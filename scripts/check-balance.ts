import { isSummonSkill } from '../miniprogram/fortress/summon-skills';
// Deterministic headless combat samples; not device playtests or measured player win rates.
import {createOpeningPlan} from '../miniprogram/fortress/opening-plan';
import {createStageInvasion} from '../miniprogram/fortress/stage-invasion';
import {createSeededRandom} from '../miniprogram/fortress/plans';
import {stepCombat,applyCombatSkills,attachCombatPet,resizeCombatArena} from '../miniprogram/fortress/combat';
import {qualitySkillOffer,skillLevels} from '../miniprogram/fortress/quality-skills';
import {applySkillReward,SKILL_IDS} from '../miniprogram/fortress/skill-quality';
import type {SkillCollection} from '../miniprogram/fortress/skill-quality';
import {createBattlePet} from '../miniprogram/pets/battle';
import {createExperience} from '../miniprogram/fortress/experience';
import {OPENING_EXPERIENCE} from '../miniprogram/fortress/opening-encounter';
import type { DifficultyId } from '../miniprogram/fortress/difficulty';

const matrix = process.argv.includes('--matrix');
const difficulties: DifficultyId[] = matrix ? ['easy', 'normal', 'hard', 'nightmare'] : ['easy', 'nightmare'];
const caseArg = process.argv.find(arg => arg.startsWith('--case='));
const selectedCase = caseArg === undefined ? undefined : Number(caseArg.slice('--case='.length));
if (selectedCase !== undefined && (!Number.isInteger(selectedCase) || selectedCase < 1 || selectedCase > (matrix ? 64 : 4))) {
 throw new Error('--case must be an integer from 1 to 64 with --matrix, or 1 to 4 without it');
}
let caseNumber = 0;
for (const difficulty of difficulties) for (const width of [360,990]) for (const levelId of (matrix ? [1,2,3,4,5,6,7,8] : [difficulty === 'easy' ? 1 : 8])) {
 caseNumber++;
 if (selectedCase !== undefined && caseNumber !== selectedCase) continue;
 const seed=Number(process.argv[2] ?? 41);
 if (!Number.isSafeInteger(seed)) throw new Error('Seed must be a safe integer; usage: check-balance.ts 41 [--matrix]');
 const highGrowth = difficulty === 'nightmare';
 const plan=createOpeningPlan(`balance-${seed}`,createSeededRandom(seed),levelId,highGrowth?7:1,difficulty);
 let collection:SkillCollection=!highGrowth?{}:Object.fromEntries(SKILL_IDS.filter(id=>!isSummonSkill(id)||['shieldLine','rocketSupport','airFormation'].includes(id)).map(id=>[id,{level:5,quality:'legendary'}]));
 let state=resizeCombatArena(createStageInvasion(plan,1,collection),width);
 if(difficulty==='nightmare')state=attachCombatPet(state,createBattlePet({level:40,equipped:[]}));
 const xp=createExperience(plan.sessionId,OPENING_EXPERIENCE);
 let peakAlive=0;const contributions:Record<string,number>={};
 const soldierContributions:Record<string,{type:string;source?:string;hits:number;damage:number;effectiveDamage:number}>={};
 while(state.status==='fighting'&&state.tick<240000){
  const result=stepCombat(state);state=result.state;
  peakAlive=Math.max(peakAlive,state.monsters.filter(m=>m.hp>0).length);
  for(const event of result.events)if(event.type==='monsterDamaged') {
   contributions[event.kind]=(contributions[event.kind]??0)+event.damage;
   if(event.kind==='soldier') {
    if(!event.soldier)throw new Error('Missing soldier attribution');
    const {id,type,source,effectiveDamage}=event.soldier;
    const unit=soldierContributions[id]??={type,source,hits:0,damage:0,effectiveDamage:0};
    unit.hits++;unit.damage+=event.damage;unit.effectiveDamage+=effectiveDamage;
   }
  }
  for(const level of xp.record(result.events).upgrades){
   const offer=qualitySkillOffer(plan.sessionId,level,collection,state.base,createSeededRandom(seed*100+level),plan);
   // One pick per level (wrong-answer path), no consumables or manual frost burst.
   const card=offer.cards.find(c=>c.id==='doubleShot'||c.id==='fireRate')??offer.cards[0];
   if(!card)continue;
   if(card.id==='repair')state={...state,base:{...state.base,hp:state.base.maxHp}};
   else {collection=applySkillReward(collection,{id:card.id,quality:card.quality!});state=applyCombatSkills(state,skillLevels(collection),collection);}
  }
 }
 const alive=state.monsters.filter(m=>m.hp>0).length;
 const queued=state.incomingMonsters?.length??0;
 if(state.status==='cleared'&&(alive||queued))throw new Error('Premature clear');
 if(Object.values(soldierContributions).reduce((sum,unit)=>sum+unit.damage,0)!==(contributions.soldier??0))throw new Error('Soldier attribution total mismatch');
 console.log(JSON.stringify({seed,levelId,difficulty,width,profile:highGrowth?'max-weapon-pet-skills':'base-weapon-no-pet',status:state.status,combatSeconds:state.tick/100,hp:state.base.hp,maxHp:state.base.maxHp,level:xp.view.level,kills:state.defeatedMonsterIds.length,remaining:queued,alive,peakAlive,contributions,soldierContributions}));
 // Matrix losses are measured outcomes, not harness failures. A timed-out run is incomplete.
 if(state.status==='fighting'||(!matrix&&state.status!=='cleared'))process.exitCode=1;
}
