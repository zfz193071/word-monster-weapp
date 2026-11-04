import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { createDefeatAudio } from '../miniprogram/services/defeat-audio';

test('失败只出现我要变强，音效一次、暂停恢复和退出释放、按钮后台无效',async()=>{
 const file=new URL('../miniprogram/components/fortress-scene/fortress-scene.ts',import.meta.url),realRequire=createRequire(file);
 let definition:any,scene:any,audioCount=0,audioActive=false,disposed=false;const events:string[]=[];
 class Scene {
  snapshot:any;options:any;paused=false;
  constructor(_node:any,options:any){this.options=options;this.snapshot=options.initial;scene=this;}
  async load(){return true;}setPaused(value:boolean){this.paused=value;}captureFrame(){return 'failed-frame';}dispose(){}applyPet(){}
 }
 runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports:{},Component(value:any){definition=value;},wx:{getWindowInfo:()=>({pixelRatio:1})},
  require(name:string){
   if(name.endsWith('/canvas-scene'))return {CanvasScene:Scene};
   if(name.endsWith('/coin-wallet'))return {coinWallet:{balance:()=>0},victoryCoinsForLevel:()=>100};
   if(name.endsWith('/pet-store'))return {petStore:{view:()=>({owned:false})}};
   if(name.endsWith('/defeat-audio'))return {createDefeatAudio(){audioCount++;return{setActive(value:boolean){audioActive=value;},dispose(){disposed=true;}};}};
   if(name.endsWith('/battle-audio'))return {createBattleAudio:()=>({handle(){},setActive(){},setVolume(){},dispose(){}})};
   return realRequire(name);
  }
 });
 const host:any={data:structuredClone(definition.data),properties:{opening:true,preview:false,paused:false,musicVolume:22,previewRequest:{plan:createOpeningPlan('defeat',createSeededRandom(1)),generation:1}},setData(patch:any){Object.assign(this.data,patch);},triggerEvent(name:string){events.push(name);},createSelectorQuery:()=>({select:()=>({fields:(_fields:any,fn:Function)=>({exec:()=>fn({node:{},width:360,height:560})})})})};
 for(const [key,fn]of Object.entries(definition.methods))host[key]=(fn as Function).bind(host);
 definition.lifetimes.attached.call(host);host.mount();await Promise.resolve();
 scene.snapshot={...scene.snapshot,status:'baseDestroyed',base:{hp:0,maxHp:1000}};
 scene.options.onEvents([{type:'baseDestroyed',context:scene.snapshot.context,tick:1}]);
 assert.equal(host.data.failed,true);assert.equal(host.data.frozenFrame,'failed-frame');assert.equal(scene.paused,true);assert.equal(audioCount,1);assert.equal(audioActive,true);
 host.presentDefeat();assert.equal(audioCount,1);
 definition.pageLifetimes.hide.call(host);assert.equal(audioActive,false);host.becomeStronger();assert.equal(events.includes('strengthenguide'),false);
 definition.pageLifetimes.show.call(host);host.becomeStronger();assert.equal(events.at(-1),'strengthenguide');assert.equal(audioActive,true);
 definition.lifetimes.detached.call(host);assert.equal(disposed,true);
 const markup=readFileSync(new URL('../miniprogram/components/fortress-scene/fortress-scene.wxml',import.meta.url),'utf8');
 assert.doesNotMatch(markup,/class="return-home"/);assert.match(markup,/bindtap="becomeStronger"[^>]*>我要变强/);
});
test('伤心音效只播一次，暂停恢复同通道，结束或出错后释放',()=>{
 let plays=0,pauses=0,destroyed=0,end=()=>{},error=()=>{};
 const channel={src:'',autoplay:false,loop:false,obeyMuteSwitch:true,play(){plays++;},pause(){pauses++;},stop(){},destroy(){destroyed++;},onEnded(fn:()=>void){end=fn;},offEnded(){},onError(fn:()=>void){error=fn;},offError(){}};
 const audio=createDefeatAudio(()=>channel);audio.setActive(true);audio.setActive(true);assert.equal(plays,1);assert.equal(channel.src,'/assets/audio/defeat-sad.mp3');
 audio.setActive(false);assert.equal(pauses,1);audio.setActive(true);assert.equal(plays,2);end();assert.equal(destroyed,1);audio.setActive(false);audio.setActive(true);audio.dispose();error();assert.equal(plays,2);assert.equal(destroyed,1);
});
