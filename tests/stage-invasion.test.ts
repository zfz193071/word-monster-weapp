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
test('8关四难度19轮同一时钟，数量/30%混编/Boss保留，开局单只并保留递增出怪间隔',()=>{
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

test('简单模式满员延迟、死亡后按空位补充，暂停不出怪，波次和Boss使用实际入场时间',()=>{
 let state=createStageInvasion(plan(1,'easy'),1);
 state={...state,automatic:false,shotRemainingMs:1e9,monsterSpeed:0};
 for(let i=0;i<2;i++)state=stepCombat({...state,tick:Math.ceil(state.invasion!.nextAtMs/COMBAT_STEP_MS)-1}).state;
 assert.equal(state.monsters.length,3);
 const pending=state.incomingMonsters;
 state=stepCombat({...state,tick:100000}).state;
 assert.equal(state.monsters.length,3);assert.equal(state.incomingMonsters,pending);assert.equal(state.invasion!.waveNumber,1);
 const runner=new CombatRunner(state);runner.pause();assert.equal(runner.frame(1e9).steps,0);assert.equal(runner.snapshot,state);runner.dispose();
 state={...state,monsters:state.monsters.map(m=>({...m,hp:0,status:'defeated' as const})),defeatedMonsterIds:state.monsters.map(m=>m.id)};
 state=stepCombat(state).state;assert.equal(state.monsters.length,6);assert.equal(state.monsters.at(-1)!.spawnAtMs,state.tick*COMBAT_STEP_MS);
 state=stepCombat(state).state;assert.equal(state.monsters.length,6,'积压不能追赶式爆发');
 const grand=state.incomingMonsters!.find(m=>m.bossKind==='grand')!;
 const result=stepCombat({...state,tick:10000000,incomingMonsters:[grand]});
 assert.equal(result.state.monsters.at(-1)!.spawnAtMs,result.state.tick*COMBAT_STEP_MS);
 assert(result.events.some(e=>e.type==='waveStarted'&&e.waveNumber===19));
});

test('按实际战斗时间从1→2→3→5递增至各难度批量上限，同批同时入场且不重叠',()=>{
 for(const [mode,limit] of [['easy',5],['normal',8],['hard',10],['nightmare',12]] as const){
  const initial=createStageInvasion(plan(1,mode),1);
  // The final wave has enough remaining monsters and the largest easy alive limit.
  const pending=initial.incomingMonsters!.filter(m=>m.id.includes(':wave:19:'));
  for(const [elapsed,size] of [[19990,1],[20000,2],[59990,2],[60000,3],[119990,3],[120000,5],[180000,8],[240000,10],[300000,12]]){
   const state={...initial,monsters:[],incomingMonsters:pending,automatic:false,shotRemainingMs:1e9,monsterSpeed:0,
    tick:elapsed/COMBAT_STEP_MS-1,invasion:{...initial.invasion!,nextAtMs:elapsed}};
   const result=stepCombat(state);const expected=Math.min(size,limit);
   assert.equal(result.state.monsters.length,expected,`${mode} @ ${elapsed}`);
   assert(result.state.monsters.every(m=>m.spawnAtMs===elapsed));
   assert.equal(new Set(result.state.monsters.map(m=>`${m.position.x}:${m.position.y}`)).size,expected);
   assert.equal(stepCombat(result.state).state.monsters.length,expected,'下一帧不能连发积压批次');
  }
 }
});
test('批次不越过轮次边界，剩余不足补足，下一批保留原存活怪物并发出一次换轮事件',()=>{
 const initial=createStageInvasion(plan(),1);
 const last=initial.incomingMonsters!.filter(m=>m.id.includes(':wave:1:')).slice(-1);
 const rest=initial.incomingMonsters!.filter(m=>!m.id.includes(':wave:1:'));
 let state: typeof initial={...initial,automatic:false,shotRemainingMs:1e9,monsterSpeed:0,tick:30000,incomingMonsters:[...last,...rest]};
 const first=stepCombat(state);assert.equal(first.state.monsters.length,2);assert.equal(first.events.filter(e=>e.type==='waveStarted').length,0);
 state={...first.state,tick:Math.ceil(first.state.invasion!.nextAtMs/COMBAT_STEP_MS)-1};
 const next=stepCombat(state);assert.equal(next.state.monsters.length,10);
 assert.equal(next.events.filter(e=>e.type==='waveStarted'&&e.waveNumber===2).length,1);
 assert(next.state.monsters.some(m=>m.id===initial.monsters[0].id&&m.hp>0));
});

test('噩梦双怪批次不固定左右两端，后期12只不排成整齐横排', () => {
 const initial=createStageInvasion(plan(1,'nightmare'),1);
 const pending=initial.incomingMonsters!.filter(m=>m.id.includes(':wave:19:'));
 const spawn=(elapsed:number)=>stepCombat({...initial,monsters:[],incomingMonsters:pending,automatic:false,shotRemainingMs:1e9,monsterSpeed:0,
  tick:elapsed/COMBAT_STEP_MS-1,invasion:{...initial.invasion!,nextAtMs:elapsed}}).state.monsters;
 const pair=spawn(20000);
 assert.equal(pair.length,2);
 assert(pair.some(m=>m.position.x>80&&m.position.x<280),'双怪批次必须能出现在中间，而非固定48/312');
 const late=spawn(300000);
 assert.equal(late.length,12);
 assert(new Set(late.map(m=>Math.round(m.position.y))).size>2,'后期不应固定两排');
 assert(late.every(m=>m.position.x>=48&&m.position.x<=312&&m.position.y<=-32));
 assert.deepEqual(spawn(300000).map(m=>m.position),late.map(m=>m.position),'同状态回放不重抽位置');
});

test('噩梦后期连续批次覆盖左中右，位置可重放且不修改原队列与入场节奏', () => {
 const initial=createStageInvasion(plan(1,'nightmare'),1);
 const pending=initial.incomingMonsters!.filter(m=>m.id.includes(':wave:19:'));
 const original=JSON.stringify(pending);
 let state={...initial,monsters:[],incomingMonsters:pending,automatic:false,shotRemainingMs:1e9,monsterSpeed:0,
  tick:300000/COMBAT_STEP_MS-1,invasion:{...initial.invasion!,nextAtMs:300000}};
 const groups:number[][]=[]; const bands=new Set<number>();
 for (let batch=0;batch<3;batch++) {
  const before=state;const result=stepCombat(before);const fresh=result.state.monsters.slice(before.monsters.length);
  assert.equal(fresh.length,12);
  assert.deepEqual(stepCombat(before).state.monsters,result.state.monsters);
  for(const m of fresh){assert(m.position.x>=48&&m.position.x<=312&&m.position.y<=-32&&m.position.y>=-96);bands.add(Math.min(2,Math.floor((m.position.x-48)/88)));}
  groups.push(fresh.map(m=>m.position.x));
  const interval=before.incomingMonsters[12].spawnAtMs!-before.incomingMonsters[11].spawnAtMs!;
  assert.equal(result.state.invasion!.nextAtMs,result.state.tick*COMBAT_STEP_MS+interval);
  state={...result.state,monsters:[...result.state.monsters],incomingMonsters:[...result.state.incomingMonsters!],automatic:false,shotRemainingMs:1e9,monsterSpeed:0,
   tick:Math.ceil(result.state.invasion!.nextAtMs/COMBAT_STEP_MS)-1,invasion:result.state.invasion!};
 }
 assert.equal(bands.size,3);assert.notDeepEqual(groups[0],groups[1]);assert.notDeepEqual(groups[1],groups[2]);
 assert.equal(JSON.stringify(pending),original);
});

test('四种难度在早中后关卡的入场覆盖上方区域，不集中于一处或两处', () => {
 for (const difficulty of ['easy','normal','hard','nightmare'] as const) {
  const bandCounts=[0,0,0,0,0]; let total=0;
  for (const stage of [1,3,8]) {
   const initial=createStageInvasion(plan(stage,difficulty),1);
   for (const elapsed of [20000,120000,300000]) for (let wave=1;wave<=19;wave++) {
    const pending=initial.incomingMonsters!.filter(m=>m.id.includes(`:wave:${wave}:`));
    if (!pending.length) continue;
    const result=stepCombat({...initial,monsters:[],incomingMonsters:pending,automatic:false,shotRemainingMs:1e9,monsterSpeed:0,
      tick:elapsed/COMBAT_STEP_MS-1,invasion:{...initial.invasion!,nextAtMs:elapsed}});
    for(const monster of result.state.monsters) {
      assert(monster.position.x>=48&&monster.position.x<=312,`${difficulty} x boundary`);
      assert(monster.position.y<=-32&&monster.position.y>=-96,`${difficulty} y boundary`);
      const band=Math.min(4,Math.floor((monster.position.x-48)/(264/5)));
      bandCounts[band]++;total++;
    }
   }
  }
  assert(total>200,`${difficulty} sample too small`);
  assert(bandCounts.every(count=>count>0),`${difficulty}: ${bandCounts}`);
  assert(Math.max(...bandCounts)/total<.35,`${difficulty} clusters in one area: ${bandCounts}`);
  assert([...bandCounts].sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a+b,0)/total<.62,`${difficulty} clusters in two areas: ${bandCounts}`);
 }
});

test('四种难度的单只入场也使用连续随机位置，不局限于五条固定窄通道', () => {
 const fixedLanes=[56,118,180,242,304];
 for(const difficulty of ['easy','normal','hard','nightmare'] as const){
  const initial=createStageInvasion(plan(3,difficulty),1);
  const positions:number[]=[];
  for(let wave=1;wave<=19;wave++){
   const incoming=initial.incomingMonsters!.filter(monster=>monster.id.includes(`:wave:${wave}:`));
   if(!incoming.length)continue;
   const elapsed=10000;
   const state=stepCombat({...initial,monsters:[],incomingMonsters:incoming,automatic:false,shotRemainingMs:1e9,monsterSpeed:0,
    tick:elapsed/COMBAT_STEP_MS-1,invasion:{...initial.invasion!,nextAtMs:elapsed}}).state;
   assert.equal(state.monsters.length,1);
   positions.push(state.monsters[0].position.x);
  }
  assert(positions.some(x=>fixedLanes.every(lane=>Math.abs(x-lane)>10)),`${difficulty} remains confined to fixed lanes`);
  assert(positions.some(x=>x<120)&&positions.some(x=>x>150&&x<210)&&positions.some(x=>x>240),`${difficulty} does not cover width`);
 }
});


test('四种难度开场首只怪物也不局限于固定窄通道', () => {
 const lanes=[56,118,180,242,304];
 for (const difficulty of ['easy','normal','hard','nightmare'] as const) {
  const positions=Array.from({length:12},(_,seed)=>createStageInvasion(createOpeningPlan(`opening-${seed}`,createSeededRandom(seed+1),1,1,difficulty),1).monsters[0].position.x);
  assert(positions.some(x=>lanes.every(lane=>Math.abs(x-lane)>10)),`${difficulty} opening position remains on fixed lanes`);
  assert(positions.every(x=>x>=48&&x<=312));
  assert(Object.isFrozen(createStageInvasion(plan(1,difficulty),1).monsters[0]));
 }
});
