import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
import { WEAPONS } from '../miniprogram/weapons/catalog';
import { createUpgradeHold, type UpgradeView } from '../miniprogram/weapons/upgrade-hold';

test('旧存档升级一次原子扣费，重复请求不扣费，奖励保留装备，重启仍一致', () => {
 let saved:any={version:1,balance:7000,rewardedSessions:['legacy'],completedLevels:[1,2]};let writes=0;let fail=false;
 const storage={getStorageSync:()=>structuredClone(saved),setStorageSync:(_key:string,value:unknown)=>{if(fail)throw Error('disk');writes++;saved=structuredClone(value);}};
 const wallet=createCoinWallet(storage);
 assert.deepEqual(wallet.equipment(),{balance:7000,level:1});assert.equal(writes,0);
 fail=true;assert.throws(()=>wallet.upgradeWeapon(1));assert.equal(wallet.balance(),7000);assert.equal(saved.weaponLevel,undefined);
 fail=false;assert.deepEqual(wallet.upgradeWeapon(1),{balance:6800,level:2,upgraded:true});
 assert.deepEqual(wallet.upgradeWeapon(1),{balance:6800,level:2,upgraded:false});assert.equal(writes,1);
 assert.equal(wallet.rewardVictory('legacy').added,0);assert.equal(wallet.rewardVictory('new',2).added,120);assert.equal(wallet.equipment().level,2);
 for(let level=2;level<7;level++)assert.equal(wallet.upgradeWeapon(level).upgraded,true);
 assert.deepEqual(createCoinWallet(storage).equipment(),{balance:120,level:7});
 assert.deepEqual(saved.completedLevels,[1,2]);assert.deepEqual(saved.rewardedSessions,['legacy','new']);
 const before=writes;assert.equal(wallet.upgradeWeapon(7).upgraded,false);assert.equal(writes,before);
 assert.equal(WEAPONS.reduce((sum,w)=>sum+(w.nextCost??0),0),7000);
 saved.weaponLevel=8;assert.throws(()=>wallet.equipment());assert.throws(()=>wallet.rewardVictory('bad'));assert.equal(writes,before);
});
test('余额不足不扣费，非法等级不覆盖',()=>{
 let saved:any={version:1,balance:199,rewardedSessions:[]};let writes=0;
 const wallet=createCoinWallet({getStorageSync:()=>saved,setStorageSync:(_k,v)=>{saved=v;writes++;}});
 assert.equal(wallet.upgradeWeapon(1).upgraded,false);assert.equal(writes,0);
 for(const level of [0,8,NaN,1.5])assert.throws(()=>wallet.upgradeWeapon(level));
 for(const level of [0,8,NaN,'2',null]){saved.weaponLevel=level;assert.throws(()=>wallet.equipment());}assert.equal(writes,0);
});
function holdFixture(balance=7000) {
 let saved:unknown={version:1,balance,rewardedSessions:[]};let fail=false;let time=0;let id=0;const tasks=new Map<number,()=>void>();let view:UpgradeView;
 const wallet=createCoinWallet({getStorageSync:()=>structuredClone(saved),setStorageSync:(_k,v)=>{if(fail)throw Error('disk');saved=structuredClone(v);}});
 const hold=createUpgradeHold({wallet,onChange:v=>{view=v;},now:()=>time,schedule:fn=>{tasks.set(++id,fn);return id;},cancel:t=>tasks.delete(t as number)});
 hold.refresh();
 return {wallet,hold,tasks,get view(){return view!;},setFail(){fail=true;},advance(ms:number){time+=ms;const next=[...tasks.values()];tasks.clear();next.forEach(fn=>fn());}};
}
test('持续按住每秒一级，松手/取消后旧回调无效，满级立即停止',()=>{
 const f=holdFixture();f.hold.start();f.hold.start();assert.equal(f.tasks.size,1);
 f.advance(999);assert.equal(f.wallet.equipment().level,1);assert(f.view.progress>99);
 f.advance(1);assert.equal(f.wallet.equipment().level,2);
 const stale=[...f.tasks.values()][0];f.hold.stop();stale();f.advance(5000);assert.equal(f.wallet.equipment().level,2);
 f.hold.start();f.advance(5000);assert.equal(f.wallet.equipment().level,3,'迟到回调不补扣多级');
 for(let i=0;i<4;i++)f.advance(1000);
 assert.deepEqual(f.wallet.equipment(),{balance:0,level:7});assert.equal(f.tasks.size,0);assert.equal(f.view.holding,false);
});
test('不足、存储失败、销毁均停止长按，不假报成功',()=>{
 const poor=holdFixture(200);poor.hold.start();poor.advance(1000);assert.equal(poor.wallet.equipment().level,2);assert.equal(poor.tasks.size,0);
 const bad=holdFixture();bad.hold.start();bad.setFail();bad.advance(1000);assert.equal(bad.wallet.equipment().level,1);assert(bad.view.error);assert.equal(bad.tasks.size,0);
 const gone=holdFixture();gone.hold.start();const stale=[...gone.tasks.values()][0];gone.hold.dispose();stale();gone.advance(2000);assert.equal(gone.wallet.equipment().level,1);
});
