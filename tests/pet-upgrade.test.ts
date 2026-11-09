import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerStorage, PLAYER_TRANSACTION_KEY} from '../miniprogram/services/player-storage';
import {createPetUpgrade} from '../miniprogram/services/pet-upgrade';
import {createCoinWallet, COIN_WALLET_KEY} from '../miniprogram/services/coin-wallet';
import {createPetStore, PET_STORE_KEY} from '../miniprogram/services/pet-store';
function setup(balance=78000) {
  const values=new Map<string,unknown>([[COIN_WALLET_KEY,{version:1,balance,rewardedSessions:[]}]]);
  let writes=0,fail=0;
  const raw={getStorageSync:(key:string)=>structuredClone(values.get(key)),setStorageSync:(key:string,value:unknown)=>{if(++writes===fail)throw Error('disk');values.set(key,structuredClone(value));}};
  const storage=createPlayerStorage(raw),coins=createCoinWallet(storage),pets=createPetStore(storage),upgrade=createPetUpgrade(storage);
  pets.rewardBoss('pet','pet:wave:1:zombie:1');pets.rewardCheckin('checkin:2026-11-07');pets.feed(pets.view().revision);
  return {values,raw,coins,pets,upgrade,failAt(n:number){writes=0;fail=n;}};
}
test('金币升级保留经验、喂养和装备，每级费用递增，40级清零且不再扣费',()=>{
 const h=setup();
 for(let level=1;level<40;level++) {
  const before=h.pets.view(),balance=h.coins.balance();
  assert(h.upgrade.upgrade(before.revision));assert.equal(h.coins.balance(),balance-level*100);
  assert.equal(h.pets.view().level,level+1);assert.equal(h.pets.view().experience,level===39?0:10);
  assert.equal(h.pets.view().food,before.food);assert.deepEqual(h.pets.view().equipped,before.equipped);
  assert.equal(h.upgrade.upgrade(before.revision),false);assert.equal(h.coins.balance(),balance-level*100);
 }
 assert.equal(h.coins.balance(),0);assert.equal(h.upgrade.upgrade(h.pets.view().revision),false);
});
test('余额不足、未拥有、无效版本均不扣费或修改宠物，金币升级后仍可喂养',()=>{
 const h=setup(99),before=h.pets.view();assert.equal(h.upgrade.upgrade(before.revision),false);assert.equal(h.coins.balance(),99);assert.deepEqual(h.pets.view(),before);
 const funded=setup(500);assert.equal(funded.upgrade.upgrade(NaN),false);assert(funded.upgrade.upgrade(funded.pets.view().revision));assert(funded.pets.feed(funded.pets.view().revision));assert.equal(funded.pets.view().experience,20);
 funded.values.delete(PET_STORE_KEY);assert.equal(funded.upgrade.upgrade(0),false);assert.equal(funded.coins.balance(),400);
});
test('四个保存边界中断后重建恢复，金币只扣一次，期间后续奖励不被覆盖',()=>{
 for(let boundary=1;boundary<=4;boundary++) {
  const h=setup(500),revision=h.pets.view().revision;h.failAt(boundary);
  assert.throws(()=>h.upgrade.upgrade(revision));h.failAt(0);
  const storage=createPlayerStorage(h.raw),coins=createCoinWallet(storage),pets=createPetStore(storage),upgrades=createPetUpgrade(storage);
  // Reading either store recovers committed upgrades before any later write.
  coins.rewardVictory('later',1);upgrades.upgrade(revision);
  assert.equal(coins.balance(),500);assert.equal(pets.view().level,2);assert.equal(pets.view().experience,10);
  assert.equal(h.values.get(PLAYER_TRANSACTION_KEY),null);assert.equal(upgrades.upgrade(revision),false);
 }
});
test('损坏的事务日志拒绝读取和写入，不覆盖原存档',()=>{
 const h=setup();h.values.set(PLAYER_TRANSACTION_KEY,[{key:'unknown',value:{version:1}}]);const before=structuredClone(h.values);
 assert.throws(()=>h.coins.balance());assert.throws(()=>h.pets.feed(1));assert.deepEqual(h.values,before);
});
test('宠物保存校验失败时撤销暂存扣费，不留下半笔交易',()=>{
 const h=setup(500);const pet=h.values.get(PET_STORE_KEY) as Record<string,unknown>;
 h.values.set(PET_STORE_KEY,{...pet,revision:Number.MAX_SAFE_INTEGER});
 assert.throws(()=>h.upgrade.upgrade(Number.MAX_SAFE_INTEGER));assert.equal(h.coins.balance(),500);assert.equal(h.pets.view().level,1);
 assert.equal(h.values.has(PLAYER_TRANSACTION_KEY),false);
});
