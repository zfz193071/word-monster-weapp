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

for (const {level,repair,realAudio} of [...levels.LEVELS.map(level=>({level,repair:false,realAudio:false})),{level:levels.LEVELS[0],repair:true,realAudio:false},{level:levels.LEVELS[0],repair:false,realAudio:true}]) test(`关卡${level.id}组件19波：退场读词、技能、下一题与结算${repair ? "与随机修复" : ""}${realAudio ? "与实际播报调度" : ""}`, async () => {
  const plan=createOpeningPlan('component-run',createSeededRandom(12), level.id, 7);let definition:any;let host:any;
  let saved:unknown={version:1,balance:0,rewardedSessions:[],completedLevels:Array.from({length:level.id-1},(_,i)=>i+1)};
  const wallet=createCoinWallet({getStorageSync:()=>saved,setStorageSync:(_key,value)=>{saved=structuredClone(value);}});
  const expectedCoins=[100,120,150,170,190,210,230,250][level.id-1];
  let rewards=0;let praises=0;let praiseActive=false;let praiseDisposed=false;let audioOptions:any;let busy=false;let current:FakeScene;
  let audioClock=0;let timerSequence=0;const timers=new Map<number,{run:()=>void;at:number}>();const voiceEnds:(()=>void)[]=[];
  function advanceAudio(ms:number){const end=audioClock+ms;while(true){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;audioClock=next[1].at;timers.delete(next[0]);next[1].run();}audioClock=end;}
  class FakeScene {
    snapshot:CombatState; options:any; disposed=false; paused=false;
    constructor(_node:unknown,options:any){this.options=options;this.snapshot=options.initial;current=this;}
    async load(){this.options.onHud({hp:this.snapshot.base.hp,maxHp:5,status:this.snapshot.status});return true;}
    dispose(){this.disposed=true;}setPaused(value:boolean){this.paused=value;}showCoinDrop(){}captureFrame(){return 'frame';}
    restoreBase(){this.snapshot={...this.snapshot,base:{...this.snapshot.base,hp:5}};}
    applySkills(levels:SkillLevels){this.snapshot={...this.snapshot,skills:levels};}
    clear(){const events:CombatEvent[]=this.snapshot.monsters.flatMap(m=>[
      {type:'monsterDefeated' as const,context:this.snapshot.context,tick:1,monsterId:m.id,wordId:m.wordId},
      ...(m.dropCoins ? [{type:'coinsDropped' as const,context:this.snapshot.context,tick:1,monsterId:m.id,amount:m.dropCoins,position:m.position}] : []),
    ]);if(realAudio){this.options.onEvents(events.slice(0,1));advanceAudio(300);}
    this.snapshot={...this.snapshot,status:'cleared'};this.options.onHud({hp:this.snapshot.base.hp,maxHp:5,status:'cleared'});this.options.onEvents(events);this.options.onEvents(events);}
  }
  const source=readFileSync(new URL('../miniprogram/components/fortress-scene/fortress-scene.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports:{},Component(value:any){definition=value;},wx:{getWindowInfo(){return{pixelRatio:1};}},
    require(name:string){
      if(name.endsWith('/coin-wallet'))return {victoryCoinsForLevel,coinWallet:{...wallet,rewardVictory(sessionId:string, levelId:number){assert.equal(levelId,level.id);rewards++;return wallet.rewardVictory(sessionId,levelId);}}};
      if(name.endsWith('/battle-drops'))return drops;
      if(name.endsWith('/victory-audio'))return {createVictoryAudio(){let started=false;return{setActive(active:boolean){praiseActive=active;if(active&&!started){started=true;praises++;}},dispose(){praiseDisposed=true;}};}};
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
  host={data:structuredClone(definition.data),properties:{opening:true,preview:false,paused:false,musicVolume:22,previewRequest:{plan,generation:1}},
    setData(patch:any,done?:()=>void){Object.assign(this.data,patch);done?.();},triggerEvent(){},
    createSelectorQuery(){return{select(){return{fields(_fields:any,callback:Function){return{exec(){callback({node:{},width:360,height:560,left:0});}};}};}};},
  };
  for(const [name,method]of Object.entries(definition.methods))host[name]=(method as Function).bind(host);
  definition.lifetimes.attached.call(host);definition.lifetimes.ready.call(host);await Promise.resolve();
  assert.equal(host.data.coinBalance,wallet.balance(),'进入战斗时读取持久金币余额');
  assert.match(readFileSync(new URL('../miniprogram/components/fortress-scene/fortress-scene.wxml',import.meta.url),'utf8'),/class="battle-wallet"[^>]*aria-label="当前金币 \{\{coinBalance\}\}"/);
  let picked=0;let repairs=0;
  for(let wave=0;wave<19;wave++){
    assert.equal(host.data.waveNumber,wave+1);assert.equal(current!.snapshot.monsters.length,3+wave*2);
    assert.equal(current!.snapshot.weaponLevel,7);const art=current!.options.art;assert.match(art.hero.path,/hero-back-weapon-7\.png$/);assert.ok(current!.snapshot.monsters.every(m=>art.fruitHats[m.wordId]));
    if(wave===18){const before=current!.snapshot;host.data.level=20;current!.snapshot={...before,status:'fighting'};host.advanceWave();assert.equal(host.data.completed,false,'20级但最后一波仍有活怪时不能显示胜利');current!.snapshot=before;host.data.level=19;}
    if(repair)current!.snapshot={...current!.snapshot,base:{...current!.snapshot.base,hp:2}};
    current!.clear();assert.equal(host.data.coinBalance,wallet.balance(),'金币掉落保存后同步刷新战斗页余额');assert.equal(host.data.level,wave+2);assert.equal(host.data.upgradeOffer,null);assert.equal(host.data.waveRequest,null);
    assert.equal(host.data.completed,false);host.advanceWave();assert.equal(host.data.completed,false);
    if(realAudio){
      const before=voiceEnds.length;advanceAudio(300);assert.equal(voiceEnds.length,before,'新击杀不能打断当前词');
      voiceEnds.at(-1)!();assert.equal(voiceEnds.length,before+1,'当前词结束才播最新待播词');
      assert.equal(host.data.upgradeOffer,null,'最后待播词未结束，不弹技能');assert.equal(host.data.waveRequest,null);assert.equal(host.data.completed,false);
      voiceEnds.at(-1)!();
    }else{busy=false;audioOptions.onDrained();}
    {
      const offer=host.data.upgradeOffer;assert.ok(offer);assert.equal(offer.cards.length,3);assert.equal(host.data.waveRequest,null);
      assert.equal(current!.paused,true,'技能弹窗出现即暂停战场');assert.equal(host.data.frozenFrame,'frame');
      const selection={detail:{offerId:offer.id,cardId:repair && offer.cards.some((c:any)=>c.id==='repair') ? 'repair' : offer.cards[0].id}};
      definition.pageLifetimes.hide.call(host);host.chooseUpgrade(selection);
      assert.equal(host.data.upgradeOffer,offer,'后台不能消费技能');
      definition.pageLifetimes.show.call(host);assert.equal(current!.paused,true,'返回前台仍由技能面板保持暂停');
      picked++;host.chooseUpgrade(selection);
      const afterSelection=JSON.stringify({skills:current!.snapshot.skills,hp:current!.snapshot.base.hp,request:host.data.waveRequest});
      host.chooseUpgrade(selection);
      assert.equal(JSON.stringify({skills:current!.snapshot.skills,hp:current!.snapshot.base.hp,request:host.data.waveRequest}),afterSelection,'重复点击不能重复应用或推进');
    }
    if(repair && current!.snapshot.base.hp===5)repairs++;
    const expectedHp=current!.snapshot.base.hp;
    if(wave<18){const request=host.data.waveRequest;assert.equal(request.waveIndex,wave+1);assert.ok(current!.disposed);
      const target=plan.waves[wave+1];host.nextWave({detail:{context:{sessionId:plan.sessionId,waveId:target.waveId,generation:request.generation},attempts:[{correct:true}]}});await Promise.resolve();assert.equal(current!.snapshot.base.hp,expectedHp);
    }else{assert.equal(host.data.completed,true);assert.equal(host.data.frozenFrame,'frame');assert.equal(host.data.victoryFruits.length,level.words.length);assert.equal(host.data.waveRequest,null);}
  }
  if(repair)assert(repairs>0 && repairs<19);
  const expectedDrops=Math.min(50,plan.waves.flatMap(w=>w.spawnPlan).reduce((sum,m)=>sum+(m.dropCoins??0),0));
  assert.ok(expectedDrops>0);assert.equal(host.data.dropCoins,expectedDrops);assert.equal(host.data.dropError,false);
  assert.equal(host.data.rewardCoins,expectedCoins);assert.equal(host.data.coinBalance,expectedCoins+expectedDrops);assert.equal(wallet.balance(),expectedCoins+expectedDrops);
  assert.equal(rewards,1);assert.equal(praises,1);assert.equal(host.data.rewardSaved,true);host.advanceWave();host.claimVictoryReward();assert.equal(rewards,1);assert.equal(praises,1);assert.equal(picked,19);assert.equal(host.data.level,20);assert.equal(host.data.experience,3990);
  assert.equal(praiseActive,true);host.properties.paused=true;definition.properties.paused.observer.call(host);assert.equal(praiseActive,false);assert.equal(host.data.inputUnavailable,true);
  host.properties.paused=false;definition.properties.paused.observer.call(host);assert.equal(praiseActive,true);
  definition.pageLifetimes.hide.call(host);assert.equal(praiseActive,false);assert.equal(host.data.inputUnavailable,true);
  definition.pageLifetimes.show.call(host);assert.equal(praiseActive,true);assert.equal(host.data.inputUnavailable,false);
  assert.equal(rewards,1);assert.equal(praises,1);definition.lifetimes.detached.call(host);assert.equal(praiseDisposed,true);
});
