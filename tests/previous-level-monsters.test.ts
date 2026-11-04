import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS, getLevel } from '../miniprogram/fortress/levels';
import { createOpeningPlan, validateOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { logicalHitbox } from '../miniprogram/fortress/viewport';

test('后续七关从首轮起30%为紧邻上一关词汇，听词题保持本关，比例与来源校验有效',()=>{
  for(const level of LEVELS.slice(1)){
    const plan=createOpeningPlan(`mixed-${level.id}`,createSeededRandom(15),level.id);
    validateOpeningPlan(plan);
    assert.deepEqual(plan.waves.map(w=>w.spawnPlan.length),Array.from({length:19},(_,i)=>Math.ceil((8+i*5)*1.25)));
    const previous=getLevel(level.id-1).words.map(word=>word.id);
    const current=level.words.map(word=>word.id);
    for(const wave of plan.waves){
      assert.equal(wave.spawnPlan.filter(m=>previous.includes(m.wordId)).length,Math.round(wave.spawnPlan.length*.3));
      assert.ok(wave.spawnPlan.every(m=>previous.includes(m.wordId)||current.includes(m.wordId)));
      assert.ok(wave.optionWordIds.every(id=>current.includes(id)));
    }
    const wave=plan.waves[0];const wrong={...plan,waves:[{...wave,spawnPlan:wave.spawnPlan.map(m=>({...m,wordId:wave.targetWordId}))},...plan.waves.slice(1)]};
    assert.throws(()=>validateOpeningPlan(wrong));
  }
});

test('动物与普通僵尸混合时，各自的碰撞区域仍对应各自形象',()=>{
  const state=createOpeningEncounter('mixed-hitbox','cat',1,0,undefined,undefined,[],3);
  assert.ok(state.monsters.some(m=>getLevel(2).words.some(word=>word.id===m.wordId)));
  for(const monster of state.monsters){
    const art=openingArt(monster.wordId);
    assert.deepEqual(monster.hitbox,logicalHitbox(art.monsterVisual,art.monsterWidth));
  }
});
