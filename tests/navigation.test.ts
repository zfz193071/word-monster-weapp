import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createSessionStore } from '../miniprogram/services/session';
import { createBattleController } from '../miniprogram/services/battle';
import { createFortressEntryStore } from '../miniprogram/services/fortress-entry';
import { BATTLE_ASSETS } from '../miniprogram/fortress/content';

// 在微信运行时之外验证导航行为，也为后续纯逻辑测试保留 Node 测试入口。
function homeHarness() {
  const sessionStore = createSessionStore();
  const fortressEntryStore = createFortressEntryStore();
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
      if (name === '../../services/coin-wallet') return { coinWallet: { balance: () => 300 } };
      if (name === '../../services/home-music') return { createHomeMusic: () => ({ setActive() {}, setEnabled() {}, retry() {}, dispose() {} }) };
      if (name === '../../fortress/content') return { BATTLE_ASSETS };
      if (name === '../../services/fortress-entry') return { fortressEntryStore };
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

function correct(page: any) {
  const request = page.data.request;
  const wave = request.plan.waves[0];
  page.choiceSucceeded({ detail: {
    context: { sessionId: request.plan.sessionId, waveId: wave.waveId, generation: request.generation },
    attempts: [{ sessionId: request.plan.sessionId, waveId: wave.waveId, targetWordId: wave.targetWordId,
      selectedWordId: wave.targetWordId, correct: true, taskKind: 'listeningChoice', attemptIndex: 1, replayCount: 0, hintUsed: false }],
  } });
}
test('首页点击仅开三选一弹窗，选对后导航一次，返回后重新听词', () => {
  const h = homeHarness(); h.page.onShow();
  h.page.openBattle(); const first = h.page.data.request;
  h.page.openBattle(); assert.equal(h.navigationCount, 0); assert.equal(h.page.data.request, first);
  assert.equal(first.variant, 'fruit');
  correct(h.page); correct(h.page);
  assert.equal(h.navigationCount, 1);
  assert.equal(h.navigation.url, `/pages/battle/battle?mode=fortress&entry=${first.plan.sessionId}`);
  h.navigation.success(); h.page.onShow();
  assert.equal(h.page.data.request, null);
  h.page.openBattle(); assert.notEqual(h.page.data.request.plan.sessionId, first.plan.sessionId);
  assert.equal(h.navigationCount, 1);
});
test('导航失败可重试，旧失败回调不能解除新导航锁', () => {
  const h = homeHarness(); h.page.openBattle(); correct(h.page);
  const oldFail = h.navigation.fail; oldFail();
  assert.equal(h.page.data.navigationError, true);
  h.page.enterBattle(); oldFail();
  assert.equal(h.page.data.opening, true); assert.equal(h.navigationCount, 2);
  h.page.closeChallenge(); assert.ok(h.page.data.request);
});
test('取消重开丢弃旧听词结果，卸载后回调不得导航或更新页面', () => {
  const h = homeHarness(); h.page.openBattle();
  const oldRequest = h.page.data.request;
  h.page.closeChallenge(); h.page.openBattle(); const current = h.page.data.request;
  h.page.data.request = oldRequest; correct(h.page); h.page.data.request = current;
  assert.equal(h.navigationCount, 0);
  correct(h.page); h.page.onUnload();
  h.navigation.fail(); h.navigation.success(); h.page.openBattle();
  assert.equal(h.navigationCount, 1); assert.equal(h.toastCount, 0);
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
      exports: {}, require: (name: string) => name === '../../services/fortress-entry' ? { fortressEntryStore: createFortressEntryStore() } : name === '../../services/session' ? { sessionStore } : { createBattleController },
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
  const fortress = loadPage();
  fortress.onLoad({ mode: 'fortress' });
  assert.equal(fortress.data.preview, false);
  assert.equal(fortress.session, undefined);
  assert.equal(redirects, 1);
  const session = sessionStore.start();
  const battle = loadPage();
  battle.onLoad({ sessionId: session.sessionId });
  assert.equal(battle.session, session);
  loadPage().onLoad({ sessionId: session.sessionId });
  assert.equal(redirects, 2);
  battle.onUnload();
  assert.equal(battle.session, undefined);
  assert.equal(sessionStore.claim(session.sessionId), undefined);
  loadPage().onLoad({});
  assert.equal(redirects, 3);
});
