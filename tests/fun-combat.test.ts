import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseFrostBurst, stepCombat, applyCombatSkills } from '../miniprogram/fortress/combat';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { comboProgress, withComboHints } from '../miniprogram/fortress/skill-combos';
import { qualitySkillOffer } from '../miniprogram/fortress/quality-skills';
import type { CombatState, ProjectileState } from '../miniprogram/fortress/types';
import { createBattlePet } from '../miniprogram/pets/battle';

function ready(): CombatState {
  const state = createOpeningEncounter('fun','apple',1);
  return {...state, frostEnergy:30, shotRemainingMs:999999, monsters:state.monsters.slice(0,3).map((m,i)=>({...m,hp:1000,maxHp:1000,status:'alive' as const,spawnAtMs:0,position:{x:180+i*20,y:200},hitbox:{x:-5,y:-5,width:10,height:10}}))};
}
function bullet(id:string, x=180, y=210): ProjectileState {
  return {id,position:{x,y},previousPosition:{x,y},width:2,height:2,damage:1,direction:{x:0,y:-1}};
}

test('冰冻消耗30能量：普通怪停移停攻300步，Boss仅减速，等待怪不受影响',()=>{
  const initial=ready();
  const before={...initial,monsters:initial.monsters.map((m,i)=>i===1?{...m,boss:true}:i===2?{...m,status:'waiting' as const,spawnAtMs:10000}:m)};
  const frozen=releaseFrostBurst(before)!;
  assert.equal(frozen.frostEnergy,0);assert.equal(releaseFrostBurst(frozen),null);
  assert.equal(frozen.monsters[0].frozenUntilTick,300);assert.equal(frozen.monsters[1].frozenUntilTick,undefined);assert.equal(frozen.monsters[1].slowRatio,.35);
  assert.equal(frozen.monsters[2].slowUntilTick,undefined);
  let state=frozen;for(let i=0;i<300;i++)state=stepCombat(state).state;
  assert.deepEqual(state.monsters[0].position,frozen.monsters[0].position);
  assert(state.monsters[1].position.y>frozen.monsters[1].position.y);
  assert(stepCombat(state).state.monsters[0].position.y>state.monsters[0].position.y);
  const atWall={...initial,monsters:[{...initial.monsters[0],status:'attackingBase' as const,attackRemainingMs:500}]};
  let wall=releaseFrostBurst(atWall)!;for(let i=0;i<300;i++)wall=stepCombat(wall).state;
  assert.equal(wall.monsters[0].attackRemainingMs,500);assert.equal(wall.base.hp,initial.base.hp);
  const boss=releaseFrostBurst({...atWall,monsters:[{...atWall.monsters[0],boss:true,attackRemainingMs:0}]})!;
  assert(stepCombat(boss).events.some(e=>e.type==='baseDamaged'));
});

test('不足能量、无入场目标、结算拒绝释放；重复点击不再次扣除，暂停及销毁拒绝',()=>{
  const initial=ready();
  assert.equal(releaseFrostBurst({...initial,frostEnergy:29}),null);
  assert.equal(releaseFrostBurst({...initial,monsters:[]}),null);
  for(const status of ['cleared','baseDestroyed'] as const)assert.equal(releaseFrostBurst({...initial,status}),null);
  const runner=new CombatRunner(initial);runner.pause();assert.equal(runner.releaseFrost(),false);
  runner.resume(0,2);assert.equal(runner.releaseFrost(),true);assert.equal(runner.releaseFrost(),false);
  runner.dispose();assert.equal(runner.releaseFrost(),false);
  assert.equal(createOpeningEncounter('new-stage','apple',1).frostEnergy,0);
});

test('冰冻与已有控制取强度和较晚截止，不缩短；Boss冲击波不因大招中断',()=>{
  const initial=ready();const old={...initial.monsters[0],slowRatio:.7,slowUntilTick:500,frozenUntilTick:400};
  const state=releaseFrostBurst({...initial,monsters:[old]})!;
  assert.equal(state.monsters[0].slowRatio,.7);assert.equal(state.monsters[0].slowUntilTick,500);assert.equal(state.monsters[0].frozenUntilTick,400);
  const boss=releaseFrostBurst({...initial,tick:1099,monsters:[{...initial.monsters[0],boss:true,bossKind:'grand',shockwaveDamage:10}]})!;
  assert(stepCombat(boss).events.some(e=>e.type==='baseDamaged'));
});

test('冰冻计时遵循倍率，暂停无消耗，恢复无跳时',()=>{
  for(const speed of [1,1.5,2,2.5]) {
    const runner=new CombatRunner(ready());runner.setSpeed(speed);assert(runner.releaseFrost());runner.frame(0);
    for(let time=100;time<=1000;time+=100)runner.frame(time);
    assert.equal(runner.snapshot!.tick,100*speed);
    runner.pause();const before=runner.snapshot;runner.frame(9999);assert.equal(runner.snapshot,before);
    runner.resume(10000,2);runner.frame(10000);assert.equal(runner.snapshot!.tick,100*speed);
  }
});

