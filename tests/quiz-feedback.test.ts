import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createQuizFeedback } from '../miniprogram/services/quiz-feedback';
class Channel {
 src='';autoplay=false;loop=false;obeyMuteSwitch=true;plays=0;pauses=0;destroyed=0;
 end=()=>{};error=()=>{};
 onEnded(fn:()=>void){this.end=fn;}offEnded(){this.end=()=>{};}
 onError(fn:()=>void){this.error=fn;}offError(){this.error=()=>{};}
 play(){this.plays++;}pause(){this.pauses++;}stop(){}destroy(){this.destroyed++;}
}
function setup(correct=true){
 const channel=new Channel();let time=0,completed=0;const tasks=new Map<number,{at:number;run:()=>void}>();let id=0;
 const feedback=createQuizFeedback(correct,()=>completed++,{createContext:()=>channel,now:()=>time,schedule(run,delay){const key=++id;tasks.set(key,{at:time+delay,run});return()=>{tasks.delete(key);};}});
 return{channel,feedback,get completed(){return completed;},tick(ms:number){time+=ms;for(const[key,task]of [...tasks])if(task.at<=time){tasks.delete(key);task.run();}}};
}
test('答对先播掌声再播完整女声，结束后自动前进一次',()=>{
 const h=setup();h.feedback.setActive(true);assert.equal(h.channel.src,'/assets/audio/victory-applause.mp3');const late=h.channel.end;h.channel.end();assert.equal(h.channel.src,'/assets/audio/victory-praise.mp3');h.tick(1799);assert.equal(h.completed,0);h.channel.end();h.tick(1);assert.equal(h.completed,1);late();h.feedback.setActive(false);h.feedback.setActive(true);assert.equal(h.completed,1);assert.equal(h.channel.destroyed,1);
});
test('掌声的迟到结束或错误回调不能截断正在播放的女声',()=>{
 const h=setup();h.feedback.setActive(true);
 const applauseEnded=h.channel.end,applauseError=h.channel.error;
 applauseEnded();assert.equal(h.channel.src,'/assets/audio/victory-praise.mp3');
 applauseEnded();applauseError();h.tick(1800);
 assert.equal(h.completed,0);assert.equal(h.channel.destroyed,0);
 h.channel.end();assert.equal(h.completed,1);
});
test('答错鼓励语结束自动前进；后台冻结，返回继续且不重复创建',()=>{
 const h=setup(false);h.feedback.setActive(true);assert.equal(h.channel.src,'/assets/audio/quiz-encouragement.mp3');h.tick(700);h.feedback.setActive(false);h.channel.end();h.tick(20000);assert.equal(h.completed,0);h.feedback.setActive(true);assert.equal(h.completed,1);
});
test('静音或无结束回调有前台超时兜底，暂停不计时，销毁忽略迟到回调',()=>{
 const h=setup();h.feedback.setActive(true);h.tick(1000);h.feedback.setActive(false);h.tick(20000);h.feedback.setActive(true);h.tick(5999);assert.equal(h.completed,0);h.tick(1);assert.equal(h.completed,1);
 const other=setup(false);other.feedback.setActive(true);const late=other.channel.end;other.feedback.dispose();late();other.tick(9000);assert.equal(other.completed,0);assert.equal(other.channel.destroyed,1);
});
test('音频失败仍能进入技能选择',()=>{
 const h=setup(false);h.feedback.setActive(true);h.channel.error();h.tick(600);assert.equal(h.completed,1);
});

test('掌声后女声未结束不提前进入技能选择，后台暂停后续播报',()=>{
 const h=setup();h.feedback.setActive(true);h.channel.end();h.tick(3200);assert.equal(h.completed,0);h.feedback.setActive(false);h.tick(20000);assert.equal(h.completed,0);h.feedback.setActive(true);h.channel.end();assert.equal(h.completed,1);
});
