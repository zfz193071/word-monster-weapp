import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bossWaveIndex, bossSoldierDropCount, monsterDropCoins, monsterStats, bossChargePhase } from '../miniprogram/fortress/battle-progression';
import { createOpeningEncounter, OPENING_EXPERIENCE } from '../miniprogram/fortress/opening-encounter';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { stepCombat } from '../miniprogram/fortress/combat';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { createExperience } from '../miniprogram/fortress/experience';
import type { CombatState } from '../miniprogram/fortress/types';

test('两维难度边界、出生后数值固定及小数基地血量跨波保留', () => {
  assert.deepEqual(monsterStats(1, 5), { hp: 80, attackDamage: 10 });
  assert.deepEqual(monsterStats(1, 6), { hp: 100, attackDamage: 11 });
  assert.deepEqual(monsterStats(1, 10), { hp: 120, attackDamage: 12 });
  assert.deepEqual(monsterStats(8, 15), { hp: 290, attackDamage: 22 });
  assert.deepEqual(monsterStats(8, 20), { hp: 330, attackDamage: 24 });
  assert.deepEqual(monsterStats(8, 15, true), { hp: 870, attackDamage: 33 });
  for (const value of [0, 9, NaN]) assert.throws(() => monsterStats(value, 6));
  const initial = createOpeningEncounter('fractional', 'apple', 0, 5);
  const attacking: CombatState = { ...initial, automatic: false, monsters: [{ ...initial.monsters[0], status: 'attackingBase', position: { x: 60, y: 480 }, attackRemainingMs: 0 }] };
  const hit = stepCombat(attacking).state;
  assert.equal(hit.base.hp, 39); assert.equal(hit.monsters[0].maxHp, 100);
  assert.equal(createOpeningEncounter('fractional', 'apple', 1, 6, undefined, hit.base.hp).base.hp, 39);
});

test('固定对局计划：10级前无Boss、全局至多一只、最后一怪替换且总589只', () => {
  let bossRuns = 0; let emptyRuns = 0;
  for (let run = 0; run < 60; run++) {
    const id = `boss-plan-${run}`;
    const index = bossWaveIndex(id);
    if (index < 0) emptyRuns++; else { bossRuns++; assert.ok(index >= 9 && index < 19); }
    const plan = createOpeningPlan(id, createSeededRandom(run));
    const monsters = plan.waves.flatMap(wave => wave.spawnPlan);
    assert.equal(monsters.length, 589);
    assert.equal(monsters.filter(monster => monster.boss).length, index < 0 ? 0 : 1);
    if (index >= 0) {
      const wave = plan.waves[index]; const boss = wave.spawnPlan.at(-1)!;
      assert.equal(boss.boss, true); assert.ok(boss.dropCoins! >= 5 && boss.dropCoins! <= 20);
      assert.ok((boss.soldierDropCount ?? 0) >= 0 && (boss.soldierDropCount ?? 0) <= 3);
      const rebuilt = createOpeningEncounter(id, wave.targetWordId, 3, index, undefined, undefined, plan.waves.slice(0, index).map(w => w.targetWordId));
      assert.equal(rebuilt.monsters.at(-1)!.id, boss.monsterId);
      assert.equal(rebuilt.monsters.at(-1)!.maxHp, monsterStats(1, index + 1).hp * 3);
      assert.equal(rebuilt.monsters.at(-1)!.hitbox.width, rebuilt.monsters[0].hitbox.width * 1.5);
      assert.deepEqual(rebuilt.monsters.map(m => m.dropCoins), wave.spawnPlan.map(m => m.dropCoins));
    }
  }
  assert.ok(bossRuns > 0 && emptyRuns > 0);
});

