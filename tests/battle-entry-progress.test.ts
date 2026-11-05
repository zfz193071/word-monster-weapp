import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('首页预加载完成仍不达到100%，为战斗页图片解码和首帧保留进度', () => {
  let definition: any; let callbacks: any; let navigated = false;
  const source = readFileSync(new URL('../miniprogram/pages/home/home.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {
    exports: {}, Page(value: any) { definition = value; },
    wx: {navigateTo() { navigated = true; }},
    require(name: string) {
      if (name.endsWith('/levels')) return {LEVELS: []};
      if (name.endsWith('/collection')) return {collectionWords: () => []};
      if (name.endsWith('/opening-encounter')) return {openingArt: () => ({})};
      if (name.endsWith('/battle-assets')) return {loadBattleAssets(_art: unknown, value: any) {callbacks = value; return () => {};}};
      return {};
    },
  });
  const host = {...definition, data: {...definition.data, choiceComplete: true, request: {plan: {sessionId: 'entry', waves: [{targetWordId: 'apple', spawnPlan: []}]}}}, setData(patch: object) {Object.assign(this.data, patch);}};
  host.enterBattle(); callbacks.onProgress(100); callbacks.onReady();
  assert.equal(navigated, true);
  assert.equal(host.data.entryProgress, 50);
});
