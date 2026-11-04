import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVictoryAudio } from '../miniprogram/services/victory-audio';
class Channel {
 src='';autoplay=false;loop=false;obeyMuteSwitch=true;plays=0;pauses=0;stops=0;destroyed=0;throwOnPause=false;throwOnStop=false;
 end=()=>{};error=()=>{};
 onEnded(fn:()=>void){this.end=fn;}offEnded(){this.end=()=>{};}
 onError(fn:()=>void){this.error=fn;}offError(){this.error=()=>{};}
 play(){this.plays++;}pause(){this.pauses++;if(this.throwOnPause)throw Error('pause');}
 stop(){this.stops++;if(this.throwOnStop)throw Error('stop');}destroy(){this.destroyed++;}
}
test('掌声、欢呼后播放鼓励语；暂停恢复原通道，完整结束后不重播',()=>{
 const channel=new Channel();let created=0;const audio=createVictoryAudio(()=>{created++;return channel;});
 audio.setActive(false);assert.equal(created,0);audio.setActive(true);audio.setActive(true);assert.equal(channel.plays,1);assert.equal(channel.src,'/assets/audio/victory-applause.mp3');
 const ended=channel.end;audio.setActive(false);assert.equal(channel.pauses,1);assert.equal(channel.destroyed,0);
 audio.setActive(true);assert.equal(channel.plays,2);assert.equal(created,1);assert.equal(channel.src,'/assets/audio/victory-applause.mp3');
 ended();assert.equal(channel.destroyed,0);assert.equal(channel.src,'/assets/audio/victory-cheer.mp3');assert.equal(channel.plays,3);
 audio.setActive(false);audio.setActive(true);assert.equal(channel.src,'/assets/audio/victory-cheer.mp3');assert.equal(channel.plays,4);
 channel.end();assert.equal(channel.src,'/assets/audio/victory-praise.mp3');assert.equal(channel.plays,5);
 const praiseEnded=channel.end;praiseEnded();assert.equal(channel.destroyed,1);audio.setActive(false);audio.setActive(true);assert.equal(channel.plays,5);
 audio.dispose();audio.dispose();praiseEnded();assert.equal(channel.destroyed,1);
 const other=new Channel();const disposed=createVictoryAudio(()=>other);disposed.setActive(true);const stale=other.end;disposed.dispose();stale();disposed.setActive(true);assert.equal(other.plays,1);assert.equal(other.destroyed,1);
});
test('音频平台异常也释放通道，不影响已完成结算或产生重复播放',()=>{
 const channel=new Channel();channel.throwOnPause=true;channel.throwOnStop=true;
 const audio=createVictoryAudio(()=>channel);audio.setActive(true);audio.setActive(false);assert.equal(channel.destroyed,1);
 audio.setActive(true);assert.equal(channel.plays,1);audio.dispose();assert.equal(channel.destroyed,1);
 const failed=new Channel();const second=createVictoryAudio(()=>failed);second.setActive(true);failed.error();assert.equal(failed.destroyed,0);assert.equal(failed.src,'/assets/audio/victory-cheer.mp3');assert.equal(failed.plays,2);failed.error();assert.equal(failed.src,'/assets/audio/victory-praise.mp3');failed.error();assert.equal(failed.destroyed,1);second.setActive(false);second.setActive(true);assert.equal(failed.plays,3);
});