test('所有真实击杀统一加能量，上限30且重复事件不累计',()=>{
  const initial=ready();
  let state:CombatState={...initial,frostEnergy:29,monsters:initial.monsters.map(m=>({...m,hp:1})),projectiles:[{...bullet('boom'),elements:{flame:1}}]};
  const result=stepCombat(state);assert.equal(result.events.filter(e=>e.type==='monsterDefeated').length,3);assert.equal(result.state.frostEnergy,30);
  assert.equal(stepCombat(result.state).state.frostEnergy,30);
  // The soldier and pet damage paths must feed the same unique death accounting.
  state={...initial,frostEnergy:0,monsters:[{...initial.monsters[0],hp:1}],supportSoldiers:[{id:'ally',slot:0,position:{x:180,y:400},hp:30,maxHp:30,attackRemainingMs:0}]};
  assert.equal(stepCombat(state).state.frostEnergy,1);
  const pet=createBattlePet({level:1,equipped:[]},0);
  assert.equal(stepCombat({...initial,frostEnergy:0,monsters:[{...initial.monsters[0],hp:1}],pet}).state.frostEnergy,1);
});

test('冰雷组合保持雷电伤害与目标数，链中普通怪获得冰霜，Boss仍免冻',()=>{
  const initial=ready();
  const collection={frost:{quality:'legendary' as const,level:1},lightning:{quality:'rare' as const,level:1}};
  const state=applyCombatSkills(initial,initial.skills,collection);
  const result=stepCombat({...state,monsters:state.monsters.map((m,i)=>i===2?{...m,boss:true}:m),projectiles:[{...bullet('ice-chain'),elements:{frost:1,lightning:1},skillCollection:collection}]});
  assert.equal(result.state.monsters[1].frozenUntilTick,61);assert.equal(result.state.monsters[2].frozenUntilTick,undefined);
  assert.equal(result.state.monsters[2].slowRatio,.35);
  assert.equal(result.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='lightning').length,2);
  assert(result.state.elementImpacts!.some(e=>e.iceChain));
});

test('火焰齐射最多三颗半伤火焰，其他元素只有第一颗，5秒冷却不变',()=>{
  const initial=ready();const collection={flame:{quality:'elite' as const,level:1},doubleShot:{quality:'legendary' as const,level:5},frost:{quality:'crude' as const,level:1},lightning:{quality:'crude' as const,level:1}};
  const state=applyCombatSkills(initial,initial.skills,collection);
  const result=stepCombat({...state,tick:499,shotRemainingMs:0}).state;
  assert.equal(result.projectiles.length,8);assert.equal(result.projectiles.filter(p=>p.elements?.flame).length,3);
  assert.equal(result.projectiles.filter(p=>p.elements?.frost).length,1);assert.equal(result.projectiles.filter(p=>p.elements?.lightning).length,1);
  assert.equal(new Set(result.projectiles.filter(p=>p.flameVolleyId).map(p=>p.flameVolleyId)).size,1);
  assert.equal(result.elementReadyTick,1000);
});

test('火焰同轮跨帧爆炸去重，普通弹独立扣血，灼烧按半伤计算且记录及时回收',()=>{
  const initial=ready();const collection={flame:{quality:'elite' as const,level:1},doubleShot:{quality:'crude' as const,level:1}};
  const payload={elements:{flame:1},flameVolleyId:'same',skillCollection:collection};
  let state={...initial,projectiles:[{...bullet('one'),...payload},{...bullet('two',180,250),...payload}]};
  let result=stepCombat(state);
  const damage=result.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='flame');
  assert.equal(damage.length,3);assert(damage.every(e=>e.type==='monsterDamaged'&&e.damage===12));
  assert.equal(result.state.monsters[0].burn!.damage,3);
  assert.equal(result.state.flameVolleyHits!.same.length,3);
  let laterFlames=0, laterBullets=0;
  for(let i=0;i<20;i++) {result=stepCombat(result.state);laterFlames+=result.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='flame').length;laterBullets+=result.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='projectile').length;}
  assert.equal(laterFlames,0);assert.equal(laterBullets,1);assert.deepEqual(result.state.flameVolleyHits,{});
  assert.equal(result.state.monsters[0].burn!.untilTick,201);
});

test('组合提示三态、选取激活及已激活标记准确，不更改候选身份',()=>{
  const zero={doubleShot:0,fireRate:0,bulletWidth:0};
  assert(comboProgress(zero).every(c=>c.status==='empty'));
  assert.equal(comboProgress({...zero,frost:1})[0].hint,'差雷电');
  assert.equal(comboProgress({...zero,frost:1,lightning:1})[0].status,'active');
  const offer=qualitySkillOffer('hints',2,{}, {hp:100,maxHp:100},()=>.4);
  const decorated=withComboHints(offer,{...zero,flame:1,frost:1});assert.equal(decorated.id,offer.id);
  assert.deepEqual(decorated.cards.map(c=>c.id),offer.cards.map(c=>c.id));
});


test('双选第二张卡刷新组合实际伤害，不保留选择第一张前的旧说明',()=>{
  const offer={id:'second',level:2,cards:[{id:'flame',icon:'flame' as const,label:'火焰',description:'旧说明',quality:'crude' as const,resultingQuality:'crude' as const,qualityLabel:'简陋',skillLevel:1}]};
  const current={doubleShot:{level:1,quality:'crude' as const}};
  const refreshed=withComboHints(offer,{doubleShot:1,fireRate:0,bulletWidth:0},current);
  assert(refreshed.cards[0].description.includes('8火焰伤害'));
  assert.equal(refreshed.cards[0].comboHint,'火焰扇面 · 选取即激活');
});
