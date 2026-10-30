import { createCombat } from './combat';
import { FORTRESS_MONSTERS, monsterDrawWidth } from './content';
import { createSeededRandom, createSessionPlan } from './plans';
import { logicalHitbox } from './viewport';
import type { CombatState, SessionPlan } from './types';

export function createPreviewPlan(wordId: string, id: string): SessionPlan {
  for (let seed = 0; seed < 1000; seed++) {
    const plan = createSessionPlan(id, createSeededRandom(seed));
    if (plan.waves[0].targetWordId === wordId) return plan;
  }
  throw new Error('未能生成素材预览');
}

// Development-only caller chooses which asset to inspect. Every scene is still
// wave one with zero skills, so later-wave skill invariants are never bypassed.
export function createPreviewCombat(wordId: string, id: string): CombatState {
  return createPreviewPlanCombat(createPreviewPlan(wordId, id));
}

export function createPreviewPlanCombat(plan: SessionPlan, generation = 0): CombatState {
  const wordId = plan.waves[0].targetWordId;
  const visual = FORTRESS_MONSTERS.find(monster => monster.wordId === wordId);
  if (!visual) throw new Error('没有对应的水果怪物素材');
  return createCombat({ plan, waveIndex: 0, combatId: `${plan.sessionId}:combat:1`, generation, baseHp: 5,
    playerX: plan.waves[0].spawnPlan[0].position.x, skills: { doubleShot: 0, fireRate: 0, bulletWidth: 0 },
    monsterHitbox: logicalHitbox(visual, monsterDrawWidth(visual)) });
}
