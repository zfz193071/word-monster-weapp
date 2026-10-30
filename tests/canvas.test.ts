import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import type { SceneArt } from '../miniprogram/fortress/canvas-scene';
import { createCombat } from '../miniprogram/fortress/combat';
import { createSessionPlan } from '../miniprogram/fortress/plans';
import { createViewport, HorizontalControl, logicalHitbox } from '../miniprogram/fortress/viewport';

const initial = () => createCombat({ plan: createSessionPlan('canvas-test', () => 0.5), waveIndex: 0,
  combatId: 'canvas-combat', generation: 0, baseHp: 5, playerX: 24,
  skills: { doubleShot: 0, fireRate: 0, bulletWidth: 0 }, monsterHitbox: { x: -32, y: -32, width: 64, height: 64 } });
function fakeCanvas() {
  let id = 0; const callbacks = new Map<number, (time: number) => void>();
  const commands: { method: string; args: unknown[] }[] = [];
  const images: { width: number; height: number; onload: () => void; onerror: () => void; src: string }[] = [];
  const context = new Proxy({}, { get: (_target, key) => (...args: unknown[]) => { commands.push({ method: String(key), args }); }, set: () => true });
  const canvas = { width: 0, height: 0, getContext: () => context,
    requestAnimationFrame: (callback: (time: number) => void) => { callbacks.set(++id, callback); return id; },
    cancelAnimationFrame: (key: number) => { callbacks.delete(key); },
    createImage: () => { const image = { width: 64, height: 64, onload: () => {}, onerror: () => {}, src: '' }; images.push(image); return image; },
  };
  const frame = (time: number) => { const entries = [...callbacks]; callbacks.clear(); for (const [, callback] of entries) callback(time); };
  return { canvas, callbacks, commands, images, frame };
}
function harness(preview = true, art?: SceneArt) {
  const fake = fakeCanvas(); const hud: unknown[] = []; const errors: string[] = []; const events: unknown[] = [];
  const scene = new CanvasScene(fake.canvas as unknown as WechatMiniprogram.Canvas, { initial: initial(), width: 360, height: 560, dpr: 2, clientLeft: 20,
    preview, art, onHud: value => hud.push(value), onError: value => errors.push(value), onEvents: value => events.push(value) });
  return { ...fake, scene, hud, errors, events };
}
function artFixture(): SceneArt {
  const word = initial().monsters[0].wordId;
  const asset = (id: string) => ({ path: `/assets/images/test-${id}.png`, source: 'https://example.invalid/test-only', rights: 'test-only fixture', approved: true });
  return { monster: asset('monster'), base: asset('base'), destroyedBase: asset('ruin'), hero: asset('hero'), weapon: asset('weapon'), bullet: asset('bullet'),
    monsterWidth: 64, monsterVisual: { wordId: word, portraitPath: asset('monster').path, spritePath: asset('monster').path,
      sourceSize: { width: 64, height: 64 }, anchor: { x: 32, y: 32 }, hitbox: { x: 0, y: 0, width: 64, height: 64 } } };
}

test('DPR 只影响物理像素，不改变逻辑位置；宽高适配与留白正确', () => {
  for (const dpr of [1, 2, 3]) {
    const v = createViewport(360, 560, dpr); const control = new HorizontalControl(v, 20);
    control.start([{ identifier: 1, clientX: 200 }]); assert.equal(control.playerX, 180);
  }
  const wide = createViewport(720, 560, 3); assert.equal(wide.left, 180);
  const control = new HorizontalControl(wide, 10); control.start([{ identifier: 1, clientX: 370 }]); assert.equal(control.playerX, 180);
  assert.equal(createViewport(180, 560, 2).top, 140);
  assert.throws(() => createViewport(0, 560, 2), RangeError);
});

test('首指独占、第二指不劫持；结束/取消/重测尺寸释放控制，边界钳制', () => {
  const control = new HorizontalControl(createViewport(360, 560, 2), 20);
  control.start([{ identifier: 1, clientX: 200 }]);
  control.start([{ identifier: 2, clientX: 350 }]);
  control.move([{ identifier: 2, clientX: 350 }]); assert.equal(control.playerX, 180);
  control.move([{ identifier: 1, clientX: 999 }]); assert.equal(control.playerX, 336);
  control.move([{ identifier: 1, clientX: -50 }]); assert.equal(control.playerX, 24);
  control.end([{ identifier: 2, clientX: 350 }]); assert.equal(control.playerX, 24);
  control.end([{ identifier: 1, clientX: 0 }]); assert.equal(control.playerX, undefined);
  control.start([{ identifier: 3, clientX: 200 }]); control.clear(); assert.equal(control.playerX, undefined);
  control.start([{ identifier: 4, clientX: 200 }]); control.resize(createViewport(180, 280, 3), 10); assert.equal(control.playerX, undefined);
});

