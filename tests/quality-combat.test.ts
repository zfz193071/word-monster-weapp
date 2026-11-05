import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpeningEncounter, ZERO_SKILLS } from '../miniprogram/fortress/opening-encounter';
import { qualityEffects, qualitySkillOffer, skillLevels } from '../miniprogram/fortress/quality-skills';
import { applySkillReward } from '../miniprogram/fortress/skill-quality';
import type { SkillCollection } from '../miniprogram/fortress/skill-quality';
import { stepCombat, applyCombatSkills } from '../miniprogram/fortress/combat';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { createUpgradeChoices } from '../miniprogram/fortress/upgrade-choice';
function initial(skills:SkillCollection) {
 const state=createOpeningEncounter('quality','apple',0,0,skillLevels(skills),20,[],1,1,[],'normal',skills);
 return {...state,monsters:state.monsters.map((m,i)=>({...m,status:'alive' as const,spawnAtMs:0,position:{x:180+i*20,y:200},hitbox:{x:-5,y:-5,width:10,height:10}}))};
}
test('五级稀有参数实际发射，齐射仅一发携带元素，伤害向上取整',()=>{
 const skills:SkillCollection={doubleShot:{level:5,quality:'rare'},fireRate:{level:5,quality:'rare'},bulletWidth:{level:5,quality:'rare'},homing:{level:5,quality:'rare'},firepower:{level:5,quality:'rare'},flame:{level:5,quality:'rare'}};
 const state=stepCombat({...initial(skills),tick:499,elementReadyTick:500,firepowerUntilTick:1000,shotRemainingMs:0}).state;
 assert.equal(state.projectiles.length,6);assert.equal(state.projectiles.filter(p=>p.elements).length,1);
 assert.equal(state.projectiles[0].width,37.800000000000004);assert.equal(state.projectiles[0].damage,26);
 assert(Math.abs(state.shotRemainingMs-220)<1e-8); // 230ms interval minus elapsed 10ms
 const changed=applyCombatSkills(state,{...ZERO_SKILLS},skills);assert.equal(changed.skills.doubleShot,5);
});
test('稀有元素范围、连锁数与Boss减速限制进入实际碰撞',()=>{
 const skills:SkillCollection={flame:{level:5,quality:'rare'},frost:{level:5,quality:'rare'},lightning:{level:5,quality:'rare'}};
 const state=initial(skills);
 const result=stepCombat({...state,tick:500,shotRemainingMs:500,monsters:state.monsters.map((m,i)=>({...m,boss:i===0})),projectiles:[{id:'hit',position:{x:180,y:210},previousPosition:{x:180,y:210},width:2,height:2,damage:1,elements:{flame:5,frost:5,lightning:5},skillCollection:skills}]}).state;
 assert.equal(result.monsters[0].hp,31);assert.equal(result.monsters[0].slowRatio,.35);
 assert.equal(result.monsters[1].hp,0);assert.equal(result.monsters[2].hp,0);assert.equal(result.monsters[3].hp,80);
});
test('技能卡片展示实际保留的高品质，重复消费不会增加等级',()=>{
 const skills:SkillCollection={doubleShot:{level:2,quality:'rare'}};
 const offer=qualitySkillOffer('offer',2,skills,{hp:100,maxHp:100},()=>.999);
 const card=offer.cards.find(c=>c.id==='doubleShot')!;assert.equal(card.skillLevel,3);assert.equal(card.qualityLabel,'稀有');assert.match(card.description,/4发/);
 const choices=createUpgradeChoices();choices.open(offer);assert(choices.select(offer.id,card.id));assert.equal(choices.select(offer.id,card.id),null);
 assert.equal(applySkillReward(skills,{id:'doubleShot',quality:card.quality!}).doubleShot!.level,3);
});
test('暂停的战斗中修复恢复满血，无暂停不能修复，失败不能复活',()=>{
 const runner=new CombatRunner(initial({}));runner.restoreBase();assert.equal(runner.snapshot!.base.hp,20);
 runner.pause();runner.restoreBase();assert.equal(runner.snapshot!.base.hp,1000);assert.deepEqual(runner.snapshot!.skills,skillLevels({}));
 const dead=new CombatRunner({...initial({}),status:'baseDestroyed',base:{hp:0,maxHp:1000}});dead.pause();dead.restoreBase();assert.equal(dead.snapshot!.base.hp,0);
});
test('品质只影响已拥有技能，追踪弹生命周期有界',()=>{
 const effect=qualityEffects({});assert.equal(effect.count,1);assert.equal(effect.width,8);assert.equal(effect.intervalMs,500);assert.equal(effect.projectileMultiplier,1);assert.equal(effect.firepowerBonus,0);
 const state=initial({homing:{level:1,quality:'fine'}});const fired=stepCombat(state).state;assert.equal(fired.projectiles[0].damage,11);
 const expired=stepCombat({...fired,tick:400,shotRemainingMs:500}).state;assert(!expired.projectiles.some(p=>p.id===fired.projectiles[0].id));
});
