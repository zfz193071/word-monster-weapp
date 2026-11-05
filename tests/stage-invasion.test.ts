import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createOpeningPlan} from '../miniprogram/fortress/opening-plan';
import {createStageInvasion} from '../miniprogram/fortress/stage-invasion';
import {openingMonsterCount} from '../miniprogram/fortress/opening-encounter';
import {createSeededRandom} from '../miniprogram/fortress/plans';
import {stepCombat,attachCombatPet,summonSupportSoldier,COMBAT_STEP_MS} from '../miniprogram/fortress/combat';
import {CombatRunner} from '../miniprogram/fortress/combat-runner';
import {createBattlePet} from '../miniprogram/pets/battle';
import {getLevel} from '../miniprogram/fortress/levels';

const plan=(stage=1,mode:'easy'|'normal'|'hard'|'nightmare'='normal')=>createOpeningPlan('continuous',createSeededRandom(41),stage,1,mode);
test('8关四难度19轮同一时钟，数量/30%混编/Boss保留，逐只出场并整关缓慢加速',()=>{
 for(let stage=1;stage<=8;stage++)for(const difficulty of ['easy','normal','hard','nightmare'] as const){
  const p=plan(stage,difficulty),state=createStageInvasion(p,1),all=[...state.monsters,...state.incomingMonsters!];
  assert.equal(state.monsters.length,1);assert.equal(all.length,p.waves.reduce((n,w)=>n+w.spawnPlan.length,0));assert.equal(new Set(all.map(m=>m.id)).size,all.length);
  const starts=state.waveStartTimesMs!;assert.equal(starts.length,19);assert.equal(starts[0],0);
  for(let wave=0;wave<19;wave++){
   const monsters=all.filter(m=>m.id.startsWith(`${p.sessionId}:wave:${wave+1}:`));assert.equal(monsters.length,openingMonsterCount(wave,stage));
   const prior=stage>1?getLevel(stage-1).words.map(w=>w.id):[];assert.equal(monsters.filter(m=>prior.includes(m.wordId)).length,stage>1?Math.round(monsters.length*.3):0);
   const times=monsters.map(m=>m.spawnAtMs!);assert.equal(times[0],starts[wave]);
   assert.equal(new Set(times).size,monsters.length);
  }
  const gaps=all.slice(1).map((m,i)=>m.spawnAtMs!-all[i].spawnAtMs!);
  const endpoints={easy:[2500,1000],normal:[2080,800],hard:[1670,650],nightmare:[1390,500]}[difficulty];
  assert.equal(gaps[0],endpoints[0]);assert.equal(gaps.at(-1),endpoints[1]);
  assert(gaps.every((gap,i)=>gap>0&&(i===0||gap<=gaps[i-1])));
  if(difficulty==='easy'){assert.equal(state.invasion!.aliveLimits![0],3);assert.equal(state.invasion!.aliveLimits!.at(-1),15);}
  const grand=all.filter(m=>m.bossKind==='grand');assert.equal(grand.length,1);assert.equal(grand[0].spawnAtMs,all.at(-1)!.spawnAtMs);assert(all.filter(m=>m.bossKind==='iron').length<=1);
 }
});
test('上一轮活怪仍在时新轮到点加入，保留宠物/士兵伤势、死亡记录、弹体、技能和出怪时钟',()=>{
 let state=createStageInvasion(plan(),1);state=attachCombatPet(state,createBattlePet({level:1,equipped:[]},1000,{hp:25}));state=summonSupportSoldier(state,'guard')!;
 const boundary=state.waveStartTimesMs![1];
 state={...state,automatic:false,shotRemainingMs:100000,monsterSpeed:0,tick:Math.ceil(boundary/COMBAT_STEP_MS)-1,supportSoldiers:state.supportSoldiers!.map(s=>({...s,hp:9,attackRemainingMs:1000})),fallenSoldiers:[{...state.supportSoldiers![0],id:'dead',hp:0}],projectiles:[{id:'flying',position:{x:10,y:300},previousPosition:{x:10,y:300},width:2,height:2,damage:1}]};
 state={...state,incomingMonsters:state.incomingMonsters!.filter(m=>m.spawnAtMs!>=boundary)};
 const old=state.monsters[0],next=stepCombat(state);
 assert(next.state.monsters.some(m=>m.id===old.id&&m.hp===old.hp));assert(next.state.monsters.some(m=>m.id.includes(':wave:2:')));assert(next.events.some(e=>e.type==='waveStarted'&&e.waveNumber===2));
 assert.equal(next.state.pet!.hp,25);assert.equal(next.state.pet!.attackRemainingMs,990);assert.equal(next.state.supportSoldiers![0].hp,9);assert.equal(next.state.fallenSoldiers![0].id,'dead');assert(next.state.projectiles.some(p=>p.id==='flying'));assert.equal(next.state.context.combatId,state.context.combatId);
 const runner=new CombatRunner(next.state);runner.pause();assert.equal(runner.frame(999999).steps,0);assert.equal(runner.snapshot,next.state);runner.resume(1000000,2);runner.frame(1000010);assert.equal(runner.snapshot!.tick,next.state.tick+1);runner.dispose();assert.equal(runner.frame(1000100).state,null);
});
test('当前怪全死但待出场时不提前通关，最后一批全死后才清场；死亡清空待出场队列',()=>{
 const initial=createStageInvasion(plan(),1);
 const dead=initial.monsters.map(m=>({...m,hp:0,status:'defeated' as const}));
 const waiting=stepCombat({...initial,monsters:dead,defeatedMonsterIds:dead.map(m=>m.id)}).state;assert.equal(waiting.status,'fighting');assert(waiting.incomingMonsters!.length>0);
 const end=stepCombat({...waiting,incomingMonsters:[]}).state;assert.equal(end.status,'cleared');assert.equal(stepCombat(end).events.length,0);
 const lost=stepCombat({...initial,automatic:false,shotRemainingMs:10000,base:{...initial.base,hp:1},monsters:[{...initial.monsters[0],status:'attackingBase',attackRemainingMs:0}]}).state;
 assert.equal(lost.status,'baseDestroyed');assert.equal(lost.incomingMonsters!.length,0);
});

