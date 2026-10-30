import { createCombat } from './combat';
import { FORTRESS_MONSTERS, monsterDrawWidth } from './content';
import { createSeededRandom, createSessionPlan } from './plans';
import { logicalHitbox } from './viewport';
import type { CombatState } from './types';

// Development-only caller chooses which asset to inspect. Every scene is still
// wave one with zero skills, so later-wave skill invariants are never bypassed.
export function createPreviewCombat(wordId: string, id: string): CombatState {
  const visual = FORTRESS_MONSTERS.find(monster => monster.wordId === wordId);
  if (!visual) throw new Error('没有对应的水果怪物素材');
  for (let seed = 0; seed < 1000; seed++) {
    const plan = createSessionPlan(id, createSeededRandom(seed));
    if (plan.waves[0].targetWordId !== wordId) continue;
    return createCombat({ plan, waveIndex: 0, combatId: id, generation: 0, baseHp: 5,
      playerX: plan.waves[0].spawnPlan[0].position.x, skills: { doubleShot: 0, fireRate: 0, bulletWidth: 0 },
      monsterHitbox: logicalHitbox(visual, monsterDrawWidth(visual)) });
  }
  throw new Error('未能生成素材预览');
}
