import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { openingArt } from '../miniprogram/fortress/opening-encounter';
import { battleAudioPaths } from '../miniprogram/services/battle-assets';

test('战斗图片按真实完成数量更新进度，全部完成后才能跳转；取消和失败阻止跳转',()=>{
  const calls:any[]=[];const timers=new Map<number,()=>void>();let timerId=0;
  const exports:any={};
  const source=readFileSync(new URL('../miniprogram/services/battle-assets.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports,require(name:string){assert.equal(name,'../fortress/levels');return {ALL_BATTLE_WORDS:[],defeatAudioPath:()=>''};},
    wx:{getImageInfo(options:any){calls.push(options);}},setTimeout(fn:()=>void){timers.set(++timerId,fn);return timerId;},clearTimeout(id:number){timers.delete(id);},
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

test('当前关卡音频路径包含战斗声、答对双语音及计划词条的听词/退场声', () => {
  const paths = battleAudioPaths(['apple', 'dog']);
  assert.ok(paths.includes('/assets/audio/battle-loop.mp3'));
  assert.ok(paths.includes('/assets/audio/quiz-praise-bilingual.mp3'));
  assert.ok(paths.includes('/assets/audio/learn-apple.mp3'));
  assert.ok(paths.includes('/assets/audio/zombie-apple.mp3'));
  assert.ok(paths.includes('/learning-assets/audio/learn-dog.mp3'));
  assert.ok(paths.includes('/learning-assets/audio/zombie-dog.mp3'));
  assert.equal(new Set(paths).size, paths.length);
});

test('图片全部解码后仍等待音频可播放；失败、取消及旧回调不能误报完成', () => {
  const images:any[]=[];const channels:any[]=[];const timers=new Map<number,()=>void>();let timerId=0;
  const exports:any={};
  const source=readFileSync(new URL('../miniprogram/services/battle-assets.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports,require(){return {ALL_BATTLE_WORDS:[],defeatAudioPath:()=>''};},
    wx:{getImageInfo(options:any){images.push(options);},createInnerAudioContext(){
      const channel:any={src:'',autoplay:false,loop:false,obeyMuteSwitch:true,destroyed:0,
        onCanplay(fn:()=>void){this.ready=fn;},offCanplay(){},onError(fn:()=>void){this.failed=fn;},offError(){},destroy(){this.destroyed++;}};
      channels.push(channel);return channel;
    }},setTimeout(fn:()=>void){timers.set(++timerId,fn);return timerId;},clearTimeout(id:number){timers.delete(id);},
  });
  let ready=0, errors=0;const progress:number[]=[];
  const callbacks={onProgress:(value:number)=>progress.push(value),onReady:()=>ready++,onError:()=>errors++};
  exports.loadBattleAssets(openingArt('apple'),callbacks,{imagePaths:['/assets/images/battle-backgrounds/level-1.png'],audioPaths:['/a.mp3','/b.mp3']});
  assert.ok(images.some(image=>image.src==='/assets/images/battle-backgrounds/level-1.png'));
  for(const image of images)image.success();
  assert.equal(ready,0);assert.ok(progress.at(-1)!<100);
  assert.equal(channels.length,1);channels[0].ready();
  assert.equal(ready,0);assert.equal(channels[0].destroyed,1);
  const stale=channels[0].ready;stale();assert.equal(channels.length,2);
  channels[1].ready();assert.equal(ready,1);assert.equal(progress.at(-1),100);
  const start=images.length;const cancel=exports.loadBattleAssets(openingArt('banana'),callbacks,{audioPaths:['/a.mp3']});
  const late=channels.at(-1).ready;cancel();late();for(const image of images.slice(start))image.success();
  assert.equal(ready,1);
  exports.loadBattleAssets(openingArt('pear'),callbacks,{audioPaths:['/a.mp3']});channels.at(-1).failed();
  assert.equal(errors,1);assert.equal(ready,1);
});
