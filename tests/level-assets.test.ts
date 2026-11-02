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
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:importer});
 const load=exports.loadLevelAssets!;const first=load();assert.equal(load(),first);assert.equal(attempts,1);
 reject(Error('network'));await assert.rejects(first);
 const next=load();assert.equal(attempts,2);resolve();await next;assert.equal(load(),next);assert.equal(attempts,2);
});
