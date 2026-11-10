import type { MonsterState, SupportSoldierState } from './types';

export const ENEMY_TYPES = ['normal', 'runner', 'armored', 'flying', 'exploder', 'giant'] as const;
export type EnemyType = typeof ENEMY_TYPES[number];
export const SOLDIER_TYPES = ['rifle', 'shield', 'flamethrower', 'rocket', 'jetpack', 'tank'] as const;
export type SoldierType = typeof SOLDIER_TYPES[number];
export type CombatLayer = 'ground' | 'air';
export type SoldierSource = 'inventory' | 'boss' | 'skill';
export type AttackCapability = 'both' | 'ground' | 'air';
export const MAX_SUPPORT_SOLDIERS = 3;
export const SUMMON_INTERVAL_MS = 20000;

export function enemyType(value?: EnemyType): EnemyType {
  if (value === undefined) return 'normal';
  if (!ENEMY_TYPES.includes(value)) throw new Error('未知僵尸类型');
  return value;
}
export function soldierType(value?: SoldierType): SoldierType {
  if (value === undefined) return 'rifle';
  if (!SOLDIER_TYPES.includes(value)) throw new Error('未知援军兵种');
  return value;
}
export function enemyLayer(monster: Pick<MonsterState, 'enemyType' | 'boss'>): CombatLayer {
  const type = enemyType(monster.enemyType);
  if (monster.boss && type !== 'normal') throw new Error('Boss不能使用普通僵尸兵种');
  return type === 'flying' ? 'air' : 'ground';
}
export function soldierLayer(soldier: Pick<SupportSoldierState, 'soldierType'>): CombatLayer {
  return soldierType(soldier.soldierType) === 'jetpack' ? 'air' : 'ground';
}
export function soldierCapability(soldier: Pick<SupportSoldierState, 'soldierType'>): AttackCapability {
  return ['shield', 'flamethrower', 'tank'].includes(soldierType(soldier.soldierType)) ? 'ground' : 'both';
}
export function canAttackLayer(capability: AttackCapability, layer: CombatLayer): boolean {
  if (!['both', 'ground', 'air'].includes(capability) || !['ground', 'air'].includes(layer)) throw new Error('未知目标能力或空地层');
  return capability === 'both' || capability === layer;
}
// Entry actors become targetable once visible. Scheduled and dead actors never do.
export function targetable(monster: MonsterState, capability: AttackCapability = 'both'): boolean {
  return monster.hp > 0 && !['waiting', 'defeated', 'retiring'].includes(monster.status)
    && canAttackLayer(capability, enemyLayer(monster));
}
export function validateSoldierIdentity(soldier: SupportSoldierState): void {
  const type = soldierType(soldier.soldierType);
  if (soldier.source !== undefined && !['inventory', 'boss', 'skill'].includes(soldier.source)) throw new Error('未知援军来源');
  if (soldier.source !== 'skill' && (type !== 'rifle' || soldier.evolved)) throw new Error('旧援军只能使用普通步枪形态');
}
