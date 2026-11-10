import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import type { SceneArt, SceneOptions } from '../miniprogram/fortress/canvas-scene';
import { createCombat } from '../miniprogram/fortress/combat';
import { createSessionPlan } from '../miniprogram/fortress/plans';
import { createViewport, HorizontalControl, logicalHitbox } from '../miniprogram/fortress/viewport';

const initial = () => createCombat({ plan: createSessionPlan('canvas-test', () => 0.5), waveIndex: 0,
  combatId: 'canvas-combat', generation: 0, baseHp: 50, playerX: 24,
  skills: { doubleShot: 0, fireRate: 0, bulletWidth: 0 }, monsterHitbox: { x: -32, y: -32, width: 64, height: 64 } });
function fakeCanvas() {
  let id = 0; const callbacks = new Map<number, (time: number) => void>();
  const commands: { method: string; args: unknown[] }[] = [];
  const images: { width: number; height: number; onload: () => void; onerror: () => void; src: string }[] = [];
  const context = new Proxy({}, { get: (_target, key) => (...args: unknown[]) => { commands.push({ method: String(key), args }); },
    set: (_target, key, value) => { if (key === 'globalCompositeOperation') commands.push({ method: 'setGlobalCompositeOperation', args: [value] }); return true; } });
  const canvas = { width: 0, height: 0, getContext: () => context,
    requestAnimationFrame: (callback: (time: number) => void) => { callbacks.set(++id, callback); return id; },
    cancelAnimationFrame: (key: number) => { callbacks.delete(key); },
    createImage: () => { const image = { width: 64, height: 64, onload: () => {}, onerror: () => {}, src: '' }; images.push(image); return image; },
  };
  const frame = (time: number) => { const entries = [...callbacks]; callbacks.clear(); for (const [, callback] of entries) callback(time); };
  return { canvas, callbacks, commands, images, frame };
}
function harness(preview = true, art?: SceneArt, extra: Partial<SceneOptions> = {}) {
  const fake = fakeCanvas(); const hud: unknown[] = []; const errors: string[] = []; const events: unknown[] = [];
  const scene = new CanvasScene(fake.canvas as unknown as WechatMiniprogram.Canvas, { initial: initial(), width: 360, height: 560, dpr: 2, clientLeft: 20,
    preview, art, onHud: value => hud.push(value), onError: value => errors.push(value), onEvents: value => events.push(value), ...extra });
  return { ...fake, scene, hud, errors, events };
}
function artFixture(): SceneArt {
  const word = initial().monsters[0].wordId;
  const asset = (id: string) => ({ path: `/assets/images/test-${id}.png`, source: 'https://example.invalid/test-only', rights: 'test-only fixture', approved: true });
  return { monster: asset('monster'), base: asset('base'), destroyedBase: asset('ruin'), hero: asset('hero'), weapon: asset('weapon'), bullet: asset('bullet'),
    monsterWidth: 64, monsterVisual: { wordId: word, portraitPath: asset('monster').path, spritePath: asset('monster').path,
      sourceSize: { width: 64, height: 64 }, anchor: { x: 32, y: 32 }, hitbox: { x: 0, y: 0, width: 64, height: 64 } } };
}

test('静态背景缓存保持原生DPR、每帧复用，尺寸改变重建，离屏不可用仍可绘制', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'wx');
  const caches: ReturnType<typeof fakeCanvas>[] = [];
  Object.defineProperty(globalThis, 'wx', { configurable: true, value: { createOffscreenCanvas({width, height}: {width: number; height: number}) {
    const cache = fakeCanvas(); cache.canvas.width = width; cache.canvas.height = height; caches.push(cache); return cache.canvas;
  } } });
  const h = harness();
  try {
    await h.scene.load(); h.frame(0); h.frame(16);
    assert.equal(caches.length, 1);
    assert.equal(caches[0].canvas.width, 720); assert.equal(caches[0].canvas.height, 1120);
    const painted = caches[0].commands.length;
    h.frame(32); assert.equal(caches[0].commands.length, painted);
    assert.ok(h.commands.filter(c => c.method === 'drawImage' && c.args[0] === caches[0].canvas).length >= 3);
    h.scene.resize(360, 560, 3, 0);
    assert.equal(caches.length, 2); assert.equal(caches[1].canvas.width, 1080); assert.equal(caches[1].canvas.height, 1680);
    assert.deepEqual(h.errors, []);
    Object.defineProperty(globalThis, 'wx', {configurable: true, value: {createOffscreenCanvas() {throw Error('unavailable');}}});
    h.scene.resize(180, 280, 3, 0); h.frame(48);
    assert.deepEqual(h.errors, []); assert.equal(h.callbacks.size, 1);
  } finally {
    h.scene.dispose();
    if (original) Object.defineProperty(globalThis, 'wx', original); else Reflect.deleteProperty(globalThis, 'wx');
  }
});

