import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';

async function harness(frame = 'complete-frame', finalPresentation = Promise.resolve(true), resources: () => Promise<void> = () => Promise.resolve()) {
  const file = new URL('../miniprogram/components/fortress-scene/fortress-scene.ts', import.meta.url);
  const realRequire = createRequire(file); let definition: any; const events: string[] = []; let scene: Scene;
  class Scene {
    snapshot: any; paused = false; presentations = 0; loads = 0;
    constructor(_node: unknown, options: any) { scene = this; this.snapshot = options.initial; }
    async load() { this.loads++; return true; } async present() { return ++this.presentations === 1 ? true : finalPresentation; }
    captureFrame() { return frame; } setPaused(value: boolean) { this.paused = value; }
    dispose() {} applySkills() {} applyPet() {}
  }
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
    exports: {}, Component(value: any) { definition = value; }, wx: {getWindowInfo: () => ({pixelRatio: 1})},
    require(name: string) {
      if(name.endsWith('/battlefield-assets')) return {loadBattlefieldAssets:resources};
      if (name.endsWith('/canvas-scene')) return {CanvasScene: Scene};
      if (name.endsWith('/coin-wallet')) return {coinWallet: {balance: () => 0}, victoryCoinsForLevel: () => 100};
      if (name.endsWith('/pet-store')) return {petStore: {view: () => ({owned: false})}};
      if (name.endsWith('/battle-audio')) return {createBattleAudio: () => ({setActive() {}, setVolume() {}, dispose() {}})};
      return realRequire(name);
    },
  });
  const host: any = {data: structuredClone(definition.data), properties: {opening: true, preview: false, managedLoading: true, paused: false, previewRequest: {plan: createOpeningPlan('entry-frame', createSeededRandom(1)), generation: 1}},
    setData(patch: object, done?: () => void) { Object.assign(this.data, patch); done?.(); }, triggerEvent(name: string) { events.push(name); },
    createSelectorQuery: () => ({select: () => ({fields: (_fields: unknown, callback: Function) => ({exec: () => callback({node: {}, width: 360, height: 560})})})}),
  };
  Object.assign(host, definition.methods); definition.lifetimes.attached.call(host); host.mount();
  await new Promise(resolve => setImmediate(resolve));
  const event = () => ({currentTarget: {dataset: {epoch: host.data.entryFrameEpoch}}});
  return {host, events, event, get scene() { return scene!; }, removeLoading() { host.properties.managedLoading = false; definition.properties.managedLoading.observer.call(host); }, dispose: () => definition.lifetimes.detached.call(host)};
}

test('首帧导出失败保持进度，不发布可开战状态', async () => {
  const h = await harness('');
  assert.equal(h.host.data.ready, false); assert.match(h.host.data.error, /首帧生成失败/);
  assert.ok(h.events.includes('sceneerror')); assert.ok(!h.events.includes('sceneready')); h.dispose();
});

test('首帧显示失败可重试；旧图片事件和退出后的事件不能撤掉加载层', async () => {
  const h = await harness(); const old = h.event();
  h.host.entryFrameFailed(old); h.host.entryFrameLoaded(old);
  assert.equal(h.host.data.ready, false); assert.match(h.host.data.error, /首帧显示失败/);
  assert.ok(!h.events.includes('sceneready'));
  h.host.mount(true); await new Promise(resolve => setImmediate(resolve));
  h.host.entryFrameLoaded(old); h.host.entryFrameFailed(old);
  assert.equal(h.host.data.ready, false); assert.equal(h.host.data.error, '');
  await h.host.entryFrameLoaded(h.event()); assert.equal(h.host.data.ready, true);
  assert.equal(h.events.filter(name => name === 'sceneready').length, 1);
  await h.host.entryFrameLoaded(h.event()); assert.equal(h.events.filter(name => name === 'sceneready').length, 1);
  h.host.mount(true); await new Promise(resolve => setImmediate(resolve)); const late = h.event();
  h.dispose(); h.host.entryFrameLoaded(late); assert.equal(h.host.data.ready, false);
});

test('最后一次画布呈现完成前保留进度，交接后无需再等待呈现', async () => {
  let reveal!: (ready: boolean) => void;
  const h = await harness('complete-frame', new Promise<boolean>(resolve => { reveal = resolve; }));
  const loaded = h.host.entryFrameLoaded(h.event());
  assert.ok(!h.events.includes('sceneready'), '最后一次呈现尚未完成就撤掉进度条');
  assert.equal(h.host.data.ready, false);
  reveal(true); await loaded;
  assert.ok(h.events.includes('sceneready'));
  assert.equal(h.host.data.entryFrame, 'complete-frame', '进度消失时保留已解码完整画面，原生Canvas交接延迟不能露出空白');
  assert.equal(h.scene.paused, true);
  h.removeLoading();
  assert.equal(h.scene.paused, false, '进度撤掉即恢复战斗，不再等待异步绘制');
  assert.equal(h.scene.presentations, 2);
  h.dispose();
});

test('最终呈现等待期间退出，迟到回调不能宣布战斗就绪', async () => {
  let reveal!: (ready: boolean) => void;
  const h = await harness('complete-frame', new Promise<boolean>(resolve => { reveal = resolve; }));
  const loaded = h.host.entryFrameLoaded(h.event());
  h.dispose(); reveal(true); await loaded;
  assert.equal(h.host.data.ready, false);
  assert.ok(!h.events.includes('sceneready'));
});


test('庭院分包先就绪再解码首帧，失败可重试，退出后迟到完成不解码', async () => {
  const attempts: {resolve:()=>void; reject:(error:Error)=>void}[] = [];
  const resources = () => new Promise<void>((resolve,reject) => attempts.push({resolve,reject}));
  const h = await harness('complete-frame', Promise.resolve(true), resources);
  assert.equal(h.scene.loads, 0); assert.equal(h.host.data.ready, false);
  attempts[0].reject(Error('download failed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(h.host.data.error, /战场资源加载失败/);
  h.host.mount(true); attempts[1].resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.host.data.error, ''); assert.equal(h.host.data.entryFrame, 'complete-frame');
  await h.host.entryFrameLoaded(h.event()); assert.equal(h.host.data.ready, true);
  h.host.mount(true); const abandoned = h.scene; h.dispose(); attempts[2].resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.host.data.ready, false);
  assert.equal(abandoned.loads, 0);
  assert.equal(h.events.filter(event => event === 'sceneready').length, 1);
});
