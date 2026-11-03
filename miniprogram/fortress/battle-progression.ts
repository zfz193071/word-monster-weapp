import { createSeededRandom } from './plans';

export const DROP_LIMIT = 50;
export function stableBattleRandom(key: string): number {
  let seed = 2166136261;
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return createSeededRandom(seed >>> 0)();
}

// Every completed wave gives exactly one level. Boss replaces a normal monster,
// so each candidate wave starts at waveIndex + 1, even when it contains a boss.
export function bossWaveIndex(sessionId: string): number {
  for (let index = 9; index < 19; index++) {
    if (stableBattleRandom(`${sessionId}:boss:${index}`) < .15) return index;
  }
  return -1;
}

export function monsterStats(levelId: number, heroLevel: number, boss = false) {
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > 8
    || !Number.isInteger(heroLevel) || heroLevel < 1 || heroLevel > 20) throw new Error('怪物等级无效');
  const tier = heroLevel < 6 ? 0 : heroLevel < 10 ? 1 : heroLevel < 15 ? 2 : heroLevel < 20 ? 3 : 4;
  const hp = Math.ceil(8 * (1 + .15 * (levelId - 1)) * (1 + tier * .25)) * 10;
  const damage = Math.round(10 * (1 + .1 * (levelId - 1)) * (1 + tier * .1));
  return { hp: hp * (boss ? 3 : 1), attackDamage: Math.round(damage * (boss ? 1.5 : 1)) };
}

export function monsterDropCoins(monsterId: string, boss = false): number {
  return boss ? 10 : stableBattleRandom(`${monsterId}:coins`) < .1 ? 1 : 0;
}

export function bossChargePhase(elapsedSinceSpawnMs: number): 'normal' | 'warning' | 'charging' {
  if (elapsedSinceSpawnMs < 8000) return 'normal';
  const phase = (elapsedSinceSpawnMs - 8000) % 8000;
  return phase < 1000 ? 'warning' : phase < 3000 ? 'charging' : 'normal';
}
