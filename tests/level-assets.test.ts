import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('分类资源并发请求共享一次加载，失败允许重试，成功复用', async()=>{
 let attempts=0;let reject:(e:Error)=>void=()=>{};let resolve:()=>void=()=>{};
 const importer=Object.assign(()=>{}, {async(path:string){assert.equal(path,'../learning-assets/ready');attempts++;return new Promise<void>((yes,no)=>{resolve=yes;reject=no;});}});
 const exports: {loadLevelAssets?:()=>Promise<void>}={};
 const source=readFileSync(new URL('../miniprogram/services/level-assets.ts',import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:importer,setTimeout,clearTimeout});
 const load=exports.loadLevelAssets!;const first=load();assert.equal(load(),first);assert.equal(attempts,1);
 reject(Error('network'));await assert.rejects(first);
 const next=load();assert.equal(attempts,2);resolve();await next;assert.equal(load(),next);assert.equal(attempts,2);
});

test('分包导入无回调时超时退出等待，重试可成功，旧加载迟到不污染新请求', async()=>{
 const timers=new Map<number,()=>void>();let id=0;const calls:{resolve:()=>void}[]=[];
 const importer=Object.assign(()=>{}, {async(){return new Promise<void>(resolve=>calls.push({resolve}));}});
 const exports:any={};
 const source=readFileSync(new URL('../miniprogram/services/level-assets.ts',import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports,require:importer,setTimeout(fn:()=>void){timers.set(++id,fn);return id;},clearTimeout(key:number){timers.delete(key);},
 });
 const first=exports.loadLevelAssets();let failed=false;first.catch(()=>{failed=true;});
 for(const [key,fn] of [...timers]){timers.delete(key);fn();}
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(failed,true,'资源导入没有回调时必须结束0%等待');
 const next=exports.loadLevelAssets();assert.notEqual(next,first);
 calls[0].resolve();await Promise.resolve();assert.equal(exports.loadLevelAssets(),next);
 calls[1].resolve();await next;assert.equal(timers.size,0);
});
