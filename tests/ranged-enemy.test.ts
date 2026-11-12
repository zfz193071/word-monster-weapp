import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { attachCombatPet, stepCombat, reviveCompanion, COMBAT_STEP_MS, RANGED_ENEMY_SHOT_SPEED } from '../miniprogram/fortress/combat';
import { createBattlePet } from '../miniprogram/pets/battle';
import type { CombatState, MonsterState, SupportSoldierState } from '../miniprogram/fortress/types';

function flying(position = { x: 180, y: 340 }, damage = 7): MonsterState {
  const initial = createOpeningEncounter('ranged-enemy', 'apple', 0);
  return { ...initial.monsters[0], enemyType: 'flying', status: 'alive', position, hp: 1000, maxHp: 1000,
    spawnAtMs: 0, attackDamage: damage, rangedRemainingMs: COMBAT_STEP_MS };
}
const soldier = (): SupportSoldierState => ({ id: 'guard', slot: 0, hp: 30, maxHp: 30,
  position: { x: 180, y: 480 }, attackRemainingMs: 100000 });
function fixture(monsters: MonsterState[], extra: Partial<CombatState> = {}): CombatState {
  return { ...createOpeningEncounter('ranged-enemy', 'apple', 0), automatic: false, projectiles: [],
    shotRemainingMs: 100000, monsterSpeed: 0, monsters, ...extra };
}
function run(state: CombatState, steps: number) {
  let current = state; const events = [] as ReturnType<typeof stepCombat>['events'][number][];
  for (let i = 0; i < steps; i++) { const next = stepCombat(current); current = next.state; events.push(...next.events); }
  return { state: current, events };
}

test('飞行怪在抵达堡垒前远程攻击最近小兵，弹道可见后才结算伤害', () => {
  const state = fixture([flying()], { supportSoldiers: [soldier()] });
  const first = stepCombat(state);
  assert.equal(first.state.enemyShots?.length, 1, '发射后留下可见弹道');
  assert.equal(first.state.enemyShots?.[0].target.kind, 'soldier');
  const shot = first.state.enemyShots![0];
  assert.equal(shot.remainingMs, shot.travelMs - COMBAT_STEP_MS);
  assert.equal(shot.travelMs, Math.max(COMBAT_STEP_MS, Math.round(Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y) / RANGED_ENEMY_SHOT_SPEED * 1000)));
  assert.equal(first.events.filter(event => event.type === 'supportSoldierDamaged').length, 0, '未命中前不扣血');
  assert.equal(first.state.base.hp, state.base.hp);
  const travelSteps = Math.ceil(shot.travelMs / COMBAT_STEP_MS);
  const landed = run(first.state, travelSteps - 1);
  assert.equal(landed.state.supportSoldiers?.[0].hp, 23);
  assert.equal(landed.state.enemyShots?.length, 0);
  assert.equal(landed.state.base.hp, state.base.hp, '有小兵时不能提前伤害堡垒');
});

test('没有存活小兵时优先攻击宠物，宠物可倒地并消耗旗帜位置复活', () => {
  const pet = createBattlePet({ level: 1, equipped: [] });
  const state = fixture([flying({ x: 270, y: 300 }, 100)], { pet });
  const first = stepCombat(state);
  assert.equal(first.state.enemyShots?.[0].target.kind, 'pet');
  const landed = run(first.state, 70);
  assert.equal(landed.state.pet?.hp, 0);
  assert.ok(landed.events.some(event => event.type === 'petDefeated'));
  assert.deepEqual(landed.state.pet?.defeatedPosition, { x: 270, y: 480 });
  assert.equal(landed.state.base.hp, state.base.hp, '宠物仍存活或刚倒地时不伤害堡垒');
  const revived = reviveCompanion(landed.state, 'pet', 'thunder-fox');
  assert.equal(revived?.pet?.hp, revived?.pet?.maxHp);
  assert.equal(revived?.pet?.defeatedPosition, undefined);
});

test('没有小兵和宠物时飞行怪才远程伤害堡垒，超出射程不发射', () => {
  const near = fixture([flying({ x: 180, y: 380 })]);
  const shot = stepCombat(near);
  assert.equal(shot.state.enemyShots?.[0].target.kind, 'base');
  const landed = run(shot.state, 40);
  assert.equal(landed.state.base.hp, near.base.hp - 7);
  assert.ok(landed.events.some(event => event.type === 'baseDamaged'));
  const far = fixture([flying({ x: 180, y: 100 })]);
  const idle = stepCombat(far);
  assert.equal(idle.state.enemyShots?.length, 0);
  assert.equal(idle.state.base.hp, far.base.hp);
});

test('冻结的飞行怪不发射，非飞行怪不获得远程攻击', () => {
  const frozen = fixture([{ ...flying(), frozenUntilTick: 1000 }]);
  const blocked = run(frozen, 250);
  assert.equal(blocked.state.enemyShots?.length, 0);
  assert.equal(blocked.state.base.hp, frozen.base.hp);
  const normal = fixture([{ ...flying(), enemyType: 'normal' }]);
  const melee = run(normal, 250);
  assert.equal(melee.state.enemyShots?.length, 0);
  assert.equal(melee.state.base.hp, normal.base.hp);
});

test('宠物只在小兵全部倒地后成为目标，并沿用统一暂停时钟', () => {
  const state = fixture([flying()], { pet: createBattlePet({ level: 1, equipped: [] }), supportSoldiers: [soldier()] });
  const first = stepCombat(state);
  assert.equal(first.state.enemyShots?.[0].target.kind, 'soldier');
  const dead = { ...first.state, supportSoldiers: [], enemyShots: [] as CombatState['enemyShots'], monsters: first.state.monsters.map(monster => ({ ...monster, rangedRemainingMs: COMBAT_STEP_MS })) };
  const next = stepCombat(dead);
  assert.equal(next.state.enemyShots?.[0].target.kind, 'pet');
});
