import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIFFICULTIES, coinRulesFor } from '../miniprogram/fortress/difficulty';
import type { DifficultyId } from '../miniprogram/fortress/difficulty';
import { monsterDropCoins, stableBattleRandom } from '../miniprogram/fortress/battle-progression';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
import { createBattleDrops } from '../miniprogram/services/battle-drops';
import { createOpeningPlan, validateOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';

const expected = {easy:[.05,1,3,10,25],normal:[.1,1,5,20,50],hard:[.1,2,10,40,100],nightmare:[.1,3,15,60,150]} as const;
for(const mode of Object.keys(DIFFICULTIES) as DifficultyId[]) {
 test(`${mode} 掉落概率、普通怪枚数、铁桶范围及计划校验`,()=>{
  const [chance,ordinary,min,max,limit]=expected[mode];
  assert.deepEqual(coinRulesFor(mode),{chance,normal:ordinary,bossMin:min,bossMax:max,limit});
  const seen=new Set<number>();let count=0;
  for(let i=0;i<3000;i++){
   const id=`coins-${i}`;const value=monsterDropCoins(id,false,mode);
   assert.equal(value,stableBattleRandom(`${id}:coins`)<chance?ordinary:0);if(value)count++;
   const boss=monsterDropCoins(id,true,mode);assert.ok(boss>=min&&boss<=max);seen.add(boss);
  }
  assert.ok(count>0);assert.equal(seen.size,max-min+1);
  const plan=createOpeningPlan(`plan-${mode}`,createSeededRandom(15),3,1,mode);validateOpeningPlan(plan);
  const wave=plan.waves[0];const bad={...plan,waves:[{...wave,spawnPlan:wave.spawnPlan.map((spawn,i)=>i?spawn:{...spawn,dropCoins:max+1})},...plan.waves.slice(1)]};
  assert.throws(()=>validateOpeningPlan(bad));
 });
 test(`${mode} 每局上限、尾笔补1枚、退出保留、重复领取与中途换档保护`,()=>{
  let saved:unknown;const storage={getStorageSync:()=>saved,setStorageSync:(_key:string,value:unknown)=>{saved=structuredClone(value);}};
  let wallet=createCoinWallet(storage);const rules=coinRulesFor(mode);let index=0;
  const award=(n:number)=>wallet.rewardDrop('run',1,`run:wave:1:zombie:${++index}`,n,mode);
  let total=award(rules.bossMax-1).total;
  while(total+rules.normal<rules.limit)total=award(rules.normal).total;
  assert.equal(total,rules.limit-1);
  const end=award(rules.bossMax);assert.equal(end.added,1);assert.equal(end.total,rules.limit);
  wallet=createCoinWallet(storage);assert.equal(wallet.balance(),rules.limit);
  assert.equal(wallet.rewardDrop('run',1,`run:wave:1:zombie:${index}`,rules.bossMax,mode).added,0);
  assert.equal(award(rules.normal).added,0);
  const other=mode==='normal'?'hard':'normal';
  assert.throws(()=>wallet.rewardDrop('run',1,'run:wave:2:zombie:1',coinRulesFor(other).normal,other));
  assert.equal(wallet.rewardDrop('new',1,'new:wave:1:zombie:1',rules.normal,mode).added,rules.normal);
  assert.equal(wallet.rewardVictory('run',1).added,100,'通关奖励保持原规则');
 });
}

test('困难击杀保存失败后重试仅入账一次，成功前不播金币收集反馈',()=>{
 let saved:unknown;let fail=true;let effects=0;let total=0;
 const wallet=createCoinWallet({getStorageSync:()=>saved,setStorageSync:(_key,value)=>{if(fail)throw Error('disk');saved=structuredClone(value);}});
 const controller=createBattleDrops({sessionId:'run',levelId:1,difficulty:'hard',wallet,onChange:v=>{total=v.total;},onAward:(_p,n)=>{effects+=n;}});
 const event={type:'coinsDropped' as const,context:{sessionId:'run',waveId:'run:wave:1',combatId:'run:wave:1',generation:1},tick:1,monsterId:'run:wave:1:zombie:1',amount:2,position:{x:10,y:10}};
 controller.handle([event]);assert.equal(effects,0);assert.equal(wallet.balance(),0);
 fail=false;controller.retry();controller.handle([event]);controller.retry();assert.equal(effects,2);assert.equal(total,2);assert.equal(wallet.balance(),2);
});
