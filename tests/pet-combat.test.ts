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
test('雷击击杀复用经验/金币并替堡垒挡伤，暂停/跨波保留计时，重复加入不重置',()=>{
 let state=fixture(10);state={...state,pet:createBattlePet(state.pet!,0),monsters:[{...state.monsters[0],hp:1,dropCoins:1,status:'attackingBase',position:{x:250,y:480},attackRemainingMs:0}]};
 const killed=stepCombat(state);assert.equal(killed.state.status,'cleared');assert.equal(killed.state.base.hp,state.base.hp);
 assert.equal(killed.events.filter(e=>e.type==='monsterDefeated').length,1);assert.equal(killed.events.filter(e=>e.type==='coinsDropped').length,1);
 const xp=createExperience('pet-fight',OPENING_EXPERIENCE);xp.record(killed.events);xp.record(killed.events);assert.equal(xp.view.total,8);
 const attacker={...fixture(),monsters:[{...fixture().monsters[0],status:'attackingBase' as const,position:{x:250,y:480},attackRemainingMs:0}]};
 const hit=stepCombat(attacker);assert.equal(hit.state.base.hp,attacker.base.hp);assert.equal(hit.state.pet?.hp,90);
 const runner=new CombatRunner(fixture());runner.frame(0);runner.frame(100);assert.equal(runner.snapshot?.pet?.attackRemainingMs,1900);
 runner.pause();runner.frame(10000);assert.equal(runner.snapshot?.pet?.attackRemainingMs,1900);runner.resume(10000,1);runner.frame(10010);assert.equal(runner.snapshot?.pet?.attackRemainingMs,1890);
 runner.applyPet(createBattlePet({level:1,equipped:[]}));assert.equal(runner.snapshot?.pet?.attackRemainingMs,1890);
 const nextWave=attachCombatPet(createOpeningEncounter('pet-fight','apple',1,1),runner.snapshot!.pet!);assert.equal(nextWave.pet?.attackRemainingMs,1890);
 runner.dispose();runner.applyPet(createBattlePet({level:1,equipped:[]}));assert.equal(runner.snapshot,null);
});

test('宠物生命随等级成长，近战按士兵、宠物、堡垒顺序承伤且倒地只触发一次',()=>{
 for(let level=1;level<=10;level++)assert.equal(createBattlePet({level,equipped:[]}).maxHp,100+(level-1)*20);
 const initial=fixture();
 const monsters=Array.from({length:4},(_,i)=>({...initial.monsters[0],id:`attacker-${i}`,status:'attackingBase' as const,attackRemainingMs:0,attackDamage:150}));
 const result=stepCombat({...initial,monsters,supportSoldiers:[{id:'guard',slot:0,hp:30,maxHp:30,position:{x:160,y:500},attackRemainingMs:2000}]});
 assert.equal(result.state.supportSoldiers?.length,0);assert.equal(result.state.pet?.hp,0);assert.equal(result.state.base.hp,initial.base.hp-300);
 assert.equal(result.events.filter(e=>e.type==='petDefeated').length,1);assert.equal(result.events.filter(e=>e.type==='petDamaged').length,1);
 assert.deepEqual(result.state.pet?.defeatedPosition,battlePetPosition(result.state.player));
 const next=stepCombat(result.state);assert.equal(next.events.filter(e=>e.type==='petDefeated').length,0);assert.equal(next.state.base.hp,result.state.base.hp);
 const wave=attachCombatPet(createOpeningEncounter('pet-fight','apple',1,1),result.state.pet!);
 assert.equal(wave.pet?.hp,0);assert.deepEqual(wave.pet?.defeatedPosition,result.state.pet?.defeatedPosition);
 assert.equal(attachCombatPet(wave,createBattlePet({level:1,equipped:[]})).pet?.hp,0);
 let dead={...fixture(),pet:wave.pet};const cooldown=dead.pet!.attackRemainingMs;
 for(let i=0;i<210;i++)dead=stepCombat(dead).state;
 assert.equal(dead.monsters[0].hp,1000);assert.equal(dead.pet?.attackRemainingMs,cooldown);
 assert.equal(createBattlePet(wave.pet!).hp,100);assert.equal(createBattlePet(wave.pet!).defeatedPosition,undefined);
});
test('难度使用怪物实际伤害，宠物生命不随难度改变，跨轮保留受伤状态',()=>{
 for(const difficulty of ['easy','normal','hard','nightmare'] as const){
  const state=attachCombatPet(createOpeningEncounter('pet-mode','apple',0,0,undefined,undefined,[],1,1,[],difficulty),createBattlePet({level:10,equipped:[]}));
  const monster={...state.monsters[0],status:'attackingBase' as const,attackRemainingMs:0};
  const hit=stepCombat({...state,automatic:false,shotRemainingMs:100000,monsters:[monster]});
  assert.equal(hit.state.pet?.hp,280-monster.attackDamage!);assert.equal(hit.state.base.hp,state.base.hp);
  assert.equal(attachCombatPet(createOpeningEncounter('pet-mode','apple',1,1),hit.state.pet!).pet?.hp,hit.state.pet?.hp);
 }
});
