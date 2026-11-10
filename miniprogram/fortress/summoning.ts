import { FORTRESS_RULES } from './rules';
import { SUMMON_INTERVAL_MS } from './army';
import { isSummonSkill, SUMMON_TYPES } from './summon-skills';
import type { SummonSkillId } from './summon-skills';
import type { SkillCollection } from './skill-quality';
import { soldierStats } from './soldier-types';
import { weaponForLevel } from '../weapons/catalog';
import type { CombatState, SupportSoldierState } from './types';

// Simulation-time reducer: no wall clock timers or permanent inventory access.
export function updateSummons(state:CombatState, collection:SkillCollection, elapsedMs=0):CombatState {
  const previous=state.skillCollection ?? {}, timers={...state.summonRemainingMs};
  let sequence=state.nextSummonSequence ?? 0;
  const weaponDamage=weaponForLevel(state.weaponLevel ?? 1).damage;
  let soldiers=[...(state.supportSoldiers ?? [])];
  const order=Object.keys(collection).filter(isSummonSkill);
  if(order.length>3)throw new Error('最多拥有三种召唤技能');
  for(const id of order){
    const skill=collection[id]!,type=SUMMON_TYPES[id];
    soldiers=soldiers.map(soldier=>{
      if(soldier.source!=='skill'||soldier.soldierType!==type)return soldier;
      if(previous[id]?.level===skill.level&&previous[id]?.quality===skill.quality)return soldier;
      if(soldier.skill?.level===skill.level&&soldier.skill.quality===skill.quality)return soldier;
      const stats=soldierStats(type,skill,weaponDamage,soldier.evolved);
      return {...soldier,skill,evolved:stats.evolved,maxHp:stats.maxHp,hp:Math.max(1,Math.floor(soldier.hp/soldier.maxHp*stats.maxHp)),attackRemainingMs:Math.min(soldier.attackRemainingMs,stats.interval)};
    });
    const newSkill=!previous[id], freshStage=timers[id]===undefined;
    const remaining=(timers[id] ?? SUMMON_INTERVAL_MS)-elapsedMs;
    if(newSkill||freshStage||remaining<=0){
      // Presence is by type, including an inventory/Boss rifle.
      if(soldiers.length<3&&(newSkill||freshStage||!soldiers.some(s=>(s.soldierType??'rifle')===type))){
        const slot=[0,1,2].find(slot=>!soldiers.some(s=>s.slot===slot))!;
        const stats=soldierStats(type,skill,weaponDamage);
        const soldier:SupportSoldierState={id:`${state.context.sessionId}:summon:${++sequence}`,slot,soldierType:type,source:'skill',skill,evolved:stats.evolved,
          position:{x:state.player.x+[-50,0,50][slot],y:FORTRESS_RULES.arena.baseTop},hp:stats.maxHp,maxHp:stats.maxHp,attackRemainingMs:stats.interval};
        soldiers.push(soldier);
      }
      timers[id]=SUMMON_INTERVAL_MS;
    }else timers[id]=remaining;
  }
  return {...state,supportSoldiers:soldiers,skillCollection:collection,summonRemainingMs:timers,nextSummonSequence:sequence};
}
export type SummonTimers = Readonly<Partial<Record<SummonSkillId,number>>>;
