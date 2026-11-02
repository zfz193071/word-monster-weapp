import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoinWallet, victoryCoinsForLevel } from '../miniprogram/services/coin-wallet';
test('旧调用默认为第一关100金币、同局幂等，重建后余额和去重记录仍保留',()=>{
 let saved:unknown='';let writes=0;const storage={getStorageSync(){return structuredClone(saved);},setStorageSync(_key:string,value:unknown){writes++;saved=structuredClone(value);}};
 const wallet=createCoinWallet(storage);assert.equal(wallet.balance(),0);assert.deepEqual(wallet.rewardVictory('a'),{balance:100,added:100});
 assert.deepEqual(wallet.rewardVictory('a'),{balance:100,added:0});assert.equal(writes,1);
 const restored=createCoinWallet(storage);assert.equal(restored.balance(),100);assert.equal(restored.rewardVictory('a').added,0);assert.equal(restored.rewardVictory('b').balance,200);
});
test('写入失败不假记到账，重试只奖励一次；损坏记录不覆盖',()=>{
 let saved:unknown='';let failing=true;const storage={getStorageSync(){return saved;},setStorageSync(_key:string,value:unknown){if(failing)throw new Error('disk');saved=value;}};
 const wallet=createCoinWallet(storage);assert.throws(()=>wallet.rewardVictory('a'));assert.equal(wallet.balance(),0);failing=false;assert.equal(wallet.rewardVictory('a').balance,100);assert.equal(wallet.rewardVictory('a').added,0);
 saved={version:1,balance:-5,rewardedSessions:[]};assert.throws(()=>wallet.balance());assert.throws(()=>wallet.rewardVictory('b'));assert.deepEqual(saved,{version:1,balance:-5,rewardedSessions:[]});
});


test('8关奖励累计1420，重玩按关卡奖励，旧对局不会补差价',()=>{
 let saved:unknown={version:1,balance:800,rewardedSessions:['old-level8'],completedLevels:[1,2,3,4,5,6,7,8]};let writes=0;
 const wallet=createCoinWallet({getStorageSync:()=>saved,setStorageSync:(_k,v)=>{saved=structuredClone(v);writes++;}});
 assert.deepEqual(wallet.rewardVictory('old-level8',8),{balance:800,added:0});assert.equal(writes,0);
 const amounts=[100,120,150,170,190,210,230,250];let expected=800;
 for(let id=1;id<=8;id++){
  expected+=amounts[id-1];assert.equal(victoryCoinsForLevel(id),amounts[id-1]);
  assert.deepEqual(wallet.rewardVictory(`new-${id}`,id),{balance:expected,added:amounts[id-1]});
  assert.equal(wallet.rewardVictory(`new-${id}`,id).added,0);
 }
 assert.equal(wallet.balance(),2220);assert.equal(writes,8);
 assert.equal(wallet.rewardVictory('level8-replay',8).added,250);
 assert.equal(wallet.rewardVictory('level8-replay',1).added,0,'同局换关卡参数不能重复发奖');
 assert.equal(wallet.completedLevels().length,8);
});
test('非法及未解锁关卡不发奖，第8关写失败重试仍只加250',()=>{
 let saved:unknown='';let failing=false;let writes=0;
 const wallet=createCoinWallet({getStorageSync:()=>saved,setStorageSync:(_k,v)=>{if(failing)throw Error('disk');saved=structuredClone(v);writes++;}});
 for(const id of [0,-1,9,1.5,NaN,Infinity]){assert.throws(()=>victoryCoinsForLevel(id));assert.throws(()=>wallet.rewardVictory('invalid',id));}
 assert.throws(()=>wallet.rewardVictory('locked',8));assert.equal(writes,0);
 saved={version:1,balance:700,rewardedSessions:['legacy'],completedLevels:[1,2,3,4,5,6,7]};const before=structuredClone(saved);
 failing=true;assert.throws(()=>wallet.rewardVictory('eight',8));assert.deepEqual(saved,before);
 failing=false;assert.deepEqual(wallet.rewardVictory('eight',8),{balance:950,added:250});assert.equal(wallet.completedLevels().length,8);
 assert.equal(wallet.rewardVictory('eight',8).added,0);assert.equal(writes,1);
});
