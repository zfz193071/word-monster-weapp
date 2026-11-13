import type { EnemyType } from './army';
import { enemyType, ENEMY_TYPES } from './army';
import type { RandomSource } from './types';

/**
 * 僵尸兵种属性倍率。
 * 
 * 当前实施范围 (#113)：
 * - 仅苹果僵尸使用 runner 类型（速度 28，生命 0.8）
 * - 所有其他僵尸（水果/动物/Boss）维持 normal 类型（速度 20，生命 1.0）
 * - 新增僵尸类型默认使用 normal，需美术资源确认和显式配置才能调整
 * 
 * 远程僵尸 (#111)：
 * - archer: 弓箭僵尸，血量 0.7，速度 1.0，攻击 0.15（基础伤害的 15%）
 * - stone: 投石僵尸，血量 0.6，速度 0.9，攻击 0.25（基础伤害的 25%）
 * 
 * @see https://github.com/zfz193071/word-monster-weapp/issues/112
 * @see https://github.com/zfz193071/word-monster-weapp/issues/113
 * @see https://github.com/zfz193071/word-monster-weapp/issues/111
 */
export const ENEMY_STATS = Object.freeze({
  normal: {hp:1,speed:1,attack:1}, runner: {hp:.8,speed:1.6,attack:1},
  armored: {hp:1.5,speed:.8,attack:1}, flying: {hp:1,speed:1.15,attack:1},
  exploder: {hp:.8,speed:1,attack:2}, giant: {hp:3,speed:.6,attack:2},
  archer: {hp:.7,speed:1,attack:.15}, stone: {hp:.6,speed:.9,attack:.25},
});
// 兵种权重配置 (normal, runner, armored, flying, exploder, giant, archer, stone)
// 远程僵尸 (archer + stone) 在后期波次出现，总比例约 15%-20%
const WEIGHTS = [
  [100,0,0,0,0,0,0,0],  // 波次 1-3: 仅普通僵尸
  [80,20,0,0,0,0,0,0],  // 波次 4-6: 普通 + 奔跑
  [65,20,15,0,0,0,0,0], // 波次 7-9: 普通 + 奔跑 + 重甲
  [50,20,15,10,5,0,0,0], // 波次 10-12: 加入自爆，远程僵尸 0%
  [40,15,15,10,10,5,5,0], // 波次 13-15: 加入巨型，弓箭 5%
  [35,12,13,10,10,5,8,7], // 波次 16-19: 弓箭 8% + 投石 7% = 15%
];
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
