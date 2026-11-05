import assert from 'node:assert/strict';
import test from 'node:test';
import { qualityDescription, qualityEffects, skillLevels } from '../miniprogram/fortress/quality-skills';
import { SKILL_QUALITIES } from '../miniprogram/fortress/skill-quality';
import type { SkillCollection, SkillQuality } from '../miniprogram/fortress/skill-quality';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { weaponForLevel } from '../miniprogram/weapons/catalog';
import type { CombatState } from '../miniprogram/fortress/types';

function scene(skills:SkillCollection, weaponLevel=1):CombatState {
 const state=createOpeningEncounter('pierce','apple',1,0,skillLevels(skills),undefined,[],1,weaponLevel,[],'normal',skills);
 return {...state,shotRemainingMs:500,monsters:state.monsters.map((m,i)=>({...m,status:i<4?'alive':'waiting',spawnAtMs:i<4?0:900000,position:{x:180,y:200},hp:1000,maxHp:1000,hitbox:{x:-5,y:-5,width:10,height:10}}))};
}
test('四种弹丸技能五级×五档品质：实际发射数量、间隔、宽度、组合伤害及武器升级',()=>{
 for(const [rank,q] of SKILL_QUALITIES.entries())for(let level=1;level<=5;level++)for(const weaponLevel of [1,7]){
  const skill={level,quality:q.id};const skills:SkillCollection={doubleShot:skill,fireRate:skill,bulletWidth:skill,homing:skill,firepower:skill};
  const state=scene(skills,weaponLevel);const fired=stepCombat({...state,shotRemainingMs:0}).state;
  assert.equal(fired.projectiles.length,Math.min(8,level+1+(rank===3?1:rank===4?2:0)));
  const expectedInterval=Math.max(160,500*(1-.08*level*q.multiplier));assert(Math.abs(fired.shotRemainingMs-(expectedInterval-10))<1e-8);
  assert.equal(fired.projectiles[0].width,Math.min(56,(8+4*level)*q.multiplier));
  const damage=Math.ceil(weaponForLevel(weaponLevel).damage*(rank===3?1.1:rank===4?1.2:1)*(1+.02*level*q.multiplier)*(1+Math.min(1.5,(.4+.1*level)*q.multiplier)));
  assert.equal(fired.projectiles[0].damage,damage);assert.equal(fired.projectiles[0].remainingPenetrations,rank===3?1:rank===4?2:0);
 }
});
function hit(quality:SkillQuality, elements=false):CombatState {
 const skills:SkillCollection={homing:{level:1,quality},...(elements?{flame:{level:1,quality:'crude' as const}}:{})};const state=scene(skills);
 return {...state,projectiles:[{id:'hit',position:{x:180,y:210},previousPosition:{x:180,y:210},width:2,height:2,damage:10,homing:true,targetMonsterId:state.monsters[0].id,skillCollection:skills,remainingPenetrations:qualityEffects(skills).homingPenetrations,hitMonsterIds:[],expiresAtTick:400,...(elements?{elements:{flame:1}}:{})}]};
}
test('精英额外穿透一次、传说两次，重叠目标同帧逐次70%向上取整，元素仅首击',()=>{
 for(const [quality,damages] of [['rare',[10]],['elite',[10,7]],['legendary',[10,7,5]]] as const){
  const result=stepCombat(hit(quality,true));const hits=result.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='projectile');
  assert.deepEqual(hits.map(e=>e.type==='monsterDamaged'?e.damage:0),damages);assert.equal(new Set(hits.map(e=>'monsterId' in e?e.monsterId:'')).size,hits.length);
  assert.equal(result.events.filter(e=>e.type==='monsterDamaged'&&e.kind==='flame').length,4,'火焰范围只结算一轮');
  assert.equal(result.state.projectiles.length,0);
 }
});
test('穿透后跨帧避开已命中活怪并改锁下一可见目标，等待出场目标不参与',()=>{
 const initial=hit('legendary');const monsters=initial.monsters.map((m,i)=>({...m,position:{x:i===0?180:260,y:200},status:i===0||i===1?'alive' as const:'waiting' as const,spawnAtMs:i<2?0:900000}));
 const first=stepCombat({...initial,monsters}).state;assert.equal(first.projectiles.length,1);assert.equal(first.projectiles[0].damage,7);
 assert.deepEqual(first.projectiles[0].hitMonsterIds,[monsters[0].id]);assert(Object.isFrozen(first.projectiles[0].hitMonsterIds));
 const next=stepCombat(first);assert.equal(next.state.projectiles[0].targetMonsterId,monsters[1].id);assert.equal(next.events.filter(e=>e.type==='monsterDamaged').length,0);
 const redirected={...next.state,projectiles:next.state.projectiles.map(p=>({...p,position:{x:260,y:210},previousPosition:{x:260,y:210}}))};
 const second=stepCombat(redirected);assert.equal(second.events.filter(e=>e.type==='monsterDamaged').length,1);assert.equal(second.state.projectiles[0].damage,5);
 assert.equal(second.state.projectiles[0].hitMonsterIds!.length,2);
});
test('穿透击杀每个实体只结算一次经验事件与金币，旧快照不变',()=>{
 const initial=hit('legendary');const before=JSON.stringify(initial);
 const result=stepCombat({...initial,monsters:initial.monsters.map(m=>({...m,hp:1,dropCoins:2}))});
 assert.equal(result.events.filter(e=>e.type==='monsterDefeated').length,3);assert.equal(result.events.filter(e=>e.type==='coinsDropped').length,3);
 assert.equal(JSON.stringify(initial),before);assert.equal(stepCombat(result.state).events.filter(e=>e.type==='monsterDefeated').length,0);
});
test('穿透弹四秒到期，暂停不消耗寿命，销毁清空状态',()=>{
 const initial={...hit('legendary'),tick:399};const runner=new CombatRunner(initial);runner.pause();runner.frame(9000);assert.equal(runner.snapshot!.tick,399);
 runner.resume(9000,initial.context.generation + 1);runner.frame(9010);assert.equal(runner.snapshot!.projectiles.length,0);runner.dispose();assert.equal(runner.snapshot,null);
});
test('精英与传说描述包含已生效的伤害和穿透，未拥有不附加收益',()=>{
 assert.equal(qualityEffects({}).projectileMultiplier,1);assert.equal(qualityEffects({}).homingPenetrations,0);
 assert.match(qualityDescription('bulletWidth',{bulletWidth:{level:5,quality:'legendary'}}),/20%/);
 assert.match(qualityDescription('homing',{homing:{level:5,quality:'elite'}}),/额外穿透1个/);
 assert.match(qualityDescription('homing',{homing:{level:5,quality:'legendary'}}),/额外穿透2个/);
});
