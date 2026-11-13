import type { MonsterState, SupportSoldierState } from './types';

/**
 * 敌方兵种类型定义。
 * 
 * 兵种说明：
 * - normal: 普通僵尸，维持标准速度和生命
 * - runner: 奔跑型僵尸，速度 1.6 倍，生命 0.8 倍
 * - armored: 重甲僵尸，生命 1.5 倍，速度 0.8 倍
 * - flying: 飞行僵尸，速度 1.15 倍，空中单位
 * - exploder: 自爆僵尸，生命 0.8 倍，伤害 2 倍
 * - giant: 巨型僵尸，生命 3 倍，速度 0.6 倍，伤害 2 倍
 * - archer: 弓箭僵尸，远程攻击，射程 200px，伤害 15%，射速 2 秒，血量 70%
 * - stone: 投石僵尸，远程攻击，射程 300px，伤害 25%，射速 3-4 秒，血量 60%
 * 
 * 当前配置：
 * - 仅苹果僵尸 (#112) 为奔跑型 (runner)，速度 28
 * - 其他所有僵尸类型维持原样 (normal)，速度 20
 * - 新增僵尸类型默认使用 normal，需显式配置才能启用其他兵种
 * 
 * @see https://github.com/zfz193071/word-monster-weapp/issues/113
 * @see https://github.com/zfz193071/word-monster-weapp/issues/111
 */
export const ENEMY_TYPES = ['normal', 'runner', 'armored', 'flying', 'exploder', 'giant', 'archer', 'stone'] as const;
export type EnemyType = typeof ENEMY_TYPES[number];
export const SOLDIER_TYPES = ['rifle', 'shield', 'flamethrower', 'rocket', 'jetpack', 'tank'] as const;
export type SoldierType = typeof SOLDIER_TYPES[number];
export type CombatLayer = 'ground' | 'air';
export type SoldierSource = 'inventory' | 'boss' | 'skill';
export type AttackCapability = 'both' | 'ground' | 'air';
// A battle can field up to thirty allied soldiers, regardless of whether they
// came from inventory, a boss reward, or a summon skill.
export const MAX_SUPPORT_SOLDIERS = 30;
export const SUMMON_INTERVAL_MS = 20000;

export function enemyType(value?: EnemyType): EnemyType {
  if (value === undefined) return 'normal';
  // Hot path: targetability checks run per projectile × monster every step.
  switch (value) {
    case 'normal': case 'runner': case 'armored': case 'flying': case 'exploder': case 'giant':
    case 'archer': case 'stone': return value;
    default: throw new Error('未知僵尸类型');
  }
}
export function soldierType(value?: SoldierType): SoldierType {
  if (value === undefined) return 'rifle';
  if (!SOLDIER_TYPES.includes(value)) throw new Error('未知援军兵种');
  return value;
}
export function enemyLayer(monster: Pick<MonsterState, 'enemyType' | 'boss'>): CombatLayer {
  if (monster.boss) return 'ground';
  const type = enemyType(monster.enemyType);
  return type === 'flying' ? 'air' : 'ground';
}
export function soldierLayer(soldier: Pick<SupportSoldierState, 'soldierType'>): CombatLayer {
  return soldierType(soldier.soldierType) === 'jetpack' ? 'air' : 'ground';
}
export function soldierCapability(soldier: Pick<SupportSoldierState, 'soldierType'>): AttackCapability {
  return ['shield', 'flamethrower', 'tank'].includes(soldierType(soldier.soldierType)) ? 'ground' : 'both';
}
export function canAttackLayer(capability: AttackCapability, layer: CombatLayer): boolean {
  if (capability !== 'both' && capability !== 'ground' && capability !== 'air') throw new Error('未知目标能力或空地层');
  if (layer !== 'ground' && layer !== 'air') throw new Error('未知目标能力或空地层');
  return capability === 'both' || capability === layer;
}
// Entry actors become targetable once visible. Scheduled and dead actors never do.
export function targetable(monster: MonsterState, capability: AttackCapability = 'both'): boolean {
  if (!(monster.hp > 0)) return false;
  const status = monster.status;
  if (status === 'waiting' || status === 'defeated' || status === 'retiring') return false;
  return canAttackLayer(capability, enemyLayer(monster));
}
export function validateSoldierIdentity(soldier: SupportSoldierState): void {
  const type = soldierType(soldier.soldierType);
  if (soldier.source !== undefined && !['inventory', 'boss', 'skill'].includes(soldier.source)) throw new Error('未知援军来源');
  if (soldier.source === 'skill' && !soldier.skill) throw new Error('技能援军缺少成长属性');
  if (soldier.source !== 'skill' && (type !== 'rifle' || soldier.evolved)) throw new Error('旧援军只能使用普通步枪形态');
}
