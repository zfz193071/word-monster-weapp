import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMBAT_STEP_MS, MAX_PROJECTILES, createCombat, getWeaponParameters, stepCombat, sweptHitTime } from '../miniprogram/fortress/combat';
import type { CreateCombatOptions, CombatInput } from '../miniprogram/fortress/combat';
import { CombatRunner, MAX_STEPS_PER_FRAME } from '../miniprogram/fortress/combat-runner';
import { createSeededRandom, createSessionPlan } from '../miniprogram/fortress/plans';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import type { CombatEvent, CombatState } from '../miniprogram/fortress/types';

// Deliberate test-only geometry. Production must supply the approved image's hitbox.
const geometry = { x: -32, y: -32, width: 64, height: 64 };
const sessionPlan = createSessionPlan('combat-test', () => 0.5); // all spawns x=180
function initial(patch: Partial<CreateCombatOptions> = {}): CombatState {
  return createCombat({ plan: sessionPlan, waveIndex: 0, combatId: 'combat-1', generation: 1,
    baseHp: 50, playerX: 24, skills: { doubleShot: 0, fireRate: 0, bulletWidth: 0 }, monsterHitbox: geometry, ...patch });
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
  assert.equal(state.monsters[0].hp, 80); assert.equal(state.projectiles.length, 1);
  assert.deepEqual(state.projectiles[0].position, { x: 180, y: 510 });
  const next = stepCombat(state, { playerX: 999 });
  assert.deepEqual(next.state.player, { x: 336, y: 510 });
  assert.equal(next.state.projectiles[0].position.x, 180, '已发弹体不跟随拖动拐弯');
  assert.equal(next.state.projectiles[0].position.y, 505.2);
  assert.equal(stepCombat(next.state, { playerX: -99 }).state.player.x, 24);
  assert.throws(() => stepCombat(state, { playerX: NaN }), /playerX/);
  assert.equal(next.state.context.generation, 1); assert.equal(next.state.tick, 1);
});

test('固定主角的子弹从七级持枪图的枪口发出，偏移随瞄准方向旋转', () => {
  const opening = createOpeningEncounter('muzzle', 'apple', 0);
  const target = { ...opening.monsters[0], status: 'alive' as const, spawnAtMs: 0,
    position: { x: 40, y: 280 }, hitbox: { x: -8, y: -8, width: 16, height: 16 } };
  const fired = stepCombat({ ...opening, shotRemainingMs: 0, monsters: [target] }).state;
  const bullet = fired.projectiles[0]; const direction = bullet.direction!;
  const side = { x: -direction.y, y: direction.x };
  assert.ok(Math.abs(bullet.position.x - (fired.player.x + side.x * 16.8 + direction.x * 34.4)) < 1e-9);
  assert.ok(Math.abs(bullet.position.y - (fired.player.y + side.y * 16.8 + direction.y * 34.4)) < 1e-9);
  assert.ok(bullet.position.x < fired.player.x, '向左瞄准时枪口同步转向左侧');
  assert.ok(bullet.position.y < fired.player.y, '枪口位于角色上方');
  const targetDelta = { x: fired.monsters[0].position.x - bullet.position.x, y: fired.monsters[0].position.y - bullet.position.y };
  assert.ok(Math.abs(targetDelta.x * direction.y - targetDelta.y * direction.x) < 1e-9, '从枪口发出的弹道仍穿过目标中心');
  assert.ok(targetDelta.x * direction.x + targetDelta.y * direction.y > 0, '目标位于枪口前方');
  const changedAim = stepCombat({ ...opening, shotRemainingMs: 0, monsters: [{ ...target, position: { x: 280, y: 250 } }] }).state;
  const angled = changedAim.projectiles[0]; const angledDirection = angled.direction!;
  const angledSide = { x: -angledDirection.y, y: angledDirection.x };
  assert.ok(Math.abs(angled.position.x - (changedAim.player.x + angledSide.x * 16.8 + angledDirection.x * 34.4)) < 1e-9);
  assert.ok(Math.abs(angled.position.y - (changedAim.player.y + angledSide.y * 16.8 + angledDirection.y * 34.4)) < 1e-9);
});

