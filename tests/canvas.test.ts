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
  assert.deepEqual(h.hud.at(-1), { hp: 0, maxHp: 50, status: 'baseDestroyed' });
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
    assert.deepEqual(h.hud.at(-1), { hp: 20, maxHp: state.base.maxHp, status });
    const stale = [...h.callbacks.values()][0];
    h.scene.setPaused(true);
    const tick = h.scene.snapshot!.tick;
    const draws = h.commands.length;
    h.scene.restoreBase();
    assert.equal(h.scene.snapshot!.base.hp, state.base.maxHp);
    assert.deepEqual(h.hud.at(-1), { hp: state.base.maxHp, maxHp: state.base.maxHp, status });
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
