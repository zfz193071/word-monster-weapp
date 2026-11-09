import { qualityDescription } from './quality-skills';
import { applySkillReward } from './skill-quality';
import type { SkillCollection } from './skill-quality';
import type { SkillLevels } from './types';
import type { UpgradeOffer } from './upgrade-choice';

const COMBOS = [
  { id: 'ice-chain', label: '冰链', symbols: ['❄', 'ϟ'], skills: ['frost', 'lightning'], names: ['冰霜', '雷电'] },
  { id: 'fire-fan', label: '火焰扇面', symbols: ['♨', '⋔'], skills: ['flame', 'doubleShot'], names: ['火焰', '齐射'] },
] as const;
export function comboProgress(skills: SkillLevels) {
  return COMBOS.map(combo => {
    const owned = combo.skills.map(id => (skills[id] ?? 0) > 0);
    const count = owned.filter(Boolean).length;
    return { id: combo.id, label: combo.label, first: combo.symbols[0], second: combo.symbols[1], firstOwned: owned[0], secondOwned: owned[1],
      status: count === 2 ? 'active' : count === 1 ? 'partial' : 'empty',
      hint: count === 2 ? '已激活' : count === 1 ? `差${combo.names[owned[0] ? 1 : 0]}` : '未获得' };
  });
}
export function withComboHints(offer: UpgradeOffer, skills: SkillLevels, collection?: SkillCollection): UpgradeOffer {
  return { ...offer, cards: offer.cards.map(card => {
    const combo = COMBOS.find(item => item.skills.some(id => id === card.id));
    if (!combo) return card;
    const progress = comboProgress(skills).find(item => item.id === combo.id)!;
    const other = combo.skills.find(id => id !== card.id)!;
    const description = collection && card.quality && card.icon !== 'repair' ? qualityDescription(card.icon, applySkillReward(collection, {id:card.icon, quality:card.quality})) : card.description;
    return { ...card, description, comboHint: progress.status === 'active' ? `${combo.label} · 已激活` : (skills[other] ?? 0) > 0 ? `${combo.label} · 选取即激活` : `${combo.label} · 需${combo.names[combo.skills[0] === other ? 0 : 1]}` };
  }) };
}
