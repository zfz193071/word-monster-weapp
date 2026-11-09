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

for (const difficulty of ['easy','nightmare'] as const) for (const width of [360,990]) {
 const seed=Number(process.argv[2] ?? 41);
 const plan=createOpeningPlan(`balance-${seed}`,createSeededRandom(seed),difficulty==='easy'?1:8,difficulty==='easy'?1:7,difficulty);
 let collection:SkillCollection=difficulty==='easy'?{}:Object.fromEntries(SKILL_IDS.map(id=>[id,{level:5,quality:'legendary'}]));
 let state=resizeCombatArena(createStageInvasion(plan,1,collection),width);
 if(difficulty==='nightmare')state=attachCombatPet(state,createBattlePet({level:40,equipped:[]}));
 const xp=createExperience(plan.sessionId,OPENING_EXPERIENCE);
 let peakAlive=0;
 while(state.status==='fighting'&&state.tick<240000){
  const result=stepCombat(state);state=result.state;
  peakAlive=Math.max(peakAlive,state.monsters.filter(m=>m.hp>0).length);
  for(const level of xp.record(result.events).upgrades){
   const offer=qualitySkillOffer(plan.sessionId,level,collection,state.base,createSeededRandom(seed*100+level),plan);
   // One pick per level (wrong-answer path), no consumables or manual frost burst.
   const card=offer.cards.find(c=>c.id==='doubleShot'||c.id==='fireRate')??offer.cards[0];
   if(!card)continue;
   if(card.id==='repair')state={...state,base:{...state.base,hp:state.base.maxHp}};
   else {collection=applySkillReward(collection,{id:card.id,quality:card.quality!});state=applyCombatSkills(state,skillLevels(collection),collection);}
  }
 }
 console.log(JSON.stringify({seed,difficulty,width,status:state.status,combatSeconds:state.tick/100,hp:state.base.hp,maxHp:state.base.maxHp,level:xp.view.level,kills:state.defeatedMonsterIds.length,remaining:state.incomingMonsters?.length,peakAlive}));
 if(state.status!=='cleared')process.exitCode=1;
}
