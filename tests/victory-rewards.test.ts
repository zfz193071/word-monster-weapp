import test from 'node:test';
import assert from 'node:assert/strict';
import {createVictoryRewards, clearRewards, VICTORY_REWARDS_KEY} from '../miniprogram/services/victory-rewards';
import {createCoinWallet} from '../miniprogram/services/coin-wallet';
import {createPetStore} from '../miniprogram/services/pet-store';
import {createDailyCheckin} from '../miniprogram/services/daily-checkin';
function setup() {
  const values = new Map<string, unknown>(); let writes=0, fail=0;
  const storage={getStorageSync:(k:string)=>structuredClone(values.get(k)),setStorageSync:(k:string,v:unknown)=>{if(++writes===fail)throw Error('disk');values.set(k,structuredClone(v));}};
  const coins=createCoinWallet(storage),pets=createPetStore(storage),supplies=createDailyCheckin({storage,coins,pets});
  const make=()=>createVictoryRewards({storage,coins,pets,supplies});
  return {values,coins,pets,supplies,make,failAt:(n:number)=>{fail=n;}};
}
test('八关固定礼包与重复领奖，累计金币沿用1420，宠物未拥有也可收材料',()=>{
  const h=setup(), service=h.make();let food=0,stones=0,eggs=0,soldiers=0,flags=0;
  for(let level=1;level<=8;level++){
    const r=clearRewards(`level-${level}`,level); food+=r.food;stones+=r.stones;eggs+=r.eggs;soldiers+=r.soldiers;flags+=r.flags;
    assert.equal(r.cards[1].amount,3+Math.floor((level-1)/2));assert.equal(r.cards[2].amount,2+Math.floor((level-1)/2));
    assert.deepEqual(service.claim(`level-${level}`,level).cards,r.cards);service.claim(`level-${level}`,level);
  }
  assert.equal(h.coins.balance(),1420);assert.equal(h.pets.view().food,food);assert.equal(h.pets.view().stones,stones);assert.equal(h.pets.view().eggs,eggs);assert.equal(h.pets.view().owned,false);
  assert.equal(h.supplies.soldierInventory().count,soldiers);assert.equal(h.supplies.flagInventory().count,flags);
  service.claim('replay',1);assert.equal(h.coins.balance(),1520);
});
test('每个写入边界失败后重建服务恢复，已到账资产不重复，随机奖品保持',()=>{
  for(let fail=1;fail<=5;fail++){
    const h=setup();h.failAt(fail);assert.throws(()=>h.make().claim('crash',1));
    h.failAt(0);h.make().recover();const result=h.make().claim('crash',1);h.make().recover();
    const expected=clearRewards('crash',1);assert.deepEqual(result.cards,expected.cards);assert.equal(h.coins.balance(),100);assert.equal(h.pets.view().food,expected.food);assert.equal(h.pets.view().stones,expected.stones);assert.equal(h.pets.view().eggs,expected.eggs);
    assert.equal(h.supplies.soldierInventory().count,expected.soldiers);assert.equal(h.supplies.flagInventory().count,expected.flags);
  }
});
test('拒绝非法/未解锁关卡且不写入待发记录，损坏日志不覆盖',()=>{
  const h=setup();assert.throws(()=>h.make().claim('bad',8));assert.equal(h.values.size,0);
  assert.throws(()=>h.make().claim(' ',1));assert.throws(()=>h.make().claim('bad',0));
  h.make().claim('one',1);assert.throws(()=>h.make().claim('one',2));
  h.values.set(VICTORY_REWARDS_KEY,{});assert.throws(()=>h.make().recover());assert.deepEqual(h.values.get(VICTORY_REWARDS_KEY),{});
});
test('惊喜奖池五类覆盖及近似分布；发放士兵旗帜更新库存版本且不创建签到',()=>{
  const counts:Record<string,number>={};
  for(let i=0;i<10000;i++){const r=clearRewards(`distribution-${i}`,1);const name=r.cards[3].name;counts[name]=(counts[name]??0)+1;}
  for(const [name,p] of Object.entries({'宠物粮':.4,'技能星石':.3,'援军士兵':.15,'复活旗帜':.1,'宠物蛋':.05}))assert(Math.abs(counts[name]/10000-p)<.025,`${name}: ${counts[name]}`);
  const h=setup();h.supplies.rewardClear('clear:stock',1,1);assert.deepEqual(h.supplies.soldierInventory(),{count:1,revision:1});assert.deepEqual(h.supplies.flagInventory(),{count:1,revision:1});
  h.supplies.rewardClear('clear:stock',1,1);assert(h.supplies.consumeFlag(1));assert(h.supplies.consumeSoldier(1));assert.equal(h.supplies.flagInventory().count,0);
});