test('画布就绪且恢复第一帧后才能召唤；保存失败不添实体，下一帧绘制成功召唤', async () => {
  const h = harness(); let debits = 0;
  const debit = () => {debits++; return true;};
  assert.equal(h.scene.summonSoldier('early',debit),false);
  await h.scene.load();
  assert.throws(()=>h.scene.summonSoldier('disk',()=>{throw Error('disk');}));
  assert.equal(h.scene.snapshot!.supportSoldiers!.length,0);
  h.scene.setPaused(true);assert.equal(h.scene.summonSoldier('paused',debit),false);
  h.scene.setPaused(false);assert.equal(h.scene.summonSoldier('before-resume-frame',debit),false);
  h.frame(1000);assert(h.scene.summonSoldier('active',debit));
  assert.equal(debits,1);assert.equal(h.scene.snapshot!.supportSoldiers![0].hp,30);
  const count=h.commands.length;h.frame(1010);assert(h.commands.length>count);
  h.scene.dispose();assert.equal(h.scene.summonSoldier('disposed',debit),false);assert.equal(debits,1);
});

test('清场后金币演出继续绘制，暂停冻结、恢复连续、结束和销毁清理帧', async () => {
  const h = harness(true, undefined, { initial: { ...initial(), status: 'cleared' } });
  await h.scene.load(); assert.equal(h.callbacks.size, 0);
  h.scene.showCoinDrop({ x: 100, y: 200 }, 10); assert.equal(h.callbacks.size, 1);
  h.frame(0); h.frame(100);
  assert.ok(h.commands.some(command => command.method === 'fillText' && command.args[0] === '+10'));
  h.scene.setPaused(true); const count = h.commands.length;
  h.frame(10000); assert.equal(h.commands.length, count); assert.equal(h.callbacks.size, 0);
  h.scene.setPaused(false); h.frame(10000);
  for (let time = 10100; time <= 10800; time += 100) h.frame(time);
  assert.equal(h.callbacks.size, 0);
  h.scene.showCoinDrop({ x: 100, y: 200 }, 1); assert.equal(h.callbacks.size, 1);
  h.scene.dispose(); assert.equal(h.callbacks.size, 0); h.scene.showCoinDrop({ x: 0, y: 0 }, 1); assert.equal(h.callbacks.size, 0);
});

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
test('Canvas 倍速推进同一战斗时钟，暂停期间不积压战斗帧', async () => {
  const h=harness();await h.scene.load();h.scene.setSpeed(2.5);
  h.frame(0);h.frame(100);assert.equal(h.scene.snapshot!.tick,25);
  h.scene.setPaused(true);h.frame(100000);assert.equal(h.scene.snapshot!.tick,25);
  h.scene.setPaused(false);h.frame(100000);assert.equal(h.scene.snapshot!.tick,25);
  h.frame(100020);assert.equal(h.scene.snapshot!.tick,30);
  h.scene.setSpeed(1);h.frame(100030);assert.equal(h.scene.snapshot!.tick,31);
  h.scene.dispose();
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
  assert.equal(h.images.length, 12); assert.equal(h.callbacks.size, 0);
  const stale = h.images[0].onload; h.images[0].onerror(); assert.equal(await first, false);
  assert.equal(h.callbacks.size, 0); assert.equal(h.scene.snapshot!.tick, 0);
  const retry = h.scene.load(); stale(); assert.equal(h.callbacks.size, 0);
  for (const image of h.images.slice(12)) image.onload(); assert.equal(await retry, true); assert.equal(h.callbacks.size, 1);
  assert.ok(h.commands.some(command => command.method === 'drawImage')); h.scene.dispose();
});

