import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattleAudio } from '../miniprogram/services/battle-audio';
import type { CombatEvent } from '../miniprogram/fortress/types';
class Channel {
  src='';autoplay=false;loop=false;obeyMuteSwitch=true;volume=1;playbackRate=1;plays=0;stops=0;destroyed=false;
  handlers=new Map<string,Function>();
  onEnded=(f:Function)=>{this.handlers.set('ended',f);};offEnded=()=>{this.handlers.delete('ended');};
  onError=(f:Function)=>{this.handlers.set('error',f);};offError=()=>{this.handlers.delete('error');};
  onPlay=(f:Function)=>{this.handlers.set('play',f);};offPlay=()=>{this.handlers.delete('play');};
  onPause=(f:Function)=>{this.handlers.set('pause',f);};offPause=()=>{this.handlers.delete('pause');};
  onStop=(f:Function)=>{this.handlers.set('stop',f);};offStop=()=>{this.handlers.delete('stop');};
  play(){this.plays++;this.handlers.get('play')?.();}pause(){this.handlers.get('pause')?.();}stop(){this.stops++;this.handlers.get('stop')?.();}destroy(){this.destroyed=true;}
}
const context={sessionId:'audio-run',combatId:'wave1',waveId:'wave1',generation:0};
const defeat=(id:string,wordId='apple'):CombatEvent=>({type:'monsterDefeated',context,tick:1,monsterId:id,wordId});
function setup(){
  const voices:Channel[]=[];const music=new Channel();const hit=new Channel();const base=new Channel();const coin=new Channel();let drained=0;let time=0;
  const timers=new Map<number,{at:number;run:()=>void}>();let next=0;const callbacks:(()=>void)[]=[];
  const controller=createBattleAudio({sessionId:context.sessionId,onChange(){},onDrained(){drained++;},now:()=>time,
    audio:{createContext(){const c=new Channel();voices.push(c);return c;},schedule(run,delay){
      const id=++next;timers.set(id,{at:time+delay,run});callbacks.push(run);return()=>{timers.delete(id);};
    }},createMusicContext:()=>music,createHitContext:()=>hit,createBaseHitContext:()=>base,createCoinContext:()=>coin});
  controller.setActive(true);
  return{controller,voices,music,hit,base,coin,callbacks,timers,get drained(){return drained;},advance(ms:number){
    const end=time+ms;
    while(true){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due)break;time=due[1].at;timers.delete(due[0]);due[1].run();
    }time=end;
  },end(){voices.at(-1)!.handlers.get('ended')!();}};
}
test('最后击杀后等满300ms，同帧取最后一词；重复事件不重置，播报按0.8倍速',()=>{
 const h=setup();h.controller.setVolume(.6);h.controller.handle([defeat('a'),defeat('b','banana')]);
 assert.equal(h.controller.busy,true);assert.equal(h.voices.length,0);assert.equal(h.music.volume,.12);
 h.advance(150);h.controller.handle([defeat('b','banana'),{...defeat('foreign'),context:{...context,sessionId:'other'}}]);
 h.advance(149);assert.equal(h.voices.length,0);h.advance(1);assert.equal(h.voices.length,1);
 assert.equal(h.voices[0].src,'/assets/audio/zombie-banana.mp3');assert.equal(h.voices[0].playbackRate,.8);
 h.controller.setVolume(0);assert.equal(h.music.volume,0);assert.equal(h.voices[0].plays,1);
 h.end();assert.equal(h.drained,1);assert.equal(h.controller.busy,false);
 h.controller.handle([defeat('a')]);h.advance(300);assert.equal(h.voices.length,1);h.controller.dispose();
});
test('连续击杀重计300ms，失效定时器不能提前播放',()=>{
 const h=setup();h.controller.handle([defeat('a')]);const stale=h.callbacks[0];h.advance(200);
 h.controller.handle([defeat('b','banana')]);stale();h.advance(299);assert.equal(h.voices.length,0);
 h.advance(1);assert.equal(h.voices[0].src,'/assets/audio/zombie-banana.mp3');h.end();assert.equal(h.drained,1);h.controller.dispose();
});
test('当前单词完整读完，期间只保留最新待播词；两个词读完才放行升级或下一波',()=>{
 const h=setup();h.controller.handle([defeat('a')]);h.advance(300);const first=h.voices[0];
 h.controller.handle([defeat('b','banana')]);h.advance(300);
 h.controller.handle([defeat('c','orange'),defeat('d','pear')]);h.advance(300);
 assert.equal(h.voices.length,1);assert.equal(first.stops,0);assert.equal(first.destroyed,false);
 assert.equal(h.controller.view.speakingWord,'apple');assert.equal(h.drained,0);
 h.end();assert.equal(h.voices.length,2);assert.equal(h.voices[1].src,'/assets/audio/zombie-pear.mp3');
 assert.equal(h.controller.busy,true);assert.equal(h.drained,0);h.end();assert.equal(h.drained,1);
 assert.equal(h.controller.busy,false);assert.equal(h.music.volume,.22);h.controller.dispose();
});
test('当前词结束时最新击杀尚不足300ms，继续等待余下时间再播',()=>{
 const h=setup();h.controller.handle([defeat('a')]);h.advance(300);
 h.controller.handle([defeat('b','banana')]);h.advance(100);h.end();
 assert.equal(h.controller.busy,true);assert.equal(h.drained,0);assert.equal(h.voices.length,1);
 h.advance(199);assert.equal(h.voices.length,1);h.advance(1);assert.equal(h.voices.length,2);
 h.end();assert.equal(h.drained,1);h.controller.dispose();
});
test('暂停冻结待播倒计时，恢复重读当前词；旧回调和销毁后回调无效',()=>{
 const h=setup();h.controller.handle([defeat('a')]);h.advance(300);const oldEnd=h.voices[0].handlers.get('ended')!;
 h.controller.handle([defeat('b','banana')]);h.advance(100);const oldTimer=h.callbacks.at(-1)!;
 h.controller.setActive(false);oldEnd();oldTimer();h.advance(1000);assert.equal(h.drained,0);
 h.controller.setActive(true);assert.equal(h.voices.length,2);oldEnd();assert.equal(h.drained,0);
 h.end();h.advance(199);assert.equal(h.voices.length,2);h.advance(1);assert.equal(h.voices.length,3);
 const finalEnd=h.voices[2].handlers.get('ended')!;h.controller.dispose();finalEnd();
 h.callbacks.forEach(run=>run());h.controller.handle([defeat('c')]);assert.equal(h.voices.length,3);assert.equal(h.drained,0);
 assert.equal(h.timers.size,0);assert.equal(h.music.destroyed,true);
});
test('发音失败可重试，保留当前词和最新待播词，不能提前放行',()=>{
 const h=setup();h.controller.handle([{type:'monsterDamaged',context,tick:1,monsterId:'a',hp:7}]);assert.equal(h.hit.plays,1);
 h.controller.handle([defeat('a')]);h.advance(300);h.voices[0].handlers.get('error')!({errCode:1,errMsg:'error'});
 h.controller.handle([defeat('b','banana'),defeat('c','orange')]);h.advance(300);
 assert.equal(h.controller.view.error,true);assert.equal(h.controller.busy,true);assert.equal(h.drained,0);
 h.controller.retry();assert.equal(h.voices[1].src,'/assets/audio/zombie-apple.mp3');h.end();
 assert.equal(h.voices[2].src,'/assets/audio/zombie-orange.mp3');assert.equal(h.drained,0);
 h.end();assert.equal(h.drained,1);h.controller.dispose();assert.equal(h.hit.destroyed,true);
});
test('超时不丢词；跨波相同怪物编号不被错误去重',()=>{
 const h=setup();h.controller.handle([defeat('a')]);h.advance(15300);assert.equal(h.controller.view.error,true);
 h.controller.retry();h.end();assert.equal(h.drained,1);
 h.controller.handle([{...defeat('a','dog'),context:{...context,combatId:'wave2'}}]);h.advance(300);
 assert.equal(h.voices.at(-1)!.src,'/learning-assets/audio/zombie-dog.mp3');h.end();assert.equal(h.drained,2);h.controller.dispose();
});

