import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMBAT_STEP_MS, MAX_PROJECTILES, createCombat, getWeaponParameters, stepCombat, sweptHitTime } from '../miniprogram/fortress/combat';
import type { CreateCombatOptions, CombatInput } from '../miniprogram/fortress/combat';
import { CombatRunner, MAX_STEPS_PER_FRAME } from '../miniprogram/fortress/combat-runner';
import { createSeededRandom, createSessionPlan } from '../miniprogram/fortress/plans';
import type { CombatEvent, CombatState } from '../miniprogram/fortress/types';

// Deliberate test-only geometry. Production must supply the approved image's hitbox.
const geometry = { x: -32, y: -32, width: 64, height: 64 };
const sessionPlan = createSessionPlan('combat-test', () => 0.5); // all spawns x=180
function initial(patch: Partial<CreateCombatOptions> = {}): CombatState {
  return createCombat({ plan: sessionPlan, waveIndex: 0, combatId: 'combat-1', generation: 1,
    baseHp: 5, playerX: 24, skills: { doubleShot: 0, fireRate: 0, bulletWidth: 0 }, monsterHitbox: geometry, ...patch });
}
function advance(start: CombatState, ms: number, input: CombatInput = {}): { state: CombatState; events: CombatEvent[] } {
  assert.equal(ms % COMBAT_STEP_MS, 0);
  let state = start; const events: CombatEvent[] = [];
  for (let elapsed = 0; elapsed < ms; elapsed += COMBAT_STEP_MS) {
    const next = stepCombat(state, input); state = next.state; events.push(...next.events);
  }
  return { state, events };
}

test('开战立即首发但不会直接杀怪；运动受限在堡垒水平范围', () => {
  const state = initial({ playerX: 180 });
  assert.equal(state.monsters[0].hp, 8); assert.equal(state.projectiles.length, 1);
  assert.deepEqual(state.projectiles[0].position, { x: 180, y: 510 });
  const next = stepCombat(state, { playerX: 999 });
  assert.deepEqual(next.state.player, { x: 336, y: 510 });
  assert.equal(next.state.projectiles[0].position.x, 180, '已发弹体不跟随拖动拐弯');
  assert.equal(next.state.projectiles[0].position.y, 505.2);
  assert.equal(stepCombat(next.state, { playerX: -99 }).state.player.x, 24);
  assert.throws(() => stepCombat(state, { playerX: NaN }), /playerX/);
  assert.equal(next.state.context.generation, 1); assert.equal(next.state.tick, 1);
});

test('后续弹道由主角位置决定，只有真实命中消耗怪物耐久', () => {
  const miss = advance(initial(), 4000);
  assert.equal(miss.state.monsters[0].hp, 8); assert.equal(miss.events.length, 0);
  const aim = advance(initial(), 4000, { playerX: 180 });
  assert.ok(aim.state.monsters[0].hp < 8);
  assert.equal(aim.state.base.hp, 5);
  assert.equal(aim.state.player.x, 180);
  assert.equal(aim.state.context.generation, 1, '高频步不改变异步代次');
});

test('抵达前不攻击，抵达后完整两秒首次扣血，连续攻击按周期执行', () => {
  const before = advance(initial(), 11990).state;
  assert.ok(before.monsters[0].position.y < 448); assert.equal(before.monsters[0].status, 'alive');
  const arrived = stepCombat(before).state;
  assert.equal(arrived.monsters[0].position.y, 448); assert.equal(arrived.monsters[0].status, 'attackingBase');
  assert.ok(Math.abs(arrived.monsters[0].attackRemainingMs - 2000) < 1e-6);
  const wait = advance(arrived, 1990);
  assert.equal(wait.state.base.hp, 5); assert.equal(wait.events.length, 0);
  const attack = stepCombat(wait.state);
  assert.equal(attack.state.base.hp, 4); assert.deepEqual(attack.events.map(e => e.type), ['baseDamaged']);
  const nextAttack = advance(attack.state, 2000);
  assert.equal(nextAttack.state.base.hp, 3);
  assert.equal(nextAttack.state.monsters[0].position.y, 448);
  assert.equal(nextAttack.state.processedBaseAttackIds.length, 2);
  assert.equal(new Set(nextAttack.state.processedBaseAttackIds).size, 2);
});