test('僵尸裤腿着色不覆盖另一条腿或战场背景', async () => {
  const art = artFixture();
  const leg = { ...art.monster, path: '/assets/images/test-leg.png' };
  const shirt = { ...art.monster, path: '/assets/images/test-shirt.png' };
  const walkArt: SceneArt = { ...art, walkParts: { body: shirt, left: leg, right: leg }, outfitBodies: { [initial().monsters[0].wordId]: shirt },
    outfitColors: { [initial().monsters[0].wordId]: '#c44c4d' } };
  const h = harness(false, walkArt);
  const loading = h.scene.load(); for (const image of h.images) image.onload(); assert.equal(await loading, true);
  h.frame(0);
  const operations = h.commands.filter(command => command.method === 'setGlobalCompositeOperation').map(command => command.args[0]);
  assert.ok(!operations.includes('source-atop'), '不能在已绘制的战场上整块染色');
  assert.ok(!operations.includes('multiply'));
  h.scene.dispose();
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
  assert.deepEqual(h.hud.at(-1), { hp: 0, maxHp: 50, status: 'baseDestroyed', frostEnergy:0, frostTarget:true });
  assert.equal(h.scene.diagnostics.recentFrameGapsMs.length, 120); assert.ok(h.scene.diagnostics.peakProjectiles > 0);
  h.scene.touchStart([{ identifier: 1, clientX: 200 }]); h.frame(30000); assert.equal(h.scene.snapshot!.player.x, 24); h.scene.dispose();
});


test('开发预览也预载真实怪物图片，缺图不能退回几何占位', async () => {
  const art = artFixture();
  const h = harness(true, undefined, { previewMonster: art });
  const loading = h.scene.load(); assert.equal(h.images.length, 1); assert.equal(h.callbacks.size, 0);
  h.images[0].onerror(); assert.equal(await loading, false); assert.equal(h.callbacks.size, 0);
  const retry = h.scene.load(); h.images[1].onload(); assert.equal(await retry, true);
  assert.ok(h.commands.some(c => c.method === 'drawImage')); h.scene.dispose();
});

test('真实击败接入读词与淡出时仍只有一个帧循环，完成后停止且战斗 tick 不变', async () => {
  let ended = () => {}; let complete = 0; let plays = 0;
  const state = { ...initial(), player: { x: 180, y: 510 } };
  const h = harness(true, undefined, { initial: state, retirement: { onChange: () => {}, onComplete: () => { complete++; },
    audio: { schedule: () => () => {}, createContext: () => ({ src: '', autoplay: false, loop: false,
      onEnded: cb => { ended = cb; }, offEnded: () => {}, onError: () => {}, offError: () => {}, onStop: () => {}, offStop: () => {}, onPause: () => {}, offPause: () => {},
      play: () => { plays++; }, stop: () => {}, destroy: () => {},
    }) } } });
  await h.scene.load(); let now = 0; h.frame(now);
  while (h.scene.snapshot!.status === 'fighting' && now < 10000) { now += 10; h.frame(now); assert.equal(h.callbacks.size, 1); }
  assert.equal(h.scene.snapshot!.status, 'cleared'); const tick = h.scene.snapshot!.tick; assert.equal(plays, 1);
  ended(); const until = now + 1050;
  while (now < until) { now += 10; h.frame(now); }
  assert.equal(h.scene.snapshot!.tick, tick); assert.equal(complete, 1); assert.equal(h.callbacks.size, 0);
  ended(); h.frame(now + 5000); assert.equal(complete, 1); h.scene.dispose();
});

for(const preview of [false,true])test(`死亡怪物立即消失，暂停与尺寸变化不恢复尸体（preview=${preview}）`,async()=>{
 const art=artFixture();const state=initial();
 const dead={...state,status:'cleared' as const,monsters:state.monsters.map(monster=>({...monster,hp:0,status:'defeated' as const}))};
 const h=harness(preview,preview?undefined:art,{initial:dead});
 const loading=h.scene.load();for(const image of h.images)image.onload();assert.equal(await loading,true);
 const absent=()=>{
  assert.ok(!h.commands.some(c=>c.method==='drawImage'&&c.args[0]===h.images.find(image=>image.src===art.monster.path)),'不绘制死亡怪物');
  assert.ok(!h.commands.some(c=>c.method==='arc'&&c.args[0]===dead.monsters[0].position.x&&c.args[1]===dead.monsters[0].position.y),'预览也不保留死亡占位图');
  assert.equal(h.callbacks.size,0,'读词队列不应维持尸体动画');
 };
 absent();h.commands.length=0;h.scene.setPaused(true);h.scene.setPaused(false);h.scene.resize(360,560,2,20);absent();
 assert.deepEqual(h.errors,[]);h.scene.dispose();
});

