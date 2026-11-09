import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIFFICULTIES } from '../miniprogram/fortress/difficulty';
import type { DifficultyId } from '../miniprogram/fortress/difficulty';
import { createDifficultyStore } from '../miniprogram/services/difficulty-store';
import { createFortressEntryStore } from '../miniprogram/services/fortress-entry';
import { monsterDropCoins, monsterStats } from '../miniprogram/fortress/battle-progression';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { getLevel } from '../miniprogram/fortress/levels';
import { validateOpeningPlan } from '../miniprogram/fortress/opening-plan';

test('难度默认普通、保存后重建可读取、非法值与写入失败不伪报成功',()=>{
 let saved:unknown;
 const storage={getStorageSync:()=>saved,setStorageSync:(_key:string,value:unknown)=>{saved=value;}};
 const store=createDifficultyStore(storage);assert.equal(store.read(),'normal');store.save('hard');
 assert.equal(createDifficultyStore(storage).read(),'hard');
 assert.throws(()=>store.save('bogus' as DifficultyId));assert.equal(store.read(),'hard');
 const broken=createDifficultyStore({...storage,setStorageSync:()=>{throw Error('disk');}});
 assert.throws(()=>broken.save('easy'));assert.equal(store.read(),'hard');
});

test('四档在八关全部19轮缩放生命攻击移速（含铁桶），不改变数量、混编和基地，掉落按难度',()=>{
 for(let level=1;level<=8;level++)for(let wave=0;wave<19;wave++){
  const word=getLevel(level).words[0].id;
  const normal=createOpeningEncounter('difficulty-regression',word,1,wave,undefined,undefined,[],level);
  for(const id of Object.keys(DIFFICULTIES) as DifficultyId[]){
   const mode=DIFFICULTIES[id];
   for(const boss of [false,true]){
    const base=monsterStats(level,wave+1,boss);const actual=monsterStats(level,wave+1,boss,id);
    assert.equal(actual.hp,Math.ceil(base.hp*mode.hp));assert.equal(actual.attackDamage,Math.ceil(base.attackDamage*mode.damage));
   }
   const state=createOpeningEncounter('difficulty-regression',word,1,wave,undefined,undefined,[],level,1,[],id);
   assert.equal(state.monsterSpeed,normal.monsterSpeed!*mode.speed);assert.deepEqual(state.base,normal.base);
   assert.deepEqual(state.monsters.map(m=>[m.id,m.wordId,m.boss]),normal.monsters.map(m=>[m.id,m.wordId,m.boss]));
   assert.equal(state.monsters[0].spawnAtMs,0);
   assert(id==='normal' ? state.monsters.at(-1)!.spawnAtMs===normal.monsters.at(-1)!.spawnAtMs : id==='easy' ? state.monsters.at(-1)!.spawnAtMs!>normal.monsters.at(-1)!.spawnAtMs! : state.monsters.at(-1)!.spawnAtMs!<normal.monsters.at(-1)!.spawnAtMs!);
   state.monsters.forEach((m,i)=>{assert.equal(m.dropCoins,m.bossKind==='grand'?0:monsterDropCoins(m.id,m.boss,id));assert.equal(m.hp,Math.ceil(normal.monsters[i].hp*mode.hp*(m.bossKind==='grand'?mode.bossHp/20:1)));assert.equal(m.attackDamage,Math.ceil(normal.monsters[i].attackDamage!*mode.damage));});
  }
 }
});

test('开局冻结难度，设置变化只作用于新局，旧计划兼容普通',()=>{
 let id:DifficultyId='hard';const store=createFortressEntryStore(()=>true,()=>1,()=>id);
 const first=store.start(1,3);id='nightmare';assert.equal(first.plan.difficulty,'hard');validateOpeningPlan(first.plan);
 assert.equal(store.start(2,3).plan.difficulty,'nightmare');
 const normal=createFortressEntryStore(()=>true).start(3,3).plan;const {difficulty:_,...legacy}=normal;validateOpeningPlan(legacy);
 assert.throws(()=>validateOpeningPlan({...first.plan,difficulty:'bogus' as DifficultyId}));
});