test('堡垒受击使用独立音效，重复攻击不重播，暂停不补播，销毁释放',()=>{
 const base=new Channel(); const music=new Channel();
 const controller=createBattleAudio({sessionId:context.sessionId,onChange(){},onDrained(){},createMusicContext:()=>music,createBaseHitContext:()=>base});
 const event:CombatEvent={type:'baseDamaged',context,tick:200,attackId:'a:1',monsterId:'a',hp:4};
 controller.setActive(true);controller.handle([event,event]);
 assert.equal(base.src,'/assets/audio/base-hit.mp3');assert.equal(base.plays,1);
 controller.handle([event]);assert.equal(base.plays,1);
 controller.setActive(false);controller.handle([{...event,attackId:'a:2'}]);controller.setActive(true);assert.equal(base.plays,1);
 controller.handle([{...event,attackId:'a:3'}]);assert.equal(base.plays,2);
 controller.dispose();assert.equal(base.destroyed,true);controller.handle([{...event,attackId:'a:4'}]);assert.equal(base.plays,2);
});

test('金币短音效合并密集调用，暂停和销毁后不播放',()=>{
 const coin=new Channel();const music=new Channel();
 const controller=createBattleAudio({sessionId:context.sessionId,onChange(){},onDrained(){},createMusicContext:()=>music,createCoinContext:()=>coin});
 controller.playCoin();assert.equal(coin.plays,0);
 controller.setActive(true);controller.playCoin();controller.playCoin();assert.equal(coin.plays,1);assert.equal(coin.src,'/assets/audio/coin-collect.mp3');
 controller.setActive(false);controller.playCoin();assert.equal(coin.plays,1);
 controller.dispose();assert.equal(coin.destroyed,true);controller.playCoin();assert.equal(coin.plays,1);
});
test('战斗音量可即时静音并恢复已创建和后续创建的音效，播词不受影响',()=>{
 const h=setup();
 h.controller.handle([{type:'monsterDamaged',context,tick:1,monsterId:'a',hp:7}]);
 h.controller.setVolume(0);
 assert.equal(h.music.volume,0);assert.equal(h.hit.volume,0);
 h.controller.setVolume(.7);
 assert.ok(h.hit.volume>0);
 h.controller.setVolume(0);
 h.controller.handle([{type:'baseDamaged',context,tick:2,attackId:'a:2',monsterId:'a',hp:5}]);
 h.controller.playCoin();
 assert.equal(h.base.volume,0);assert.equal(h.coin.volume,0);
 h.controller.handle([defeat('a')]);h.advance(300);
 assert.equal(h.voices[0].volume,1);
 h.controller.dispose();
});
