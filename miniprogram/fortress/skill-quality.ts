import type { BattleSkillId, RandomSource, SkillLevels } from './types';

export const SKILL_IDS: readonly BattleSkillId[] = Object.freeze(['doubleShot', 'fireRate', 'bulletWidth', 'flame', 'frost', 'lightning', 'firepower', 'homing']);
export const SKILL_QUALITIES = Object.freeze([
  { id: 'crude', label: '简陋', color: '#92989b', multiplier: 1 },
  { id: 'fine', label: '精良', color: '#599c62', multiplier: 1.15 },
  { id: 'rare', label: '稀有', color: '#438acb', multiplier: 1.35 },
  { id: 'elite', label: '精英', color: '#9b62c6', multiplier: 1.6 },
  { id: 'legendary', label: '传说', color: '#d9a331', multiplier: 2 },
] as const);
export type SkillQuality = typeof SKILL_QUALITIES[number]['id'];
export interface OwnedSkill { readonly level: number; readonly quality: SkillQuality }
export type SkillCollection = Readonly<Partial<Record<BattleSkillId, OwnedSkill>>>;
export interface SkillReward { readonly id: BattleSkillId; readonly quality: SkillQuality }
export type SkillCandidate = SkillReward | { readonly id: 'repair' };
export const MAX_SKILL_LEVEL = 5;

export function qualityRank(quality: SkillQuality): number {
  const rank = SKILL_QUALITIES.findIndex(item => item.id === quality);
  if (rank < 0) throw new Error('未知技能品质');
  return rank;
}

// Used only when importing an older in-memory battle; absent skills stay absent.
export function skillsFromLegacy(levels: SkillLevels): SkillCollection {
  const skills: Partial<Record<BattleSkillId, OwnedSkill>> = {};
  for (const id of SKILL_IDS) {
    const level = levels[id] ?? 0;
    if (!Number.isSafeInteger(level) || level < 0) throw new Error('技能等级无效');
    if (level > 0) skills[id] = Object.freeze({ level: Math.min(level, MAX_SKILL_LEVEL), quality: 'crude' });
  }
  return Object.freeze(skills);
}

export function canImproveSkill(owned: OwnedSkill | undefined, quality: SkillQuality): boolean {
  return !owned || owned.level < MAX_SKILL_LEVEL || qualityRank(quality) > qualityRank(owned.quality);
}

// Offer consumption/idempotence belongs to the choice coordinator, not this pure reducer.
export function applySkillReward(skills: SkillCollection, reward: SkillReward): SkillCollection {
  const rank = qualityRank(reward.quality);
  const owned = skills[reward.id];
  if (!canImproveSkill(owned, reward.quality)) return skills;
  const quality = owned && qualityRank(owned.quality) > rank ? owned.quality : reward.quality;
  return Object.freeze({ ...skills, [reward.id]: Object.freeze({ level: Math.min((owned?.level ?? 0) + 1, MAX_SKILL_LEVEL), quality }) });
}

export function upgradeQualityWeights(heroLevel: number): readonly number[] {
  if (!Number.isSafeInteger(heroLevel) || heroLevel < 2 || heroLevel > 20) throw new Error('升级人物等级必须为2至20');
  return heroLevel <= 5 ? [60, 30, 10] : heroLevel <= 10 ? [35, 45, 20] : heroLevel <= 15 ? [15, 45, 40] : [5, 35, 60];
}

function draw(random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('随机数必须位于[0,1)');
  return value;
}

// First sample distinct eligible skills; then independently roll each card's quality.
// At Lv.5, normalize the same weights over qualities that still improve that skill.
export function rollUpgradeCandidates(skills: SkillCollection, heroLevel: number, base: { hp: number; maxHp: number }, random: RandomSource, ensureOffense = false): readonly SkillCandidate[] {
  const weights = upgradeQualityWeights(heroLevel);
  const eligible: (BattleSkillId | 'repair')[] = SKILL_IDS.filter(id => weights.some((weight, rank) => weight > 0 && canImproveSkill(skills[id], SKILL_QUALITIES[rank].id)));
  if (base.hp > 0 && base.hp < base.maxHp * .5) eligible.push('repair');
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(draw(random) * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  const selected = eligible.slice(0, 3);
  // Keep the sampled quality distribution and distinct cards; only guarantee an eligible offense choice.
  if (ensureOffense && !selected.some(id => id === 'doubleShot' || id === 'fireRate')) {
    const offense = eligible.find(id => id === 'doubleShot' || id === 'fireRate');
    if (offense) selected[selected.length - 1] = offense;
  }
  return Object.freeze(selected.map(id => {
    if (id === 'repair') return Object.freeze({ id });
    const available = weights.map((weight, rank) => canImproveSkill(skills[id], SKILL_QUALITIES[rank].id) ? weight : 0);
    let remaining = draw(random) * available.reduce((sum, weight) => sum + weight, 0);
    for (let rank = 0; rank < available.length; rank++) {
      remaining -= available[rank];
      if (remaining < 0) return Object.freeze({ id, quality: SKILL_QUALITIES[rank].id });
    }
    throw new Error('技能品质抽取失败');
  }));
}
