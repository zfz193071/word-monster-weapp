import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { qualityDescription, qualityEffects, skillLevels } from '../miniprogram/fortress/quality-skills';
import { SKILL_QUALITIES } from '../miniprogram/fortress/skill-quality';
import type { SkillCollection } from '../miniprogram/fortress/skill-quality';
import type { CombatState, ElementId } from '../miniprogram/fortress/types';
function scene(skills:SkillCollection):CombatState {
 const state=createOpeningEncounter('element-quality','apple',1,0,skillLevels(skills),undefined,[],1,1,[],'normal',skills);
 return {...state,monsterSpeed:0,shotRemainingMs:1e8,monsters:state.monsters.map((m,i)=>({...m,status:'alive',spawnAtMs:0,position:{x:180+i*10,y:200},hp:10000,maxHp:10000,hitbox:{x:-3,y:-5,width:6,height:10}}))};
}
function hit(state:CombatState, id:ElementId) {
 return stepCombat({...state,projectiles:[{id:`hit-${state.tick}`,position:{x:180,y:210},previousPosition:{x:180,y:210},width:2,height:2,damage:1,elements:{[id]:state.skills[id]},skillCollection:state.skillCollection}]} );
}
function until(state:CombatState,tick:number) {while(state.tick<tick) state=stepCombat(state).state;return state;}
test('元素五级×五档：真实爆炸伤害、灼烧比例、冻结、连锁数和范围',()=>{
 for(const [rank,q] of SKILL_QUALITIES.entries())for(let level=1;level<=5;level++){
  const skill={level,quality:q.id};const skills:SkillCollection={flame:skill,frost:skill,lightning:skill};const state=scene(skills);const damage=Math.ceil((10+5*level)*q.multiplier);
  const fire=hit(state,'flame');const fireHits=fire.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='flame');
  assert.equal(fireHits.length,[5,5,6,8,8][rank]);assert.equal(fire.state.elementImpacts!.find(i=>i.kind==='flame')!.radius,[45,45,60,75,90][rank]);assert(fireHits.every(e=>e.type==='monsterDamaged'&&e.damage===damage));
  assert.equal(fire.state.monsters[0].burn?.damage,rank>=3?Math.ceil(damage*(rank===3?.25:.5)):undefined);
  const frost=hit(state,'frost').state.monsters[0];assert.equal(frost.slowRatio,Math.min(.7,(.2+.05*level)*q.multiplier));
  assert.equal(frost.frozenUntilTick,rank>=3?1+(rank===3?30:60):undefined);
  const lightning=hit(state,'lightning');const arcs=lightning.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='lightning');
  assert.equal(arcs.length,[1,1,2,3,5][rank]);assert.equal(new Set(arcs.map(e=>'monsterId' in e?e.monsterId:'')).size,arcs.length);
  assert(arcs.every(e=>e.type==='monsterDamaged'&&e.damage===damage));
  assert.equal(qualityEffects(skills).flameRadius,[45,45,60,75,90][rank]);assert.equal(qualityEffects(skills).lightningRange,rank===4?130:90);
 }
});
test('灼烧每秒一次、两秒到期；同源刷新时长不叠层且保留下一次伤害节拍',()=>{
 const skills:SkillCollection={flame:{level:1,quality:'elite'}};
 let state=hit(scene(skills),'flame').state;assert.deepEqual(state.monsters[0].burn,{damage:6,nextTick:101,untilTick:201});assert(Object.isFrozen(state.monsters[0].burn));
 const hp=state.monsters[0].hp;state=until(state,100);assert.equal(state.monsters[0].hp,hp);state=until(state,101);assert.equal(state.monsters[0].hp,hp-6);
 state=until(state,150);state=hit(state,'flame').state;const refreshedHp=state.monsters[0].hp;
 assert.deepEqual(state.monsters[0].burn,{damage:6,nextTick:201,untilTick:351});
 state=until(state,301);assert.equal(state.monsters[0].hp,refreshedHp-12);state=until(state,352);assert.equal(state.monsters[0].hp,refreshedHp-12);assert.equal(state.monsters[0].burn,undefined);
 const once=hit(scene(skills),'flame').state;const ended=until(once,202);assert.equal(ended.monsters[0].hp,once.monsters[0].hp-12);
});
test('灼烧击杀不递归触发元素，死亡金币一次，死亡怪当步不能攻击',()=>{
 const skills:SkillCollection={flame:{level:1,quality:'legendary'},lightning:{level:5,quality:'legendary'}};
 const state=scene(skills);const victim={...state.monsters[0],hp:10,burn:{damage:15,nextTick:1,untilTick:200},status:'attackingBase' as const,attackRemainingMs:0,dropCoins:3};
 const result=stepCombat({...state,monsters:[victim,...state.monsters.slice(1)]});
 assert.equal(result.events.filter(e=>e.type==='monsterDefeated').length,1);assert.equal(result.events.filter(e=>e.type==='coinsDropped').length,1);
 assert.equal(result.events.filter(e=>e.type==='baseDamaged').length,0);assert.equal(result.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='lightning').length,0);
 assert.equal(stepCombat(result.state).events.filter(e=>e.type==='coinsDropped'||e.type==='monsterDefeated').length,0);
});
test('冻结暂停移动和攻击，结束后只继续原2秒减速窗口，Boss免冻减速上限35%',()=>{
 const skills:SkillCollection={frost:{level:5,quality:'legendary'}};const frozen=hit({...scene(skills),monsterSpeed:20},'frost').state;
 const before=frozen.monsters[0].position.y;const end=until(frozen,61);assert.equal(end.monsters[0].position.y,before);
 const slow=stepCombat(end).state;assert(Math.abs(slow.monsters[0].position.y-before-.06)<1e-8);
 const expired=stepCombat({...slow,tick:200}).state;assert(Math.abs(expired.monsters[0].position.y-slow.monsters[0].position.y-.2)<1e-8);
 const state=scene(skills);const attack=hit({...state,monsters:state.monsters.map((m,i)=>i?m:{...m,status:'attackingBase',attackRemainingMs:0})},'frost').state;
 assert.equal(attack.base.hp,state.base.hp);const held=until(attack,61);assert.equal(held.base.hp,state.base.hp);assert(stepCombat(held).state.base.hp<state.base.hp);
 const boss=hit({...state,monsters:state.monsters.map((m,i)=>i?m:{...m,boss:true,status:'attackingBase',attackRemainingMs:0})},'frost').state;
 assert.equal(boss.monsters[0].frozenUntilTick,undefined);assert.equal(boss.monsters[0].slowRatio,.35);assert(boss.base.hp<state.base.hp);
});
test('火力五级×五档按开场、5/6/8秒结束和20秒再次触发，元素伤害不受增益',()=>{
 for(const [rank,q] of SKILL_QUALITIES.entries())for(let level=1;level<=5;level++){
  const skills:SkillCollection={firepower:{level,quality:q.id},flame:{level:1,quality:'crude'}};const state=scene(skills);const duration=[500,500,500,600,800][rank];
  assert.equal(state.firepowerUntilTick,duration);
  for(const [tick,active] of [[1,true],[duration-1,true],[duration,false],[1999,false],[2000,true]] as const){
   const fired=stepCombat({...state,tick:tick-1,shotRemainingMs:0}).state;assert.equal(fired.projectiles[0].damage,active?Math.ceil(10*(1+Math.min(1.5,(.4+.1*level)*q.multiplier))):10);
  }
  assert(hit(state,'flame').events.filter(e=>e.type==='monsterDamaged'&&e.kind==='flame').every(e=>e.type==='monsterDamaged'&&e.damage===15));
 }
});
test('暂停冻结灼烧和冻结时长，换轮新状态无残留，处置后无回调',()=>{
 let state=hit(scene({flame:{level:1,quality:'elite'},frost:{level:1,quality:'elite'}}),'flame').state;state=hit(state,'frost').state;
 const runner=new CombatRunner(state);runner.pause();runner.frame(99999);assert.equal(runner.snapshot!.tick,state.tick);assert.deepEqual(runner.snapshot!.monsters[0].burn,state.monsters[0].burn);
 runner.resume(99999,2);runner.frame(100009);assert.equal(runner.snapshot!.tick,state.tick+1);runner.dispose();assert.equal(runner.frame(100109).state,null);
 const next=createOpeningEncounter('next','apple',2,1,skillLevels(state.skillCollection!),undefined,[],1,1,[],'normal',state.skillCollection);
 assert(next.monsters.every(m=>!m.burn&&!m.frozenUntilTick));assert.equal(next.elementReadyTick,500);
 assert.match(qualityDescription('flame',state.skillCollection!),/灼烧2秒/);assert.match(qualityDescription('frost',state.skillCollection!),/含冻结0.3秒/);
});