test('火力激发按5秒/20秒节奏提高整数伤害，追踪弹分配不同目标并在击败后重锁', () => {
  let state = createOpeningEncounter('homing', 'apple', 0, 0,
    { doubleShot: 1, fireRate: 0, bulletWidth: 0, firepower: 1, homing: 1 });
  state = { ...state, monsters: state.monsters.map((monster, index) => ({ ...monster, status: 'alive', spawnAtMs: 0,
    position: { x: index ? 270 : 90, y: 200 }, hitbox: { x: -5, y: -5, width: 10, height: 10 } })) };
  let result = stepCombat(state); state = result.state;
  const first = state.projectiles.slice(-2);
  assert(first.every(projectile => projectile.damage === 15 && Number.isInteger(projectile.damage)));
  assert.notEqual(first[0].targetMonsterId, first[1].targetMonsterId);
  const followed = stepCombat(state).state;
  assert.notDeepEqual(followed.projectiles[0].direction, state.projectiles[0].direction);
  const targetId = followed.projectiles[0].targetMonsterId!;
  const other = followed.monsters.find(monster => monster.id !== targetId)!;
  const killed = stepCombat({ ...followed, monsters: followed.monsters.map(monster => monster.id === targetId ? { ...monster, hp: 0, status: 'defeated' as const } : monster) }).state;
  assert.equal(killed.projectiles[0].targetMonsterId, other.id);

  let plain = { ...state, automatic: false, monsters: state.monsters.map(monster => ({ ...monster, status: 'waiting' as const, spawnAtMs: 999999 })),
    projectiles: [], shotRemainingMs: 0, nextProjectileSequence: 0, tick: 0 };
  const damages: number[] = [];
  for (let tick = 0; tick < 2001; tick++) {
    const next = stepCombat(plain); plain = next.state;
    if (plain.nextProjectileSequence > damages.length) damages.push(...plain.projectiles.slice(-2).map(projectile => projectile.damage));
  }
  assert(damages.slice(0, 20).every(damage => damage === 15));
  assert(damages.slice(20, 80).every(damage => damage === 10));
  assert(damages.slice(80).every(damage => damage === 15));
});

test('后续弹道由主角位置决定，只有真实命中消耗怪物耐久', () => {
  const miss = advance(initial(), 4000);
  assert.equal(miss.state.monsters[0].hp, 80); assert.equal(miss.events.length, 0);
  const aim = advance(initial(), 4000, { playerX: 180 });
  assert.ok(aim.state.monsters[0].hp < 80);
  assert.equal(aim.state.base.hp, 50);
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
  assert.equal(wait.state.base.hp, 50); assert.equal(wait.events.length, 0);
  const attack = stepCombat(wait.state);
  assert.equal(attack.state.base.hp, 40); assert.deepEqual(attack.events.map(e => e.type), ['baseDamaged']);
  const nextAttack = advance(attack.state, 2000);
  assert.equal(nextAttack.state.base.hp, 30);
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
  const start = initial({ baseHp: 10, playerX: 180 });
  const due: CombatState = { ...start,
    monsters: [{ ...start.monsters[0], position: { x: 180, y: 448 }, hp: 1, status: 'attackingBase', attackRemainingMs: 10 }],
    projectiles: [{ ...start.projectiles[0], position: { x: 180, y: 490 }, previousPosition: { x: 180, y: 490 } }],
  };
  const win = stepCombat(due);
  assert.equal(win.state.status, 'cleared'); assert.equal(win.state.base.hp, 10);
  assert.deepEqual(win.events.map(e => e.type), ['monsterDamaged', 'monsterDefeated']);
  assert.equal(win.state.monsters[0].status, 'defeated'); assert.equal(win.state.projectiles.length, 0);
  const surviveHit = stepCombat({ ...due, monsters: [{ ...due.monsters[0], hp: 11 }] });
  assert.equal(surviveHit.state.monsters[0].hp, 1);
  assert.equal(surviveHit.state.status, 'baseDestroyed');
  assert.deepEqual(surviveHit.events.map(e => e.type), ['monsterDamaged', 'baseDamaged', 'baseDestroyed']);
});