test('最后一击飘字在清场后仍完成动画，暂停和销毁不推进或重放',async()=>{
 const start=initial();const monster=start.monsters[0];
 const state={...start,shotRemainingMs:1000,monsters:[{...monster,status:'alive' as const,hp:1,position:{x:180,y:200}}],projectiles:[{id:'final',position:{x:180,y:230},previousPosition:{x:180,y:230},width:8,height:18,damage:4}]};
 const h=harness(true,undefined,{initial:state});await h.scene.load();h.frame(0);h.frame(10);
 assert.equal(h.scene.snapshot!.status,'cleared');assert(h.commands.some(c=>c.method==='fillText'&&c.args[0]==='-4'));assert.equal(h.callbacks.size,1);
 h.scene.setPaused(true);assert.equal(h.callbacks.size,0);const count=h.commands.length;h.frame(10000);assert.equal(h.commands.length,count);
 h.scene.setPaused(false);h.frame(10000);for(let t=10100;t<=10900;t+=100)h.frame(t);
 assert.equal(h.callbacks.size,0);assert.equal(h.errors.length,0);h.scene.dispose();assert.equal(h.callbacks.size,0);
});

// Exercises the real repair -> draw -> HUD path while no animation frame can run.
for (const levelId of [1, 3, 8]) for (const status of ['fighting', 'cleared'] as const) {
  test(`第${levelId}关${status}暂停修复：立即发布满血HUD，旧帧不覆盖，跨轮保持`, async () => {
    const { createOpeningEncounter, ZERO_SKILLS } = await import('../miniprogram/fortress/opening-encounter');
    const { getLevel } = await import('../miniprogram/fortress/levels');
    const word = getLevel(levelId).words[0].id;
    const state = { ...createOpeningEncounter(`repair-${levelId}`, word, 1, 0, ZERO_SKILLS, 20, [], levelId, 1, [], 'normal', {}), status };
    const h = harness(true, undefined, { initial: state });
    await h.scene.load();
    assert.deepEqual(h.hud.at(-1), { hp: 20, maxHp: state.base.maxHp, status, frostEnergy:0, frostTarget:true });
    const stale = [...h.callbacks.values()][0];
    h.scene.setPaused(true);
    const tick = h.scene.snapshot!.tick;
    const draws = h.commands.length;
    h.scene.restoreBase();
    assert.equal(h.scene.snapshot!.base.hp, state.base.maxHp);
    assert.deepEqual(h.hud.at(-1), { hp: state.base.maxHp, maxHp: state.base.maxHp, status, frostEnergy:0, frostTarget:true });
    assert(h.commands.length > draws, '无需动画帧就重新绘制修复状态');
    assert.equal(h.scene.snapshot!.tick, tick);
    assert.equal(h.callbacks.size, 0);
    const hudCount = h.hud.length;
    h.scene.restoreBase();
    assert.equal(h.hud.length, hudCount, '重复调用不产生第二次状态更新');
    stale?.(5000);
    assert.equal(h.scene.snapshot!.base.hp, state.base.maxHp, '暂停前的迟到帧不能覆盖修复');
    const next = createOpeningEncounter(`repair-${levelId}`, word, 2, 1, h.scene.snapshot!.skills, h.scene.snapshot!.base.hp, [word], levelId, 1, [], 'normal', {});
    assert.equal(next.base.hp, next.base.maxHp);
    if (status === 'fighting') {
      h.scene.setPaused(false);
      h.frame(6000);
      for (let time = 6100; time <= 66000 && h.scene.snapshot!.base.hp === state.base.maxHp; time += 100) h.frame(time);
      assert(h.scene.snapshot!.base.hp < state.base.maxHp, '恢复战斗后新的攻击仍然正常扣血');
      const lastHud = h.hud.at(-1) as { hp: number; maxHp: number };
      assert.equal(lastHud.hp, h.scene.snapshot!.base.hp);
    }
    h.scene.dispose();
  });
}