test('Canvas backing store 与变换使用 DPR；重复 load 不创建第二个帧循环', async () => {
  const h = harness(); assert.equal(h.canvas.width, 720); assert.equal(h.canvas.height, 1120);
  assert.equal(await h.scene.load(), true); await h.scene.load(); assert.equal(h.callbacks.size, 1);
  assert.ok(h.commands.some(command => command.method === 'setTransform' && JSON.stringify(command.args) === '[2,0,0,2,0,0]'));
  h.frame(0); for (let now = 10; now <= 1000; now += 10) { h.frame(now); assert.equal(h.callbacks.size, 1); }
  assert.equal(h.hud.length, 1, '弹体逐帧变化不通过 HUD/setData 发布');
  h.scene.resize(180, 280, 3, 10); assert.equal(h.canvas.width, 540); assert.equal(h.canvas.height, 840);
  assert.equal(h.scene.snapshot!.tick, 100, 'resize 不重建战斗'); h.scene.dispose();
});

test('面板暂停取消帧与触摸，迟到帧无效，恢复不追赶后台时间', async () => {
  const h = harness(); await h.scene.load(); h.frame(0); h.frame(10);
  const stale = [...h.callbacks.values()][0];
  h.scene.touchStart([{ identifier: 1, clientX: 200 }]); h.scene.setPaused(true);
  const before = h.scene.snapshot; assert.equal(h.callbacks.size, 0);
  stale(30000); h.scene.touchMove([{ identifier: 1, clientX: 350 }]); assert.strictEqual(h.scene.snapshot, before);
  h.scene.setPaused(false); assert.equal(h.callbacks.size, 1); h.frame(30000);
  assert.equal(h.scene.snapshot!.tick, before!.tick); assert.equal(h.scene.snapshot!.player.x, 24);
  h.frame(30010); assert.equal(h.scene.snapshot!.tick, before!.tick + 1);
  h.scene.dispose(); stale(60000); assert.equal(h.callbacks.size, 0); assert.equal(h.scene.snapshot, null);
});

test('正式模式缺图/未批准/错配几何时不启动模拟，不自动回退占位', async () => {
  const missing = harness(false); assert.equal(await missing.scene.load(), false); assert.equal(missing.callbacks.size, 0); assert.equal(missing.scene.snapshot!.tick, 0); missing.scene.dispose();
  const art = artFixture();
  const unapproved = harness(false, { ...art, monster: { ...art.monster, approved: false } });
  assert.equal(await unapproved.scene.load(), false); assert.match(unapproved.errors[0], /审校/); unapproved.scene.dispose();
  const wrong = harness(false, { ...art, monsterWidth: 128 }); assert.equal(await wrong.scene.load(), false); assert.match(wrong.errors[0], /碰撞/); wrong.scene.dispose();
  assert.deepEqual(logicalHitbox(art.monsterVisual, 64), initial().monsters[0].hitbox);
});

test('全部图片加载成功才开战；失败后可重试，旧加载回调无效', async () => {
  const h = harness(false, artFixture()); const first = h.scene.load();
  assert.equal(h.images.length, 6); assert.equal(h.callbacks.size, 0);
  const stale = h.images[0].onload; h.images[0].onerror(); assert.equal(await first, false);
  assert.equal(h.callbacks.size, 0); assert.equal(h.scene.snapshot!.tick, 0);
  const retry = h.scene.load(); stale(); assert.equal(h.callbacks.size, 0);
  for (const image of h.images.slice(6)) image.onload(); assert.equal(await retry, true); assert.equal(h.callbacks.size, 1);
  assert.ok(h.commands.some(command => command.method === 'drawImage')); h.scene.dispose();
});

test('加载期间销毁终结 Promise，原图尺寸不符不能进入战斗', async () => {
  const h = harness(false, artFixture()); const pending = h.scene.load(); const stale = h.images[0].onload;
  h.scene.dispose(); stale(); assert.equal(await pending, false); assert.equal(h.errors.length, 0); assert.equal(h.callbacks.size, 0);
  const bad = harness(false, artFixture()); const load = bad.scene.load(); bad.images[0].width = 128;
  for (const image of bad.images) image.onload(); assert.equal(await load, false); assert.match(bad.errors[0], /尺寸/); bad.scene.dispose();
});

test('HUD 读真实基地血量；失败停止循环；诊断样本有界且不声称真机性能', async () => {
  const h = harness(); await h.scene.load(); h.frame(0);
  for (let time = 10; time <= 23000; time += 10) h.frame(time);
  assert.equal(h.scene.snapshot!.status, 'baseDestroyed'); assert.equal(h.scene.snapshot!.base.hp, 0);
  assert.equal(h.callbacks.size, 0); assert.equal(h.hud.length, 6);
  assert.deepEqual(h.hud.at(-1), { hp: 0, maxHp: 5, status: 'baseDestroyed' });
  assert.equal(h.scene.diagnostics.recentFrameGapsMs.length, 120); assert.ok(h.scene.diagnostics.peakProjectiles > 0);
  h.scene.touchStart([{ identifier: 1, clientX: 200 }]); h.frame(30000); assert.equal(h.scene.snapshot!.player.x, 24); h.scene.dispose();
});