test('传说电弧实际扩大至130，目标不足/等待出场安全结束，死亡奖励不重复',()=>{
 const setup=(quality:'rare'|'legendary')=>{const state=scene({lightning:{level:1,quality}});return {...state,monsters:state.monsters.map((m,i)=>({...m,position:{x:[180,260,280,300,305,320,340,350][i],y:200}}))};};
 const rare=hit(setup('rare'),'lightning');assert.equal(rare.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='lightning').length,1);
 const gold=hit(setup('legendary'),'lightning');assert.equal(gold.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='lightning').length,4);
 const state=setup('legendary');const one=hit({...state,monsters:state.monsters.map((m,i)=>i?{...m,status:'waiting',spawnAtMs:900000}:m)},'lightning');
 assert.equal(one.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='lightning').length,0);
 const killed=hit({...state,monsters:state.monsters.map(m=>({...m,hp:2,dropCoins:1}))},'lightning');
 assert.equal(killed.events.filter(e=>e.type==='monsterDefeated').length,4);assert.equal(killed.events.filter(e=>e.type==='coinsDropped').length,4);
 assert.equal(stepCombat(killed.state).events.filter(e=>e.type==='coinsDropped').length,0);
});
test('火力和子弹组合加成不改变宠物或小士兵伤害',()=>{
 const state=scene({firepower:{level:5,quality:'legendary'},bulletWidth:{level:5,quality:'legendary'},homing:{level:5,quality:'legendary'}});
 const result=stepCombat({...state,pet:{level:5,equipped:[],attackRemainingMs:0},supportSoldiers:[{id:'soldier',slot:0,position:state.player,hp:30,maxHp:30,attackRemainingMs:0}]});
 const pet=result.events.find(e=>e.type==='monsterDamaged'&&e.kind==='pet');const soldier=result.events.find(e=>e.type==='monsterDamaged'&&e.kind==='soldier');
 assert.equal(pet?.type==='monsterDamaged'?pet.damage:0,18);assert.equal(soldier?.type==='monsterDamaged'?soldier.damage:0,10);
});
