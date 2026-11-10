import { soldierType, soldierLayer, enemyLayer, targetable, soldierCapability } from './army';
import type { SoldierType } from './army';
import { FORTRESS_RULES } from './rules';
import { SKILL_QUALITIES, qualityRank } from './skill-quality';
import type { OwnedSkill } from './skill-quality';
import type { MonsterState, SupportSoldierState } from './types';

const BASE = {
  rifle: {hp:30,damage:1,interval:2000,range:240,radius:0},
  shield: {hp:60,damage:1,interval:2500,range:70,radius:0},
  flamethrower: {hp:30,damage:2,interval:2000,range:120,radius:0},
  rocket: {hp:30,damage:4,interval:3000,range:260,radius:35},
  jetpack: {hp:25,damage:1,interval:1500,range:240,radius:0},
  tank: {hp:90,damage:5,interval:4000,range:260,radius:45},
} as const;
export function soldierStats(type: SoldierType, skill: OwnedSkill, weaponDamage: number, evolved = false) {
  const base = BASE[soldierType(type)], rank = qualityRank(skill.quality);
  if (!Number.isSafeInteger(skill.level) || skill.level < 1 || skill.level > 5 || !Number.isSafeInteger(weaponDamage) || weaponDamage < 1) throw new Error('援军成长参数无效');
  evolved ||= skill.level === 5 && rank >= 3;
  const q = SKILL_QUALITIES[rank].multiplier;
  return {evolved,maxHp:Math.ceil(base.hp * (1 + .15 * (skill.level - 1)) * q * (evolved && type === 'tank' ? 1.3 : 1)),
    damage:Math.ceil(base.damage * weaponDamage * (1 + .1 * (skill.level - 1)) * q),
    interval:evolved && type === 'jetpack' ? 1000 : base.interval,
    range:evolved && type === 'flamethrower' ? 150 : base.range,
    radius:evolved && type === 'rocket' ? 50 : evolved && type === 'tank' ? 60 : base.radius,
    arc:evolved ? 90 : 60, shots:evolved && type === 'rifle' ? 2 : 1,
    reduction:type === 'shield' ? evolved ? .5 : .3 : 0};
}
export function unitStats(soldier: SupportSoldierState, weaponDamage: number) {
  if (soldier.source === 'skill') {
    if (!soldier.skill) throw new Error('技能援军缺少成长属性');
    return soldierStats(soldierType(soldier.soldierType),soldier.skill,weaponDamage,soldier.evolved);
  }
  // Legacy inventory/Boss rifles retain unlimited old range and base weapon damage.
  return {maxHp:30,damage:weaponDamage,interval:2000,range:Infinity,radius:0,arc:0,shots:1,reduction:0,evolved:false};
}
export function soldierTargets(soldier: SupportSoldierState, monsters: readonly MonsterState[], weaponDamage: number): number[] {
  const stats = unitStats(soldier,weaponDamage), type = soldierType(soldier.soldierType);
  const distance = (m:MonsterState) => Math.hypot(m.position.x-soldier.position.x,m.position.y-soldier.position.y);
  const eligible = monsters.map((m,index)=>({m,index})).filter(({m})=>targetable(m,soldierCapability(soldier)) && m.position.y >= 0 && m.position.y <= FORTRESS_RULES.arena.baseTop && distance(m)<=stats.range);
  eligible.sort((a,b)=>distance(a.m)-distance(b.m)||a.index-b.index);
  if (!eligible.length) return [];
  const first=eligible[0];
  if(type==='rocket'||type==='tank') return monsters.flatMap((m,index)=>targetable(m,soldierCapability(soldier)) && enemyLayer(m)===enemyLayer(first.m)
    && Math.hypot(m.position.x-first.m.position.x,m.position.y-first.m.position.y)<=stats.radius?[index]:[]);
  if(type==='flamethrower') {
    const angle=Math.atan2(first.m.position.y-soldier.position.y,first.m.position.x-soldier.position.x);
    return eligible.filter(({m})=>{const delta=Math.atan2(m.position.y-soldier.position.y,m.position.x-soldier.position.x)-angle;
      return Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta)))<=stats.arc*Math.PI/360;}).map(({index})=>index);
  }
  return Array.from({length:stats.shots},()=>first.index);
}
export function receivedSoldierDamage(soldier: SupportSoldierState, damage: number): number {
  return Math.ceil(damage*(1-unitStats(soldier,1).reduction));
}
export function canBlock(soldier: SupportSoldierState, monster: MonsterState): boolean {
  return !monster.boss && soldier.hp>0 && soldierLayer(soldier)===enemyLayer(monster);
}
