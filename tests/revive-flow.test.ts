import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createDailyCheckin, CHECKIN_KEY} from '../miniprogram/services/daily-checkin';
import {createCoinWallet} from '../miniprogram/services/coin-wallet';
import {createPetStore} from '../miniprogram/services/pet-store';
import {CombatRunner} from '../miniprogram/fortress/combat-runner';
import {createOpeningPlan} from '../miniprogram/fortress/opening-plan';
import {createSeededRandom} from '../miniprogram/fortress/plans';
import {applyCombatSkills} from '../miniprogram/fortress/combat';
import {skillLevels} from '../miniprogram/fortress/quality-skills';
import {SUMMON_SKILLS} from '../miniprogram/fortress/summon-skills';

for (const summon of [undefined, ...SUMMON_SKILLS]) test(`复活面板 ${summon ?? '旧援军'}：暂停、后台、保存失败和重复点击不误扣旗帜`,async()=>{
  const saved=new Map<string,unknown>([[CHECKIN_KEY,{version:1,entries:[],soldiers:5,flags:2}]]);let fail=false;
  const storage={getStorageSync:(key:string)=>structuredClone(saved.get(key)),setStorageSync(key:string,value:unknown){if(fail)throw Error('disk');saved.set(key,structuredClone(value));}};
  const wallet=createCoinWallet(storage),pets=createPetStore(storage);
  const daily=createDailyCheckin({storage,coins:wallet,pets});
  const file=new URL('../miniprogram/components/fortress-scene/fortress-scene.ts',import.meta.url),requireReal=createRequire(file);
  let definition:any,current:any;
  class Scene {
    runner:CombatRunner;options:any;disposed=false;
    constructor(_node:unknown,options:any){this.options=options;this.runner=new CombatRunner(options.initial);current=this;}
    get snapshot(){return this.runner.snapshot;}
    async present(){return true;}async load(){this.options.onHud({hp:this.snapshot!.base.hp,maxHp:this.snapshot!.base.maxHp,status:this.snapshot!.status});return true;}
    setPaused(paused:boolean){if(paused)this.runner.pause();else if(this.snapshot)this.runner.resume(0,this.snapshot.context.generation+1);}
    revive(kind:string,id:string,debit:()=>boolean){return this.runner.revive(kind,id,debit);}
    summonSoldier(id:string,debit:()=>boolean){return this.runner.summonSoldier(id,debit);}
    captureFrame(){return 'frame';} applyPet(){} applySkills(){} showCoinDrop(){}
    dispose(){this.disposed=true;this.runner.dispose();}
  }
  runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports:{},Component(value:any){definition=value;},wx:{getWindowInfo:()=>({pixelRatio:1})},
    require(name:string){
      if(name.endsWith('/daily-checkin'))return{dailyCheckin:daily};
      if(name.endsWith('/canvas-scene'))return{CanvasScene:Scene};
      if(name.endsWith('/coin-wallet'))return{coinWallet:wallet,victoryCoinsForLevel:()=>100};
      if(name.endsWith('/pet-store'))return{petStore:pets};
      if(name.endsWith('/battle-audio'))return{createBattleAudio:()=>({handle(){},setActive(){},setVolume(){},dispose(){}})};
      return requireReal(name);
    },
  });
  async function mount(){
    const host:any={data:structuredClone(definition.data),properties:{opening:true,preview:false,paused:false,musicVolume:22,previewRequest:{plan:createOpeningPlan('summon-ui',createSeededRandom(1)),generation:1}},setData(patch:any,done?:()=>void){Object.assign(this.data,patch);done?.();if(patch.entryFrame)queueMicrotask(()=>this.entryFrameLoaded({currentTarget:{dataset:{epoch:patch.entryFrameEpoch}}}));},triggerEvent(){},createSelectorQuery:()=>({select:()=>({fields:(_fields:any,fn:Function)=>({exec:()=>fn({node:{},width:360,height:560})})})})};
    for(const [key,fn]of Object.entries(definition.methods))host[key]=(fn as Function).bind(host);
    definition.lifetimes.attached.call(host);host.mount();await new Promise(resolve => setImmediate(resolve));return host;
  }
  const host=await mount();
  host.openRevive();assert.equal(host.data.reviveOpen,false,'没有死亡目标不开面板');
  const collection=summon ? {[summon]:{level:5,quality:'legendary' as const}} : {};
  const battle=applyCombatSkills(current.snapshot,skillLevels(collection),collection);
  const fallen=summon ? {...battle.supportSoldiers[0],hp:0} : {id:'fallen',slot:0,hp:0,maxHp:30,position:{x:1,y:1},attackRemainingMs:400};
  current.runner=new CombatRunner({...battle,supportSoldiers:[],fallenSoldiers:[fallen]});
  const timers=structuredClone(current.snapshot.summonRemainingMs);
  host.refreshSoldierCount();
  for(const [field,value] of [['ready',false],['error','broken'],['upgradeOffer',{}],['waveRequest',{}],['completed',true],['failed',true]]){
    const previous=host.data[field as string];host.data[field as string]=value;host.openRevive();host.data[field as string]=previous;assert.equal(host.data.reviveOpen,false);
  }
  host.openRevive();assert.equal(host.data.reviveOpen,true);assert.equal(current.runner.frame(1000).steps,0);
  host.summonSoldier({currentTarget:{dataset:{revision:host.data.soldierRevision}}});assert.equal(daily.soldierInventory().count,5);
  host.closeRevive();assert.equal(daily.flagInventory().count,2);host.openRevive();
  const event={currentTarget:{dataset:{kind:'soldier',id:fallen.id,revision:host.data.flagRevision}}};
  definition.pageLifetimes.hide.call(host);host.chooseRevive(event);assert.equal(daily.flagInventory().count,2);
  definition.pageLifetimes.show.call(host);assert.equal(host.data.reviveOpen,true);assert.equal(current.runner.frame(2000).steps,0);
  fail=true;host.chooseRevive(event);assert(host.data.reviveError);assert.equal(current.snapshot.supportSoldiers.length,0);assert.equal(daily.flagInventory().count,2);
  fail=false;host.chooseRevive(event);assert.equal(host.data.reviveOpen,false);assert.equal(daily.flagInventory().count,1);assert.equal(current.snapshot.supportSoldiers[0].hp,fallen.maxHp);assert.equal(current.snapshot.fallenSoldiers.length,0);
  const revived=current.snapshot.supportSoldiers[0];
  if(summon){
    assert.equal(revived.soldierType,battle.supportSoldiers[0].soldierType);
    assert.equal(revived.source,'skill');assert.equal(revived.evolved,true);
    assert.deepEqual(revived.skill,battle.supportSoldiers[0].skill);
    assert.deepEqual(current.snapshot.summonRemainingMs,timers);
  }
  host.chooseRevive(event);assert.equal(daily.flagInventory().count,1);assert.equal(current.snapshot.supportSoldiers.length,1);
  host.endRun();host.chooseRevive(event);assert.equal(daily.flagInventory().count,1);
  const fresh=await mount();assert.equal(fresh.data.reviveTargets.length,0);assert.equal(fresh.data.flagStock,1);fresh.endRun();
});
