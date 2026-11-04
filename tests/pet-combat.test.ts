import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattlePet, petDamage, battlePetPosition } from '../miniprogram/pets/battle';
import { attachCombatPet, stepCombat } from '../miniprogram/fortress/combat';
import { createOpeningEncounter, OPENING_EXPERIENCE } from '../miniprogram/fortress/opening-encounter';
import { createExperience } from '../miniprogram/fortress/experience';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import type { CombatState } from '../miniprogram/fortress/types';
function fixture(level=1):CombatState {
  const initial=attachCombatPet(createOpeningEncounter('pet-fight','apple',0),createBattlePet({level,equipped:[]}));
  return {...initial,automatic:false,shotRemainingMs:100000,monsterSpeed:0,monsters:initial.monsters.slice(0,2).map((m,i)=>({...m,hp:1000,maxHp:1000,status:'alive',position:{x:250+i*60,y:350},spawnAtMs:0}))};
}
test('宠物每2秒雷击最近目标，伤害仅随宠物等级增长且单体命中',()=>{
 for(const level of [1,4,7,10]){
  let state=fixture(level);
  for(let i=0;i<199;i++){const next=stepCombat(state);state=next.state;assert.equal(next.events.filter(e=>e.type==='monsterDamaged').length,0);}
  const next=stepCombat(state);assert.equal(next.state.monsters[0].hp,1000-petDamage(level));assert.equal(next.state.monsters[1].hp,1000);
  assert.equal(next.state.pet?.attackRemainingMs,2000);assert.equal(next.state.elementImpacts?.[0].kind,'lightning');
  assert.equal(next.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='pet').length,1);
  state=next.state;for(let i=0;i<200;i++)state=stepCombat(state).state;assert.equal(state.monsters[0].hp,1000-2*petDamage(level));
 }
 assert.equal(petDamage(1),10);assert.equal(petDamage(10),28);
 assert.throws(()=>createBattlePet({level:11,equipped:[]}));
});
test('宠物不会攻击等待/死亡/屏外目标，冷却到期无目标等待，移动跟随主角',()=>{
 let state=fixture();state={...state,pet:createBattlePet(state.pet!,0),monsters:state.monsters.map((m,i)=>i?{...m,hp:0,status:'defeated'}:{...m,status:'waiting',spawnAtMs:100000})};
 let next=stepCombat(state);assert.equal(next.events.length,0);assert.equal(next.state.pet?.attackRemainingMs,0);
 state={...next.state,monsters:[{...state.monsters[0],status:'alive',position:{x:250,y:-20}}]};next=stepCombat(state);assert.equal(next.events.length,0);
 state={...next.state,monsters:[{...state.monsters[0],status:'alive',position:{x:250,y:350}}]};next=stepCombat(state);assert.equal(next.state.monsters[0].hp,990);
 const moved=stepCombat(fixture(),{playerX:100}).state;assert.equal(battlePetPosition(moved.player).x,170);
});
test('雷击击杀复用经验/金币且不会挡伤，暂停/跨波保留计时，重复加入不重置',()=>{
 let state=fixture(10);state={...state,pet:createBattlePet(state.pet!,0),monsters:[{...state.monsters[0],hp:1,dropCoins:1,status:'attackingBase',position:{x:250,y:480},attackRemainingMs:0}]};
 const killed=stepCombat(state);assert.equal(killed.state.status,'cleared');assert.equal(killed.state.base.hp,state.base.hp);
 assert.equal(killed.events.filter(e=>e.type==='monsterDefeated').length,1);assert.equal(killed.events.filter(e=>e.type==='coinsDropped').length,1);
 const xp=createExperience('pet-fight',OPENING_EXPERIENCE);xp.record(killed.events);xp.record(killed.events);assert.equal(xp.view.total,8);
 const attacker={...fixture(),monsters:[{...fixture().monsters[0],status:'attackingBase' as const,position:{x:250,y:480},attackRemainingMs:0}]};
 const hit=stepCombat(attacker);assert.equal(hit.state.base.hp,40);assert.ok(hit.state.pet,'宠物不受伤或消失，也不替堡垒挡伤');
 const runner=new CombatRunner(fixture());runner.frame(0);runner.frame(100);assert.equal(runner.snapshot?.pet?.attackRemainingMs,1900);
 runner.pause();runner.frame(10000);assert.equal(runner.snapshot?.pet?.attackRemainingMs,1900);runner.resume(10000,1);runner.frame(10010);assert.equal(runner.snapshot?.pet?.attackRemainingMs,1890);
 runner.applyPet(createBattlePet({level:1,equipped:[]}));assert.equal(runner.snapshot?.pet?.attackRemainingMs,1890);
 const nextWave=attachCombatPet(createOpeningEncounter('pet-fight','apple',1,1),runner.snapshot!.pet!);assert.equal(nextWave.pet?.attackRemainingMs,1890);
 runner.dispose();runner.applyPet(createBattlePet({level:1,equipped:[]}));assert.equal(runner.snapshot,null);
});
