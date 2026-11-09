import { createVictoryRewards, clearRewards } from '../miniprogram/services/victory-rewards';
import { createDailyCheckin } from '../miniprogram/services/daily-checkin';
import { skillQuizAnswer } from './helpers/skill-quiz';
import * as invasion from '../miniprogram/fortress/stage-invasion';
import * as continuation from '../miniprogram/fortress/continuation';
import * as combos from '../miniprogram/fortress/skill-combos';
import * as qualitySkills from '../miniprogram/fortress/quality-skills';
import * as quality from '../miniprogram/fortress/skill-quality';
import { coinRulesFor } from '../miniprogram/fortress/difficulty';
import { bossWaveIndex, monsterStats } from '../miniprogram/fortress/battle-progression';
import * as petBattle from '../miniprogram/pets/battle';
import { attachCombatPet } from '../miniprogram/fortress/combat';
import { createPetDrops } from '../miniprogram/services/pet-drops';
import { createPetStore } from '../miniprogram/services/pet-store';
import { createBattleAudio } from '../miniprogram/services/battle-audio';
import { createCoinWallet, victoryCoinsForLevel } from '../miniprogram/services/coin-wallet';
import * as drops from '../miniprogram/services/battle-drops';
import * as levels from '../miniprogram/fortress/levels';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as opening from '../miniprogram/fortress/opening-encounter';
import * as experience from '../miniprogram/fortress/experience';
import * as upgrades from '../miniprogram/fortress/upgrade-choice';
import * as fruits from '../miniprogram/fortress/fruit-catalog';
import * as content from '../miniprogram/fortress/content';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import type { CombatState, CombatEvent, SkillLevels } from '../miniprogram/fortress/types';

