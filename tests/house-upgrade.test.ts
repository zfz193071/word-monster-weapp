import assert from 'node:assert/strict';
import test from 'node:test';
import {createCoinWallet, COIN_WALLET_KEY} from '../miniprogram/services/coin-wallet';
import {CombatRunner} from '../miniprogram/fortress/combat-runner';
import {houseForLevel} from '../miniprogram/houses/catalog';
import {fortressMaxHp} from '../miniprogram/fortress/battle-progression';
import {createOpeningPlan} from '../miniprogram/fortress/opening-plan';
import {createStageInvasion} from '../miniprogram/fortress/stage-invasion';
import {nextStageRequest} from '../miniprogram/fortress/continuation';
import {createFortressEntryStore} from '../miniprogram/services/fortress-entry';
import {stepCombat} from '../miniprogram/fortress/combat';

function fixture(balance=4500) {
  let saved: unknown={version:1,balance,rewardedSessions:[],weaponLevel:3};
  let fail=false;
  const storage={getStorageSync:()=>structuredClone(saved),setStorageSync(key:string,value:unknown){assert.equal(key,COIN_WALLET_KEY);if(fail)throw Error('disk');saved=structuredClone(value);}};
  return {wallet:createCoinWallet(storage),storage,fail(value:boolean){fail=value;},saved:()=>saved};
}
test('旧存档默认木屋，逐级扣费与等级一起保存，重复点击和满级不能多扣',()=>{
  const f=fixture();assert.equal(f.wallet.house().level,1);
  let balance=4500;
  for(let level=1;level<5;level++){
    const cost=houseForLevel(level).nextCost!;
    const result=f.wallet.upgradeHouse(level);balance-=cost;
    assert.equal(result.upgraded,true);assert.equal(result.level,level+1);assert.equal(result.balance,balance);
    assert.equal(f.wallet.upgradeHouse(level).upgraded,false);assert.equal(f.wallet.balance(),balance);
    assert.equal(createCoinWallet(f.storage).house().level,level+1);
    assert.equal(f.wallet.equipment().level,3);
  }
  assert.equal(balance,0);assert.equal(f.wallet.upgradeHouse(5).upgraded,false);
  f.wallet.rewardCheckin('checkin:2026-11-08');f.wallet.rewardVictory('house-test',1);
  assert.equal(f.wallet.house().level,5);assert.equal(f.wallet.balance(),200);
});
test('余额不足、写入失败、非法等级不扣款；保存失败后可重试',()=>{
  const poor=fixture(299);assert.equal(poor.wallet.upgradeHouse(1).upgraded,false);assert.equal(poor.wallet.balance(),299);
  const f=fixture();const before=f.saved();f.fail(true);assert.throws(()=>f.wallet.upgradeHouse(1));assert.deepEqual(f.saved(),before);
  f.fail(false);assert.equal(f.wallet.upgradeHouse(1).upgraded,true);
  for(const level of [0,6,1.5,NaN])assert.throws(()=>f.wallet.upgradeHouse(level));
  const corrupt=createCoinWallet({getStorageSync:()=>({version:1,balance:10,rewardedSessions:[],houseLevel:6}),setStorageSync(){throw Error('must not write');}});
  assert.throws(()=>corrupt.house());
});
test('所有关卡与五级房屋生命对应，战斗受伤和修复使用升级上限',()=>{
  for(let stage=1;stage<=8;stage++)for(let house=1;house<=5;house++){
    const expected=(1000+200*(stage-1))*(1+.25*(house-1));
    assert.equal(fortressMaxHp(stage,house),expected);
    const plan=createOpeningPlan(`house-${stage}-${house}`,()=>.5,stage,1,'normal',house);
    const state=createStageInvasion(plan,1);assert.equal(state.base.maxHp,expected);assert.equal(state.base.hp,expected);
    const injured={...state,base:{hp:expected*.25,maxHp:expected}};
    const advanced=stepCombat(injured,{}).state;assert.equal(advanced.base.maxHp,expected);assert.ok(advanced.base.hp<=expected*.25);
    const runner=new CombatRunner(injured);runner.pause();runner.restoreBase();assert.equal(runner.snapshot!.base.hp,expected);
  }
});
test('首页入场快照与连续闯关携带房屋等级，新关恢复升级后满血',()=>{
  const f=fixture();f.wallet.upgradeHouse(1);f.wallet.upgradeHouse(2);
  const entry=createFortressEntryStore(()=>true,()=>1,()=> 'hard',()=>f.wallet.house().level);
  const request=entry.start(1);assert.equal(request.plan.houseLevel,3);
  f.wallet.upgradeHouse(3);assert.equal(request.plan.houseLevel,3);
  const next=nextStageRequest(request);assert.equal(next.plan.houseLevel,3);assert.equal(next.plan.difficulty,'hard');
  assert.deepEqual(createStageInvasion(next.plan,next.generation).base,{hp:1800,maxHp:1800});
  assert.equal(entry.start(2).plan.houseLevel,4);
});
