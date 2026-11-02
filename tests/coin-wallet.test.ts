import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
test('每局奖励100金币、同局幂等，重建后余额和去重记录仍保留',()=>{
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
