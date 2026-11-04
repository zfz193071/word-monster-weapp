import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';
test('八关堡垒按关卡增加耐久，首关承受100次普通命中，伤势跨波保留',()=>{
 for(let level=1;level<=8;level++){
  // This check uses the target word actually belonging to the selected level below.
  const word=require('../miniprogram/fortress/levels').getLevel(level).words[0].id;
  const state=createOpeningEncounter('durability',word,0,0,undefined,undefined,[],level);
  assert.equal(state.base.hp,1000+(level-1)*200);assert.equal(state.base.maxHp,state.base.hp);
  const nextWave=createOpeningEncounter('durability',word,1,1,undefined,state.base.hp-10,[],level);
  assert.equal(nextWave.base.hp,state.base.hp-10);assert.equal(nextWave.base.maxHp,state.base.maxHp);
 }
 let state=createOpeningEncounter('hits','apple',0);
 state={...state,automatic:false,shotRemainingMs:100000,monsters:[{...state.monsters[0],position:{x:180,y:480},status:'attackingBase',attackRemainingMs:0}]};
 for(let hits=1;hits<=100;hits++){
  state=stepCombat({...state,monsters:state.monsters.map(m=>({...m,attackRemainingMs:0}))}).state;
  assert.equal(state.base.hp,1000-hits*10);assert.equal(state.status,hits===100?'baseDestroyed':'fighting');
 }
});
