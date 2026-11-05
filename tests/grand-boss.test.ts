import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpeningEncounter, openingMonsterCount } from '../miniprogram/fortress/opening-encounter';
import { createOpeningPlan, validateOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { getLevel } from '../miniprogram/fortress/levels';
import { difficultyFor } from '../miniprogram/fortress/difficulty';
import { monsterStats, grandBossWindingUp } from '../miniprogram/fortress/battle-progression';
import { stepCombat } from '../miniprogram/fortress/combat';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { createBattlePet } from '../miniprogram/pets/battle';
import type { CombatState } from '../miniprogram/fortress/types';
function arena(tick=0):CombatState {
 const initial=createOpeningEncounter('grand-test','apple',0,18);
 const boss=initial.monsters.at(-1)!;
 return {...initial,tick,automatic:false,shotRemainingMs:1e8,projectiles:[],monsters:[{...boss,status:'alive',spawnAtMs:0,position:{x:180,y:200}}],supportSoldiers:[{id:'guard',slot:0,position:{x:150,y:500},hp:30,maxHp:30,attackRemainingMs:1e8}]};
}
function hit(state:CombatState, damage=10){return stepCombat({...state,projectiles:[{id:'test-hit',position:{x:180,y:210},previousPosition:{x:180,y:210},width:2,height:2,damage}]});}
test('8关×19轮×四档：末轮最后一批唯一大Boss、本关词汇、总数与30%混合不变',()=>{
 for(let stage=1;stage<=8;stage++)for(const difficulty of ['easy','normal','hard','nightmare'] as const){
  const plan=createOpeningPlan(`grand-${stage}`,createSeededRandom(stage),stage,1,difficulty);validateOpeningPlan(plan);
  const all=plan.waves.flatMap(w=>w.spawnPlan);assert.equal(all.filter(m=>m.bossKind==='grand').length,1);
  assert(all.filter(m=>m.boss).every(m=>m.bossKind==='grand'||m.bossKind==='iron'));
  const irons=plan.waves.filter(w=>w.spawnPlan.some(m=>m.bossKind==='iron'));assert(irons.length<=1);assert(irons.every(w=>w.index>=9&&w.index<=17));
  for(const wave of plan.waves){
   assert.equal(wave.spawnPlan.length,openingMonsterCount(wave.index,stage));
   const prior=stage>1?getLevel(stage-1).words.map(w=>w.id):[];
   assert.equal(wave.spawnPlan.filter(m=>prior.includes(m.wordId)).length,stage>1?Math.round(wave.spawnPlan.length*.3):0);
  }
  const wave=plan.waves[18];const boss=wave.spawnPlan.at(-1)!;
  assert.equal(boss.bossKind,'grand');assert(getLevel(stage).words.some(w=>w.id===boss.wordId));assert.equal(boss.spawnAtMs,Math.max(...wave.spawnPlan.map(m=>m.spawnAtMs!)));
  const state=createOpeningEncounter(plan.sessionId,wave.targetWordId,0,18,undefined,undefined,plan.waves.slice(0,18).map(w=>w.targetWordId),stage,1,[],difficulty);
  const actual=state.monsters.at(-1)!;const ordinary=monsterStats(stage,19);const mode=difficultyFor(difficulty);
  assert.equal(actual.hp,Math.ceil(ordinary.hp*20*mode.hp));assert.equal(actual.attackDamage,Math.ceil(ordinary.attackDamage*2*mode.damage));assert.equal(actual.shockwaveDamage,Math.ceil(ordinary.attackDamage*3*mode.damage));
  assert.equal(actual.attackIntervalMs,stage===3?1500:2000);assert.equal(actual.dropCoins,0);assert.equal(actual.soldierDropCount,undefined);
  const normal=state.monsters.find(m=>!m.boss&&m.wordId===actual.wordId)!;assert.equal(actual.hitbox.width,normal.hitbox.width*2);assert.equal(actual.hitbox.height,normal.hitbox.height*2);
  assert.equal(actual.id,boss.monsterId);assert.equal(actual.wordId,boss.wordId);
  const moving=stepCombat({...state,tick:Math.ceil(actual.spawnAtMs!/10),automatic:false,shotRemainingMs:1e8,monsters:[{...actual,status:'alive',position:{x:180,y:100}}]}).state;
  assert(Math.abs(moving.monsters[0].position.y-100-(stage===3?28:20)*mode.speed*.7*.01)<1e-8);
 }
});
test('10秒开始蓄力1秒，易伤包含直接伤害、灼烧、士兵和宠物；大Boss不沿用铁桶冲锋',()=>{
 assert(!grandBossWindingUp(9990));assert(grandBossWindingUp(10000));assert(grandBossWindingUp(10990));assert(!grandBossWindingUp(11000));assert(grandBossWindingUp(20000));
 for(const [tick,damage] of [[998,10],[999,15],[1098,15],[1099,10]])assert.equal(hit(arena(tick)).events.find(e=>e.type==='monsterDamaged')?.damage,damage);
 let state=arena(999);state={...state,monsters:[{...state.monsters[0],burn:{damage:7,nextTick:1000,untilTick:1200}}],supportSoldiers:state.supportSoldiers!.map(s=>({...s,attackRemainingMs:0})),pet:{level:1,equipped:[],attackRemainingMs:0}} as CombatState;
 const result=stepCombat(state);for(const kind of ['flame','soldier','pet'])assert(result.events.some(e=>e.type==='monsterDamaged'&&e.kind===kind));
 assert.equal(result.events.find(e=>e.type==='monsterDamaged'&&e.kind==='flame')?.damage,11);
 assert.equal(result.events.find(e=>e.type==='monsterDamaged'&&e.kind==='soldier')?.damage,15);
 assert.equal(result.events.find(e=>e.type==='monsterDamaged'&&e.kind==='pet')?.damage,15);
 for(const tick of [899,999,1099]){const before=arena(tick);const next=stepCombat(before).state;assert(Math.abs(next.monsters[0].position.y-200-.14)<1e-8);}
});
test('冲击波直接扣堡垒、每周期一次，普通近战仍由士兵阻挡；当步死亡取消攻击',()=>{
 const before={...arena(1099),pet:createBattlePet({level:1,equipped:[]})};const result=stepCombat(before);assert.equal(result.state.pet?.hp,100);assert.equal(result.state.base.hp,before.base.hp-before.monsters[0].shockwaveDamage!);assert.equal(result.state.supportSoldiers![0].hp,30);
 assert.equal(result.events.filter(e=>e.type==='baseDamaged').length,1);assert.equal(stepCombat(result.state).state.base.hp,result.state.base.hp);
 const second=stepCombat({...result.state,tick:2099});assert.equal(second.state.base.hp,result.state.base.hp-before.monsters[0].shockwaveDamage!);
 const melee=stepCombat({...before,tick:0,monsters:[{...before.monsters[0],status:'attackingBase',attackRemainingMs:0}]});assert.equal(melee.state.base.hp,before.base.hp);assert(melee.state.supportSoldiers![0].hp<30);
 const killed=hit({...before,monsters:[{...before.monsters[0],hp:1}]});assert.equal(killed.state.status,'cleared');assert.equal(killed.state.base.hp,before.base.hp);assert.equal(killed.events.filter(e=>e.type==='coinsDropped').length,0);assert.equal(killed.state.supportSoldiers!.length,1);
});
test('暂停蓄力计时不流逝，恢复继续，退出销毁后无冲击波',()=>{
 const runner=new CombatRunner(arena(1099));runner.frame(0);runner.pause();assert.equal(runner.frame(100000).steps,0);assert.equal(runner.snapshot!.tick,1099);
 runner.resume(100000,1);const resumed=runner.frame(100010);assert.equal(resumed.events.filter(e=>e.type==='baseDamaged').length,1);assert.equal(resumed.state!.tick,1100);
 runner.dispose();assert.equal(runner.frame(200000).events.length,0);assert.equal(runner.snapshot,null);
});
test('大Boss元素联动：爆炸与连锁各易伤一次，冻结免疫且减速最高35%',()=>{
 const initial=arena(999);const boss=initial.monsters[0];
 const normal={...boss,id:'normal',boss:false,bossKind:undefined,position:{x:160,y:200},hitbox:{x:-3,y:-5,width:6,height:10}};
 const collection={flame:{level:1,quality:'legendary' as const},frost:{level:5,quality:'legendary' as const},lightning:{level:1,quality:'legendary' as const}};
 const projectile={id:'element',position:{x:160,y:210},previousPosition:{x:160,y:210},width:2,height:2,damage:1,elements:{flame:1,lightning:1},skillCollection:collection};
 // Narrow the boss box so the ordinary monster takes the direct hit.
 const result=stepCombat({...initial,skillCollection:collection,skills:{...initial.skills,flame:1,lightning:1},monsters:[normal,{...boss,hitbox:{x:-3,y:-5,width:6,height:10}}],projectiles:[projectile]});
 for(const kind of ['flame','lightning'])assert.equal(result.events.find(e=>e.type==='monsterDamaged'&&e.monsterId===boss.id&&e.kind===kind)?.damage,45);
 const frost=stepCombat({...initial,skillCollection:collection,skills:{...initial.skills,frost:5},projectiles:[{...projectile,position:{x:180,y:210},elements:{frost:5}}]}).state.monsters[0];
 assert.equal(frost.frozenUntilTick,undefined);assert.equal(frost.slowRatio,.35);
});
