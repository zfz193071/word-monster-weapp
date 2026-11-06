import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('顶部返回、我要变强和页面卸载先终止内存闯关，导航与原入口释放保持正常',()=>{
 for(const action of ['returnHome','becomeStronger','onUnload']){
  let definition:any;let stopped=0;let navigated=0;let released='';let guided=0;
  const source=readFileSync(new URL('../miniprogram/pages/battle/battle.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:{},Page(v:any){definition=v;},wx:{navigateBack(){assert.equal(stopped,1);navigated++;}},require(name:string){if(name.endsWith('/battle-background'))return{battleBackgroundCover:()=>'',battleBackgroundColor:()=>''};if(name.endsWith('/strength-guide'))return{strengthGuide:{request(){guided++;}}};if(name.endsWith('/fortress-entry'))return{fortressEntryStore:{release(id:string){released=id;}}};return{};}});
  const host={...definition,data:{fromHome:true,choiceRequest:{plan:{sessionId:'original-entry'}}},setData(patch:object){Object.assign(this.data,patch);},selectComponent(){return{endRun(){stopped++;}};}};
  host[action]();assert.equal(stopped,1);assert.equal(navigated,action==='onUnload'?0:1);assert.equal(guided,action==='becomeStronger'?1:0);if(action==='onUnload')assert.equal(released,'original-entry');
 }
});
test('战斗倍速按钮按四档循环，新开页面恢复默认一倍',()=>{
 let definition:any;
 const source=readFileSync(new URL('../miniprogram/pages/battle/battle.ts',import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:{},Page(value:any){definition=value;},require(name:string){return name.endsWith('/battle-background')?{battleBackgroundCover:()=>'',battleBackgroundColor:()=>''}:{};}});
 const host={...definition,data:{...definition.data},setData(patch:object){Object.assign(this.data,patch);}};
 assert.equal(host.data.combatSpeed,1);
 for(const expected of [1.5,2,2.5,1,1.5]){host.cycleCombatSpeed();assert.equal(host.data.combatSpeed,expected);}
 assert.equal(definition.data.combatSpeed,1);
});
