import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';
import { createFortressEntryStore } from '../miniprogram/services/fortress-entry';
import { DamageNumbers } from '../miniprogram/fortress/damage-numbers';
import type { CombatState } from '../miniprogram/fortress/types';

function ready(level:number):CombatState {
 const state=createOpeningEncounter('weapon-damage','apple',0,0,{doubleShot:1,fireRate:0,bulletWidth:0},50,[],1,level);
 return {...state,shotRemainingMs:0,monsters:state.monsters.map((m,i)=>({...m,status:'alive',spawnAtMs:0,position:{x:180+i*20,y:200},hitbox:{x:-5,y:-5,width:10,height:10}}))};
}
test('七级装备进入战斗，每颗齐射子弹使用对应伤害，怪物生命不变',()=>{
 for(let level=1;level<=7;level++){
  const initial=ready(level);assert(initial.monsters.every(m=>m.maxHp===80));
  const fired=stepCombat(initial).state;assert.equal(fired.projectiles.length,2);
  assert(fired.projectiles.every(p=>p.damage===10+(level-1)*5));
  assert.equal(fired.weaponLevel,level);assert.equal(openingArt('apple',['apple'],level).hero.path,
   level === 1 ? '/character-assets/hero-back-weapon-1-textured.png' : `/assets/images/fortress/hero-back-weapon-${level}.png`);
 }
 assert.throws(()=>ready(8));
});
test('装备由已保存等级进入对局计划，十九波不丢失，下一局读取新装备',()=>{
 let equipped=3;const store=createFortressEntryStore(()=>true,()=>equipped);
 const first=store.start(100);assert.equal(first.plan.weaponLevel,3);equipped=7;assert.equal(first.plan.weaponLevel,3);
 for(let wave=0;wave<19;wave++){
  const plan=first.plan;const state=createOpeningEncounter(plan.sessionId,plan.waves[wave].targetWordId,0,wave,undefined,50,plan.waves.slice(0,wave).map(w=>w.targetWordId),1,plan.weaponLevel);
  assert.equal(state.weaponLevel,3);
 }
 assert.equal(store.start(101).plan.weaponLevel,7);
});
test('普通与元素伤害逐次记录，致命伤害不按剩余血量截断，冰霜不伪造伤害',()=>{
 const initial=ready(7);
 const projectile={id:'hit',position:{x:180,y:210},previousPosition:{x:180,y:210},width:2,height:2,damage:4,elements:{flame:1,lightning:1,frost:1}};
 const result=stepCombat({...initial,shotRemainingMs:500,projectiles:[projectile]});
 const hits=result.events.filter(e=>e.type==='monsterDamaged');
 assert.deepEqual(hits.map(e=>[e.kind,e.damage]),[['projectile',4],['lightning',15],['flame',15],['flame',15],['flame',15]]);
 assert.deepEqual(result.state.monsters.map(m=>m.hp),[61,50,65,80,80,80,80,80]);
 const kill=stepCombat({...initial,shotRemainingMs:500,monsters:initial.monsters.map((m,i)=>i===0?{...m,hp:1}:m),projectiles:[{...projectile,elements:undefined}]});
 const event=kill.events.find(e=>e.type==='monsterDamaged');assert.equal(event?.hp,0);assert.equal(event?.damage,4);
 assert.equal(kill.events.filter(e=>e.type==='monsterDefeated').length,1);
 const numbers=new DamageNumbers();numbers.add(result.events,100);const first=numbers.sample(100);
 assert.equal(first.length,5);assert.equal(first[0].text,'-4');assert.equal(first[1].text,'-15');assert.notEqual(first[0].color,first[2].color);
 assert.notEqual(first[0].position.x,first[2].position.x,'同一个怪物普通和火焰数字错开');
 assert.deepEqual(numbers.sample(100),first,'暂停不推进效果时间');
 const later=numbers.sample(700);assert(later[0].opacity<first[0].opacity);assert(later[0].position.y<first[0].position.y);
 assert.equal(numbers.sample(900).length,0);assert.equal(numbers.active,false);
 numbers.add(kill.events,1000);assert.equal(numbers.sample(1000)[0].text,'-4');numbers.clear();assert.equal(numbers.active,false);
});