test('五次基地攻击失败且只发出一次终局事件，终态不再发射或扣血', () => {
  const result = advance(initial(), 30000);
  assert.equal(result.state.status, 'baseDestroyed'); assert.equal(result.state.base.hp, 0);
  assert.equal(result.events.filter(e => e.type === 'baseDamaged').length, 5);
  assert.equal(result.events.filter(e => e.type === 'baseDestroyed').length, 1);
  assert.equal(result.state.tick, 2200); assert.equal(result.state.projectiles.length, 0);
  const after = stepCombat(result.state, { playerX: 180 });
  assert.strictEqual(after.state, result.state); assert.deepEqual(after.events, []);
});

test('同一步先处理命中：最后一击能阻止到期攻击且不会同时失败', () => {
  const start = initial({ baseHp: 1, playerX: 180 });
  const due: CombatState = { ...start,
    monsters: [{ ...start.monsters[0], position: { x: 180, y: 448 }, hp: 1, status: 'attackingBase', attackRemainingMs: 10 }],
    projectiles: [{ ...start.projectiles[0], position: { x: 180, y: 490 }, previousPosition: { x: 180, y: 490 } }],
  };
  const win = stepCombat(due);
  assert.equal(win.state.status, 'cleared'); assert.equal(win.state.base.hp, 1);
  assert.deepEqual(win.events.map(e => e.type), ['monsterDefeated']);
  assert.equal(win.state.monsters[0].status, 'defeated'); assert.equal(win.state.projectiles.length, 0);
  const surviveHit = stepCombat({ ...due, monsters: [{ ...due.monsters[0], hp: 2 }] });
  assert.equal(surviveHit.state.monsters[0].hp, 1);
  assert.equal(surviveHit.state.status, 'baseDestroyed');
  assert.deepEqual(surviveHit.events.map(e => e.type), ['baseDamaged', 'baseDestroyed']);
});

test('一颗弹体只命中一次；同一帧多弹击败后不重复发击败事件', () => {
  const start = initial({ playerX: 180 });
  const shot = { ...start.projectiles[0], position: { x: 180, y: 490 }, previousPosition: { x: 180, y: 490 } };
  const target = { ...start.monsters[0], position: { x: 180, y: 448 }, status: 'attackingBase' as const };
  const hit = stepCombat({ ...start, monsters: [target], projectiles: [shot] });
  assert.equal(hit.state.monsters[0].hp, 7); assert.equal(hit.state.projectiles.length, 0);
  assert.equal(stepCombat(hit.state).state.monsters[0].hp, 7);
  const defeat = stepCombat({ ...start, monsters: [{ ...target, hp: 1 }],
    projectiles: [shot, { ...shot, id: 'another-shot' }] });
  assert.equal(defeat.events.filter(e => e.type === 'monsterDefeated').length, 1);
  assert.equal(defeat.state.defeatedMonsterIds.length, 1);
  assert.equal(stepCombat(defeat.state).events.length, 0);
});

