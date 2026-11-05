import assert from 'node:assert/strict';
import test from 'node:test';
import { createCoinWallet, grandBossCoins } from '../miniprogram/services/coin-wallet';
import { createBattleDrops } from '../miniprogram/services/battle-drops';
import { coinRulesFor } from '../miniprogram/fortress/difficulty';
import { bossSkillOffer } from '../miniprogram/fortress/quality-skills';
import { applySkillReward, SKILL_IDS } from '../miniprogram/fortress/skill-quality';
import type { SkillCollection } from '../miniprogram/fortress/skill-quality';
import { createUpgradeChoices } from '../miniprogram/fortress/upgrade-choice';
import type { CombatEvent } from '../miniprogram/fortress/types';

test('四档大Boss独立金币，不受普通上限影响；失败退出/重建/通关/武器升级保留凭据',()=>{
 for(const mode of ['easy','normal','hard','nightmare'] as const){
  let saved:unknown={version:1,balance:200,rewardedSessions:[]};const storage={getStorageSync:()=>structuredClone(saved),setStorageSync:(_k:string,v:unknown)=>{saved=structuredClone(v);}};
  const wallet=createCoinWallet(storage);const rules=coinRulesFor(mode);
  for(let i=0;i<rules.limit;i++)wallet.rewardDrop('run',1,`run:wave:1:zombie:${i}`,rules.normal,mode);
  const amount=grandBossCoins(mode);assert.equal(amount,{easy:10,normal:20,hard:40,nightmare:60}[mode]);
  assert.deepEqual(wallet.rewardGrandBoss('run',1,mode),{added:amount,total:amount,balance:200+rules.limit+amount});
  assert.equal(createCoinWallet(storage).rewardGrandBoss('run',1,mode).added,0);
  wallet.upgradeWeapon(1);wallet.rewardVictory('run',1);assert.equal(wallet.rewardGrandBoss('run',1,mode).added,0);
  assert.equal(wallet.balance(),rules.limit+amount+100);assert.equal(wallet.rewardGrandBoss('run',2,mode).added,amount,'同一连续局下一关单独记账');
 }
});
test('大Boss保存失败不演出、不假报到账，重试一次且兼容旧钱包',()=>{
 let saved:unknown={version:1,balance:17,rewardedSessions:['old']};let fail=true;let effects=0;let view={total:0,error:false};
 const wallet=createCoinWallet({getStorageSync:()=>structuredClone(saved),setStorageSync:(_k,v)=>{if(fail)throw Error('disk');saved=structuredClone(v);}});
 const id='run:wave:19:zombie:98';const event:CombatEvent={type:'monsterDefeated',context:{sessionId:'run',waveId:'run:wave:19',combatId:'run:wave:19',generation:1},tick:1,monsterId:id,wordId:'apple'};
 const controller=createBattleDrops({sessionId:'run',levelId:1,grandBosses:{[id]:{x:180,y:200}},wallet,onChange:v=>{view=v;},onAward:(_p,n)=>{effects+=n;}});
 controller.handle([event,event]);assert.equal(wallet.balance(),17);assert.equal(effects,0);assert.equal(view.error,true);
 fail=false;controller.retry();controller.retry();controller.handle([event]);assert.equal(wallet.balance(),37);assert.equal(effects,20);assert.deepEqual(view,{total:20,error:false});
 controller.handle([{...event,context:{...event.context,sessionId:'other'}}]);assert.equal(wallet.balance(),37);
 controller.dispose();controller.retry();controller.handle([event]);assert.equal(effects,20);
 assert.equal(createCoinWallet({getStorageSync:()=>saved,setStorageSync(){throw Error('duplicate write');}}).rewardGrandBoss('run',1).added,0);
});
test('损坏、重复、错难度与未解锁大Boss凭据不能覆盖旧余额',()=>{
 let saved:unknown={version:1,balance:20,rewardedSessions:[],bossDrops:[{sessionId:'run',levelId:1,difficulty:'normal',amount:19}]};let writes=0;
 const wallet=createCoinWallet({getStorageSync:()=>saved,setStorageSync:(_k,v)=>{saved=v;writes++;}});
 assert.throws(()=>wallet.rewardGrandBoss('new',1));assert.throws(()=>wallet.rewardVictory('new',1));assert.equal(writes,0);
 saved={version:1,balance:20,rewardedSessions:[],bossDrops:[{sessionId:'run',levelId:1,difficulty:'normal',amount:20}]};
 assert.throws(()=>wallet.rewardGrandBoss('run',1,'nightmare'));assert.throws(()=>wallet.rewardGrandBoss('new',2));assert.equal(writes,0);
});
test('Boss技能最多三项、同品质、只抽可成长项；等级与品质各自保留最大成长',()=>{
 for(const quality of ['elite','legendary'] as const){
  const offer=bossSkillOffer('boss',quality,{},()=>.5);assert.equal(offer.cards.length,3);assert.equal(new Set(offer.cards.map(c=>c.id)).size,3);assert(offer.cards.every(c=>c.quality===quality&&c.skillLevel===1));
  const full=Object.fromEntries(SKILL_IDS.map(id=>[id,{level:5,quality}])) as SkillCollection;
  assert.equal(bossSkillOffer('boss',quality,full,()=>.5).cards.length,0);
  const only={...full,homing:{level:4,quality:'legendary' as const}};const single=bossSkillOffer('one',quality,only,()=>.5);assert.equal(single.cards.length,1);assert.equal(single.cards[0].id,'homing');assert.equal(single.cards[0].resultingQuality,'legendary');assert.equal(single.cards[0].skillLevel,5);
 }
 const promoted=applySkillReward({flame:{level:5,quality:'elite'}},{id:'flame',quality:'legendary'});assert.deepEqual(promoted.flame,{level:5,quality:'legendary'});
});
test('人物同等级仍可领精英与传说；每个奖励只能选择一次',()=>{
 const choices=createUpgradeChoices();const elite=bossSkillOffer('iron','elite',{},()=>.5);const legendary=bossSkillOffer('grand','legendary',{},()=>.5);
 const level={...elite,id:'level-2',source:'level' as const};assert(choices.open(level));assert(choices.select(level.id,level.cards[0].id));
 for(const offer of [elite,legendary]){assert(choices.open(offer));assert(choices.select(offer.id,offer.cards[0].id));assert.equal(choices.select(offer.id,offer.cards[0].id),null);assert.equal(choices.open(offer),null);}
 assert.equal(choices.open({...level,id:'other-level-2'}),null);
});
