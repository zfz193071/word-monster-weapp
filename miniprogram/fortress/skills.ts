import { createSkillOffer } from './plans';
import { FORTRESS_RULES, FORTRESS_SKILLS } from './rules';
import { assertNoFortressIssues, validateSessionPlan } from './validation';
import type { CombatState, RandomSource, SessionPlan, SkillId, SkillLevels, SkillOfferState } from './types';

export function skillCards(state: SkillOfferState | null, levels: SkillLevels) {
  if (!state) return [];
  return state.offer.candidateIds.map(id => {
    const definition = FORTRESS_SKILLS.find(skill => skill.id === id)!;
    const level = state.status === 'selected' && state.selection.skillId === id ? levels[id] - 1 : levels[id];
    const unit = id === 'doubleShot' ? '发' : id === 'fireRate' ? '毫秒' : '宽度';
    return { id, label: definition.label, description: `${definition.values[level]} → ${definition.values[level + 1]} ${unit}` };
  });
}

// One owner per run. The wave coordinator calls open only after retirement ends.
// No timers, rendering, learning records or automatic next-wave transitions here.
export function createSkillSession(plan: SessionPlan, random: RandomSource) {
  assertNoFortressIssues(validateSessionPlan(plan));
  let levels: SkillLevels = Object.freeze({ doubleShot: 0, fireRate: 0, bulletWidth: 0 });
  let offers: readonly SkillOfferState[] = Object.freeze([]);
  let paused = false;
  let disposed = false;
  return {
    get levels() { return levels; },
    get offers() { return offers; },
    open(combat: CombatState): SkillOfferState | null {
      if (disposed || paused || combat.status !== 'cleared' || combat.base.hp <= 0 || combat.context.sessionId !== plan.sessionId) return null;
      const index = plan.waves.findIndex(wave => wave.waveId === combat.context.waveId);
      if (index < 0 || index >= FORTRESS_RULES.skillWaveCount) return null;
      const previous = offers[index];
      if (previous) return previous;
      if (index !== offers.length || offers.some(item => item.status !== 'selected')) return null;
      if (FORTRESS_SKILLS.some(skill => combat.skills[skill.id] !== levels[skill.id])) return null;
      const state: SkillOfferState = Object.freeze({ status: 'offered', offer: createSkillOffer(plan, index, levels, random) });
      offers = Object.freeze([...offers, state]);
      return state;
    },
    select(offerId: string, skillId: SkillId): SkillOfferState | null {
      const current = offers[offers.length - 1];
      if (disposed || paused || !current || current.status !== 'offered' || current.offer.offerId !== offerId || !current.offer.candidateIds.includes(skillId)) return null;
      const selection = Object.freeze({ offerId, skillId, levelAfter: levels[skillId] + 1 });
      levels = Object.freeze({ ...levels, [skillId]: selection.levelAfter });
      const selected: SkillOfferState = Object.freeze({ status: 'selected', offer: current.offer, selection });
      offers = Object.freeze([...offers.slice(0, -1), selected]);
      return selected;
    },
    setPaused(value: boolean) { paused = value; },
    dispose() { disposed = true; },
  };
}
export type SkillSession = ReturnType<typeof createSkillSession>;