test('扫掠碰撞覆盖跨越薄目标、高速相对运动与擦边，不把横向错开算命中', () => {
  const thin = { x: -1, y: -1, width: 2, height: 2 };
  const from = { x: 180, y: 510 }; const to = { x: 180, y: 0 };
  const target = { x: 180, y: 250 };
  const t = sweptHitTime(from, to, 8, 18, target, target, thin);
  assert.ok(t !== null && t > 0 && t < 1);
  assert.equal(sweptHitTime(from, to, 8, 18, { x: 200, y: 250 }, { x: 200, y: 250 }, thin), null);
  assert.notEqual(sweptHitTime({ x: 185, y: 300 }, { x: 185, y: 200 }, 8, 18, target, target, thin), null);
  assert.notEqual(sweptHitTime({ x: 180, y: 300 }, { x: 180, y: 280 }, 8, 18,
    { x: 180, y: 200 }, { x: 180, y: 320 }, thin), null);
  const start = initial({ monsterHitbox: { x: -1, y: -0.01, width: 2, height: 0.02 }, playerX: 180 });
  const result = stepCombat({ ...start, monsters: [{ ...start.monsters[0], position: { x: 180, y: 300 } }],
    projectiles: [{ ...start.projectiles[0], height: 0.02, position: { x: 180, y: 302 }, previousPosition: { x: 180, y: 302 } }] });
  assert.equal(result.state.monsters[0].hp, 7, '单个逻辑步内完全穿过薄目标仍应命中');
});

test('技能参数实际改变弹数、射击周期和碰撞宽度，波间继承不回血', () => {
  const skills = { doubleShot: 2, fireRate: 1, bulletWidth: 1 };
  assert.deepEqual(getWeaponParameters(skills), { count: 3, intervalMs: 400, width: 12 });
  const start = initial({ waveIndex: 4, skills, baseHp: 2, playerX: 180 });
  assert.equal(start.base.hp, 2); assert.equal(start.projectiles.length, 3);
  assert.deepEqual(start.projectiles.map(p => p.position.x), [164, 180, 196]);
  assert.ok(start.projectiles.every(p => p.width === 12 && p.damage === 1));
  const before = advance(start, 390).state; assert.equal(before.nextProjectileSequence, 3);
  const after = stepCombat(before).state; assert.equal(after.nextProjectileSequence, 6);
  assert.equal(initial().base.hp, 5); assert.equal(initial().projectiles[0].width, 8);
  // x=187 is outside an 8-wide bullet against a 2-wide target, inside a 12-wide one.
  const target = { x: 180, y: 300 }; const box = { x: -1, y: -1, width: 2, height: 2 };
  assert.equal(sweptHitTime({ x: 187, y: 310 }, { x: 187, y: 290 }, 8, 18, target, target, box), null);
  assert.notEqual(sweptHitTime({ x: 187, y: 310 }, { x: 187, y: 290 }, 12, 18, target, target, box), null);
});

test('长时间未命中弹体离开屏幕后释放，数量有上界且新局无残留', () => {
  let state = initial({ waveIndex: 4, skills: { doubleShot: 3, fireRate: 1, bulletWidth: 0 }, playerX: 24 });
  const firstIds = state.projectiles.map(p => p.id); let maximum = state.projectiles.length;
  for (let tick = 0; tick < 2000; tick++) {
    state = stepCombat(state).state;
    maximum = Math.max(maximum, state.projectiles.length);
    assert.ok(state.projectiles.every(p => p.position.y + p.height / 2 >= 0));
    assert.equal(new Set(state.projectiles.map(p => p.id)).size, state.projectiles.length);
  }
  assert.ok(maximum <= MAX_PROJECTILES);
  assert.ok(state.projectiles.every(p => !firstIds.includes(p.id)));
  const other = initial({ plan: createSessionPlan('new-session', () => 0.5), combatId: 'new-combat' });
  assert.equal(other.tick, 0); assert.equal(other.defeatedMonsterIds.length, 0);
  assert.equal(other.processedBaseAttackIds.length, 0); assert.equal(other.base.hp, 5);
  assert.deepEqual(other.skills, { doubleShot: 0, fireRate: 0, bulletWidth: 0 });
});

