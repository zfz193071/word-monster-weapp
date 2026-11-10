import type { SoldierType } from './army';
export const SUMMON_SKILLS = ['rifleSupport','shieldLine','flameSquad','rocketSupport','airFormation','armorSupport'] as const;
export type SummonSkillId = typeof SUMMON_SKILLS[number];
export const SUMMON_TYPES: Readonly<Record<SummonSkillId,SoldierType>> = {
  rifleSupport:'rifle',shieldLine:'shield',flameSquad:'flamethrower',rocketSupport:'rocket',airFormation:'jetpack',armorSupport:'tank',
};
export const SUMMON_LABELS = {rifleSupport:'步枪支援',shieldLine:'防御阵线',flameSquad:'烈焰小队',rocketSupport:'火箭支援',airFormation:'空中编队',armorSupport:'装甲支援'};
export function isSummonSkill(id:string): id is SummonSkillId {return (SUMMON_SKILLS as readonly string[]).includes(id);}
export function canAcquireSummon(skills: Readonly<Partial<Record<SummonSkillId,unknown>>>, id:string):boolean {
  return !isSummonSkill(id) || !!skills[id] || SUMMON_SKILLS.filter(key=>skills[key]).length<3;
}
