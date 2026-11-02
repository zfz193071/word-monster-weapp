import type { MonsterState } from './types';
import { FORTRESS_RULES as RULES } from './rules';

// Use the simulation countdown so pause, animal cadence and damage stay aligned.
export function baseAttackPose(monster: MonsterState): { lunge: number; impact: number } {
  if (monster.hp <= 0 || monster.status !== 'attackingBase') return { lunge: 0, impact: 0 };
  const elapsed = (monster.attackIntervalMs ?? RULES.monster.attackIntervalMs) - monster.attackRemainingMs;
  if (monster.attackSequence > 0 && elapsed < 220) {
    return { lunge: Math.max(0, 1 - elapsed / 220), impact: Math.max(0, 1 - elapsed / 160) };
  }
  return { lunge: monster.attackRemainingMs < 260 ? -Math.sin(monster.attackRemainingMs / 260 * Math.PI) * .35 : 0, impact: 0 };
}
