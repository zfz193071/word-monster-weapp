import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('答题组件自动继续使用当前令牌，切后台暂停，换题和退出释放反馈',()=>{
 let definition:any;const controllers:any[]=[];const effects:any[]=[];
 const modules={
  '../../fortress/listening':{createListening(options:any){
   const controller={view:{phase:'ready',paused:false,token:'start',cards:[]},continued:[] as string[],disposed:false,start(){},setPaused(paused:boolean){this.view={...this.view,paused,token:paused?'paused':'resumed'};options.onChange(this.view);},continueQuiz(token:string){this.continued.push(token);},dispose(){this.disposed=true;},answer(correct:boolean){this.view={...this.view,phase:'answered',correct} as any;options.onChange(this.view);}};
   controllers.push(controller);return controller;
  }},
  '../../services/quiz-feedback':{createQuizFeedback(correct:boolean,done:()=>void){const effect={correct,done,active:false,disposed:false,volume:1,setVolume(value:number){this.volume=value;},setActive(value:boolean){this.active=value;},dispose(){this.disposed=true;}};effects.push(effect);return effect;}}
 };
 const source=readFileSync(new URL('../miniprogram/components/fortress-choice/fortress-choice.ts',import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:{},Component(value:any){definition=value;},require:(name:string)=>modules[name as keyof typeof modules]});
 const host:any={properties:{request:{singleAttempt:true},paused:false,musicVolume:22},data:{},setData(value:any){Object.assign(this.data,value);},triggerEvent(){}};
 for(const[name,fn]of Object.entries(definition.methods))host[name]=(fn as Function).bind(host);
 definition.lifetimes.attached.call(host);definition.lifetimes.ready.call(host);
 controllers[0].answer(true);assert.equal(effects.length,1);assert.equal(effects[0].active,true);assert.equal(effects[0].volume,.22);
 definition.pageLifetimes.hide.call(host);assert.equal(effects[0].active,false);effects[0].done();assert.equal(controllers[0].continued.length,0);
 definition.pageLifetimes.show.call(host);assert.equal(effects.length,1);effects[0].done();assert.deepEqual(controllers[0].continued,['resumed']);
 host.mount();assert.equal(effects[0].disposed,true);effects[0].done();assert.equal(controllers[0].continued.length,1);
 controllers[1].answer(false);assert.equal(effects[1].correct,false);definition.lifetimes.detached.call(host);assert.equal(effects[1].disposed,true);effects[1].done();assert.equal(controllers[1].continued.length,0);
});
