import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('首页图片资源并发请求共享一次加载，失败允许重试，成功复用', async()=>{
 let attempts=0;let reject:(e:Error)=>void=()=>{};let resolve:()=>void=()=>{};
 const importer=Object.assign(()=>{}, {async(path:string){assert.equal(path,'../assets/images/ready');attempts++;return new Promise<void>((yes,no)=>{resolve=yes;reject=no;});}});
 const exports: {loadImageAssets?:()=>Promise<void>}={};
 const source=readFileSync(new URL('../miniprogram/services/image-assets.ts',import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:importer,setTimeout,clearTimeout});
 const load=exports.loadImageAssets!;const first=load();assert.equal(load(),first);assert.equal(attempts,1);
 reject(Error('network'));await assert.rejects(first);
 const next=load();assert.equal(attempts,2);resolve();await next;assert.equal(load(),next);assert.equal(attempts,2);
});

test('分包导入无回调时超时退出等待，重试可成功，旧加载迟到不污染新请求', async()=>{
 const timers=new Map<number,()=>void>();let id=0;const calls:{resolve:()=>void}[]=[];
 const importer=Object.assign(()=>{}, {async(){return new Promise<void>(resolve=>calls.push({resolve}));}});
 const exports:any={};
 const source=readFileSync(new URL('../miniprogram/services/image-assets.ts',import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports,require:importer,setTimeout(fn:()=>void){timers.set(++id,fn);return id;},clearTimeout(key:number){timers.delete(key);},
 });
 const first=exports.loadImageAssets();let failed=false;first.catch(()=>{failed=true;});
 for(const [key,fn] of [...timers]){timers.delete(key);fn();}
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(failed,true,'资源导入没有回调时必须结束0%等待');
 const next=exports.loadImageAssets();assert.notEqual(next,first);
 calls[0].resolve();await Promise.resolve();assert.equal(exports.loadImageAssets(),next);
 calls[1].resolve();await next;assert.equal(timers.size,0);
});

test('首页在图片分包成功后才挂载场景，失败可重试，卸载后不更新', async () => {
 let page: any;
 const calls: {resolve: () => void; reject: (error: Error) => void}[] = [];
 const source = readFileSync(new URL('../miniprogram/pages/home/home.ts', import.meta.url), 'utf8');
 runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
  exports: {}, Page(value: any) {page = value;}, require(name: string) {
   if (name.endsWith('/levels')) return {LEVELS: []};
   if (name.endsWith('/collection')) return {collectionWords: () => []};
   if (name.endsWith('/image-assets')) return {loadImageAssets: () => new Promise<void>((resolve, reject) => calls.push({resolve, reject}))};
   return {};
  },
 });
 page.setData = (patch: object) => Object.assign(page.data, patch);
 const first = page.prepareImages();
 assert.equal(page.data.imagesReady, false);
 await page.prepareImages(); assert.equal(calls.length, 1);
 calls[0].reject(Error('offline')); await first;
 assert.equal(page.data.imagesError, true);
 const retry = page.prepareImages(); calls[1].resolve(); await retry;
 assert.equal(page.data.imagesReady, true); assert.equal(page.data.imagesError, false);
 page.data.imagesReady = false;
 const last = page.prepareImages(); page.disposed = true; calls[2].resolve(); await last;
 assert.equal(page.data.imagesReady, false);
 const markup = readFileSync(new URL('../miniprogram/pages/home/home.wxml', import.meta.url), 'utf8');
 assert.match(markup, /<view wx:if="\{\{imagesReady\}\}" class="home/);
});