test('Boss预警1秒/冲锋2秒、慢速叠加，后台暂停不消耗冲锋时间', () => {
  assert.equal(bossChargePhase(7990), 'normal'); assert.equal(bossChargePhase(8000), 'warning');
  assert.equal(bossChargePhase(8990), 'warning'); assert.equal(bossChargePhase(9000), 'charging');
  assert.equal(bossChargePhase(11000), 'normal'); assert.equal(bossChargePhase(16000), 'warning');
  const initial = createOpeningEncounter('charge', 'apple', 0);
  const boss = { ...initial.monsters[0], boss: true, position: { x: 60, y: 100 }, status: 'alive' as const, spawnAtMs: 1000, slowUntilTick: 2000, slowRatio: .5 };
  const state: CombatState = { ...initial, tick: 999, automatic: false, monsters: [boss], projectiles: [] };
  const next = stepCombat(state).state;
  assert.ok(Math.abs(next.monsters[0].position.y - 100 - .105) < 1e-9);
  const runner = new CombatRunner(state); runner.frame(0); runner.pause(); runner.frame(10000);
  assert.equal(runner.snapshot!.tick, 999); runner.resume(10000, 1); runner.frame(10010);
  assert.equal(runner.snapshot!.tick, 1000); assert.equal(runner.snapshot!.monsters[0].position.y, next.monsters[0].position.y);
});

test('Boss金币5至20枚及0/1至3名援军按怪物ID固定随机结果', () => {
  const coins = new Set<number>(); const soldiers = new Set<number>();
  for (let index = 0; index < 120; index++) {
    const id = `reward-boss-${index}`;
    const amount = monsterDropCoins(id, true); const count = bossSoldierDropCount(id);
    assert.ok(Number.isInteger(amount) && amount >= 5 && amount <= 20);
    assert.ok(Number.isInteger(count) && count >= 0 && count <= 3);
    assert.equal(monsterDropCoins(id, true), amount); assert.equal(bossSoldierDropCount(id), count);
    coins.add(amount); soldiers.add(count);
    const normalDrop = monsterDropCoins(id, false);
    assert.ok(normalDrop === 0 || normalDrop === 1); assert.equal(monsterDropCoins(id, false), normalDrop);
  }
  assert.ok(coins.size > 1); assert.ok(soldiers.has(0)); assert.ok(soldiers.has(1) || soldiers.has(2) || soldiers.has(3));
});

test('Boss召唤援军，援军每2秒攻击并按普通僵尸规则结算击杀经验与金币', () => {
  const initial = createOpeningEncounter('kill-boss', 'apple', 0);
  const boss = { ...initial.monsters[0], boss: true, soldierDropCount: 2, dropCoins: 10, hp: 1, position: { x: 180, y: 100 }, status: 'alive' as const };
  const target = { ...initial.monsters[1], hp: 30, maxHp: 30, dropCoins: 1, position: { x: 230, y: 100 }, status: 'alive' as const };
  const state: CombatState = { ...initial, automatic: false, shotRemainingMs: 100_000, monsters: [boss, target], projectiles: [{ id: 'hit', position: { x: 180, y: 120 }, previousPosition: { x: 180, y: 120 }, width: 50, height: 50, damage: 1 }] };
  let next = stepCombat(state);
  assert.equal(next.state.supportSoldiers?.length, 2);
  const nextWave = createOpeningEncounter('kill-boss', 'banana', 1, 1, undefined, undefined, ['apple'], 1, 1, next.state.supportSoldiers);
  assert.deepEqual(nextWave.supportSoldiers, next.state.supportSoldiers);
  const pausedRunner = new CombatRunner({ ...next.state, supportSoldiers: next.state.supportSoldiers!.map(soldier => ({ ...soldier, attackRemainingMs: 1000 })) });
  pausedRunner.frame(0); pausedRunner.pause(); pausedRunner.frame(10_000);
  assert.equal(pausedRunner.snapshot!.supportSoldiers![0].attackRemainingMs, 1000);
  pausedRunner.resume(10_000, 1); pausedRunner.frame(10_010);
  assert.equal(pausedRunner.snapshot!.supportSoldiers![0].attackRemainingMs, 990);
  assert.ok(next.events.some(event => event.type === 'coinsDropped' && event.monsterId === boss.id && event.amount === 10));
  let current = next.state;
  for (let index = 0; index < 198; index++) current = stepCombat(current).state;
  assert.equal(current.monsters[1].hp, 30);
  next = stepCombat(current);
  assert.ok(next.events.some(event => event.type === 'monsterDamaged' && event.kind === 'soldier' && event.monsterId === target.id));
  assert.equal(next.state.monsters[1].hp, 10);
  current = next.state;
  for (let index = 0; index < 199; index++) current = stepCombat(current).state;
  next = stepCombat(current);
  assert.ok(next.events.some(event => event.type === 'monsterDefeated' && event.monsterId === target.id));
  assert.ok(next.events.some(event => event.type === 'coinsDropped' && event.monsterId === target.id && event.amount === 1));
  const xp = createExperience(initial.context.sessionId, OPENING_EXPERIENCE);
  xp.record(next.events); assert.equal(xp.view.total, 8);
});

