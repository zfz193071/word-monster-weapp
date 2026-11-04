import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS, getLevel, ANIMAL_IDS } from '../miniprogram/fortress/levels';
import { createOpeningPlan, validateOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { openingMonsterCount } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
import { createFortressEntryStore } from '../miniprogram/services/fortress-entry';

test('八关分类隔离、19波循环学词、复习无相邻重复，混合使用本关已学词和上一关复习词',()=>{
 for(const level of LEVELS) for(let seed=0;seed<20;seed++){
  const plan=createOpeningPlan(`l${level.id}-${seed}`,createSeededRandom(seed),level.id);validateOpeningPlan(plan);
  assert.equal(plan.waves.length,19);assert.equal(plan.levelId,level.id);
  const ids=level.words.map(w=>w.id);
  for(const [index,wave] of plan.waves.entries()){
   assert.ok(ids.includes(wave.targetWordId));assert.ok(wave.optionWordIds.every(id=>ids.includes(id)));
   const history=[...new Set(plan.waves.slice(0,index).map(w=>w.targetWordId))].filter(id=>id!==wave.targetWordId);
   assert.equal(wave.spawnPlan.length,openingMonsterCount(index,level.id));
   const currentCount=wave.spawnPlan.length-(level.id>1?Math.round(wave.spawnPlan.length*.3):0);
   assert.equal(wave.spawnPlan.filter(m=>m.wordId===wave.targetWordId).length,index?Math.ceil(currentCount/2):currentCount);
   const counts=history.map(id=>wave.spawnPlan.filter(m=>m.wordId===id).length);
   if(index) {assert.notEqual(wave.targetWordId,plan.waves[index-1].targetWordId);assert.ok(Math.max(...counts)-Math.min(...counts)<=1);}
  }
  for(let start=0;start<19;start+=ids.length){const cycle=plan.waves.slice(start,start+ids.length);assert.equal(new Set(cycle.map(w=>w.targetWordId)).size,cycle.length);}
 }
 assert.throws(()=>getLevel(9));
 assert.throws(()=>createOpeningEncounter('bad','dog',0));
 assert.throws(()=>createOpeningEncounter('bad','dog',0,1,undefined,undefined,['apple'],3));
});

test('动物速度28、1.5秒攻击一次；水果速度20、2秒攻击一次',()=>{
 for(const [word,level,speed,interval] of [['dog',3,28,1500],['apple',1,20,2000]] as const){
  const initial=createOpeningEncounter('traits',word,0,0,undefined,undefined,[],level);
  assert.equal(initial.monsterSpeed,speed);assert.ok(initial.monsters.every(m=>m.attackIntervalMs===interval));
  let state={...initial,automatic:false,monsters:[{...initial.monsters[0],position:{x:60,y:480},status:'attackingBase' as const}]};
  for(let ms=0;ms<interval-10;ms+=10)state=stepCombat(state).state as typeof state;
  assert.equal(state.base.hp,initial.base.maxHp);state=stepCombat(state).state as typeof state;assert.equal(state.base.hp,initial.base.maxHp-(level===3 ? 12 : 10));
 }
 assert.equal(ANIMAL_IDS.length,16);
});

test('逐关解锁、重玩、全通默认第8关；金币与进度原子持久化且同局只奖一次',()=>{
 let raw:unknown={version:1,balance:200,rewardedSessions:['legacy']};let fail=false;
 const storage={getStorageSync:()=>raw,setStorageSync:(_k:string,v:unknown)=>{if(fail)throw Error('disk');raw=structuredClone(v);}};
 const wallet=createCoinWallet(storage);const entry=createFortressEntryStore(id=>wallet.canEnter(id));
 assert.equal(wallet.defaultLevel(),1);assert.throws(()=>entry.start(1,2));assert.throws(()=>wallet.rewardVictory('skip',2));
 fail=true;assert.throws(()=>wallet.rewardVictory('one',1));assert.equal(wallet.balance(),200);assert.equal(wallet.canEnter(2),false);
 fail=false;
 for(let level=1;level<=8;level++){
  assert.equal(createCoinWallet(storage).defaultLevel(),level);wallet.rewardVictory(`win-${level}`,level);wallet.rewardVictory(`win-${level}`,level);
  assert.equal(wallet.balance(),200+[100,220,370,540,730,940,1170,1420][level-1]);assert.equal(wallet.canEnter(Math.min(8,level+1)),true);
 }
 assert.equal(createCoinWallet(storage).defaultLevel(),8);assert.equal(wallet.canEnter(9),false);
 wallet.rewardVictory('replay',1);assert.equal(wallet.balance(),1720);assert.equal(wallet.completedLevels().length,8);
 raw={version:1,balance:100,rewardedSessions:[],completedLevels:[1,3]};assert.throws(()=>wallet.defaultLevel());assert.throws(()=>wallet.rewardVictory('corrupt',1));
});

test('各关词汇的图片、标准读音、退场读音和封面均为非空文件，子包小于2MB', async()=>{
 const {stat,readdir}=await import('node:fs/promises');const {defeatAudioPath}=await import('../miniprogram/fortress/levels');
 const root=new URL('../miniprogram/',import.meta.url);
 for(const level of LEVELS){
  assert.ok((await stat(new URL(level.cover.slice(1),root))).size>0);
  for(const w of level.words)for(const path of [w.fruitImagePath,w.audioPath,defeatAudioPath(w.id)])assert.ok((await stat(new URL(path.slice(1),root))).size>0,path);
 }
 const files=await readdir(new URL('learning-assets/',root),{recursive:true,withFileTypes:true});let total=0;
 for(const f of files)if(f.isFile())total+=(await stat(`${f.parentPath}/${f.name}`)).size;
 assert.ok(total<2*1024*1024,`subpackage ${total}`);
});

test('全部击杀词音与男声生成清单一致，听词音频独立，来源只登记一次',async()=>{
 const {readFile}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const {defeatAudioPath}=await import('../miniprogram/fortress/levels');
 const {BATTLE_ASSETS}=await import('../miniprogram/fortress/content');
 const manifest=JSON.parse(await readFile(new URL('../docs/defeat-voice-manifest.json',import.meta.url),'utf8'));
 const words=LEVELS.flatMap(level=>level.words);
 assert.equal(manifest.files.length,words.length);assert.equal(manifest.gender,'male');assert.equal(manifest.playbackRate,.8);
 for(const word of words){
  const path=defeatAudioPath(word.id);const records=manifest.files.filter((r:any)=>r.path===path);
  assert.equal(records.length,1,path);assert.equal(records[0].wordId,word.id);assert.notEqual(word.audioPath,path);
  const data=await readFile(new URL('../miniprogram'+path,import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'),records[0].sha256,path);
  const assets=BATTLE_ASSETS.filter(asset=>asset.path===path);assert.equal(assets.length,1,path);
  assert.equal(assets[0].source,manifest.modelSource);assert.match(assets[0].rights,/am_michael/);
 }
});
