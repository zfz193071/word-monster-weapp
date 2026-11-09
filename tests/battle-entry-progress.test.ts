import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { battleBackgroundCover } from '../miniprogram/fortress/battle-background';

test('八关首帧战场背景在图片分包中且尺寸与 Canvas 逻辑画面一致', () => {
  for (let level = 1; level <= 8; level++) {
    const cover = battleBackgroundCover(level);
    const image = readFileSync(new URL(`../miniprogram${cover}`, import.meta.url));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(16), 360);
    assert.equal(image.readUInt32BE(20), 560);
  }
});

test('首页答对后立即进入战斗页，不等待资源预加载', () => {
  let definition: any; let callbacks: any; let navigated = false;
  const source = readFileSync(new URL('../miniprogram/pages/home/home.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
    exports: {}, Page(value: any) { definition = value; },
    wx: {navigateTo() { navigated = true; }},
    require(name: string) {
      if (name.endsWith('/levels')) return {LEVELS: []};
      if (name.endsWith('/collection')) return {collectionWords: () => []};
      if (name.endsWith('/opening-encounter')) return {openingArt: () => ({})};
      if (name.endsWith('/battle-background')) return {battleBackgroundCover: () => '/assets/images/battle-backgrounds/level-1.png'};
      if (name.endsWith('/battle-assets')) return {battleAudioPaths: () => [], loadBattleAssets(_art: unknown, value: any) {callbacks = value; return () => {};}};
      return {};
    },
  });
  const host = {...definition, data: {...definition.data, choiceComplete: true, request: {plan: {sessionId: 'entry', waves: [{targetWordId: 'apple', spawnPlan: []}]}}}, setData(patch: object) {Object.assign(this.data, patch);}};
  host.enterBattle();
  assert.equal(navigated, true);
  assert.equal(callbacks, undefined);
});

import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createStageInvasion } from '../miniprogram/fortress/stage-invasion';
import { createSeededRandom } from '../miniprogram/fortress/plans';

test('八关四难度加载结束的初始战斗画面已有完整可见僵尸', () => {
  for (let level = 1; level <= 8; level++) for (const difficulty of ['easy', 'normal', 'hard', 'nightmare'] as const) {
    const state = createStageInvasion(createOpeningPlan('entry', createSeededRandom(41), level, 1, difficulty), 1);
    const first = state.monsters[0];
    assert.ok(first.position.y + first.hitbox.y >= 0, `关卡${level}/${difficulty}: 首只僵尸仍在屏幕外 y=${first.position.y}`);
  }
});

function battleEntryHarness(plan?: ReturnType<typeof createOpeningPlan>) {
  let definition: any;
  const music = {active: false, volume: 0, disposed: false, setActive(value: boolean) {this.active = value;}, setVolume(value: number) {this.volume = value;}, retry() {}, dispose() {this.disposed = true; this.active = false;}};
  const jobs: { callbacks: any; cancelled: boolean; options: any; art: any }[] = [];
  const request = { plan: plan ?? { sessionId: 'entry', levelId: 1, waves: [{ targetWordId: 'apple', spawnPlan: [{ wordId: 'pear' }] }] } };
  const source = readFileSync(new URL('../miniprogram/pages/battle/battle.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
    exports: {}, Page(value: any) { definition = value; }, wx: {},
    require(name: string) {
      if (name.endsWith('/home-music')) return {createLoopMusic: () => music};
      if (name.endsWith('/fortress-entry')) return { fortressEntryStore: {claim: () => ({request}), release() {}} };
      if (name.endsWith('/levels')) return {getLevel: (id: number) => plan ? getLevel(id) : ({words: [{id: 'banana'}]})};
      if (name.endsWith('/opening-encounter')) return {openingArt: (_word: string, ids: string[]) => ids};
      if (name.endsWith('/battle-background')) return {battleBackgroundCover: () => 'cover.png', battleBackgroundColor: () => '#123456'};
      if (name.endsWith('/battle-assets')) return {battleAudioPaths: (ids: string[]) => ids,
        loadBattleAssets(art: any, callbacks: any, options: any) {
          const job = {art, callbacks, options, cancelled: false}; jobs.push(job);
          callbacks.onProgress(0); return () => {job.cancelled = true;};
        }};
      return {};
    },
  });
  const host = {...definition, data: {...definition.data}, selectComponent() {},
    setData(patch: object, done?: () => void) {Object.assign(this.data, patch); done?.();}};
  return {host, jobs, music};
}

