import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHomeMusic } from '../miniprogram/services/home-music';
class Music {
  src='';autoplay=false;loop=false;volume=1;obeyMuteSwitch=true;
  plays=0;pauses=0;destroyed=false;
  playHandler=()=>{};pauseHandler=()=>{};errorHandler=()=>{};
  onPlay(f:()=>void){this.playHandler=f;}offPlay(){this.playHandler=()=>{};}
  onPause(f:()=>void){this.pauseHandler=f;}offPause(){this.pauseHandler=()=>{};}
  onError(f:()=>void){this.errorHandler=f;}offError(){this.errorHandler=()=>{};}
  play(){this.plays++;this.playHandler();}pause(){this.pauses++;this.pauseHandler();}
  stop(){}destroy(){this.destroyed=true;}
}
test('首页音乐单通道循环，听词/隐藏暂停，返回恢复，不重复创建或播放',()=>{
  const channels:Music[]=[];
  const music=createHomeMusic({onChange(){},createContext(){const channel=new Music();channels.push(channel);return channel;}});
  music.setActive(true);music.setActive(true);
  assert.equal(channels.length,1);assert.equal(channels[0].plays,1);assert.equal(channels[0].loop,true);
  assert.equal(music.view.status,'playing');assert.equal(channels[0].volume,.22);assert.equal(channels[0].obeyMuteSwitch,true);
  music.setActive(false);assert.equal(music.view.status,'paused');
  music.setActive(true);assert.equal(channels.length,1);assert.equal(channels[0].plays,2);
  music.setEnabled(false);music.setActive(false);music.setActive(true);
  assert.equal(channels[0].plays,2);assert.equal(music.view.enabled,false);
  music.setEnabled(true);assert.equal(channels[0].plays,3);
  music.dispose();assert.equal(channels[0].destroyed,true);music.setActive(false);music.setActive(true);
  assert.equal(channels[0].plays,3);
});
test('延迟播放回调不能在听词期间恢复音乐，错误不会自动重试打断听词',()=>{
  const channels:Music[]=[];const music=createHomeMusic({onChange(){},createContext(){const channel=new Music();channels.push(channel);return channel;}});
  music.setActive(true);const oldPlay=channels[0].playHandler;music.setActive(false);const pauses=channels[0].pauses;
  oldPlay();assert.equal(channels[0].pauses,pauses+1);assert.equal(music.view.status,'paused');
  const oldError=channels[0].errorHandler;oldError();assert.equal(music.view.status,'error');assert.equal(channels[0].destroyed,true);
  music.setActive(true);assert.equal(channels.length,1);
  music.retry();assert.equal(channels.length,2);oldError();oldPlay();assert.equal(music.view.status,'playing');
  music.dispose();assert.equal(channels[1].destroyed,true);
});
test('创建/播放异常不会阻塞首页，销毁时即使停止失败也释放通道',()=>{
  const music=createHomeMusic({onChange(){},createContext(){throw new Error('platform');}});music.setActive(true);
  assert.equal(music.view.status,'error');music.dispose();
  const channel=new Music();channel.stop=()=>{throw new Error('stop');};
  const other=createHomeMusic({onChange(){},createContext:()=>channel});other.setActive(true);other.dispose();assert.equal(channel.destroyed,true);
});
