import { createOpeningEncounter } from './opening-encounter';
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
  // Keep the previous relative difficulty pacing, but release one monster at a time.
  const intervals = {easy:[2500,1000], normal:[2080,800], hard:[1670,650], nightmare:[1390,500]}[difficulty];
  const total = waves.reduce((sum, wave) => sum + wave.monsters.length, 0);
  let offset = 0;
  for (const wave of waves) {
    starts.push(offset);
    for (const monster of wave.monsters) {
      const spawnAtMs = offset;
      monsters.push(Object.freeze({...monster, spawnAtMs, status:spawnAtMs > 0 ? 'waiting' : 'entering'}));
      offset += Math.round(intervals[0] + (intervals[1] - intervals[0]) * (monsters.length - 1) / Math.max(1, total - 2));
    }
  }
  const first = waves[0];
  return Object.freeze({...first, context:Object.freeze({...first.context, combatId:`${plan.sessionId}:stage`}),
    monsters:Object.freeze(monsters.filter(monster => monster.spawnAtMs === 0)),
    incomingMonsters:Object.freeze(monsters.slice(1)), waveStartTimesMs:Object.freeze(starts),
    invasion:Object.freeze({nextAtMs:monsters[1].spawnAtMs!, waveNumber:1,
      ...(difficulty === 'easy' ? {aliveLimits:Object.freeze(waves.map((_, index) => 3 + Math.floor(12 * index / (waves.length - 1))))} : {})})});
}