test('战斗页初始即有进度，慢加载至50%仍保持遮罩，解码与首帧完成才交接', () => {
  const {host, jobs} = battleEntryHarness();
  assert.equal(host.data.entryLoading, true);
  assert.equal(host.data.entryProgress, 0);
  host.onLoad({mode: 'fortress', entry: 'entry'});
  assert.deepEqual([...jobs[0].art].sort(), ['apple', 'banana', 'pear']);
  jobs[0].callbacks.onProgress(38);
  assert.equal(host.data.entryProgress, 19);
  assert.equal(host.data.assetsReady, false);
  host.onHide();
  jobs[0].callbacks.onProgress(100); jobs[0].callbacks.onReady();
  assert.equal(host.data.pageVisible, false);
  host.onShow();
  assert.equal(host.data.pageVisible, true);
  assert.equal(host.data.entryProgress, 50);
  assert.equal(host.data.assetsReady, true);
  assert.equal(host.data.entryLoading, true);
  host.entrySceneProgress({detail: {progress: 100}});
  assert.equal(host.data.entryProgress, 99);
  assert.equal(host.data.entryLoading, true);
  host.entrySceneReady();
  assert.equal(host.data.entryProgress, 100);
  assert.equal(host.data.entryLoading, false);
});

test('战斗页失败保持加载层并可重试，旧任务和卸载后的回调不能改变新任务', () => {
  const {host, jobs} = battleEntryHarness();
  host.onLoad({mode: 'fortress', entry: 'entry'});
  jobs[0].callbacks.onError();
  assert.ok(host.data.entryError);
  assert.equal(host.data.entryLoading, true);
  host.prepareEntry();
  assert.equal(jobs[0].cancelled, true);
  jobs[0].callbacks.onReady(); jobs[0].callbacks.onProgress(100);
  assert.equal(host.data.assetsReady, false); assert.equal(host.data.entryProgress, 0);
  jobs[1].callbacks.onReady();
  host.entrySceneError({detail: {message: '图片解码失败'}});
  assert.equal(host.data.entryError, '图片解码失败');
  host.onUnload();
  assert.equal(jobs[1].cancelled, true);
  jobs[1].callbacks.onProgress(100); host.entrySceneReady();
  assert.equal(host.data.entryLoading, true);
});

import { getLevel } from '../miniprogram/fortress/levels';
import { openingArt } from '../miniprogram/fortress/opening-encounter';

test('战斗页预载八关各自所有轮次和Boss可能用到的怪物素材', () => {
  for (let level = 1; level <= 8; level++) {
    const plan = createOpeningPlan(`assets-${level}`, createSeededRandom(41), level);
    const {host, jobs} = battleEntryHarness(plan);
    host.onLoad({mode: 'fortress', entry: plan.sessionId});
    const art = openingArt(plan.waves[0].targetWordId, jobs[0].art);
    for (const wave of plan.waves) for (const monster of wave.spawnPlan) {
      assert.ok(art.outfitBodies?.[monster.wordId]);
      assert.ok(art.fruitHats?.[monster.wordId]);
    }
    host.onUnload();
  }
});

test('首页不渲染战斗进度条，进度仅由战斗页展示', () => {
  const home = readFileSync(new URL('../miniprogram/pages/home/home.wxml', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /<loading-progress\b/);
});

test('战斗预载时播放背景音乐，后台暂停、重试恢复、交接和退出释放', () => {
  const {host, jobs, music} = battleEntryHarness();
  host.onLoad({mode: 'fortress', entry: 'entry'});
  assert.equal(music.active, true, '预载尚未完成时应播放背景音乐');
  assert.equal(music.volume, .22);
  host.onHide(); assert.equal(music.active, false);
  host.onShow(); assert.equal(music.active, true);
  jobs[0].callbacks.onError(); assert.equal(music.active, false);
  host.prepareEntry(); assert.equal(music.active, true);
  jobs[1].callbacks.onReady(); assert.equal(music.active, true);
  host.entrySceneReady(); assert.equal(music.active, false);
  host.onUnload(); assert.equal(music.disposed, true);
});

test('Canvas与音频并行准备，首帧先完成时继续等待音频，失败和旧场景不能提前开战', () => {
  const {host, jobs} = battleEntryHarness();
  host.onLoad({mode: 'fortress', entry: 'entry'});
  assert.equal(host.data.sceneMounted, true, '不应等待音频结束才创建Canvas');
  assert.equal(host.data.assetsReady, false);
  host.entrySceneReady();
  assert.equal(host.data.entryLoading, true);
  assert.equal(host.data.entryProgress, 50);
  jobs[0].callbacks.onProgress(50);
  assert.equal(host.data.entryProgress, 75);
  jobs[0].callbacks.onReady();
  assert.equal(host.data.entryLoading, false);
  host.prepareEntry();
  const oldEpoch = host.loadEpoch - 1;
  host.entrySceneReady({currentTarget: {dataset: {loadEpoch: oldEpoch}}});
  host.entrySceneError({detail: {message: '旧场景错误'}, currentTarget: {dataset: {loadEpoch: oldEpoch}}});
  jobs[1].callbacks.onReady();
  assert.equal(host.data.entryLoading, true);
  assert.equal(host.data.entryError, '');
  host.entrySceneError({detail: {message: '首帧失败'}});
  assert.equal(jobs[1].cancelled, true);
  assert.equal(host.data.sceneMounted, false);
  host.entrySceneReady();
  assert.equal(host.data.entryLoading, true);
});
