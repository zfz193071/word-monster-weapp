import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { openingArt } from '../miniprogram/fortress/opening-encounter';

test('战斗图片按真实完成数量更新进度，全部完成后才能跳转；取消和失败阻止跳转',()=>{
  const calls:any[]=[];const timers=new Map<number,()=>void>();let timerId=0;
  const exports:any={};
  const source=readFileSync(new URL('../miniprogram/services/battle-assets.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports,wx:{getImageInfo(options:any){calls.push(options);}},setTimeout(fn:()=>void){timers.set(++timerId,fn);return timerId;},clearTimeout(id:number){timers.delete(id);},
  });
  const progress:number[]=[];let ready=0;let errors=0;
  const callbacks={onProgress:(n:number)=>progress.push(n),onReady:()=>ready++,onError:()=>errors++};
  exports.loadBattleAssets(openingArt('apple'),callbacks);
  const total=calls.length;assert.ok(total>5);assert.equal(new Set(calls.map(c=>c.src)).size,total);
  assert.deepEqual(progress,[0]);calls[0].success();calls[0].success();assert.equal(progress.at(-1),Math.floor(100/total));assert.equal(ready,0);
  for(const call of calls.slice(1))call.success();assert.equal(progress.at(-1),100);assert.equal(ready,1);assert.equal(timers.size,0);
  const start=calls.length;const cancel=exports.loadBattleAssets(openingArt('banana'),callbacks);cancel();
  for(const call of calls.slice(start))call.success();assert.equal(ready,1);
  exports.loadBattleAssets(openingArt('pear'),callbacks);calls.at(-1).fail();assert.equal(errors,1);assert.equal(ready,1);
  exports.loadBattleAssets(openingArt('orange'),callbacks);for(const fn of [...timers.values()])fn();assert.equal(errors,2);assert.equal(ready,1);
});