test('一颗弹体只命中一次；同一帧多弹击败后不重复发击败事件', () => {
  const start = initial({ playerX: 180 });
  const shot = { ...start.projectiles[0], position: { x: 180, y: 490 }, previousPosition: { x: 180, y: 490 } };
  const target = { ...start.monsters[0], position: { x: 180, y: 448 }, status: 'attackingBase' as const };
  const hit = stepCombat({ ...start, monsters: [target], projectiles: [shot] });
  assert.equal(hit.state.monsters[0].hp, 70); assert.equal(hit.state.projectiles.length, 0);
  assert.equal(stepCombat(hit.state).state.monsters[0].hp, 70);
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
  assert.equal(result.state.monsters[0].hp, 70, '单个逻辑步内完全穿过薄目标仍应命中');
});

test('技能参数实际改变弹数、射击周期和碰撞宽度，波间继承不回血', () => {
  const skills = { doubleShot: 2, fireRate: 1, bulletWidth: 1 };
  assert.deepEqual(getWeaponParameters(skills), { count: 3, intervalMs: 400, width: 12 });
  const start = initial({ waveIndex: 4, skills, baseHp: 20, playerX: 180 });
  assert.equal(start.base.hp, 20); assert.equal(start.projectiles.length, 3);
  assert.deepEqual(start.projectiles.map(p => p.position.x), [164, 180, 196]);
  assert.ok(start.projectiles.every(p => p.width === 12 && p.damage === 10));
  const before = advance(start, 390).state; assert.equal(before.nextProjectileSequence, 3);
  const after = stepCombat(before).state; assert.equal(after.nextProjectileSequence, 6);
  assert.equal(initial().base.hp, 50); assert.equal(initial().projectiles[0].width, 8);
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
  assert.equal(other.processedBaseAttackIds.length, 0); assert.equal(other.base.hp, 50);
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
    { baseHp: 0 }, { baseHp: 51 }, { baseHp: NaN }, { baseHp: 1.5 }, { waveIndex: -1 }, { waveIndex: 5 },
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
  assert.equal(runner.snapshot!.tick, 10); assert.equal(runner.snapshot!.base.hp, 50);
  assert.equal(runner.frame(30100).steps, 0); assert.equal(runner.frame(30110).steps, 1);
  assert.throws(() => runner.frame(30109), /不能倒退/);
  assert.throws(() => runner.frame(NaN), /帧时间/);
});
test('倍速共用战斗时钟，四档按比例推进且暂停恢复不补帧', () => {
  for (const speed of [1, 1.5, 2, 2.5]) {
    const runner = new CombatRunner(initial());
    runner.setSpeed(speed);
    runner.frame(0);
    assert.equal(runner.frame(100).steps, speed * 10);
    assert.equal(runner.snapshot!.tick, speed * 10);
    runner.pause();
    assert.equal(runner.frame(100000).steps, 0);
    runner.resume(100000, runner.snapshot!.context.generation + 1);
    assert.equal(runner.frame(100020).steps, speed * 2);
    runner.dispose();
  }
  const runner = new CombatRunner(initial());
  assert.throws(() => runner.setSpeed(3), RangeError);
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
  assert.equal(runner.snapshot!.base.hp, 50);
  const attack = runner.frame(31000); assert.equal(attack.state!.base.hp, 40);
  assert.ok(attack.events.every(event => event.context.generation === 2));
  runner.dispose(); assert.equal(runner.snapshot, null);
  assert.equal(runner.frame(99999).steps, 0); assert.deepEqual(runner.frame(99999).events, []);
  runner.resume(99999, 3); assert.equal(runner.snapshot, null);
});
