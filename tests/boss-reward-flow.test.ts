import { skillQuizAnswer } from './helpers/skill-quiz';
import * as invasion from '../miniprogram/fortress/stage-invasion';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as qualitySkills from '../miniprogram/fortress/quality-skills';
import * as quality from '../miniprogram/fortress/skill-quality';
import * as opening from '../miniprogram/fortress/opening-encounter';
import * as experience from '../miniprogram/fortress/experience';
import * as choices from '../miniprogram/fortress/upgrade-choice';
import * as levels from '../miniprogram/fortress/levels';
import * as fruits from '../miniprogram/fortress/fruit-catalog';
import * as content from '../miniprogram/fortress/content';
import * as drops from '../miniprogram/services/battle-drops';
import { bossWaveIndex } from '../miniprogram/fortress/battle-progression';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { createCoinWallet, victoryCoinsForLevel } from '../miniprogram/services/coin-wallet';
import type { CombatState, CombatEvent, MonsterSpawn, SkillLevels } from '../miniprogram/fortress/types';

async function setup(stage=1, full=false){
 let session=0;while(bossWaveIndex(`reward-flow-${session}`)<0)session++;
 const plan=createOpeningPlan(`reward-flow-${session}`,createSeededRandom(12),stage);let definition:any;let scene:any;let active=true;let busy=false;
 let saved:unknown={version:1,balance:0,rewardedSessions:[],completedLevels:Array.from({length:stage-1},(_,i)=>i+1)};
 const wallet=createCoinWallet({getStorageSync:()=>saved,setStorageSync:(_k,v)=>{saved=structuredClone(v);}});
 const audio={get busy(){return busy;},setActive(v:boolean){active=v;},setVolume(){},playCoin(){},dispose(){},handle(){busy=true;}};
 class FakeScene {snapshot:CombatState;paused=false;options:any;constructor(_n:any,o:any){this.snapshot=o.initial;this.options=o;scene=this;}async load(){return true;}dispose(){}captureFrame(){return'frame';}showCoinDrop(){}setPaused(v:boolean){this.paused=v;}applySkills(skills:SkillLevels,skillCollection:quality.SkillCollection){this.snapshot={...this.snapshot,skills,skillCollection};}}
 const modules:Record<string,any>={'stage-invasion':invasion,'quality-skills':full?{...qualitySkills,bossSkillOffer:(...args:Parameters<typeof qualitySkills.bossSkillOffer>)=>({...qualitySkills.bossSkillOffer(...args),cards:[]})}:qualitySkills,'skill-quality':quality,'opening-encounter':opening,experience,'upgrade-choice':choices,levels,'fruit-catalog':fruits,content,plans:{createSeededRandom},'battle-drops':drops,'coin-wallet':{coinWallet:wallet,victoryCoinsForLevel},'pet-store':{petStore:{view:()=>({owned:false})}},'pet-drops':{createPetDrops:()=>({handle(){},dispose(){}})},'battle-audio':{createBattleAudio:()=>audio},'defeat-audio':{createDefeatAudio:()=>({setActive(){},dispose(){}})},'canvas-scene':{CanvasScene:FakeScene}};
 const source=readFileSync(new URL('../miniprogram/components/fortress-scene/fortress-scene.ts',import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:{},Component(v:any){definition=v;},wx:{getWindowInfo:()=>({pixelRatio:1})},require:(name:string)=>modules[name.split('/').at(-1)!]??{}});
 const host:any={data:structuredClone(definition.data),properties:{opening:true,preview:false,paused:false,musicVolume:22,previewRequest:{plan,generation:1}},setData(v:any,done?:()=>void){Object.assign(this.data,v);done?.();},triggerEvent(){},createSelectorQuery(){return{select(){return{fields(_f:any,callback:Function){return{exec(){callback({node:{},width:360,height:560});}};}};}};}};
 for(const [key,method]of Object.entries(definition.methods))host[key]=(method as Function).bind(host);
 definition.lifetimes.attached.call(host);definition.lifetimes.ready.call(host);await Promise.resolve();assert.equal(host.data.error,'');
 function kill(m:MonsterSpawn):CombatEvent{return{type:'monsterDefeated',context:scene.snapshot.context,tick:1,monsterId:m.monsterId,wordId:m.wordId};}
 function select(){host.finishSkillQuiz({detail:skillQuizAnswer(host.data.skillQuiz)});const offer=host.data.upgradeOffer;assert(offer);const detail={offerId:offer.id,cardId:offer.cards[0].id};host.chooseUpgrade({detail});return detail;}
 return {host,definition,plan,wallet,scene,kill,select,audioActive:()=>active};
}
test('同帧升级→精英→传说逐个暂停；重复事件/点击无重复技能或经验，最后恢复读词',async()=>{
 const h=await setup();const monsters=h.plan.waves.flatMap(w=>w.spawnPlan);const iron=monsters.find(m=>m.bossKind==='iron')!;const grand=monsters.find(m=>m.bossKind==='grand')!;
 const events=[h.kill(grand),h.kill(iron),...h.plan.waves[0].spawnPlan.slice(0,3).map(h.kill)];
 h.scene.options.onEvents(events);assert.equal(h.host.data.level,2);assert.equal(h.host.data.experience,40);assert.equal(h.host.data.upgradeOffer.source,undefined);assert(h.scene.paused);assert(!h.audioActive());
 h.scene.options.onEvents(events);assert.equal(h.host.data.experience,40);assert.equal(h.wallet.balance(),20);
 const stale=h.select();assert.equal(h.host.data.upgradeOffer.source,'elite');assert(!h.audioActive());h.host.chooseUpgrade({detail:stale});assert.equal(h.host.data.upgradeOffer.source,'elite');
 h.select();assert.equal(h.host.data.upgradeOffer.source,'legendary');assert(!h.audioActive());h.select();assert.equal(h.host.data.upgradeOffer,null);assert(!h.scene.paused);assert(h.audioActive());
 assert.equal(Object.values(h.scene.snapshot.skillCollection).reduce((sum:number,s:any)=>sum+s.level,0),3);
 h.scene.options.onEvents(events);assert.equal(h.host.data.upgradeOffer,null);assert.equal(h.wallet.balance(),20);h.definition.lifetimes.detached.call(h.host);
});
test('同帧死亡优先清空已持有和待选技能，已入账大Boss金币保留，迟到选择无效',async()=>{
 const h=await setup();h.scene.options.onEvents(h.plan.waves[0].spawnPlan.slice(0,5).map(h.kill));h.select();assert(Object.keys(h.scene.snapshot.skillCollection).length);
 const grand=h.plan.waves[18].spawnPlan.at(-1)!;const iron=h.plan.waves.flatMap(w=>w.spawnPlan).find(m=>m.bossKind==='iron')!;
 h.scene.snapshot={...h.scene.snapshot,status:'baseDestroyed',base:{...h.scene.snapshot.base,hp:0}};
 const events=[h.kill(iron),h.kill(grand),...h.plan.waves[1].spawnPlan.map(h.kill)];h.scene.options.onEvents(events);
 assert(h.host.data.failed);assert.equal(h.host.data.upgradeOffer,null);assert.equal(h.host.data.skillInventory.length,0);assert.equal(Object.keys(h.scene.snapshot.skillCollection).length,0);assert.equal(h.wallet.balance(),20);
 h.scene.options.onEvents(events);h.host.presentUpgrade();assert.equal(h.host.data.upgradeOffer,null);assert.equal(h.wallet.balance(),20);h.definition.lifetimes.detached.call(h.host);
});
test('第8关大Boss只给金色庆祝与金币，活怪仍在不能结算或清空现有技能',async()=>{
 const h=await setup(8);h.scene.options.onEvents(h.plan.waves[0].spawnPlan.slice(0,5).map(h.kill));h.select();
 const grand=h.plan.waves[18].spawnPlan.at(-1)!;h.scene.options.onEvents([h.kill(grand)]);
 assert(h.host.data.goldenLoot);assert.equal(h.host.data.upgradeOffer,null);assert.equal(h.host.data.completed,false);assert(Object.keys(h.scene.snapshot.skillCollection).length);assert.equal(h.wallet.balance(),20);h.definition.lifetimes.detached.call(h.host);
});
test('Boss技能池已满显示说明，不生成替代奖励也不阻塞剩余战斗',async()=>{
 const h=await setup(1,true);const iron=h.plan.waves.flatMap(w=>w.spawnPlan).find(m=>m.bossKind==='iron')!;h.scene.options.onEvents([h.kill(iron)]);
 assert.equal(h.host.data.bossNotice,'技能已满');assert.equal(h.host.data.upgradeOffer,null);assert.equal(h.scene.paused,false);assert.equal(h.wallet.balance(),0);h.definition.lifetimes.detached.call(h.host);
});
test('死亡丢弃已打开精英与排队传说，迟到的选择和恢复回调不能重新授予技能',async()=>{
 const h=await setup();const all=h.plan.waves.flatMap(w=>w.spawnPlan);const iron=all.find(m=>m.bossKind==='iron')!;const grand=all.find(m=>m.bossKind==='grand')!;
 h.scene.options.onEvents([h.kill(grand),h.kill(iron)]);assert.equal(h.host.data.upgradeOffer.source,'elite');const offer=h.host.data.upgradeOffer;
 h.scene.snapshot={...h.scene.snapshot,status:'baseDestroyed',base:{...h.scene.snapshot.base,hp:0}};h.scene.options.onEvents([{type:'baseDestroyed',context:h.scene.snapshot.context,tick:2}]);
 h.host.chooseUpgrade({detail:{offerId:offer.id,cardId:offer.cards[0].id}});h.definition.pageLifetimes.hide.call(h.host);h.definition.pageLifetimes.show.call(h.host);h.host.presentUpgrade();
 assert(h.host.data.failed);assert.equal(h.host.data.upgradeOffer,null);assert.equal(Object.keys(h.scene.snapshot.skillCollection).length,0);assert.equal(h.wallet.balance(),20);h.definition.lifetimes.detached.call(h.host);
});
test('升级和Boss均先答题，答对连续选两个不同技能后才推进下一奖励；后台/旧答题拒绝',async()=>{
 const h=await setup();const all=h.plan.waves.flatMap(w=>w.spawnPlan);const iron=all.find(m=>m.bossKind==='iron')!;const grand=all.find(m=>m.bossKind==='grand')!;
 h.scene.options.onEvents([h.kill(grand),h.kill(iron),...h.plan.waves[0].spawnPlan.slice(0,3).map(h.kill)]);
 for(const source of [undefined,'elite','legendary']){
  const offer=h.host.data.upgradeOffer;const quiz=h.host.data.skillQuiz;assert(quiz);assert.equal(offer.source,source);assert(h.scene.paused);
  h.host.chooseUpgrade({detail:{offerId:offer.id,cardId:offer.cards[0].id}});assert.equal(h.host.data.upgradeOffer,offer);
  const result=skillQuizAnswer(quiz,true);
  h.host.finishSkillQuiz({detail:{...result,context:{...result.context,generation:quiz.generation+1}}});assert.equal(h.host.data.skillQuiz,quiz);
  h.definition.pageLifetimes.hide.call(h.host);h.host.finishSkillQuiz({detail:result});assert.equal(h.host.data.skillQuiz,quiz);
  h.definition.pageLifetimes.show.call(h.host);h.host.finishSkillQuiz({detail:result});assert.equal(h.host.data.skillQuiz,null);assert.equal(h.host.data.skillPicksRemaining,2);assert.equal(h.host.data.skillShowGuide,false);
  h.host.chooseUpgrade({detail:{offerId:offer.id,cardId:offer.cards[0].id}});
  const second=h.host.data.upgradeOffer;assert.equal(second.source,source);assert.equal(h.host.data.skillQuiz,null);assert.equal(h.host.data.skillPicksRemaining,1);assert.equal(h.host.data.skillShowGuide,true);assert(h.scene.paused);assert.equal(h.host.data.frozenFrame,'frame');
  assert(!second.cards.some((card:any)=>card.id===offer.cards[0].id));
  h.host.finishSkillQuiz({detail:result});h.host.chooseUpgrade({detail:{offerId:offer.id,cardId:offer.cards[0].id}});assert.equal(h.host.data.upgradeOffer,second);
  h.host.chooseUpgrade({detail:{offerId:second.id,cardId:second.cards[0].id}});
 }
 assert.equal(h.host.data.upgradeOffer,null);assert(!h.scene.paused);assert.equal(Object.values(h.scene.snapshot.skillCollection).reduce((n:number,s:any)=>n+s.level,0),6);
 h.definition.lifetimes.detached.call(h.host);
});
test('答题和二选阶段退出均清空，不接受迟到答案或第二次选择',async()=>{
 for(const afterFirst of [false,true]){
  const h=await setup();h.scene.options.onEvents(h.plan.waves[0].spawnPlan.slice(0,5).map(h.kill));
  const result=skillQuizAnswer(h.host.data.skillQuiz,true);
  if(afterFirst){h.host.finishSkillQuiz({detail:result});const offer=h.host.data.upgradeOffer;h.host.chooseUpgrade({detail:{offerId:offer.id,cardId:offer.cards[0].id}});}
  const pending=h.host.data.upgradeOffer;h.host.endRun();h.host.finishSkillQuiz({detail:result});h.host.chooseUpgrade({detail:{offerId:pending.id,cardId:pending.cards[0].id}});
  assert.equal(h.host.data.skillQuiz,null);assert.equal(h.host.data.skillPicksRemaining,0);assert.equal(h.host.data.skillShowGuide,false);assert.equal(h.host.data.upgradeOffer,null);assert.equal(h.host.data.skillInventory.length,0);
 }
});
