import { isSummonSkill } from '../miniprogram/fortress/summon-skills';
import assert from 'node:assert/strict';
import test from 'node:test';
import { nextStageRequest } from '../miniprogram/fortress/continuation';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { qualityEffects, skillLevels } from '../miniprogram/fortress/quality-skills';
import { getWeaponParameters, stepCombat } from '../miniprogram/fortress/combat';
import { SKILL_IDS, SKILL_QUALITIES } from '../miniprogram/fortress/skill-quality';
import type { SkillCollection } from '../miniprogram/fortress/skill-quality';

test('七个跨关入口保留四档难度和武器，重试身份稳定，各关奖励会话独立且无第9关',()=>{
 for(const difficulty of ['easy','normal','hard','nightmare'] as const){
  let request={plan:createOpeningPlan('continuation',createSeededRandom(12),1,7,difficulty),waveIndex:0,generation:1};
  const ids=new Set([request.plan.sessionId]);
  for(let stage=2;stage<=8;stage++){
   const next=nextStageRequest(request);assert.equal(next.plan.levelId,stage);assert.equal(next.waveIndex,0);assert.equal(next.plan.weaponLevel,7);assert.equal(next.plan.difficulty,difficulty);
   assert.equal(next.generation,request.generation+1);assert.deepEqual(next,nextStageRequest(request));assert(!ids.has(next.plan.sessionId));ids.add(next.plan.sessionId);request=next;
  }
  assert.throws(()=>nextStageRequest(request));
 }
});
test('五档品质技能实际带入新关战斗参数，经验时钟从零、冷却重开、满血且不带士兵',()=>{
 for(const quality of SKILL_QUALITIES){
  const collection=Object.fromEntries(SKILL_IDS.filter(id=>!isSummonSkill(id)).map((id,i)=>[id,{level:i%5+1,quality:quality.id}])) as SkillCollection;
  const state=createOpeningEncounter('carry','black',1,0,skillLevels(collection),undefined,[],2,7,[],'hard',collection);
  assert.deepEqual(state.skillCollection,collection);assert.equal(state.tick,0);assert.equal(state.base.hp,1200);assert.equal(state.supportSoldiers!.length,0);assert.equal(state.elementReadyTick,500);
  const effect=qualityEffects(collection);const weapon=getWeaponParameters(state.skills,state.skillCollection);assert.equal(weapon.count,effect.count);assert.equal(weapon.intervalMs,effect.intervalMs);assert.equal(state.firepowerUntilTick,effect.firepowerTicks);assert.equal(state.firepowerReadyTick,2000);
  const fired=stepCombat({...state,monsters:state.monsters.map((m,i)=>({...m,status:i?'waiting':'alive',position:{x:180,y:200}}))}).state;
  assert.equal(fired.projectiles.length,effect.count);assert(fired.projectiles.every(p=>p.damage>0));assert.deepEqual(state.skillCollection,collection);
 }
});

test('六类召唤在四难度七个跨关入口保留成长并重建满血编队',async()=>{
 const {createStageInvasion}=await import('../miniprogram/fortress/stage-invasion');
 const {SUMMON_TYPES}=await import('../miniprogram/fortress/summon-skills');
 for(const difficulty of ['easy','normal','hard','nightmare'] as const){
  for(const ids of [ ['rifleSupport','shieldLine','flameSquad'], ['rocketSupport','airFormation','armorSupport'] ] as const){
   const collection:SkillCollection=Object.fromEntries(ids.map(id=>[id,{level:5,quality:'legendary'}]));
   let request={plan:createOpeningPlan(`army-carry-${difficulty}-${ids[0]}`,createSeededRandom(41),1,7,difficulty),waveIndex:0,generation:1};
   for(let stage=2;stage<=8;stage++){
    request=nextStageRequest(request);
    const state=createStageInvasion(request.plan,request.generation,collection);
    assert.deepEqual(state.skillCollection,collection);
    assert.deepEqual(state.supportSoldiers!.map(s=>s.soldierType),ids.map(id=>SUMMON_TYPES[id]));
    assert(state.supportSoldiers!.every(s=>s.hp===s.maxHp&&s.source==='skill'&&s.evolved));
    assert.deepEqual(state.fallenSoldiers,[]);
    assert.deepEqual(Object.values(state.summonRemainingMs!),[20000,20000,20000]);
    assert.equal(state.tick,0);assert.equal(state.base.hp,state.base.maxHp);
    assert.equal(state.context.sessionId,request.plan.sessionId);
    assert.equal(state.context.generation,request.generation);
    const advanced=stepCombat(state).state;
    assert.equal(advanced.supportSoldiers!.length,3,'首帧不重复补兵');
    assert.deepEqual(Object.values(advanced.summonRemainingMs!),[19990,19990,19990]);
   }
  }
 }
});
