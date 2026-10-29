import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// 在微信运行时之外验证导航行为，也为后续纯逻辑测试保留 Node 测试入口。
function homeHarness() {
  let page: any;
  let navigation: any;
  let navigationCount = 0;
  let toastCount = 0;
  const source = readFileSync(new URL('../miniprogram/pages/home/home.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  });
  runInNewContext(outputText, {
    Page(definition: any) {
      page = definition;
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    },
    wx: {
      navigateTo(options: any) { navigationCount++; navigation = options; },
      showToast() { toastCount++; },
    },
  });
  return { get page() { return page; }, get navigation() { return navigation; },
    get navigationCount() { return navigationCount; }, get toastCount() { return toastCount; } };
}

test('连续点击只导航一次，从战斗返回后允许再次出发', () => {
  const h = homeHarness();
  h.page.onShow();
  h.page.openBattle();
  h.page.openBattle();
  assert.equal(h.navigationCount, 1);
  assert.equal(h.navigation.url, '/pages/battle/battle');
  h.page.onShow();
  h.page.openBattle();
  assert.equal(h.navigationCount, 2);
});

test('导航失败时解除锁定并提示，下一次点击可以重试', () => {
  const h = homeHarness();
  h.page.openBattle();
  h.navigation.fail();
  assert.equal(h.page.data.opening, false);
  assert.equal(h.toastCount, 1);
  h.page.openBattle();
  assert.equal(h.navigationCount, 2);
});