test('复活画布仅在就绪暂停时允许，保存失败保留死亡状态，恢复帧绘制满血士兵', async () => {
  const h=harness(true,undefined,{initial:{...initial(),fallenSoldiers:[{id:'fallen',slot:0,hp:0,maxHp:30,position:{x:10,y:10},attackRemainingMs:0}]}});let debits=0;
  const debit=()=>{debits++;return true;};
  assert.equal(h.scene.revive('soldier','fallen',debit),false);await h.scene.load();assert.equal(h.scene.revive('soldier','fallen',debit),false);
  h.scene.setPaused(true);assert.throws(()=>h.scene.revive('soldier','fallen',()=>{throw Error('disk');}));assert.equal(h.scene.snapshot!.fallenSoldiers!.length,1);
  assert(h.scene.revive('soldier','fallen',debit));assert.equal(h.scene.snapshot!.supportSoldiers![0].hp,30);assert.equal(debits,1);
  assert.equal(h.scene.revive('soldier','fallen',debit),false);h.scene.setPaused(false);h.frame(1000);assert.equal(h.errors.length,0);
  h.scene.dispose();assert.equal(h.scene.revive('soldier','fallen',debit),false);
});

test('战场进度包含实际Canvas图片解码，只有首帧绘制完成才能达到100%', async () => {
  const progress: number[] = []; let drawnAtCompletion = false;
  const h = harness(false, artFixture(), {onLoadProgress(percent) {
    progress.push(percent);
    if (percent === 100) drawnAtCompletion = h.commands.some(command => command.method === 'drawImage');
  }});
  const pending = h.scene.load();
  assert.deepEqual(progress, [0]);
  h.images[0].onload(); await Promise.resolve();
  assert.ok(progress.at(-1)! > 0 && progress.at(-1)! < 100);
  for (const image of h.images.slice(1)) image.onload();
  assert.equal(await pending, true);
  assert.equal(progress.at(-1), 100); assert.equal(drawnAtCompletion, true);
  h.scene.dispose();
});

test('八关加载时只绘制纯色，解码完成后才绘制战场与角色', async () => {
  for (let levelId = 1; levelId <= 8; levelId++) {
    const art = artFixture();
    const h = harness(false, {...art, fruitHat: art.monster}, {levelId});
    const pending = h.scene.load();
    const background = h.commands.slice();
    assert.ok(background.some(command => command.method === 'fillRect'));
    assert.equal(background.some(command => command.method === 'arc' || command.method === 'fill'), false);
    assert.equal(background.some(command => command.method === 'drawImage'), false);
    assert.equal(h.callbacks.size, 0);
    for (const image of h.images) image.onload();
    assert.equal(await pending, true);
    assert.ok(h.commands.slice(background.length).some(command => command.method === 'arc'));
    assert.ok(h.commands.slice(background.length).some(command => command.method === 'drawImage' && (command.args[0] as {src: string}).src === art.hero.path));
    h.scene.dispose();
  }
});

test('入场必须等待完整画面跨过呈现帧，取消入场不能继续开战', async () => {
  const h = harness(false, artFixture());
  const loading = h.scene.load();
  for (const image of h.images) image.onload();
  await loading;
  h.scene.setPaused(true);
  let shown = false;
  const presenting = h.scene.present().then(value => { shown = value; return value; });
  await Promise.resolve(); assert.equal(shown, false);
  h.frame(0); await Promise.resolve(); assert.equal(shown, false);
  h.frame(16); assert.equal(await presenting, true);
  const cancelled = h.scene.present(); h.scene.dispose();
  assert.equal(await cancelled, false);
});