test('僵尸优先攻击30点生命的小士兵；士兵被击败后后续攻击才扣堡垒血量', () => {
  const initial = createOpeningEncounter('soldier-shield', 'apple', 0);
  const attacker = { ...initial.monsters[0], position: { x: 180, y: 480 }, status: 'attackingBase' as const,
    attackDamage: 20, attackIntervalMs: 10, attackRemainingMs: 0 };
  let state: CombatState = { ...initial, automatic: false, projectiles: [], monsters: [attacker], supportSoldiers: [
    { id: 'shield-soldier-1', slot: 0, position: { x: 150, y: 530 }, hp: 30, maxHp: 30, attackRemainingMs: 1000 },
  ] };
  let hit = stepCombat(state); state = hit.state;
  assert.equal(state.supportSoldiers?.[0].hp, 10);
  assert.equal(state.base.hp, 50);
  assert.ok(hit.events.some(event => event.type === 'supportSoldierDamaged' && event.hp === 10));
  const nextWave = createOpeningEncounter('soldier-shield', 'banana', 1, 1, undefined, undefined, ['apple'], 1, 1, state.supportSoldiers);
  assert.equal(nextWave.supportSoldiers?.[0].hp, 10, '受伤状态应跨波保留');
  hit = stepCombat(state); state = hit.state;
  assert.equal(state.supportSoldiers?.length, 0);
  assert.equal(state.base.hp, 50);
  assert.ok(hit.events.some(event => event.type === 'supportSoldierDefeated' && event.soldierId === 'shield-soldier-1'));
  hit = stepCombat(state);
  assert.equal(hit.state.base.hp, 30);
  assert.ok(hit.events.some(event => event.type === 'baseDamaged' && event.hp === 30));
});

test('Boss死亡按普通规则给8经验和一次计划金币；有待出场Boss不能清场', () => {
  const initial = createOpeningEncounter('kill-boss', 'apple', 0);
  const monster = { ...initial.monsters[0], boss: true, dropCoins: 10, hp: 1, position: { x: 180, y: 100 }, status: 'alive' as const };
  const state: CombatState = { ...initial, monsters: [monster], projectiles: [{ id: 'hit', position: { x: 180, y: 120 }, previousPosition: { x: 180, y: 120 }, width: 50, height: 50, damage: 1 }] };
  const dead = stepCombat(state); assert.equal(dead.state.status, 'cleared');
  assert.equal(dead.events.filter(e => e.type === 'coinsDropped').length, 1);
  const xp = createExperience(initial.context.sessionId, OPENING_EXPERIENCE);
  xp.record(dead.events); xp.record(dead.events); assert.equal(xp.view.total, 8);
  assert.equal(stepCombat(dead.state).events.length, 0);
  const waiting: CombatState = { ...initial, monsters: [{ ...monster, status: 'waiting', spawnAtMs: 5000 }] };
  assert.equal(stepCombat(waiting).state.status, 'fighting');
});