test('固定种子和逐步输入完全重放，不修改旧快照或配置对象', () => {
  const replay = () => {
    let state = initial({ plan: createSessionPlan('seeded', createSeededRandom(19)) }); const events: CombatEvent[] = [];
    for (let tick = 0; tick < 1800; tick++) {
      const result = stepCombat(state, { playerX: tick < 100 ? 24 : state.monsters[0].position.x });
      state = result.state; events.push(...result.events);
    }
    return { state, events };
  };
  assert.deepEqual(replay(), replay());
  const start = initial(); const original = JSON.stringify(start);
  stepCombat(start, { playerX: 180 });
  assert.equal(JSON.stringify(start), original);
  assert.ok(Object.isFrozen(start.monsters[0].hitbox)); assert.ok(Object.isFrozen(start.projectiles[0].position));
  assert.equal(Reflect.set(start.monsters[0], 'hp', 0), false);
  assert.equal(geometry.width, 64);
});

test('构造拒绝坏几何、已失败基地、错误波次、技能叠加和事件身份', () => {
  for (const patch of [
    { baseHp: 0 }, { baseHp: 6 }, { baseHp: NaN }, { waveIndex: -1 }, { waveIndex: 5 },
    { combatId: '' }, { generation: -1 }, { generation: 0.5 }, { playerX: Infinity },
    { monsterHitbox: { ...geometry, width: 0 } }, { monsterHitbox: { ...geometry, x: NaN } },
    { skills: { doubleShot: 1, fireRate: 0, bulletWidth: 0 } },
  ]) assert.throws(() => initial(patch), RangeError);
});

test('不同帧间隔只改变展示次数，相同逻辑时间/输入得到相同快照和事件', () => {
  const run = (intervals: number[]) => {
    const runner = new CombatRunner(initial({ playerX: 180 })); runner.frame(0);
    let time = 0; const events: CombatEvent[] = [];
    for (const dt of intervals) { time += dt; const frame = runner.frame(time, { playerX: 180 }); events.push(...frame.events); }
    return { state: runner.snapshot, events };
  };
  assert.deepEqual(run(Array(1000).fill(10)), run(Array(200).fill([7, 23, 20]).flat()));
});

test('同一时间戳不重复扣血；卡顿有限补帧，不在后续帧偿还积压', () => {
  const runner = new CombatRunner(initial()); assert.equal(runner.frame(100).steps, 0);
  const stalled = runner.frame(30100);
  assert.equal(stalled.steps, MAX_STEPS_PER_FRAME); assert.equal(stalled.droppedMs, 29900);
  assert.equal(runner.snapshot!.tick, 10); assert.equal(runner.snapshot!.base.hp, 5);
  assert.equal(runner.frame(30100).steps, 0); assert.equal(runner.frame(30110).steps, 1);
  assert.throws(() => runner.frame(30109), /不能倒退/);
  assert.throws(() => runner.frame(NaN), /帧时间/);
});

test('暂停不消耗移动、射击或基地冷却，恢复仅切代次，销毁释放状态', () => {
  const start = advance(initial(), 13000).state; // arrived, one second before attack
  const runner = new CombatRunner(start); runner.frame(0); runner.pause();
  assert.equal(runner.frame(30000, { playerX: 180 }).steps, 0);
  assert.strictEqual(runner.snapshot, start);
  assert.throws(() => runner.resume(30000, 1), /generation/);
  runner.resume(30000, 2);
  assert.equal(runner.snapshot!.context.generation, 2);
  assert.equal(runner.snapshot!.tick, start.tick);
  assert.equal(runner.snapshot!.shotRemainingMs, start.shotRemainingMs);
  assert.equal(runner.snapshot!.monsters[0].attackRemainingMs, start.monsters[0].attackRemainingMs);
  for (let ms = 10; ms < 1000; ms += 10) runner.frame(30000 + ms);
  assert.equal(runner.snapshot!.base.hp, 5);
  const attack = runner.frame(31000); assert.equal(attack.state!.base.hp, 4);
  assert.ok(attack.events.every(event => event.context.generation === 2));
  runner.dispose(); assert.equal(runner.snapshot, null);
  assert.equal(runner.frame(99999).steps, 0); assert.deepEqual(runner.frame(99999).events, []);
  runner.resume(99999, 3); assert.equal(runner.snapshot, null);
});
