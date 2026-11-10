import assert from 'node:assert/strict';
import test from 'node:test';
import { SOLDIER_TYPES, ENEMY_TYPES } from '../miniprogram/fortress/army';
import type { SoldierType } from '../miniprogram/fortress/army';
import { stepCombat } from '../miniprogram/fortress/combat';
import { createOpeningEncounter, OPENING_EXPERIENCE } from '../miniprogram/fortress/opening-encounter';
import { createExperience } from '../miniprogram/fortress/experience';
import { soldierStats } from '../miniprogram/fortress/soldier-types';
import { createBattleDrops } from '../miniprogram/services/battle-drops';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
import { coinRulesFor } from '../miniprogram/fortress/difficulty';
import type { CombatEvent, CombatState, SupportSoldierState } from '../miniprogram/fortress/types';

function ally(type: SoldierType): SupportSoldierState {
  const skill = { level: 5, quality: 'legendary' as const };
  const stats = soldierStats(type, skill, 10);
  return { id: type, slot: 0, soldierType: type, source: 'skill', skill, evolved: stats.evolved,
    hp: stats.maxHp, maxHp: stats.maxHp, position: { x: 180, y: 450 }, attackRemainingMs: 0 };
}
function ledger(state: CombatState) {
  let saved: unknown = { version: 1, balance: 0, rewardedSessions: [] };
  const storage = { getStorageSync: () => structuredClone(saved), setStorageSync: (_key: string, value: unknown) => { saved = structuredClone(value); } };
  const wallet = createCoinWallet(storage);
  const xp = createExperience(state.context.sessionId, OPENING_EXPERIENCE);
  let awarded = 0;
  const drops = createBattleDrops({ sessionId: state.context.sessionId, levelId: 1, difficulty: 'normal', wallet,
    grandBosses: Object.fromEntries(state.monsters.filter(m => m.bossKind === 'grand').map(m => [m.id, m.position])),
    onChange(view) { assert.equal(view.error, false); }, onAward(_position, amount) { awarded += amount; } });
  return { wallet, xp, get awarded() { return awarded; },
    replay(events: readonly CombatEvent[]) { for (let i = 0; i < 3; i++) { xp.record(events); drops.handle(events); } },
    reload: () => createCoinWallet(storage), dispose() { xp.dispose(); drops.dispose(); } };
}

for (const type of SOLDIER_TYPES) test(`${type}: eligible enemy types use unique XP/coins/energy through real soldier hits`, () => {
  const initial = createOpeningEncounter(`army-rewards-${type}`, 'apple', 1);
  const types = ENEMY_TYPES.filter(enemy => enemy !== 'flying' || ['rifle', 'rocket', 'jetpack'].includes(type));
  let state: CombatState = { ...initial, monsterSpeed: 0, shotRemainingMs: 100000,
    supportSoldiers: [ally(type)], monsters: types.map((enemyType, index) => ({ ...initial.monsters[0],
      id: `${initial.context.sessionId}:wave:1:zombie:${index}`, enemyType, hp: 1, maxHp: 1,
      dropCoins: coinRulesFor('normal').normal, status: 'alive', spawnAtMs: 0, position: { x: 178 + index, y: 420 } })) };
  const accounts = ledger(state), events: CombatEvent[] = [];
  for (let tick = 0; tick < 4000 && state.status === 'fighting'; tick++) {
    const result = stepCombat(state); state = result.state;
    accounts.replay(result.events); events.push(...result.events);
  }
  assert.equal(state.status, 'cleared');
  assert.equal(events.filter(e => e.type === 'monsterDefeated').length, types.length);
  assert.equal(events.filter(e => e.type === 'coinsDropped').length, types.length);
  const hits = events.filter(e => e.type === 'monsterDamaged');
  assert.equal(hits.length, types.length, 'area and double shots cannot hit an already killed target');
  assert.ok(hits.every(e => e.kind === 'soldier' && e.soldier?.type === type));
  assert.equal(accounts.xp.view.total, types.length * OPENING_EXPERIENCE.experiencePerKill);
  assert.equal(state.frostEnergy, types.length);
  const coins = types.length * coinRulesFor('normal').normal;
  assert.equal(accounts.wallet.balance(), coins); assert.equal(accounts.awarded, coins);
  accounts.replay(events);
  assert.equal(accounts.reload().balance(), coins);
  assert.deepEqual(stepCombat(state).events, []);
  assert.equal(stepCombat(state).state.frostEnergy, types.length);
  accounts.dispose();
});

