import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createSessionStore } from '../miniprogram/services/session';
import { createBattleController } from '../miniprogram/services/battle';
import { CONTENT_ASSETS } from '../miniprogram/content/assets';

// 在微信运行时之外验证导航行为，也为后续纯逻辑测试保留 Node 测试入口。
function homeHarness() {
  const sessionStore = createSessionStore();
  let page: any;
  let navigation: any;
  let navigationCount = 0;
  let toastCount = 0;
  const source = readFileSync(new URL('../miniprogram/pages/home/home.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  });
  runInNewContext(outputText, {
    exports: {},
    require(name: string) {
      if (name === '../../content/assets') return { CONTENT_ASSETS };
      assert.equal(name, '../../services/session');
      return { sessionStore };
    },
    Page(definition: any) {
      page = definition;
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    },
    wx: {
      navigateTo(options: any) { navigationCount++; navigation = options; },
      showToast() { toastCount++; },
    },
  });
  return { sessionStore, get page() { return page; }, get navigation() { return navigation; },
    get navigationCount() { return navigationCount; }, get toastCount() { return toastCount; } };
}

test('连续点击只导航一次，从战斗返回后允许再次出发', () => {
  const h = homeHarness();
  h.page.onShow();
  h.page.openBattle();
  h.page.openBattle();
  assert.equal(h.navigationCount, 1);
  assert.equal(h.navigation.url, `/pages/battle/battle?sessionId=${h.page.sessionId}`);
  const firstId = h.page.sessionId;
  const session = h.sessionStore.claim(firstId)!;
  assert.equal(session.rounds.length, 15);
  assert.equal(session.status, 'ready');
  assert.equal(h.sessionStore.claim(firstId), undefined);
  h.navigation.success();
  h.page.onShow();
  h.page.openBattle();
  assert.equal(h.navigationCount, 2);
  assert.notEqual(h.page.sessionId, firstId);
});

test('导航失败时解除锁定并提示，下一次点击可以重试', () => {
  const h = homeHarness();
  h.page.openBattle();
  const failedId = h.page.sessionId;
  h.navigation.fail();
  assert.equal(h.sessionStore.claim(failedId), undefined);
  assert.equal(h.page.data.opening, false);
  assert.equal(h.toastCount, 1);
  h.page.openBattle();
  assert.equal(h.navigationCount, 2);
});

test('导航未完成时首页再次显示不解除锁定，旧失败回调不清理新会话', () => {
  const h = homeHarness();
  h.page.openBattle();
  h.page.onShow();
  h.page.openBattle();
  assert.equal(h.navigationCount, 1);
  const oldFail = h.navigation.fail;
  oldFail();
  h.page.openBattle();
  const id = h.page.sessionId;
  oldFail();
  assert.equal(h.page.data.opening, true);
  assert.equal(h.page.sessionId, id);
  assert.ok(h.sessionStore.claim(id));
});

test('首页卸载清理未交接会话，异步回调不再操作页面', () => {
  const h = homeHarness();
  h.page.openBattle();
  const id = h.page.sessionId;
  h.page.onUnload();
  h.navigation.fail();
  h.navigation.success();
  h.page.openBattle();
  assert.equal(h.toastCount, 0);
  assert.equal(h.navigationCount, 1);
  assert.equal(h.sessionStore.claim(id), undefined);
});

test('会话仅在内存中保存，释放后新局重置，旧释放不能影响新局', () => {
  const store = createSessionStore();
  const first = store.start();
  assert.equal(store.start(), first);
  assert.equal(store.claim('invalid'), undefined);
  assert.equal(store.claim(first.sessionId), first);
  store.release(first.sessionId);
  const second = store.start();
  store.release(first.sessionId);
  assert.equal(store.claim(second.sessionId), second);
  assert.notEqual(first.sessionId, second.sessionId);
  assert.equal(second.energy, 0);
  assert.equal(second.roundIndex, 0);
  assert.equal(second.attempts.length, 0);
  assert.equal(createSessionStore().claim(second.sessionId), undefined);
});

test('战斗页只领取一次合法会话，卸载释放，缺失或失效入口返回首页', () => {
  const sessionStore = createSessionStore();
  let redirects = 0;
  function loadPage() {
    let page: any;
    const source = readFileSync(new URL('../miniprogram/pages/battle/battle.ts', import.meta.url), 'utf8');
    runInNewContext(ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText, {
      exports: {}, require: (name: string) => name === '../../services/session' ? { sessionStore } : { createBattleController },
      Page: (definition: any) => {
        page = definition;
        page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
      },
      wx: { reLaunch: ({ url }: { url: string }) => {
        assert.equal(url, '/pages/home/home'); redirects++;
      } },
    });
    return page;
  }
  const session = sessionStore.start();
  const battle = loadPage();
  battle.onLoad({ sessionId: session.sessionId });
  assert.equal(battle.session, session);
  loadPage().onLoad({ sessionId: session.sessionId });
  assert.equal(redirects, 1);
  battle.onUnload();
  assert.equal(battle.session, undefined);
  assert.equal(sessionStore.claim(session.sessionId), undefined);
  loadPage().onLoad({});
  assert.equal(redirects, 2);
});