// Use production plans/art and PNG dimensions; readiness alone cannot prove actors drew.
test('八关入场呈现前已绘制主角、宠物和首只怪物，暂停期间也不依赖开战补画', async () => {
  const { readFileSync } = await import('node:fs');
  const { createOpeningPlan } = await import('../miniprogram/fortress/opening-plan');
  const { createStageInvasion } = await import('../miniprogram/fortress/stage-invasion');
  const { openingArt } = await import('../miniprogram/fortress/opening-encounter');
  const { createSeededRandom } = await import('../miniprogram/fortress/plans');
  const { createBattlePet, battlePetPosition } = await import('../miniprogram/pets/battle');
  for (let levelId = 1; levelId <= 8; levelId++) {
    const initial = createStageInvasion(createOpeningPlan(`first-frame-${levelId}`, createSeededRandom(41), levelId), 1);
    const art = openingArt(initial.monsters[0].wordId, [...initial.monsters, ...initial.incomingMonsters!].map(monster => monster.wordId));
    const h = harness(false, art, { initial, levelId });
    h.scene.setPaused(true);
    h.scene.applyPet(createBattlePet({ level: 1, equipped: [] }));
    const loading = h.scene.load();
    for (const image of h.images) {
      const png = readFileSync(new URL(`../miniprogram${image.src}`, import.meta.url));
      if (image.src.endsWith('.jpg')) {
        assert.equal(png.readUInt16BE(0), 0xffd8); image.width = 1536; image.height = 1024;
      } else { image.width = png.readUInt32BE(16); image.height = png.readUInt32BE(20); }
      image.onload();
    }
    assert.equal(await loading, true, `关卡${levelId}: ${h.errors.join(',')}`);
    h.commands.length = 0;
    const presented = h.scene.present();
    h.frame(0); h.frame(16);
    assert.equal(await presented, true);
    assert.equal(h.scene.snapshot!.tick, 0);
    assert.ok(h.commands.some(command => command.method === 'drawImage' && (command.args[0] as {src: string}).src === art.hero.path), `关卡${levelId}: 未绘制主角`);
    const pet = battlePetPosition(initial.player);
    assert.ok(h.commands.some(command => command.method === 'translate' && command.args[0] === pet.x && command.args[1] === pet.y), `关卡${levelId}: 未绘制宠物`);
    assert.ok(!h.commands.some(command => command.method === 'fillText' && command.args[0] === '100/100'), '无敌宠物不再显示血条数值');
    const monster = initial.monsters[0];
    assert.ok(h.commands.some(command => command.method === 'translate' && command.args[0] === monster.position.x && command.args[1] === monster.position.y), `关卡${levelId}: 未绘制怪物`);
    assert.ok(monster.position.y + monster.hitbox.y >= 0, '首只怪物不应在画面之外');
    assert.deepEqual(h.errors, []);
    h.scene.dispose();
  }
});

test('冰冻大招：加载、暂停、恢复首帧前和销毁拒绝，释放立即同步能量HUD且不重复', async () => {
  const state=initial();
  const h=harness(true,undefined,{initial:{...state,frostEnergy:30,monsters:state.monsters.map(m=>({...m,status:'alive',spawnAtMs:0,position:{x:180,y:200}}))}});
  assert.equal(h.scene.releaseFrost(),false);await h.scene.load();
  h.scene.setPaused(true);assert.equal(h.scene.releaseFrost(),false);
  h.scene.setPaused(false);assert.equal(h.scene.releaseFrost(),false);h.frame(1000);
  assert.equal(h.scene.releaseFrost(),true);assert.equal(h.scene.releaseFrost(),false);
  assert.equal((h.hud.at(-1) as {frostEnergy:number}).frostEnergy,0);
  const frozen=h.scene.snapshot!.monsters[0].position;h.frame(1010);assert.deepEqual(h.scene.snapshot!.monsters[0].position,frozen);
  assert.deepEqual(h.errors,[]);h.scene.dispose();assert.equal(h.scene.releaseFrost(),false);
});

test('正式自动战斗将全宽视口接入模拟器，重测尺寸保留时钟与实体', async () => {
  const h = harness(true, undefined, {initial: {...initial(), automatic: true}, width: 1024, height: 580});
  await h.scene.load();
  const before = h.scene.snapshot!;
  assert.ok(before.arenaWidth! > 900);
  assert.ok(h.commands.some(c => c.method === 'fillRect' && c.args[0] === 0 && c.args[1] === 0 && c.args[2] === before.arenaWidth && c.args[3] === 560));
  h.frame(0); h.frame(100);
  const tick = h.scene.snapshot!.tick;
  const ids = h.scene.snapshot!.monsters.map(m => m.id);
  h.scene.resize(390, 620, 3, 0);
  assert.equal(h.scene.snapshot!.tick, tick);
  assert.deepEqual(h.scene.snapshot!.monsters.map(m => m.id), ids);
  assert.ok(Math.abs(h.scene.snapshot!.arenaWidth! - 390 / (620 / 560)) < 1e-8);
  assert.equal(h.canvas.width, 1170); assert.equal(h.canvas.height, 1860);
  assert.deepEqual(h.errors, []);
  h.scene.dispose();
});

