import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { createDefeatAudio } from '../miniprogram/services/defeat-audio';

test('失败可变强或重开当前关卡，音效一次、暂停恢复和后台禁止重开',async()=>{
 const file=new URL('../miniprogram/components/fortress-scene/fortress-scene.ts',import.meta.url),realRequire=createRequire(file);
 let definition:any,scene:any,audioCount=0,audioActive=false,disposed=false;const events:string[]=[];
 class Scene {
  snapshot:any;options:any;paused=false;
  constructor(_node:any,options:any){this.options=options;this.snapshot=options.initial;scene=this;}
  async present(){return true;}async load(){return true;}setPaused(value:boolean){this.paused=value;}captureFrame(){return 'failed-frame';}dispose(){}applyPet(){}applySkills(skills:any,skillCollection:any){this.snapshot={...this.snapshot,skills,skillCollection};}
 }
 runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports:{},Component(value:any){definition=value;},wx:{getWindowInfo:()=>({pixelRatio:1})},
  require(name:string){
   if(name.endsWith('/battlefield-assets')) return {loadBattlefieldAssets:()=>Promise.resolve()};
      if(name.endsWith('/canvas-scene'))return {CanvasScene:Scene};
   if(name.endsWith('/coin-wallet'))return {coinWallet:{balance:()=>0},victoryCoinsForLevel:()=>100};
   if(name.endsWith('/pet-store'))return {petStore:{view:()=>({owned:false})}};
   if(name.endsWith('/defeat-audio'))return {createDefeatAudio(){audioCount++;return{setActive(value:boolean){audioActive=value;},dispose(){disposed=true;}};}};
   if(name.endsWith('/battle-audio'))return {createBattleAudio:()=>({handle(){},setActive(){},setVolume(){},dispose(){}})};
   return realRequire(name);
  }
 });
 const host:any={data:structuredClone(definition.data),properties:{opening:true,preview:false,paused:false,musicVolume:22,previewRequest:{plan:createOpeningPlan('defeat',createSeededRandom(1),3,2,'hard'),generation:1}},setData(patch:any,callback?:()=>void){Object.assign(this.data,patch);callback?.();if(patch.entryFrame)queueMicrotask(()=>this.entryFrameLoaded({currentTarget:{dataset:{epoch:patch.entryFrameEpoch}}}));},triggerEvent(name:string){events.push(name);},createSelectorQuery:()=>({select:()=>({fields:(_fields:any,fn:Function)=>({exec:()=>fn({node:{},width:360,height:560})})})})};
 for(const [key,fn]of Object.entries(definition.methods))host[key]=(fn as Function).bind(host);
 definition.lifetimes.attached.call(host);host.mount();await new Promise(resolve => setImmediate(resolve));
 scene.snapshot={...scene.snapshot,status:'baseDestroyed',base:{hp:0,maxHp:1000}};
 scene.options.onEvents([{type:'baseDestroyed',context:scene.snapshot.context,tick:1}]);
 assert.equal(host.data.failed,true);assert.equal(host.data.frozenFrame,'failed-frame');assert.equal(scene.paused,true);assert.equal(audioCount,1);assert.equal(audioActive,true);
 host.presentDefeat();assert.equal(audioCount,1);
 definition.pageLifetimes.hide.call(host);assert.equal(audioActive,false);host.becomeStronger();assert.equal(events.includes('strengthenguide'),false);
 definition.pageLifetimes.show.call(host);host.becomeStronger();assert.equal(events.at(-1),'strengthenguide');assert.equal(audioActive,true);
 host.properties.paused=true;host.restartBattle();assert.equal(host.data.failed,true);
 host.properties.paused=false;definition.pageLifetimes.hide.call(host);host.restartBattle();assert.equal(host.data.failed,true);
 definition.pageLifetimes.show.call(host);host.restartBattle();
 const request=host.data.waveRequest;
 assert.equal(host.data.failed,false);assert.equal(disposed,true);
 assert.equal(request.plan.levelId,3);assert.equal(request.plan.weaponLevel,2);assert.equal(request.plan.difficulty,'hard');assert.notEqual(request.plan.sessionId,'defeat');
 host.restartBattle();assert.equal(host.data.waveRequest,request);
 const wave=request.plan.waves[0];
 host.nextWave({detail:{context:{sessionId:request.plan.sessionId,waveId:wave.waveId,generation:request.generation},attempts:[{sessionId:request.plan.sessionId,waveId:wave.waveId,targetWordId:wave.targetWordId,selectedWordId:wave.targetWordId,correct:true}]}});
 await Promise.resolve();
 assert.equal(host.data.waveRequest,null);assert.equal(host.data.failed,false);assert.equal(host.data.level,1);assert.equal(host.data.experience,0);
 assert.equal(scene.snapshot.status,'fighting');assert.equal(scene.snapshot.base.hp,scene.snapshot.base.maxHp);
 assert.equal(scene.snapshot.context.sessionId,request.plan.sessionId);assert.equal(host.data.skillInventory.length,0);
 definition.lifetimes.detached.call(host);
 const markup=readFileSync(new URL('../miniprogram/components/fortress-scene/fortress-scene.wxml',import.meta.url),'utf8');
 assert.doesNotMatch(markup,/class="return-home"/);assert.match(markup,/bindtap="becomeStronger"[^>]*>我要变强/);
});
test('伤心音效只播一次，暂停恢复同通道，结束或出错后释放',()=>{
 let plays=0,pauses=0,destroyed=0,end=()=>{},error=()=>{};
 const channel={src:'',autoplay:false,loop:false,obeyMuteSwitch:true,play(){plays++;},pause(){pauses++;},stop(){},destroy(){destroyed++;},onEnded(fn:()=>void){end=fn;},offEnded(){},onError(fn:()=>void){error=fn;},offError(){}};
 const audio=createDefeatAudio(()=>channel);audio.setActive(true);audio.setActive(true);assert.equal(plays,1);assert.equal(channel.src,'/assets/audio/defeat-sad.mp3');
 audio.setActive(false);assert.equal(pauses,1);audio.setActive(true);assert.equal(plays,2);end();assert.equal(destroyed,1);audio.setActive(false);audio.setActive(true);audio.dispose();error();assert.equal(plays,2);assert.equal(destroyed,1);
});
