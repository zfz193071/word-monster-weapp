import test from 'node:test';
import assert from 'node:assert/strict';
import { updateSummons } from '../miniprogram/fortress/summoning';
import { applyCombatSkills, stepCombat, summonSupportSoldier, reviveCompanion } from '../miniprogram/fortress/combat';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { applySkillReward, rollUpgradeCandidates } from '../miniprogram/fortress/skill-quality';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { SUMMON_SKILLS, isSummonSkill } from '../miniprogram/fortress/summon-skills';
import { skillLevels } from '../miniprogram/fortress/quality-skills';
const first={level:1,quality:'crude' as const};
const initial=()=>createOpeningEncounter('summons','apple',1);
test('first acquisition summons once, upgrades preserve HP ratio/cooldown and do not restart twenty second timer',()=>{
 let state=applyCombatSkills(initial(),skillLevels({shieldLine:first}),{shieldLine:first});assert.equal(state.supportSoldiers!.length,1);
 state={...state,supportSoldiers:state.supportSoldiers!.map(s=>({...s,hp:30,attackRemainingMs:333})),summonRemainingMs:{shieldLine:1234}};
 const next=applyCombatSkills(state,skillLevels({shieldLine:{...first,level:2}}),{shieldLine:{...first,level:2}});
 assert.equal(next.supportSoldiers!.length,1);assert.equal(next.supportSoldiers![0].hp,34);assert.equal(next.supportSoldiers![0].attackRemainingMs,333);assert.equal(next.summonRemainingMs!.shieldLine,1234);
});
test('full squads neither replace nor bank spawns; twenty second checks refill one missing type',()=>{
 let state=initial();for(let i=0;i<3;i++)state=summonSupportSoldier(state,'inventory'+i)!;
 state=updateSummons(state,{armorSupport:first});assert.equal(state.supportSoldiers!.length,3);assert(state.supportSoldiers!.every(s=>s.source!=='skill'));
 state=updateSummons(state,state.skillCollection!,20000);assert.equal(state.supportSoldiers!.length,3);
 state={...state,supportSoldiers:state.supportSoldiers!.slice(0,2)};
 state=updateSummons(state,state.skillCollection!,19990);assert.equal(state.supportSoldiers!.length,2);
 state=updateSummons(state,state.skillCollection!,10);assert.equal(state.supportSoldiers!.length,3);assert.equal(state.supportSoldiers![2].soldierType,'tank');
});
test('cross-stage collection starts fresh units in acquisition order; death does not consume unspent inventory',()=>{
 const collection={armorSupport:first,airFormation:first,shieldLine:first};
 const state=createOpeningEncounter('next','apple',1,0,skillLevels(collection),undefined,[],1,1,[],'normal',collection);
 assert.deepEqual(state.supportSoldiers!.map(s=>s.soldierType),['tank','jetpack','shield']);assert.deepEqual(Object.values(state.summonRemainingMs!),[20000,20000,20000]);
 const before=state.summonRemainingMs!.armorSupport!;assert.equal(stepCombat(state).state.summonRemainingMs!.armorSupport,before-10);
});
test('three summon skills cap applies to rewards and double-choice candidates without hiding ordinary skills',()=>{
 const two={armorSupport:first,airFormation:first},three={...two,shieldLine:first};
 assert.throws(()=>applySkillReward(three,{id:'rocketSupport',quality:'rare'}));
 for(let seed=1;seed<100;seed++){
  const offers=rollUpgradeCandidates(two,5,{hp:100,maxHp:100},createSeededRandom(seed));
  assert(offers.filter(c=>isSummonSkill(c.id)&&!Object.keys(two).includes(c.id)).length<=1);
  const capped=rollUpgradeCandidates(three,5,{hp:100,maxHp:100},createSeededRandom(seed));
  assert(capped.every(c=>!isSummonSkill(c.id)||Object.keys(three).includes(c.id)));
 }
 assert.equal(SUMMON_SKILLS.length,6);
});

test('first rifle skill may fill a free slot beside an inventory rifle; periodic checks do not duplicate the type',()=>{
 const base=summonSupportSoldier(initial(),'stock')!;
 const state=updateSummons(base,{rifleSupport:first});assert.equal(state.supportSoldiers!.length,2);
 assert.equal(state.supportSoldiers!.filter(s=>s.source==='skill').length,1);
 assert.equal(updateSummons(state,state.skillCollection!,20000).supportSoldiers!.length,2);
});

test('all six summons evolve without healing, can die, revive and are rebuilt fresh on a new stage',()=>{
 for(const id of SUMMON_SKILLS){
  const collection={[id]:{level:4,quality:'elite' as const}};
  let state=updateSummons(initial(),collection);
  const unit=state.supportSoldiers![0];
  state={...state,supportSoldiers:[{...unit,hp:Math.floor(unit.maxHp/2),attackRemainingMs:700}]};
  const upgraded={[id]:{level:5,quality:'elite' as const}};
  state=updateSummons(state,upgraded);
  const evolved=state.supportSoldiers![0];assert.equal(evolved.evolved,true);assert(evolved.hp<evolved.maxHp);assert.equal(evolved.attackRemainingMs,700);
  const dead={...state,supportSoldiers:[],fallenSoldiers:[{...evolved,hp:0}]};
  const revived=reviveCompanion(dead,'soldier',evolved.id)!;
  assert.equal(revived.supportSoldiers![0].evolved,true);assert.equal(revived.supportSoldiers![0].soldierType,evolved.soldierType);assert.equal(revived.supportSoldiers![0].hp,evolved.maxHp);
  const next=createOpeningEncounter('next-'+id,'apple',1,0,skillLevels(upgraded),undefined,[],1,1,[],'normal',upgraded);
  assert.equal(next.supportSoldiers![0].soldierType,evolved.soldierType);assert.equal(next.supportSoldiers![0].hp,evolved.maxHp);assert.equal(next.fallenSoldiers!.length,0);
 }
});

test('a fallen unit is not retroactively upgraded when revived after its skill changed',()=>{
 let state=updateSummons(initial(),{rifleSupport:{level:4,quality:'elite'}});
 const fallen={...state.supportSoldiers![0],hp:0};
 state={...state,supportSoldiers:[],fallenSoldiers:[fallen]};
 state=updateSummons(state,{rifleSupport:{level:5,quality:'elite'}});
 const revived=reviveCompanion(state,'soldier',fallen.id)!;
 const next=updateSummons(revived,revived.skillCollection!,10);
 assert.equal(next.supportSoldiers![0].skill!.level,4);assert.equal(next.supportSoldiers![0].evolved,false);
});
