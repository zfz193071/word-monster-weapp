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
 for(const level of [1,4,7,10,40]){
  let state=fixture(level);
  for(let i=0;i<199;i++){const next=stepCombat(state);state=next.state;assert.equal(next.events.filter(e=>e.type==='monsterDamaged').length,0);}
  const next=stepCombat(state);assert.equal(next.state.monsters[0].hp,1000-petDamage(level));assert.equal(next.state.monsters[1].hp,1000);
  assert.equal(next.state.pet?.attackRemainingMs,2000);assert.equal(next.state.elementImpacts?.[0].kind,'lightning');
  assert.equal(next.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='pet').length,1);
  state=next.state;for(let i=0;i<200;i++)state=stepCombat(state).state;assert.equal(state.monsters[0].hp,1000-2*petDamage(level));
 }
 assert.equal(petDamage(1),10);assert.equal(petDamage(10),28);
 assert.throws(()=>createBattlePet({level:41,equipped:[]}));
});
test('宠物不会攻击等待/死亡/屏外目标，冷却到期无目标等待，固定站在堡垒上',()=>{
 let state=fixture();state={...state,pet:createBattlePet(state.pet!,0),monsters:state.monsters.map((m,i)=>i?{...m,hp:0,status:'defeated'}:{...m,status:'waiting',spawnAtMs:100000})};
 let next=stepCombat(state);assert.equal(next.events.length,0);assert.equal(next.state.pet?.attackRemainingMs,0);
 state={...next.state,monsters:[{...state.monsters[0],status:'alive',position:{x:250,y:-20}}]};next=stepCombat(state);assert.equal(next.events.length,0);
 state={...next.state,monsters:[{...state.monsters[0],status:'alive',position:{x:250,y:350}}]};next=stepCombat(state);assert.equal(next.state.monsters[0].hp,990);
 const moved=stepCombat(fixture(),{playerX:100}).state;assert.equal(battlePetPosition(moved.player).x,270);
});
test('雷击击杀复用经验/金币且宠物不承伤，暂停/跨波保留计时，重复加入不重置',()=>{
 let state=fixture(10);state={...state,pet:createBattlePet(state.pet!,0),monsters:[{...state.monsters[0],hp:1,dropCoins:1,status:'attackingBase',position:{x:250,y:480},attackRemainingMs:0}]};
 const killed=stepCombat(state);assert.equal(killed.state.status,'cleared');assert.equal(killed.state.base.hp,state.base.hp);
 assert.equal(killed.events.filter(e=>e.type==='monsterDefeated').length,1);assert.equal(killed.events.filter(e=>e.type==='coinsDropped').length,1);
 const xp=createExperience('pet-fight',OPENING_EXPERIENCE);xp.record(killed.events);xp.record(killed.events);assert.equal(xp.view.total,8);
 const attacker={...fixture(),monsters:[{...fixture().monsters[0],status:'attackingBase' as const,position:{x:250,y:480},attackRemainingMs:0}]};
 const hit=stepCombat(attacker);assert.equal(hit.state.base.hp,attacker.base.hp-10);assert.equal(hit.state.pet?.hp,100);
 const runner=new CombatRunner(fixture());runner.frame(0);runner.frame(100);assert.equal(runner.snapshot?.pet?.attackRemainingMs,1900);
 runner.pause();runner.frame(10000);assert.equal(runner.snapshot?.pet?.attackRemainingMs,1900);runner.resume(10000,1);runner.frame(10010);assert.equal(runner.snapshot?.pet?.attackRemainingMs,1890);
 runner.applyPet(createBattlePet({level:1,equipped:[]}));assert.equal(runner.snapshot?.pet?.attackRemainingMs,1890);
 const nextWave=attachCombatPet(createOpeningEncounter('pet-fight','apple',1,1),runner.snapshot!.pet!);assert.equal(nextWave.pet?.attackRemainingMs,1890);
 runner.dispose();runner.applyPet(createBattlePet({level:1,equipped:[]}));assert.equal(runner.snapshot,null);
});

test('宠物不承伤不死亡，士兵之后由堡垒承伤，跨轮持续攻击',()=>{
 const initial=fixture();
 const monsters=Array.from({length:4},(_,i)=>({...initial.monsters[0],id:`attacker-${i}`,status:'attackingBase' as const,attackRemainingMs:0,attackDamage:150}));
 const result=stepCombat({...initial,monsters,supportSoldiers:[{id:'guard',slot:0,hp:30,maxHp:30,position:{x:160,y:500},attackRemainingMs:2000}]});
 assert.equal(result.state.supportSoldiers?.length,0);assert.equal(result.state.pet?.hp,100);assert.equal(result.state.base.hp,initial.base.hp-450);
 assert.equal(result.events.filter(e=>e.type==='petDefeated'||e.type==='petDamaged').length,0);
 const wave=attachCombatPet(createOpeningEncounter('pet-fight','apple',1,1),result.state.pet!);
 assert.equal(wave.pet?.hp,100);assert.equal(wave.pet?.defeatedPosition,undefined);
 const legacy=createBattlePet({level:1,equipped:[]},500,{hp:0,defeatedPosition:{x:200,y:500}});
 assert.equal(legacy.hp,100);assert.equal(legacy.defeatedPosition,undefined);assert.equal(legacy.attackRemainingMs,500);
 assert.deepEqual(battlePetPosition({x:24,y:510}),battlePetPosition({x:330,y:510}));
 assert.equal(battlePetPosition(initial.player).y,480);
});
test('四难度怪物伤害均绕过宠物，跨轮保持满血',()=>{
 for(const difficulty of ['easy','normal','hard','nightmare'] as const){
  const state=attachCombatPet(createOpeningEncounter('pet-mode','apple',0,0,undefined,undefined,[],1,1,[],difficulty),createBattlePet({level:10,equipped:[]}));
  const monster={...state.monsters[0],status:'attackingBase' as const,attackRemainingMs:0};
  const hit=stepCombat({...state,automatic:false,shotRemainingMs:100000,monsters:[monster]});
  assert.equal(hit.state.pet?.hp,280);assert.equal(hit.state.base.hp,state.base.hp-monster.attackDamage!);
  assert.equal(attachCombatPet(createOpeningEncounter('pet-mode','apple',1,1),hit.state.pet!).pet?.hp,hit.state.pet?.hp);
 }
});

test('宠物绘制固定在堡垒顶部，不绘制血条或倒地文字', async()=>{
 const {drawBattlePet}=await import('../miniprogram/pets/battle-art');
 const calls:{method:string;args:unknown[]}[]=[];
 const context=new Proxy({}, {get:(_target,key)=>(...args:unknown[])=>calls.push({method:String(key),args}),set:()=>true});
 drawBattlePet(context as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,fixture());
 assert.deepEqual(calls.find(call=>call.method==='translate')?.args,[270,480]);
 assert.equal(calls.filter(call=>call.method==='fillText').length,0);
 assert.ok(!calls.some(call=>call.method==='fillRect'&&call.args[2]===48),'不绘制宠物血条');
});
