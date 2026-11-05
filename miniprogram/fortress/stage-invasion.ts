import { createOpeningEncounter, SPAWN_INTERVALS } from './opening-encounter';
import { skillLevels } from './quality-skills';
import { validateOpeningPlan } from './opening-plan';
import type { SkillCollection } from './skill-quality';
import type { CombatState, MonsterState, SessionPlan } from './types';

// One scene and simulation clock for the entire stage. Wave boundaries schedule
// arrivals, never reset enemies, allies, projectiles, cooldowns or attack IDs.
export function createStageInvasion(plan: SessionPlan, generation: number, collection: SkillCollection = {}): CombatState {
  validateOpeningPlan(plan);
  const difficulty = plan.difficulty ?? 'normal';
  const waves = plan.waves.map((wave, index) => createOpeningEncounter(plan.sessionId, wave.targetWordId, generation, index,
    skillLevels(collection), undefined, plan.waves.slice(0, index).map(previous => previous.targetWordId), plan.levelId, plan.weaponLevel, [], difficulty, collection));
  const monsters: MonsterState[] = [], starts: number[] = [];
  let offset = 0;
  for (const wave of waves) {
    starts.push(offset);
    for (const monster of wave.monsters) {
      const spawnAtMs = offset + (monster.spawnAtMs ?? 0);
      monsters.push(Object.freeze({...monster, spawnAtMs, status:spawnAtMs > 0 ? 'waiting' : 'entering'}));
    }
    offset += Math.max(...wave.monsters.map(monster => monster.spawnAtMs ?? 0)) + SPAWN_INTERVALS[difficulty][1];
  }
  const first = waves[0];
  return Object.freeze({...first, context:Object.freeze({...first.context, combatId:`${plan.sessionId}:stage`}),
    monsters:Object.freeze(monsters.filter(monster => monster.spawnAtMs === 0)),
    incomingMonsters:Object.freeze(monsters.filter(monster => monster.spawnAtMs! > 0)), waveStartTimesMs:Object.freeze(starts)});
}