for (const {level,repair,realAudio,exit,bossChain} of [...levels.LEVELS.map(level=>({level,repair:false,realAudio:false})),{level:levels.LEVELS[0],repair:true,realAudio:false},{level:levels.LEVELS[0],repair:false,realAudio:true},{level:levels.LEVELS[0],repair:false,realAudio:false,exit:true},{level:levels.LEVELS[0],repair:false,realAudio:false,bossChain:true}]) test(`关卡${level.id}组件19波：退场读词、技能、下一题与结算${repair ? "与随机修复" : ""}${realAudio ? "与实际播报调度" : ""}${exit ? "与准备时退出" : ""}${bossChain ? "与必出铁桶精英及传说连续闯关" : ""}`, async () => {
  let bossSeed=0;while(bossWaveIndex(`acceptance-${bossSeed}`)<0)bossSeed++;
  const plan=createOpeningPlan(bossChain?`acceptance-${bossSeed}`:'component-run',createSeededRandom(12), level.id, 7, level.id === 3 ? 'nightmare' : 'normal');let definition:any;let host:any;
  let saved:unknown={version:1,balance:0,rewardedSessions:[],completedLevels:Array.from({length:level.id-1},(_,i)=>i+1)};
  const wallet=createCoinWallet({getStorageSync:()=>saved,setStorageSync:(_key,value)=>{saved=structuredClone(value);}});
  const expectedCoins=[100,120,150,170,190,210,230,250][level.id-1];
  let petSaved:unknown; const petStore=createPetStore({getStorageSync:()=>petSaved,setStorageSync:(_key,value)=>{petSaved=structuredClone(value);}});
  if(level.id===2)petStore.rewardBoss('prior','prior:wave:1:zombie:1');
  let reveal!: () => void;
  const presentation = new Promise<void>(resolve => { reveal = resolve; });
  let loadCount=0;let loadNext=()=>Promise.resolve();
  let rewards=0;let praises=0;let praiseActive=false;let praiseDisposed=false;let audioOptions:any;let busy=false;let current:FakeScene;
  const rewardValues=new Map<string,unknown>();const rewardStorage={getStorageSync:(k:string)=>rewardValues.get(k),setStorageSync:(k:string,v:unknown)=>{rewardValues.set(k,structuredClone(v));}};
  const supplies=createDailyCheckin({storage:rewardStorage,coins:wallet,pets:petStore});
  const victoryRewards=createVictoryRewards({storage:rewardStorage,coins:{...wallet,rewardVictory(sessionId:string,stage:number){rewards++;return wallet.rewardVictory(sessionId,stage);}},pets:petStore,supplies});
  let audioClock=0;let timerSequence=0;const timers=new Map<number,{run:()=>void;at:number}>();const voiceEnds:(()=>void)[]=[];
  function advanceAudio(ms:number){const end=audioClock+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;audioClock=next[1].at;timers.delete(next[0]);next[1].run();}audioClock=end;}
  class FakeScene {
    snapshot:CombatState; options:any; disposed=false; paused=false; speed=1;
    constructor(_node:unknown,options:any){this.options=options;this.snapshot=options.initial;current=this;}
    async present(){await presentation;return true;}
    async load(){this.options.onLoadProgress?.(0);this.options.onLoadProgress?.(100);this.options.onHud({hp:this.snapshot.base.hp,maxHp:this.snapshot.base.maxHp,status:this.snapshot.status});return true;}
    dispose(){this.disposed=true;}setPaused(value:boolean){this.paused=value;}setSpeed(value:number){this.speed=value;}showCoinDrop(){}captureFrame(){return 'frame';}
    restoreBase(){this.snapshot={...this.snapshot,base:{...this.snapshot.base,hp:this.snapshot.base.maxHp}};}
    applyPet(pet:petBattle.BattlePet){this.snapshot=attachCombatPet(this.snapshot,pet);}
    applySkills(levels:SkillLevels,collection:quality.SkillCollection){this.snapshot={...this.snapshot,skills:levels,skillCollection:collection};}
    arrive(wave:number){
      const matches=(m:CombatState['monsters'][number])=>m.id.startsWith(`${this.snapshot.context.sessionId}:wave:${wave+1}:`);
      const incoming=this.snapshot.incomingMonsters ?? [];
      this.snapshot={...this.snapshot,tick:Math.ceil(this.snapshot.waveStartTimesMs![wave]/10),monsters:[...this.snapshot.monsters,...incoming.filter(matches)],incomingMonsters:incoming.filter(m=>!matches(m))};
      this.options.onEvents([{type:'waveStarted',context:this.snapshot.context,tick:this.snapshot.tick,waveNumber:wave+1}]);
    }
    clear(wave:number){const targets=this.snapshot.monsters.filter(m=>m.id.startsWith(`${this.snapshot.context.sessionId}:wave:${wave+1}:`));const events:CombatEvent[]=targets.flatMap(m=>[
      {type:'monsterDefeated' as const,context:this.snapshot.context,tick:1,monsterId:m.id,wordId:m.wordId},
      ...(m.dropCoins ? [{type:'coinsDropped' as const,context:this.snapshot.context,tick:1,monsterId:m.id,amount:m.dropCoins,position:m.position}] : []),
    ]);if(realAudio){this.options.onEvents(events.slice(0,1));advanceAudio(300);}
    this.snapshot={...this.snapshot,status:wave===18?'cleared':'fighting',monsters:this.snapshot.monsters.map(m=>targets.includes(m)?{...m,hp:0,status:'defeated'}:m)};this.options.onHud({hp:this.snapshot.base.hp,maxHp:this.snapshot.base.maxHp,status:this.snapshot.status});this.options.onEvents(events);this.options.onEvents(events);}
  }
  const source=readFileSync(new URL('../miniprogram/components/fortress-scene/fortress-scene.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports:{},Component(value:any){definition=value;},wx:{getWindowInfo(){return{pixelRatio:1};}},
    require(name:string){
      if(name.endsWith('/stage-invasion'))return invasion;
      if(name.endsWith('/continuation'))return continuation;
      if(name.endsWith('/level-assets'))return {loadLevelAssets(){loadCount++;return loadNext();}};
      if(name.endsWith('/battle-assets'))return {battleAudioPaths:()=>[],loadBattleAssets(_art:unknown,callbacks:any){callbacks.onProgress(100);callbacks.onReady();return()=>{};}};
      if(name.endsWith('/battle-background'))return {battleBackgroundCover:(levelId:number)=>`/assets/images/battle-backgrounds/level-${levelId}.png`,battleBackgroundColor:()=> '#a1b777'};
      if(name.endsWith("/pets/battle"))return petBattle;
      if(name.endsWith('/pet-drops'))return {createPetDrops};
      if(name.endsWith('/pet-store'))return {petStore};
      if(name.endsWith('/victory-rewards'))return {victoryRewards};
      if(name.endsWith('/coin-wallet'))return {victoryCoinsForLevel,coinWallet:{...wallet,rewardVictory(sessionId:string, levelId:number){assert.equal(levelId,level.id);rewards++;return wallet.rewardVictory(sessionId,levelId);}}};
      if(name.endsWith('/battle-drops'))return drops;
      if(name.endsWith('/victory-audio'))return {createVictoryAudio(){let started=false;return{setActive(active:boolean){praiseActive=active;if(active&&!started){started=true;praises++;}},dispose(){praiseDisposed=true;}};}};
      if(name.endsWith('/skill-combos'))return combos;
      if(name.endsWith('/quality-skills'))return qualitySkills;
      if(name.endsWith('/skill-quality'))return quality;
      if(name.endsWith('/plans'))return {createSeededRandom};
      if(name.endsWith('/opening-encounter'))return opening;
      if(name.endsWith('/experience'))return experience;
      if(name.endsWith('/upgrade-choice'))return upgrades;
      if(name.endsWith('/fruit-catalog'))return fruits;
      if(name.endsWith('/levels'))return levels;
      if(name.endsWith('/content'))return content;
      if(name.endsWith('/canvas-scene'))return{CanvasScene:FakeScene};
      if(name.endsWith('/battle-audio'))return{createBattleAudio(options:any){
        if(realAudio)return createBattleAudio({...options,now:()=>audioClock,audio:{
          schedule(run:()=>void,delay:number){const id=++timerSequence;timers.set(id,{run,at:audioClock+delay});return()=>{timers.delete(id);};},
          createContext(){return{src:'',autoplay:false,loop:false,onEnded(fn:()=>void){voiceEnds.push(fn);},offEnded(){},onError(){},offError(){},onPause(){},offPause(){},onStop(){},offStop(){},play(){},stop(){},destroy(){}};},
        }});
        audioOptions=options;return{get busy(){return busy;},playCoin(){},setActive(){},setVolume(){},dispose(){},handle(events:CombatEvent[]){busy=events.some(e=>e.type==='monsterDefeated');},retry(){}};}};
      return{};
    },
  });
  const updates:any[]=[]; let autoEntryFrames = false;
  host={data:structuredClone(definition.data),properties:{opening:true,preview:false,paused:false,managedLoading:true,musicVolume:22,combatSpeed:2,previewRequest:{plan,generation:1}},
    setData(patch:any,done?:()=>void){updates.push(patch);Object.assign(this.data,patch);done?.();if(autoEntryFrames && patch.entryFrame)queueMicrotask(()=>this.entryFrameLoaded({currentTarget:{dataset:{epoch:patch.entryFrameEpoch}}}));},triggerEvent(){},
    createSelectorQuery(){return{select(){return{fields(_fields:any,callback:Function){return{exec(){callback({node:{},width:360,height:560,left:0});}};}};}};},
  };
  for(const [name,method]of Object.entries(definition.methods))host[name]=(method as Function).bind(host);
  definition.lifetimes.attached.call(host);definition.lifetimes.ready.call(host);await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.data.ready,false,'图片已解码但画面未呈现时，必须继续显示加载层');
  assert.ok(host.data.loadingProgress<100);
  reveal();await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.data.ready,false,'Canvas回调结束不等于视图层首帧图片已显示，不能撤掉进度层');
  assert.equal(current!.paused,true,'首帧实际显示前不能在遮罩后开战');
  host.entryFrameLoaded({currentTarget:{dataset:{epoch:host.data.entryFrameEpoch-1}}});
  assert.equal(host.data.ready,false,'旧画面的load事件不能放行');
  await host.entryFrameLoaded({currentTarget:{dataset:{epoch:host.data.entryFrameEpoch}}});
  assert.equal(host.data.ready,true);
  assert.equal(current!.paused,true,'页面进度遮罩仍在时不能开战');
  assert.equal(host.data.entryFrame,'frame','保留完整首帧作为原生画布交接底图');
  host.properties.managedLoading=false;definition.properties.managedLoading.observer.call(host);
  autoEntryFrames = true;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.data.loadingProgress,100);
  assert.ok(updates.filter(patch=>patch.loadingProgress===100).every(patch=>patch.ready===true),'100%仅随战斗首帧就绪发布');
  assert.equal(current!.speed,2);
  host.properties.combatSpeed=2.5;definition.properties.combatSpeed.observer.call(host,2.5);assert.equal(current!.speed,2.5);
  host.properties.volumeOpen=true;definition.properties.volumeOpen.observer.call(host,true);
  assert.equal(host.data.volumeFrame,'frame');assert.equal(host.data.inputUnavailable,true);assert.equal(current!.paused,true,'音量窗口覆盖画布时冻结战斗');
  host.properties.volumeOpen=false;definition.properties.volumeOpen.observer.call(host,false);
  assert.equal(host.data.volumeFrame,'');assert.equal(host.data.inputUnavailable,false);assert.equal(current!.paused,false,'关闭音量窗口后恢复战斗');
  assert.equal(host.data.coinBalance,wallet.balance(),'进入战斗时读取持久金币余额');
  assert.match(readFileSync(new URL('../miniprogram/pages/battle/battle.wxml',import.meta.url),'utf8'),/class="toolbar-wallet"[^>]*aria-label="当前金币 \{\{coinBalance\}\}"/);
  const { openingMonsterCount } = await import('../miniprogram/fortress/opening-encounter');
  let picked=0;let repairs=0;let bossPicked=0;
  function consumeBossOffers(){while(host.data.upgradeOffer?.source){const offer=host.data.upgradeOffer;assert(current!.paused);assert(offer.cards.every((c:any)=>c.quality===offer.source));bossPicked++;host.finishSkillQuiz({detail:skillQuizAnswer(host.data.skillQuiz)});host.chooseUpgrade({detail:{offerId:offer.id,cardId:offer.cards[0].id}});}}

  const stageScene=current!;
  for(let wave=0;wave<19;wave++){
    current!.arrive(wave);
    const waveMonsters=current!.snapshot.monsters.filter(m=>m.id.startsWith(`${plan.sessionId}:wave:${wave+1}:`));
    assert.equal(current!,stageScene,'整关不重建场景');
    assert.equal(!!current!.snapshot.pet,petStore.view().owned,'拥有宠物开局/跨波自动上阵');
    assert.equal(host.data.waveNumber,wave+1);assert.equal(waveMonsters.length,openingMonsterCount(wave,level.id));
    assert.equal(current!.snapshot.monsterSpeed, (level.id === 3 ? 28 * 1.2 : 20));
    for(const monster of waveMonsters){const stats=monsterStats(level.id,wave+1,monster.bossKind==='grand'?'grand':monster.boss,plan.difficulty);assert.equal(monster.maxHp,stats.hp);assert.equal(monster.attackDamage,stats.attackDamage);}
    assert.equal(current!.snapshot.weaponLevel,7);const art=current!.options.art;assert.match(art.hero.path,/hero-back-weapon-7\.png$/);assert.ok(current!.snapshot.monsters.every(m=>art.fruitHats[m.wordId]));
    if(repair)current!.snapshot={...current!.snapshot,base:{...current!.snapshot.base,hp:2}};
    let awardedThisWave=0;
    while(host.data.level<20 && opening.OPENING_EXPERIENCE.levelThresholds[host.data.level-1] <= host.data.experience+(waveMonsters.length-awardedThisWave)*8){
    const killsToUpgrade=(opening.OPENING_EXPERIENCE.levelThresholds[host.data.level-1]-host.data.experience)/8;
    const nextLevel=host.data.level+1;
    assert.ok(killsToUpgrade>0 && killsToUpgrade<=waveMonsters.length-awardedThisWave);
    current!.options.onEvents(waveMonsters.slice(awardedThisWave,awardedThisWave+killsToUpgrade).map(m=>({type:'monsterDefeated',context:current!.snapshot.context,tick:1,monsterId:m.id,wordId:m.wordId})));
    awardedThisWave+=killsToUpgrade;
    assert.equal(host.data.level,nextLevel);assert.equal(current!.snapshot.status,'fighting');
    assert.equal(host.data.xpCurrent,0,'达到门槛升级后当前级经验归零');
    assert.equal(host.data.xpRequired,nextLevel<20?nextLevel*40:0);
    assert.equal(host.data.xpPercent,nextLevel<20?0:100,'新等级从空经验条开始，满级沿用清场状态');
    {
      const offer=host.data.upgradeOffer;assert.ok(offer);assert.equal(offer.cards.length,3);assert.equal(host.data.waveRequest,null);
      assert.equal(current!.paused,true,'技能弹窗出现即暂停战场');assert.equal(host.data.frozenFrame,'frame');
      const selection={detail:{offerId:offer.id,cardId:repair && offer.cards.some((c:any)=>c.id==='repair') ? 'repair' : offer.cards[0].id}};
      definition.pageLifetimes.hide.call(host);host.chooseUpgrade(selection);
      assert.equal(host.data.upgradeOffer,offer,'后台不能消费技能');
      definition.pageLifetimes.show.call(host);assert.equal(current!.paused,true,'返回前台仍由技能面板保持暂停');
      host.chooseUpgrade(selection);assert.equal(host.data.upgradeOffer,offer,'未答题不能领取技能');
      host.finishSkillQuiz({detail:skillQuizAnswer(host.data.skillQuiz)});
      assert.equal(host.data.skillPicksRemaining,1);assert.equal(host.data.skillQuiz,null);
      picked++;host.chooseUpgrade(selection);
      const afterSelection=JSON.stringify({skills:current!.snapshot.skills,hp:current!.snapshot.base.hp,request:host.data.waveRequest});
      host.chooseUpgrade(selection);
      assert.equal(JSON.stringify({skills:current!.snapshot.skills,hp:current!.snapshot.base.hp,request:host.data.waveRequest}),afterSelection,'重复点击不能重复应用或推进');
    }
    consumeBossOffers();
    assert.equal(current!.paused,false,'选完技能立即继续同一轮');
    assert.equal(host.data.waveRequest,null,'整关过程中不弹轮间听词');
    }
    if(level.id===2 && current!.snapshot.pet)current!.snapshot={...current!.snapshot,fallenSoldiers:[{id:'fallen-guard',slot:0,hp:0,maxHp:30,position:{x:150,y:500},attackRemainingMs:0}]};
    current!.clear(wave);consumeBossOffers();assert.equal(!!current!.snapshot.pet,petStore.view().owned,'首次获得宠物立即加入当前场景');assert.equal(host.data.coinBalance,wallet.balance(),'金币掉落保存后同步刷新战斗页余额');assert.equal(host.data.level,1+opening.OPENING_EXPERIENCE.levelThresholds.filter(n=>n<=host.data.experience).length);assert.equal(host.data.upgradeOffer,null);assert.equal(host.data.waveRequest,null);
    assert.equal(host.data.completed,false);host.advanceWave();assert.equal(host.data.completed,false);
    if(realAudio){
      const before=voiceEnds.length;advanceAudio(300);assert.equal(voiceEnds.length,before,'新击杀不能打断当前词');
      voiceEnds.at(-1)!();assert.equal(voiceEnds.length,before+1,'当前词结束才播最新待播词');
      assert.equal(host.data.upgradeOffer,null,'最后待播词未结束，不弹技能');assert.equal(host.data.waveRequest,null);assert.equal(host.data.completed,false);
      voiceEnds.at(-1)!();
    }else{busy=false;audioOptions.onDrained();}
    if(repair && current!.snapshot.base.hp===current!.snapshot.base.maxHp)repairs++;
    if(wave<18){assert.equal(host.data.waveRequest,null);assert.equal(current!.disposed,false);assert.equal(current!.snapshot.status,'fighting');
      if(level.id===2){assert.equal(current!.snapshot.pet?.hp,current!.snapshot.pet?.maxHp);assert.equal(current!.snapshot.fallenSoldiers?.[0].id,'fallen-guard');}
    }else{assert.equal(host.data.completed,true);assert.equal(host.data.frozenFrame,'frame');assert.equal(host.data.victoryFruits.length,level.words.length);assert.equal(host.data.waveRequest,null);}
  }
  assert.equal(petStore.view().receipts.filter(id=>!id.startsWith('clear:')).length,plan.waves.flatMap(w=>w.spawnPlan).filter(m=>m.boss && m.bossKind!=='grand').length+(level.id===2?1:0),'真实Boss事件发宠物奖励且重复事件不重复领取');
  assert.deepEqual(JSON.parse(JSON.stringify(host.data.rewardCards)),clearRewards(plan.sessionId,level.id).cards);
  assert.equal(petStore.view().stones,clearRewards(plan.sessionId,level.id).stones);
  if(repair)assert(repairs>0 && repairs<19);
  const expectedDrops=(level.id===3?60:20)+Math.min(coinRulesFor(plan.difficulty).limit,plan.waves.flatMap(w=>w.spawnPlan).reduce((sum,m)=>sum+(m.dropCoins??0),0));
  assert.ok(expectedDrops>0);assert.equal(host.data.dropCoins,expectedDrops);assert.equal(host.data.dropError,false);
  assert.equal(host.data.rewardCoins,expectedCoins);assert.equal(host.data.coinBalance,expectedCoins+expectedDrops);assert.equal(wallet.balance(),expectedCoins+expectedDrops);
  assert.equal(rewards,1);assert.equal(praises,1);assert.equal(host.data.rewardSaved,true);host.advanceWave();host.claimVictoryReward();assert.equal(rewards,1);assert.equal(praises,1);assert.equal(picked,19);assert.equal(bossPicked,plan.waves.flatMap(w=>w.spawnPlan).filter(m=>m.bossKind==='iron').length+(level.id<8?1:0));if(level.id===8){assert.equal(host.data.goldenLoot,true);assert.equal(Object.keys(current!.snapshot.skillCollection??{}).length,0);}assert.equal(host.data.level,20);const totalXp=plan.waves.reduce((sum,w)=>sum+w.spawnPlan.length*8,0);assert.equal(host.data.experience,totalXp);assert.equal(host.data.xpCurrent,totalXp-7600);
  assert.equal(praiseActive,true);host.properties.paused=true;definition.properties.paused.observer.call(host);assert.equal(praiseActive,false);assert.equal(host.data.inputUnavailable,true);
  host.properties.paused=false;definition.properties.paused.observer.call(host);assert.equal(praiseActive,true);
  definition.pageLifetimes.hide.call(host);assert.equal(praiseActive,false);assert.equal(host.data.inputUnavailable,true);
  definition.pageLifetimes.show.call(host);assert.equal(praiseActive,true);assert.equal(host.data.inputUnavailable,false);
  assert.equal(rewards,1);assert.equal(praises,1);
  if(exit){
    let done=()=>{};loadNext=()=>new Promise<void>(resolve=>{done=resolve;});const pending=host.continueStage();const abandoned=current!;host.returnHome();done();await pending;
    assert(abandoned.disposed);assert.equal(host.data.waveRequest,null);assert.equal(host.data.skillInventory.length,0);assert.equal(host.data.continueBusy,false);
    abandoned.options.onEvents([]);host.presentUpgrade();await host.continueStage();assert.equal(loadCount,1);assert.equal(host.data.waveRequest,null);
    definition.lifetimes.detached.call(host);return;
  }
  if(level.id<8){
    const carried=JSON.parse(JSON.stringify(current!.snapshot.skillCollection));const pet=current!.snapshot.pet;const oldScene=current!;
    current!.snapshot={...current!.snapshot,base:{...current!.snapshot.base,hp:1},supportSoldiers:[{id:'leftover',slot:0,hp:30,maxHp:30,position:{x:160,y:500},attackRemainingMs:100}]};
    host.data.rewardSaved=false;await host.continueStage();assert.equal(loadCount,0,'上关奖励未保存不能继续');host.data.rewardSaved=true;
    host.data.dropError=true;await host.continueStage();assert.equal(loadCount,0,'掉落未保存不能跨关丢弃重试');host.data.dropError=false;
    host.data.petDropError=true;await host.continueStage();assert.equal(loadCount,0);host.data.petDropError=false;
    loadNext=()=>Promise.reject(Error('network'));await host.continueStage();assert(host.data.completed);assert(host.data.continueError);assert.equal(JSON.stringify(current!.snapshot.skillCollection),JSON.stringify(carried));assert.equal(rewards,1);
    let resolveNext=()=>{};loadNext=()=>new Promise<void>(resolve=>{resolveNext=resolve;});const prepare=host.continueStage();await host.continueStage();assert.equal(loadCount,2,'连点只准备一次');
    definition.pageLifetimes.hide.call(host);resolveNext();await prepare;assert(host.data.completed,'后台资源就绪仍停留胜利页');definition.pageLifetimes.show.call(host);
    assert.equal(host.data.completed,false);const next=host.data.waveRequest;assert.equal(next.waveIndex,0);assert.equal(next.plan.levelId,level.id+1);assert.equal(next.plan.weaponLevel,7);assert.equal(next.plan.difficulty,plan.difficulty);assert(oldScene.disposed);assert.equal(rewards,1);
    const context={sessionId:next.plan.sessionId,waveId:next.plan.waves[0].waveId,generation:next.generation};const target=next.plan.waves[0].targetWordId;
    host.nextWave({detail:{context,attempts:[{correct:false}]}});assert.equal(host.data.waveRequest,next);
    host.nextWave({detail:{context:{...context,sessionId:'stale'},attempts:[{correct:true}]}});assert.equal(host.data.waveRequest,next);
    host.nextWave({detail:{context,attempts:[{correct:true,selectedWordId:target,targetWordId:target,sessionId:context.sessionId,waveId:context.waveId}]}});await Promise.resolve();
    assert.equal(host.data.error,'');assert.equal(host.data.level,1);assert.equal(host.data.experience,0);assert.equal(host.data.waveNumber,1);assert.equal(host.data.waveRequest,null);
    assert.equal(current!.speed,2.5,'进入下一关沿用当前倍率');assert.equal(current!.snapshot.base.hp,1000+200*level.id);assert.equal(current!.snapshot.base.maxHp,current!.snapshot.base.hp);assert.equal(current!.snapshot.supportSoldiers!.length,0);assert.equal(current!.snapshot.fallenSoldiers?.length ?? 0,0);
    assert.equal(JSON.stringify(current!.snapshot.skillCollection),JSON.stringify(carried));assert.equal(host.data.skillInventory.length,Object.keys(carried).length);assert.equal(current!.snapshot.weaponLevel,7);
    assert.equal(current!.snapshot.tick,0);assert.equal(current!.snapshot.elementReadyTick,500);if(current!.snapshot.skills.firepower)assert.equal(current!.snapshot.firepowerUntilTick,qualitySkills.qualityEffects(carried).firepowerTicks);
    if(pet){assert.equal(current!.snapshot.pet?.hp,current!.snapshot.pet?.maxHp);assert.equal(current!.snapshot.pet?.defeatedPosition,undefined);}assert.equal(current!.snapshot.pet?.level,pet?.level);assert.equal(JSON.stringify(current!.snapshot.pet?.equipped),JSON.stringify(pet?.equipped));
    assert.equal(current!.snapshot.monsters[0].hp,monsterStats(level.id+1,1,false,plan.difficulty).hp);
    const preserved=current!.snapshot;definition.observers.previewRequest.call(host,host.properties.previewRequest);assert.equal(current!.snapshot,preserved,'父页面重复传入最初入口不能重置连续关卡');definition.pageLifetimes.hide.call(host);definition.pageLifetimes.show.call(host);assert.equal(current!.snapshot,preserved,'后台恢复不创建新局或清技能');
    if (!repair && !realAudio && !bossChain) {
      assert.equal(host.data.rewardSaved,false,'下一关重置领奖状态');
      assert.equal(host.data.rewardCards.length,0);
      const previousStones=petStore.view().stones;
      for(let wave=0;wave<19;wave++) {
        current!.arrive(wave); current!.clear(wave);
        const beforeSettlement=wallet.balance();
        busy=false; audioOptions.onDrained();
        let choices=0;
        while(host.data.upgradeOffer) {
          assert(++choices<50,'升级奖励队列应可完成');
          const offer=host.data.upgradeOffer;
          if(host.data.skillQuiz)host.finishSkillQuiz({detail:skillQuizAnswer(host.data.skillQuiz)});
          host.chooseUpgrade({detail:{offerId:offer.id,cardId:offer.cards[0].id}});
        }
        if(wave===18)assert.equal(wallet.balance()-beforeSettlement,victoryCoinsForLevel(level.id+1),'继续后的关卡胜利立即发金币');
      }
      assert.equal(host.data.completed,true);assert.equal(host.data.rewardSaved,true);assert.equal(rewards,2);
      const expected=clearRewards(next.plan.sessionId,level.id+1);
      assert.deepEqual(JSON.parse(JSON.stringify(host.data.rewardCards)),expected.cards);
      assert.equal(petStore.view().stones,previousStones+expected.stones);
      assert(petStore.view().receipts.includes(`clear:${next.plan.sessionId}`));
      assert.equal(host.data.coinBalance,wallet.balance());
      const paid=wallet.balance();host.claimVictoryReward();host.advanceWave();
      assert.equal(wallet.balance(),paid);assert.equal(rewards,2,'两关各发一次，重复回调不重发');
    }
  }else{assert.equal(host.data.canContinue,false);await host.continueStage();assert.equal(loadCount,0);}
  if(level.id===1 && !repair && !realAudio){
    const oldScene=current!;
    const nextPlan=createOpeningPlan('next-color-session',createSeededRandom(18),2,7);
    host.properties.previewRequest={plan:nextPlan,generation:2};
    definition.observers.previewRequest?.call(host,host.properties.previewRequest);
    await Promise.resolve();
    assert.equal(current!.snapshot.context.sessionId,nextPlan.sessionId,'切换颜色关不能继续保留水果关的场景');
    assert.ok(oldScene.disposed);
    assert.equal([...current!.snapshot.monsters,...(current!.snapshot.incomingMonsters??[])].filter(m=>levels.getLevel(1).words.some(word=>word.id===m.wordId)).length,nextPlan.waves.reduce((sum,w)=>sum+Math.round(w.spawnPlan.length*.3),0));
    assert.ok(Object.keys(current!.options.art.fruitHats).every(id=>[...levels.getLevel(1).words,...levels.getLevel(2).words].some(word=>word.id===id)));
    assert.equal(host.data.completed,false);assert.equal(host.data.waveNumber,1);assert.equal(host.data.waveRequest,null);
    assert.equal(host.data.xpCurrent,0);assert.equal(host.data.xpRequired,40);assert.equal(host.data.xpPercent,0);
  }
  definition.lifetimes.detached.call(host);assert.equal(praiseDisposed,true);
});
