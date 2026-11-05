import { applySkillReward, rollUpgradeCandidates, SKILL_QUALITIES, qualityRank } from './skill-quality';
import type { SkillCollection } from './skill-quality';
import type { BattleSkillId, RandomSource, SkillLevels } from './types';
import type { UpgradeOffer } from './upgrade-choice';

export function skillLevels(skills: SkillCollection): SkillLevels {
  return Object.freeze({ doubleShot: 0, fireRate: 0, bulletWidth: 0, ...Object.fromEntries(Object.entries(skills).map(([id, skill]) => [id, skill.level])) });
}
export function qualityEffects(skills: SkillCollection) {
  const level = (id: BattleSkillId) => skills[id]?.level ?? 0;
  const rank = (id: BattleSkillId) => qualityRank(skills[id]?.quality ?? 'crude');
  const q = (id: BattleSkillId) => SKILL_QUALITIES[rank(id)].multiplier;
  return Object.freeze({
    count: level('doubleShot') ? Math.min(8, level('doubleShot') + 1 + Math.max(0, rank('doubleShot') - 2)) : 1,
    intervalMs: Math.max(160, 500 * (1 - .08 * level('fireRate') * q('fireRate'))),
    width: level('bulletWidth') ? Math.min(56, (8 + 4 * level('bulletWidth')) * q('bulletWidth')) : 8,
    widthDamageBonus: level('bulletWidth') ? Math.max(0, rank('bulletWidth') - 2) * .1 : 0,
    homingPenetrations: level('homing') ? Math.max(0, rank('homing') - 2) : 0,
    projectileMultiplier: (1 + (level('bulletWidth') ? Math.max(0, rank('bulletWidth') - 2) * .1 : 0)) * (1 + .02 * level('homing') * q('homing')),
    flameDamage: level('flame') ? Math.ceil((10 + 5 * level('flame')) * q('flame')) : 0,
    burnRatio: level('flame') ? [0,0,0,.25,.5][rank('flame')] : 0,
    freezeTicks: level('frost') ? [0,0,0,30,60][rank('frost')] : 0,
    flameRadius: [45,45,60,75,90][rank('flame')],
    frostSlow: level('frost') ? Math.min(.7, (.2 + .05 * level('frost')) * q('frost')) : 0,
    lightningDamage: level('lightning') ? Math.ceil((10 + 5 * level('lightning')) * q('lightning')) : 0,
    lightningTargets: level('lightning') ? [1,1,2,3,5][rank('lightning')] : 0,
    lightningRange: rank('lightning') === 4 ? 130 : 90,
    firepowerBonus: level('firepower') ? Math.min(1.5, (.4 + .1 * level('firepower')) * q('firepower')) : 0,
    firepowerTicks: [500,500,500,600,800][rank('firepower')],
  });
}
const LABELS: Record<BattleSkillId, string> = { doubleShot:'齐射',fireRate:'疾速',bulletWidth:'巨型弹丸',flame:'火花绽放',frost:'冰晶缓行',lightning:'跃动电弧',firepower:'火力激发',homing:'灵巧追踪' };
const number = (value: number) => Math.round(value * 100) / 100;
export function qualityDescription(id: BattleSkillId, skills: SkillCollection): string {
  const effect = qualityEffects(skills);
  switch (id) {
    case 'doubleShot': return `每次齐射${effect.count}发；元素仅附于其中一发`;
    case 'fireRate': return `自动射击间隔${number(effect.intervalMs)}毫秒`;
    case 'bulletWidth': return `弹丸宽度${number(effect.width)}${effect.widthDamageBonus ? `；普通子弹伤害增加${number(effect.widthDamageBonus * 100)}%` : ''}`;
    case 'flame': return `每5秒充能，半径${effect.flameRadius}内造成${effect.flameDamage}火焰伤害${effect.burnRatio ? `；灼烧2秒，每秒${Math.ceil(effect.flameDamage * effect.burnRatio)}伤害` : ''}`;
    case 'frost': return `每5秒充能，减速${number(effect.frostSlow * 100)}%，持续2秒${effect.freezeTicks ? `（含冻结${effect.freezeTicks / 100}秒）` : ''}；Boss免冻、最多减速35%`;
    case 'lightning': return `每5秒充能，额外命中${effect.lightningTargets}个目标，每个${effect.lightningDamage}伤害，范围${effect.lightningRange}`;
    case 'firepower': return `开场及每20秒触发，普通子弹伤害增加${number(effect.firepowerBonus * 100)}%，持续${effect.firepowerTicks / 100}秒`;
    case 'homing': return `自动追踪并重新锁定，普通子弹伤害增加${number(.02 * skills.homing!.level * SKILL_QUALITIES[qualityRank(skills.homing!.quality)].multiplier * 100)}%${effect.homingPenetrations ? `；额外穿透${effect.homingPenetrations}个目标，逐次保留70%伤害` : ''}；最多飞行4秒`;
  }
}
export function qualitySkillOffer(sessionId: string, level: number, skills: SkillCollection, base: {hp:number;maxHp:number}, random: RandomSource): UpgradeOffer {
  const cards = rollUpgradeCandidates(skills, level, base, random).map(candidate => {
    if (candidate.id === 'repair') return {id:'repair',icon:'repair' as const,label:'堡垒修复',description:'立即恢复堡垒全部生命值'};
    const next = applySkillReward(skills, candidate);
    const owned = next[candidate.id]!;
    const quality = SKILL_QUALITIES[qualityRank(owned.quality)];
    return { id:candidate.id,icon:candidate.id,label:LABELS[candidate.id],description:qualityDescription(candidate.id,next),quality:candidate.quality,
      resultingQuality:owned.quality,qualityLabel:quality.label,skillLevel:owned.level };
  });
  return {id:`${sessionId}:level:${level}`,level,cards};
}