test('self-detonation grants no XP, coins or frost energy', () => {
  const initial = createOpeningEncounter('army-self-explosion', 'apple', 1);
  const state: CombatState = { ...initial, shotRemainingMs: 100000, frostEnergy: 7,
    monsters: [{ ...initial.monsters[0], enemyType: 'exploder', hp: 100, maxHp: 100,
      status: 'attackingBase', position: { x: 180, y: 450 }, explosionRemainingMs: 10, dropCoins: 1 }] };
  const accounts = ledger(state), result = stepCombat(state);
  accounts.replay(result.events);
  assert.equal(result.state.status, 'cleared');
  assert.ok(result.state.base.hp < state.base.hp);
  assert.equal(result.state.frostEnergy, 7);
  assert.equal(accounts.xp.view.total, 0); assert.equal(accounts.wallet.balance(), 0);
  assert.equal(accounts.awarded, 0);
  assert.equal(result.events.filter(e => e.type === 'monsterDefeated' || e.type === 'coinsDropped').length, 0);
  assert.deepEqual(stepCombat(result.state).events, []);
  accounts.dispose();
});

test('pending flying enemy prevents clear after the ground kill and yields rewards only when killed', () => {
  const initial = createOpeningEncounter('army-pending-air', 'apple', 1);
  const enemy = { ...initial.monsters[0], hp: 1, maxHp: 1, dropCoins: 1, position: { x: 180, y: 420 } };
  let state: CombatState = { ...initial, monsterSpeed: 0, shotRemainingMs: 100000,
    supportSoldiers: [ally('rifle')], monsters: [{ ...enemy, status: 'alive' }],
    incomingMonsters: [{ ...enemy, id: `${initial.context.sessionId}:wave:2:zombie:0`, enemyType: 'flying', status: 'waiting', spawnAtMs: 1000 }] };
  const accounts = ledger(state);
  const first = stepCombat(state); state = first.state; accounts.replay(first.events);
  assert.equal(state.status, 'fighting'); assert.equal(state.incomingMonsters!.length, 1);
  assert.equal(accounts.xp.view.total, OPENING_EXPERIENCE.experiencePerKill);
  for (let tick = 0; tick < 400 && state.status === 'fighting'; tick++) {
    const next = stepCombat(state); state = next.state; accounts.replay(next.events);
  }
  assert.equal(state.status, 'cleared'); assert.equal(state.incomingMonsters!.length, 0);
  assert.equal(accounts.xp.view.total, 2 * OPENING_EXPERIENCE.experiencePerKill);
  assert.equal(accounts.wallet.balance(), 2); assert.equal(state.frostEnergy, 2);
  accounts.dispose();
});

for (const type of SOLDIER_TYPES) test(`${type}: grand Boss kill and victory receipts survive repeated delivery and wallet reload`, () => {
  const initial = createOpeningEncounter(`army-boss-${type}`, 'apple', 1);
  const state: CombatState = { ...initial, shotRemainingMs: 100000, supportSoldiers: [ally(type)],
    monsters: [{ ...initial.monsters[0], hp: 1, maxHp: 1, boss: true, bossKind: 'grand',
      enemyType: 'normal', dropCoins: 0, status: 'alive', position: { x: 180, y: 420 } }] };
  const accounts = ledger(state), result = stepCombat(state);
  accounts.replay(result.events);
  assert.equal(result.state.status, 'cleared');
  assert.equal(accounts.xp.view.total, OPENING_EXPERIENCE.experiencePerKill);
  assert.equal(result.state.frostEnergy, 1);
  assert.equal(accounts.wallet.balance(), 20); assert.equal(accounts.awarded, 20);
  assert.equal(accounts.reload().rewardGrandBoss(state.context.sessionId, 1, 'normal').added, 0);
  accounts.wallet.rewardVictory(state.context.sessionId, 1);
  accounts.reload().rewardVictory(state.context.sessionId, 1);
  accounts.replay(result.events);
  assert.equal(accounts.wallet.balance(), 120);
  accounts.dispose();
});
