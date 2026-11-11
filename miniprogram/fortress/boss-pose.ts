import { bossChargePhase, grandBossWindingUp } from './battle-progression';
import type { MonsterState } from './types';

export interface BossPose { readonly torsoY: number; readonly torsoScaleY: number }
const REST: BossPose = {torsoY: 0, torsoScaleY: 1};

/** Presentation follows the existing simulation phases; no independent timer.
 * Feet stay planted while the torso compresses in preparation and follows through.
 */
export function bossPose(monster: MonsterState, tick: number): BossPose {
  if (!monster.boss || monster.hp <= 0 || monster.status === 'waiting') return REST;
  const elapsed = tick * 10 - (monster.spawnAtMs ?? 0);
  if (monster.bossKind === 'grand') {
    const phase = elapsed % 10000;
    if (grandBossWindingUp(elapsed)) {
      const preparation = Math.sin(phase / 1000 * Math.PI / 2);
      return {torsoY: preparation * 6, torsoScaleY: 1 - preparation * .04};
    }
    if (elapsed >= 11000 && phase >= 1000 && phase < 1400) {
      const release = 1 - (phase - 1000) / 400;
      return {torsoY: release * 12, torsoScaleY: 1 + release * .015};
    }
  } else if (monster.status !== 'attackingBase') {
    const phase = bossChargePhase(elapsed);
    if (phase === 'warning') {
      const preparation = Math.sin(((elapsed - 8000) % 8000) / 1000 * Math.PI / 2);
      return {torsoY: preparation * 5, torsoScaleY: 1 - preparation * .035};
    }
    if (phase === 'charging') return {torsoY: 6, torsoScaleY: 1.015};
  }
  return REST;
}
