import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattleAudio } from '../miniprogram/services/battle-audio';
import type { CombatEvent } from '../miniprogram/fortress/types';
class Channel {
  src='';autoplay=false;loop=false;obeyMuteSwitch=true;volume=1;plays=0;destroyed=false;
  handlers=new Map<string,Function>();
  onEnded=(f:Function)=>{this.handlers.set('ended',f);};offEnded=()=>{this.handlers.delete('ended');};
  onError=(f:Function)=>{this.handlers.set('error',f);};offError=()=>{this.handlers.delete('error');};
  onPlay=(f:Function)=>{this.handlers.set('play',f);};offPlay=()=>{this.handlers.delete('play');};
  onPause=(f:Function)=>{this.handlers.set('pause',f);};offPause=()=>{this.handlers.delete('pause');};
  onStop=(f:Function)=>{this.handlers.set('stop',f);};offStop=()=>{this.handlers.delete('stop');};
  play(){this.plays++;this.handlers.get('play')?.();}pause(){this.handlers.get('pause')?.();}stop(){this.handlers.get('stop')?.();}destroy(){this.destroyed=true;}
}
const context={sessionId:'audio-run',combatId:'wave1',waveId:'wave1',generation:0};
const defeat=(id:string,wordId='apple'):CombatEvent=>({type:'monsterDefeated',context,tick:1,monsterId:id,wordId});
function setup(){
  const voices:Channel[]=[];const music=new Channel();const hit=new Channel();let drained=0;
  const controller=createBattleAudio({sessionId:context.sessionId,onChange(){},onDrained(){drained++;},
    audio:{createContext(){const c=new Channel();voices.push(c);return c;},schedule(){return()=>{};}},createMusicContext:()=>music,createHitContext:()=>hit});
  controller.setActive(true);
  return{controller,voices,music,hit,get drained(){return drained;}};
}
test('多只击败依次读完才消失，重复事件不重播；背景音乐静音不影响发音',()=>{
 const h=setup();h.controller.setVolume(.6);h.controller.handle([defeat('a'),defeat('b','banana'),defeat('a')]);
 assert.deepEqual(h.controller.view.retiringIds,['a','b']);assert.equal(h.voices.length,1);assert.equal(h.music.volume,.12);
 h.controller.setVolume(0);assert.equal(h.music.volume,0);assert.equal(h.voices[0].plays,1);
 h.voices[0].handlers.get('ended')!();assert.deepEqual(h.controller.view.retiringIds,['b']);assert.equal(h.drained,0);
 assert.equal(h.voices[1].src,'/assets/audio/zombie-banana.mp3');h.voices[1].handlers.get('ended')!();assert.equal(h.drained,1);assert.equal(h.controller.busy,false);
 h.controller.handle([defeat('a')]);assert.equal(h.voices.length,2);h.controller.dispose();assert.equal(h.music.destroyed,true);
});
test('暂停停止声音但保留退场队列，恢复重读；旧回调及销毁后事件无效',()=>{
 const h=setup();h.controller.handle([defeat('a')]);const stale=h.voices[0].handlers.get('ended')!;
 h.controller.setActive(false);stale();assert.equal(h.controller.busy,true);assert.equal(h.drained,0);
 h.controller.setActive(true);assert.equal(h.voices.length,2);stale();assert.equal(h.controller.busy,true);
 h.controller.dispose();h.voices[1].handlers.get('ended')?.();h.controller.handle([defeat('b')]);assert.equal(h.voices.length,2);assert.equal(h.drained,0);
});
test('发音失败保留怪物、重试后才允许升级，命中只触发效果通道',()=>{
 const h=setup();h.controller.handle([{type:'monsterDamaged',context,tick:1,monsterId:'a',hp:7}]);assert.equal(h.hit.plays,1);assert.equal(h.voices.length,0);
 h.controller.handle([defeat('a')]);h.voices[0].handlers.get('error')!({errCode:1,errMsg:'error'});
 assert.equal(h.controller.view.error,true);assert.equal(h.controller.busy,true);assert.equal(h.drained,0);
 h.controller.retry();assert.equal(h.voices.length,2);h.voices[1].handlers.get('ended')!();assert.equal(h.drained,1);assert.equal(h.music.volume,.22);h.controller.dispose();assert.equal(h.hit.destroyed,true);
});
