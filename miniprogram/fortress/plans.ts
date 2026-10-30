import { FORTRESS_RULES, FORTRESS_SKILLS } from './rules';
import type { FortressRules, RandomSource, SessionPlan, SkillId, SkillLevels, SkillOffer } from './types';
import { assertNoFortressIssues, validateFortressRules, validateSessionPlan } from './validation';

function sample(random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('随机数必须位于 [0, 1)');
  return value;
}
function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(sample(random) * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function createSeededRandom(seed: number): RandomSource {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('种子须为 uint32');
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
// Generate once at new-session creation, including spawn coordinates. Retry/resume
// retain this immutable plan. A valid plan alone does NOT certify art/audio readiness.
export function createSessionPlan(sessionId: string, random: RandomSource, rules: FortressRules = FORTRESS_RULES): SessionPlan {
  assertNoFortressIssues(validateFortressRules(rules));
  if (!sessionId.trim()) throw new RangeError('会话 ID 不能为空');
  const waves = shuffle(rules.wordIds, random).map((targetWordId, index) => {
    const other = shuffle(rules.wordIds.filter(id => id !== targetWordId), random)[0];
    const waveId = `${sessionId}:wave:${index + 1}`;
    return Object.freeze({
      waveId, index, targetWordId,
      optionWordIds: Object.freeze(shuffle([targetWordId, other], random)),
      spawnPlan: Object.freeze([Object.freeze({
        monsterId: `${waveId}:monster:1`, wordId: targetWordId,
        position: Object.freeze({ x: rules.monster.spawnMinX + sample(random) * (rules.monster.spawnMaxX - rules.monster.spawnMinX), y: rules.monster.startY }),
      })]),
    });
  });
  const plan = Object.freeze({ mode: rules.mode, schemaVersion: rules.schemaVersion,
    contentVersion: rules.contentVersion, sessionId, waves: Object.freeze(waves) });
  assertNoFortressIssues(validateSessionPlan(plan));
  return plan;
}
export function validateSkillLevels(levels: SkillLevels): void {
  for (const definition of FORTRESS_SKILLS) {
    const level = levels[definition.id];
    if (!Number.isInteger(level) || level < 0 || level > definition.maxLevel) throw new RangeError(`skills.${definition.id}: 等级必须在 0—${definition.maxLevel}`);
  }
  if (Object.keys(levels).some(id => !FORTRESS_SKILLS.some(definition => definition.id === id))) throw new RangeError('未知技能');
}
// Only plans candidates. Applying effects/consuming an offer is owned by #11.
export function createSkillOffer(plan: SessionPlan, afterWaveIndex: number, levels: SkillLevels, random: RandomSource): SkillOffer {
  assertNoFortressIssues(validateSessionPlan(plan));
  validateSkillLevels(levels);
  if (!Number.isInteger(afterWaveIndex) || afterWaveIndex < 0 || afterWaveIndex >= FORTRESS_RULES.skillWaveCount) throw new RangeError('仅前四波提供技能');
  if (Object.values(levels).reduce((sum, value) => sum + value, 0) !== afterWaveIndex) throw new RangeError('技能已选次数与当前波次不匹配');
  const eligible = FORTRESS_SKILLS.filter(skill => levels[skill.id] < skill.maxLevel).map(skill => skill.id);
  const chosen = shuffle(eligible, random);
  if (chosen.length < 2) throw new RangeError('可升级技能不足两个');
  const candidateIds: readonly [SkillId, SkillId] = Object.freeze([chosen[0], chosen[1]]);
  const wave = plan.waves[afterWaveIndex];
  return Object.freeze({ offerId: `${wave.waveId}:skill`, sessionId: plan.sessionId, afterWaveId: wave.waveId, candidateIds });
}
