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

test('真实组件召唤入口校验状态、刷新库存/人数，后台与退出拒绝消费，重建不携带旧士兵',async()=>{
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
    async load(){this.options.onHud({hp:this.snapshot!.base.hp,maxHp:this.snapshot!.base.maxHp,status:this.snapshot!.status});return true;}
    setPaused(paused:boolean){if(paused)this.runner.pause();else if(this.snapshot)this.runner.resume(0,this.snapshot.context.generation+1);}
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
    const host:any={data:structuredClone(definition.data),properties:{opening:true,preview:false,paused:false,musicVolume:22,previewRequest:{plan:createOpeningPlan('summon-ui',createSeededRandom(1)),generation:1}},setData(patch:any){Object.assign(this.data,patch);},triggerEvent(){},createSelectorQuery:()=>({select:()=>({fields:(_fields:any,fn:Function)=>({exec:()=>fn({node:{},width:360,height:560})})})})};
    for(const [key,fn]of Object.entries(definition.methods))host[key]=(fn as Function).bind(host);
    definition.lifetimes.attached.call(host);host.mount();await Promise.resolve();return host;
  }
  const host=await mount();const event=()=>({currentTarget:{dataset:{revision:host.data.soldierRevision}}});
  for(const [field,value] of [['ready',false],['error','broken'],['upgradeOffer',{}],['waveRequest',{}],['completed',true],['failed',true],['soldierBusy',true]]){
    const previous=host.data[field as string];host.data[field as string]=value;host.summonSoldier(event());host.data[field as string]=previous;
    assert.equal(daily.soldierInventory().count,5, String(field));
  }
  definition.pageLifetimes.hide.call(host);host.summonSoldier(event());assert.equal(daily.soldierInventory().count,5);
  definition.pageLifetimes.show.call(host);
  fail=true;host.summonSoldier(event());assert(host.data.soldierSummonError);assert.equal(current.snapshot.supportSoldiers.length,0);assert.equal(host.data.soldierStock,5);
  fail=false;const stale=event();host.summonSoldier(stale);assert.equal(host.data.soldierStock,4);assert.equal(host.data.soldiersInBattle,1);
  host.summonSoldier(stale);assert.equal(host.data.soldierStock,4);assert.equal(host.data.soldiersInBattle,1);
  host.summonSoldier(event());host.summonSoldier(event());host.summonSoldier(event());assert.equal(host.data.soldiersInBattle,3);assert.equal(host.data.soldierStock,2);
  host.endRun();host.summonSoldier(event());assert.equal(daily.soldierInventory().count,2);assert.equal(host.data.soldiersInBattle,0);
  const fresh=await mount();assert.equal(fresh.data.soldiersInBattle,0);assert.equal(fresh.data.soldierStock,2);fresh.endRun();
});
