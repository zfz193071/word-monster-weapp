import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createQuizFeedback } from '../miniprogram/services/quiz-feedback';

class Channel {
  src='';autoplay=false;loop=false;obeyMuteSwitch=true;volume=1;plays=0;pauses=0;destroyed=0;
  end=()=>{};error=()=>{};
  onEnded(fn:()=>void){this.end=fn;}offEnded(fn:()=>void){if(this.end===fn)this.end=()=>{};}
  onError(fn:()=>void){this.error=fn;}offError(fn:()=>void){if(this.error===fn)this.error=()=>{};}
  play(){this.plays++;}pause(){this.pauses++;}stop(){}destroy(){this.destroyed++;}
}
function setup(correct=true){
  const channels:Channel[]=[];let time=0,completed=0;const tasks=new Map<number,{at:number;run:()=>void}>();let id=0;
  const feedback=createQuizFeedback(correct,()=>completed++,{createContext(){const channel=new Channel();channels.push(channel);return channel;},now:()=>time,schedule(run,delay){const key=++id;tasks.set(key,{at:time+delay,run});return()=>{tasks.delete(key);};}});
  return{channels,feedback,get completed(){return completed;},tick(ms:number){time+=ms;for(const[key,task]of [...tasks])if(task.at<=time){tasks.delete(key);task.run();}}};
}

test('答对时掌声与双语女声同阶段开始，掌声结束不提前进入技能选择',()=>{
  const h=setup();h.feedback.setVolume(.22);h.feedback.setActive(true);
  assert.equal(h.channels.length,2);
  const [voice,applause]=h.channels;
  assert.equal(voice.src,'/assets/audio/quiz-praise-bilingual.mp3');
  assert.equal(applause.src,'/assets/audio/victory-applause.mp3');
  assert.equal(voice.plays,1);assert.equal(applause.plays,1);
  applause.end();h.tick(1800);assert.equal(h.completed,0);
  voice.end();assert.equal(h.completed,1);
  assert.equal(voice.destroyed,1);assert.equal(applause.destroyed,1);
});

test('女声持续超过最短鲜花时间仍等待自然结束，暂停与迟到回调不截断',()=>{
  const h=setup();h.feedback.setActive(true);const voice=h.channels[0];const oldEnd=voice.end;
  h.tick(1000);h.feedback.setActive(false);oldEnd();h.tick(20000);assert.equal(h.completed,0);
  h.feedback.setActive(true);oldEnd();h.tick(3500);assert.equal(h.completed,0);
  assert.equal(voice.plays,2);assert.equal(h.channels[1].plays,2);
  voice.end();assert.equal(h.completed,1);
});

test('战斗音量仅调掌声，双语女声保持原音量',()=>{
  const h=setup();h.feedback.setVolume(0);h.feedback.setActive(true);
  const [voice,applause]=h.channels;assert.equal(applause.volume,0);assert.equal(voice.volume,1);
  h.feedback.setVolume(.7);assert.equal(applause.volume,.7);assert.equal(voice.volume,1);
  h.feedback.dispose();assert.equal(voice.destroyed,1);assert.equal(applause.destroyed,1);
});

test('答错只播放原鼓励语，音频错误与后台超时仍能继续',()=>{
  const wrong=setup(false);wrong.feedback.setActive(true);
  assert.equal(wrong.channels.length,1);assert.equal(wrong.channels[0].src,'/assets/audio/quiz-encouragement.mp3');
  wrong.channels[0].error();wrong.tick(600);assert.equal(wrong.completed,1);
  const stalled=setup();stalled.feedback.setActive(true);stalled.tick(1000);stalled.feedback.setActive(false);stalled.tick(20000);assert.equal(stalled.completed,0);
  stalled.feedback.setActive(true);stalled.tick(10999);assert.equal(stalled.completed,0);stalled.tick(1);assert.equal(stalled.completed,1);
});

test('退出后迟到音频回调不重复前进',()=>{
  const h=setup();h.feedback.setActive(true);const lateVoice=h.channels[0].end,lateApplause=h.channels[1].end;
  h.feedback.dispose();lateVoice();lateApplause();h.tick(20000);h.feedback.setActive(true);
  assert.equal(h.completed,0);assert.equal(h.channels.length,2);
});
