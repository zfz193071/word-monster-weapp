import type { EnemyType } from './army';
import { enemyType, ENEMY_TYPES } from './army';
import type { RandomSource } from './types';

export const ENEMY_STATS = Object.freeze({
  normal: {hp:1,speed:1,attack:1}, runner: {hp:.8,speed:1.6,attack:1},
  armored: {hp:1.5,speed:.8,attack:1}, flying: {hp:1,speed:1.15,attack:1},
  exploder: {hp:.8,speed:1,attack:2}, giant: {hp:3,speed:.6,attack:2},
});
const WEIGHTS = [[100,0,0,0,0,0],[80,20,0,0,0,0],[65,20,15,0,0,0],
  [55,20,15,10,0,0],[45,20,15,10,10,0],[40,15,15,10,10,10]];
export function drawEnemyType(wave: number, first: boolean, random: RandomSource): EnemyType {
  if (!Number.isSafeInteger(wave) || wave < 1 || wave > 19) throw new Error('无效兵种轮次');
  const phase = Math.min(5, Math.floor((wave - 1) / 3));
  if (first && phase > 0 && wave === phase * 3 + 1) return ENEMY_TYPES[phase];
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('无效兵种随机数');
  let remaining = value * 100;
  for (let i = 0; i < ENEMY_TYPES.length; i++) { remaining -= WEIGHTS[phase][i]; if (remaining < 0) return ENEMY_TYPES[i]; }
  throw new Error('兵种权重无效');
}
export function enemyStats(type: EnemyType | undefined) { return ENEMY_STATS[enemyType(type)]; }
export function armoredDamage(type: EnemyType | undefined, damage: number, kinetic: boolean): number {
  return enemyType(type) === 'armored' && kinetic ? Math.max(1, Math.ceil(damage * .5)) : damage;
}
