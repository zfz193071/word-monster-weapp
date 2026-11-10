import { SUMMON_SKILLS } from './summon-skills';
import type { SummonSkillId } from './summon-skills';
import { SKILL_QUALITIES } from './skill-quality';
import type { SkillQuality } from './skill-quality';
export interface UpgradeCard {
  readonly comboHint?: string;
  readonly quality?: SkillQuality;
  readonly resultingQuality?: SkillQuality;
  readonly qualityLabel?: string;
  readonly skillLevel?: number;
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: SummonSkillId | 'doubleShot' | 'fireRate' | 'bulletWidth' | 'flame' | 'frost' | 'lightning' | 'firepower' | 'homing' | 'repair';
}
export interface UpgradeOffer {
  readonly source?: 'level' | 'elite' | 'legendary';
  readonly id: string;
  readonly level: number;
  readonly cards: readonly UpgradeCard[];
}

export function validateUpgradeOffer(offer: UpgradeOffer): void {
  if (offer.source !== undefined && !['level','elite','legendary'].includes(offer.source)) throw new Error('技能奖励来源无效');
  for (const card of offer.cards) {
    if (card.quality !== undefined && (card.id === 'repair' || !SKILL_QUALITIES.some(q => q.id === card.quality)
      || !SKILL_QUALITIES.some(q => q.id === card.resultingQuality && q.label === card.qualityLabel)
      || !Number.isInteger(card.skillLevel) || card.skillLevel! < 1 || card.skillLevel! > 5)) throw new Error('技能品质或等级无效');
  }
  if (!offer.id.trim() || !Number.isSafeInteger(offer.level) || offer.level < 2 || (offer.cards.length < 1 || offer.cards.length > 3)
    || new Set(offer.cards.map(card => card.id)).size !== offer.cards.length
    || offer.cards.some(card => !card.id.trim() || !card.label.trim() || !card.description.trim()
      || !['doubleShot', 'fireRate', 'bulletWidth', 'flame', 'frost', 'lightning', 'firepower', 'homing', 'repair', ...SUMMON_SKILLS].includes(card.icon))) throw new Error('升级必须提供一至三个不同的有效技能候选');
}

// The coordinator supplies eligible cards after an actual level-up. No wave-based reward or implicit skill pool.
export function createUpgradeChoices() {
  const offers = new Map<string, UpgradeOffer>();
  const levels = new Set<number>();
  const selected = new Set<string>();
  let active: UpgradeOffer | null = null;
  let disposed = false;
  let remaining = 0;
  return {
    get current() { return active; },
    get remaining() { return remaining; },
    open(offer: UpgradeOffer, requireAnswer = false): UpgradeOffer | null {
      if (disposed) return null;
      if (active) return active.id === offer.id ? active : null;
      if (offers.has(offer.id) || ((!offer.source || offer.source === 'level') && levels.has(offer.level))) return null;
      validateUpgradeOffer(offer);
      active = Object.freeze({ ...offer, cards: Object.freeze(offer.cards.map(card => Object.freeze({ ...card }))) });
      remaining = requireAnswer ? 0 : 1;
      offers.set(offer.id, active); if (!offer.source || offer.source === 'level') levels.add(offer.level);
      return active;
    },
    answer(offerId: string, correct: boolean): boolean {
      if (disposed || !active || active.id !== offerId || remaining !== 0) return false;
      remaining = Math.min(correct ? 2 : 1, active.cards.length); return true;
    },
    select(offerId: string, cardId: string): UpgradeCard | null {
      if (disposed || !remaining || !active || active.id !== offerId || selected.has(offerId)) return null;
      const card = active.cards.find(card => card.id === cardId);
      if (!card) return null;
      selected.add(offerId); remaining--;
      active = remaining ? Object.freeze({...active, id:`${active.id}:second`, cards:Object.freeze(active.cards.filter(item => item.id !== cardId))}) : null;
      return card;
    },
    dispose() { disposed = true; active = null; remaining = 0; offers.clear(); levels.clear(); selected.clear(); },
  };
}