test('首页房屋逐级升级后，正式战斗堡垒的绘制随本局等级变化', async () => {
  const drawings: unknown[] = [];
  for (let houseLevel = 1; houseLevel <= 5; houseLevel++) {
    const h = harness(false, artFixture(), { initial: { ...initial(), houseLevel } });
    const loading = h.scene.load();
    h.images.forEach(image => image.onload());
    await loading;
    drawings.push(JSON.parse(JSON.stringify(h.commands)));
    h.scene.dispose();
  }
  for (let i = 1; i < drawings.length; i++) {
    assert.notDeepEqual(drawings[i], drawings[i - 1], `房屋${i}→${i + 1}级后战斗堡垒仍相同`);
  }
});

test('房屋外观兼容旧快照，五级堡垒摧毁后仍使用废墟', async () => {
  const render = async (houseLevel: number | undefined, destroyed = false) => {
    const state = initial();
    const h = harness(false, artFixture(), { initial: { ...state, houseLevel,
      ...(destroyed ? { base: { ...state.base, hp: 0 }, status: 'baseDestroyed' as const } : {}) } });
    const loading = h.scene.load(); h.images.forEach(image => image.onload()); await loading;
    const commands = JSON.parse(JSON.stringify(h.commands));
    h.scene.dispose(); return commands as {method: string; args: any[]}[];
  };
  assert.deepEqual(await render(undefined), await render(1));
  for (let level = 1; level <= 5; level++) {
    const commands = await render(level, true);
    assert.ok(commands.some(command => command.method === 'drawImage' && command.args[0]?.src === artFixture().destroyedBase.path));
  }
});


test('第一关庭院等待资源完成后绘制，宽窄屏等比裁切且其他关卡不加载', async () => {
  const { COURTYARD_ASSET, PORTRAIT_COURTYARD_ASSET } = await import('../miniprogram/fortress/battle-background');
  for (const levelId of [1, 2]) {
    const art = { ...artFixture(), fruitHat: artFixture().monster };
    const h = harness(false, art, { levelId, initial: { ...initial(), automatic: true } });
    const loading = h.scene.load();
    const ground = h.images.find(image => image.src === COURTYARD_ASSET.path);
    const portrait = h.images.find(image => image.src === PORTRAIT_COURTYARD_ASSET.path);
    assert.equal(!!ground, levelId === 1);
    assert.equal(!!portrait, levelId === 1);
    for (const image of h.images.filter(image => image !== ground && image !== portrait)) image.onload();
    if (ground) {
      assert.equal(h.callbacks.size, 0);
      ground.width = 1536; ground.height = 1024; ground.onload();
      await Promise.resolve();
      assert.equal(h.callbacks.size, 0, 'must also wait for portrait background');
      portrait!.width = 1024; portrait!.height = 1536; portrait!.onload();
    }
    assert.equal(await loading, true);
    if (ground) for (const [width, height] of [[390,620], [1024,580], [390,620]]) {
      h.commands.length = 0; h.scene.resize(width, height, 2, 0);
      const selected = width < height ? portrait! : ground;
      const draw = h.commands.find(command => command.method === 'drawImage' && command.args[0] === selected)!;
      assert.ok(draw);
      const [, sx, sy, sw, sh, dx, dy, dw, dh] = draw.args as number[];
      assert.ok(sx >= 0 && sy >= 0 && sx + sw <= selected.width + .001 && sy + sh <= selected.height + .001);
      if (selected === portrait) assert.ok(sw / selected.width > .94, 'retain portrait edge decoration');
      assert.ok(Math.abs(sw / sh - dw / dh) < 1e-8);
      assert.equal(dx, 0); assert.equal(dy, 0); assert.equal(dh, 560);
    }
    h.scene.dispose();
  }
});
