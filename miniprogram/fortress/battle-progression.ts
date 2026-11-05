import { coinRulesFor, difficultyFor } from './difficulty';
import type { DifficultyId } from './difficulty';
import { createSeededRandom } from './plans';

export const DROP_LIMIT = coinRulesFor().limit;
export function stableBattleRandom(key: string): number {
  let seed = 2166136261;
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return createSeededRandom(seed >>> 0)();
}

// Iron captains are tried once per candidate wave, independently of hero XP.
export function bossWaveIndex(sessionId: string): number {
  for (let index = 9; index < 18; index++) {
    if (stableBattleRandom(`${sessionId}:boss:${index}`) < .15) return index;
  }
  return -1;
}

export function monsterStats(levelId: number, heroLevel: number, boss: boolean | 'grand' = false, difficulty: DifficultyId = 'normal') {
  const multipliers = difficultyFor(difficulty);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 8
    || !Number.isInteger(heroLevel) || heroLevel < 1 || heroLevel > 20) throw new Error('怪物等级无效');
  const tier = heroLevel < 6 ? 0 : heroLevel < 10 ? 1 : heroLevel < 15 ? 2 : heroLevel < 20 ? 3 : 4;
  const hp = Math.ceil(8 * (1 + .15 * (levelId - 1)) * (1 + tier * .25)) * 10;
  const damage = Math.round(10 * (1 + .1 * (levelId - 1)) * (1 + tier * .1));
  return { hp: Math.ceil(hp * (boss === 'grand' ? 20 : boss ? 8 : 1) * multipliers.hp), attackDamage: Math.ceil(Math.round(damage * (boss === 'grand' ? 2 : boss ? 1.5 : 1)) * multipliers.damage), ...(boss === 'grand' ? { shockwaveDamage: Math.ceil(damage * 3 * multipliers.damage) } : {}) };
}

export function monsterDropCoins(monsterId: string, boss = false, difficulty: DifficultyId = 'normal'): number {
  const coins = coinRulesFor(difficulty);
  if (!boss) return stableBattleRandom(`${monsterId}:coins`) < coins.chance ? coins.normal : 0;
  return coins.bossMin + Math.floor(stableBattleRandom(`${monsterId}:boss-coins`) * (coins.bossMax - coins.bossMin + 1));
}

export function bossSoldierDropCount(monsterId: string): number {
  if (stableBattleRandom(`${monsterId}:soldiers:chance`) >= .3) return 0;
  return 1 + Math.floor(stableBattleRandom(`${monsterId}:soldiers:count`) * 3);
}

export function bossChargePhase(elapsedSinceSpawnMs: number): 'normal' | 'warning' | 'charging' {
  if (elapsedSinceSpawnMs < 8000) return 'normal';
  const phase = (elapsedSinceSpawnMs - 8000) % 8000;
  return phase < 1000 ? 'warning' : phase < 3000 ? 'charging' : 'normal';
}

export function fortressMaxHp(levelId: number): number {
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 8) throw new Error('堡垒关卡无效');
  return 1000 + (levelId - 1) * 200;
}

export function grandBossWindingUp(elapsedMs: number): boolean {
  return elapsedMs >= 10000 && elapsedMs % 10000 < 1000;
}
