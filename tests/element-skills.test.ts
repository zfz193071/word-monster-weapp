import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpeningEncounter, openingSkillOffer } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';
import type { CombatState, ElementId } from '../miniprogram/fortress/types';
function ready(): CombatState {
 const state=createOpeningEncounter('elements','apple',0,0,{doubleShot:1,fireRate:0,bulletWidth:0,flame:1,frost:1,lightning:1});
 return {...state,tick:499,shotRemainingMs:0,monsters:state.monsters.map((m,i)=>({...m,status:'alive',spawnAtMs:0,position:{x:180+i*20,y:200},hitbox:{x:-5,y:-5,width:10,height:10}}))};
}
function hit(elements: Partial<Record<ElementId,number>>): CombatState {
 const state=ready();return {...state,tick:500,shotRemainingMs:500,projectiles:[{id:'hit',position:{x:180,y:210},previousPosition:{x:180,y:210},width:2,height:2,damage:1,elements}]};
}
test('每波5秒蓄能，双发火焰组合生效，冰雷仍仅第一颗，发射后重计5秒',()=>{
 const initial=ready();const before=stepCombat({...initial,tick:498}).state;assert.ok(before.projectiles.every(p=>!p.elements));
 const fired=stepCombat(initial).state;assert.equal(fired.projectiles.length,2);assert.equal(fired.projectiles.filter(p=>p.elements?.flame).length,2);assert.equal(fired.projectiles.filter(p=>p.elements?.frost).length,1);assert.equal(fired.elementReadyTick,1000);
 const again=stepCombat({...fired,shotRemainingMs:0,projectiles:[]}).state;assert.ok(again.projectiles.every(p=>!p.elements));
 const noTarget=stepCombat({...initial,monsters:initial.monsters.map(m=>({...m,position:{...m.position,y:-20}}))}).state;assert.equal(noTarget.projectiles.length,0);assert.equal(noTarget.elementReadyTick,500);
});
test('火焰额外范围伤害，冰霜2秒减速，雷电仅最近另一目标；同距离按出场序',()=>{
 const state=hit({flame:1,frost:1,lightning:1});const result=stepCombat(state);
 assert.equal(result.state.monsters[0].hp,64);assert.equal(result.state.monsters[1].hp,50);assert.equal(result.state.monsters[2].hp,65);
 const slowed=result.state.monsters[0];assert.equal(slowed.slowUntilTick,701);assert.equal(slowed.slowRatio,.25);
 const next=stepCombat(result.state).state;assert.ok(Math.abs(next.monsters[0].position.y-slowed.position.y-.15)<1e-8);
 const expired=stepCombat({...result.state,tick:701,projectiles:[]}).state;assert.ok(Math.abs(expired.monsters[0].position.y-slowed.position.y-.2)<1e-8);
 const tied=hit({lightning:1});const tie=stepCombat({...tied,monsters:tied.monsters.map((m,i)=>({...m,position:{x:i===0?180:i===1?160:200,y:200}}))}).state;
 assert.equal(tie.monsters[1].hp,65);assert.equal(tie.monsters[2].hp,80);
});
test('冰霜上限70%，范围击杀每实体只记一次，等待出场不受伤',()=>{
 const state=hit({flame:20,frost:20,lightning:20});const result=stepCombat({...state,monsters:state.monsters.map((m,i)=>i===2?{...m,status:'waiting',spawnAtMs:90000}:m)});
 assert.equal(result.events.filter(e=>e.type==='monsterDefeated').length,2);assert.equal(new Set(result.state.defeatedMonsterIds).size,2);assert.equal(result.state.monsters[2].hp,80);
 const frost=stepCombat(hit({frost:20})).state;assert.equal(frost.monsters[0].slowRatio,.7);
});
test('旧技能封顶后始终提供三个不同元素；不同局候选变化',()=>{
 const levels={doubleShot:3,fireRate:3,bulletWidth:3,flame:19,frost:19,lightning:19,firepower:1,homing:1};
 const offer=openingSkillOffer('max',20,levels);assert.deepEqual(offer.cards.map(c=>c.id).sort(),['flame','frost','lightning']);
 assert.ok(offer.cards.every(c=>c.label.includes('20')));
 const sets=new Set(Array.from({length:20},(_,i)=>openingSkillOffer(`run-${i}`).cards.map(c=>c.id).sort().join(',')));assert.ok(sets.size>1);
});