test('简单模式满员延迟、死亡后逐只补充，暂停不出怪，波次和Boss使用实际入场时间',()=>{
 let state=createStageInvasion(plan(1,'easy'),1);
 state={...state,automatic:false,shotRemainingMs:1e9,monsterSpeed:0};
 for(let i=0;i<2;i++)state=stepCombat({...state,tick:Math.ceil(state.invasion!.nextAtMs/COMBAT_STEP_MS)-1}).state;
 assert.equal(state.monsters.length,3);
 const pending=state.incomingMonsters;
 state=stepCombat({...state,tick:100000}).state;
 assert.equal(state.monsters.length,3);assert.equal(state.incomingMonsters,pending);assert.equal(state.invasion!.waveNumber,1);
 const runner=new CombatRunner(state);runner.pause();assert.equal(runner.frame(1e9).steps,0);assert.equal(runner.snapshot,state);runner.dispose();
 state={...state,monsters:state.monsters.map(m=>({...m,hp:0,status:'defeated' as const})),defeatedMonsterIds:state.monsters.map(m=>m.id)};
 state=stepCombat(state).state;assert.equal(state.monsters.length,4);assert.equal(state.monsters.at(-1)!.spawnAtMs,state.tick*COMBAT_STEP_MS);
 state=stepCombat(state).state;assert.equal(state.monsters.length,4,'积压不能追赶式爆发');
 const grand=state.incomingMonsters!.find(m=>m.bossKind==='grand')!;
 const result=stepCombat({...state,tick:10000000,incomingMonsters:[grand]});
 assert.equal(result.state.monsters.at(-1)!.spawnAtMs,result.state.tick*COMBAT_STEP_MS);
 assert(result.events.some(e=>e.type==='waveStarted'&&e.waveNumber===19));
});
