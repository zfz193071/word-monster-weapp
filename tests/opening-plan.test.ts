import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpeningPlan, validateOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { createOpeningEncounter, OPENING_EXPERIENCE, OPENING_MONSTER_COUNTS, openingSkillOffer, ZERO_SKILLS } from '../miniprogram/fortress/opening-encounter';
import { createExperience } from '../miniprogram/fortress/experience';
import { BATTLE_WORDS } from '../miniprogram/fortress/fruit-catalog';
import { createFruitOptions } from '../miniprogram/fortress/fruit-options';
import { stepCombat } from '../miniprogram/fortress/combat';
import type { BattleSkillId } from '../miniprogram/fortress/types';

test('19波：前11词唯一，后8词不重复复习，边界不连续同词；每波半数新目标、其余均匀覆盖历史', () => {
  for (let seed = 0; seed < 50; seed++) {
    const plan = createOpeningPlan(`plan-${seed}`, createSeededRandom(seed)); validateOpeningPlan(plan);
    assert.equal(plan.waves.length, 19);
    assert.deepEqual(plan.waves.map(w => w.spawnPlan.length), [8,13,18,23,28,33,38,43,48,53,58,63,68,73,78,83,88,93,98]);
    assert.equal(new Set(plan.waves.slice(0,11).map(w=>w.targetWordId)).size,11);
    assert.equal(new Set(plan.waves.slice(11).map(w=>w.targetWordId)).size,8);
    for (const [index,wave] of plan.waves.entries()) {
      const count=OPENING_MONSTER_COUNTS[index];assert.equal(wave.spawnPlan.length,count);
      const batches = new Map<number, number>();
      for (const spawn of wave.spawnPlan) batches.set(spawn.spawnAtMs!, (batches.get(spawn.spawnAtMs!) ?? 0) + 1);
      assert.ok([...batches.values()].every(size => size >= 3 && size <= 5), '含尾批的全部批次均为3至5只');
      const history=[...new Set(plan.waves.slice(0,index).map(w=>w.targetWordId))].filter(id=>id!==wave.targetWordId);
      assert.equal(wave.spawnPlan.filter(m=>m.wordId===wave.targetWordId).length,index?Math.ceil(count/2):count);
      const oldCounts=history.map(id=>wave.spawnPlan.filter(m=>m.wordId===id).length);
      if(index){assert.ok(Math.min(...oldCounts)>=1);assert.ok(Math.max(...oldCounts)-Math.min(...oldCounts)<=1);assert.notEqual(wave.targetWordId,plan.waves[index-1].targetWordId);}
      const cards=createFruitOptions(wave.targetWordId,[],createSeededRandom(seed),BATTLE_WORDS.map(w=>w.id));
      const retry=createFruitOptions(wave.targetWordId,cards,createSeededRandom(seed+1),BATTLE_WORDS.map(w=>w.id));assert.deepEqual(retry.filter(id=>cards.includes(id)),[wave.targetWordId]);
    }
  }
});
test('7级武器完整19波击杀升级至20封顶，满级旧技能移出，每次固定三选一', () => {
 const plan=createOpeningPlan('full-run',createSeededRandom(10));const xp=createExperience(plan.sessionId,OPENING_EXPERIENCE);
 let levels: import("../miniprogram/fortress/types").SkillLevels={...ZERO_SKILLS}; let hp=50;
 for(let index=0;index<19;index++){
  const wave=plan.waves[index];let state=createOpeningEncounter(plan.sessionId,wave.targetWordId,index,index,levels,hp,plan.waves.slice(0,index).map(w=>w.targetWordId),1,7);
  const upgrades:number[]=[];
  for(let tick=0;tick<20000&&state.status==='fighting';tick++){const next=stepCombat(state);state=next.state;upgrades.push(...xp.record(next.events).upgrades);}
  assert.equal(state.status,'cleared',`wave ${index+1}`);hp=state.base.hp;assert.deepEqual(upgrades,[index+2]);
  const offer=openingSkillOffer(plan.sessionId,index+2,levels);assert.equal(offer.cards.length,3);assert.equal(new Set(offer.cards.map(c=>c.id)).size,3);
  assert.ok(offer.cards.every(c=>!['doubleShot','fireRate','bulletWidth'].includes(c.id)||(levels[c.id as BattleSkillId]??0)<3));
  const chosen=(offer.cards.find(c=>c.id==='fireRate')??offer.cards.find(c=>c.id==='doubleShot')??offer.cards.find(c=>c.id==='bulletWidth')??offer.cards.find(c=>c.id==='flame')??offer.cards[0]).id as BattleSkillId;levels={...levels,[chosen]:(levels[chosen]??0)+1};
 }
 assert.equal(xp.view.total,8056);assert.equal(xp.view.level,20);assert.ok(xp.view.total>OPENING_EXPERIENCE.levelThresholds.at(-1)!,'20级后击杀仍累计经验');assert.equal(Object.values(levels).reduce((a,b)=>a+b,0),19);
});
