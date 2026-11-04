import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { RoomOrbit } from '../miniprogram/home/room-orbit';

test('首页弹窗保留已绘制画布，暂停/恢复不重建，旋转与后台手势正确取消',()=>{
 let definition:any;const scenes:Scene[]=[];let taps=0;const coverEvents:boolean[]=[];
 class Scene {
  angle:number;active=false;disposed=false;
  constructor(_canvas:unknown,_w:number,_h:number,_dpr:number,yaw:number){this.angle=yaw;scenes.push(this);}
  hitHero(x:number,y:number){return x===100&&y===100;}
  setWeaponLevel(_value:number){}
  setGuide(){}
  setPet(){} hitPet(){return false;}
  setYaw(value:number){this.angle=value;}setActive(value:boolean){this.active=value;}dispose(){this.disposed=true;}capture(){return 'frame';}
 }
 const source=readFileSync(new URL('../miniprogram/components/home-scene/home-scene.ts',import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports:{},Component(value:any){definition=value;},wx:{getWindowInfo:()=>({pixelRatio:2}),nextTick:(fn:Function)=>fn()},
  require:(path:string)=>path.endsWith('room-orbit')?{RoomOrbit}:{HomeRoomScene:Scene},
 });
 const host:any={triggerEvent(name:string,detail?:{ready:boolean}){if(name==='coverchange'){coverEvents.push(detail!.ready);return;}assert.equal(name,'herotap');taps++;},properties:{paused:false,covered:false},data:{},setData(patch:any,done?:()=>void){Object.assign(this.data,patch);done?.();},createSelectorQuery:()=>({select:()=>({fields:(_fields:any,fn:Function)=>({exec:()=>fn({node:{},width:360,height:400})})})})};
 for(const [key,method] of Object.entries(definition.methods))host[key]=(method as Function).bind(host);
 definition.lifetimes.attached.call(host);definition.lifetimes.ready.call(host);
 const gesture=(x:number,y=100)=>({touches:[{identifier:1,clientX:x,clientY:y}]});
 const end=(x:number,y=100)=>host.touchEnd({changedTouches:[{identifier:1,clientX:x,clientY:y}]});
 host.touchStart(gesture(100));end(100);assert.equal(taps,1);
 host.touchStart(gesture(100));host.touchMove(gesture(100,110));end(100);assert.equal(taps,1,'竖向拖动返回原点也不能误触');
 host.touchStart(gesture(100));host.touchMove(gesture(110));host.touchMove(gesture(100));end(100);assert.equal(taps,1,'横向拖动返回原点也不能误触');
 host.touchStart(gesture(100));host.touchCancel();end(100);assert.equal(taps,1);
 host.touchStart(gesture(0));end(0);assert.equal(taps,1,'房间空白不触发');
 host.touchStart(gesture(0));host.touchMove(gesture(180));assert.equal(scenes[0].angle,Math.PI/2);
 host.properties.covered=true;host.synchronize();assert.equal(scenes[0].disposed,false,'弹窗不能销毁当前房屋画布');assert.equal(scenes[0].active,false);
 const firstCapture=host.data.frozenFrames[0].id;
 assert.notEqual(host.data.canvasCovered,true,'截图加载前保留原画布，避免空白');
 assert.ok(!coverEvents.includes(true),'隐藏原生画布前不能通知页面显示卡片');
 const setData=host.setData.bind(host);let committed:()=>void=()=>{};
 host.setData=(patch:any,done?:()=>void)=>{setData(patch);if(done)committed=done;};
 host.frozenReady({currentTarget:{dataset:{captureId:firstCapture}}});assert.equal(host.data.canvasCovered,true);
 assert.ok(!coverEvents.includes(true),'等待隐藏画布的setData提交后才能显示卡片');
 committed();host.setData=setData;
 assert.equal(coverEvents.at(-1),true,'原生画布隐藏后通知页面显示卡片');
 host.touchStart(gesture(100));end(100);assert.equal(taps,1,'弹窗覆盖时不能穿透点击主角');
 definition.pageLifetimes.hide.call(host);definition.pageLifetimes.show.call(host);assert.equal(scenes[0].active,false,'返回前台不能恢复被弹窗暂停的动画');
 host.touchMove(gesture(360));host.properties.covered=false;host.synchronize();assert.equal(scenes.length,1,'关闭弹窗复用原场景，不能等待重建');assert.equal(scenes[0].active,true);assert.equal(scenes[0].angle,Math.PI/2);
 assert.equal(host.data.canvasCovered,false);assert.equal(host.data.frozenFrames[0].src,'frame','关闭后保留截图，覆盖原生画布恢复显示前的间隙');
 host.frozenReady({currentTarget:{dataset:{captureId:firstCapture}}});assert.equal(host.data.canvasCovered,false,'关闭后迟到的图片回调不能隐藏房屋');
 host.touchMove(gesture(360));assert.equal(scenes[0].angle,Math.PI/2,'旧手势不能恢复');
 for(let i=0;i<5;i++){
  host.properties.covered=true;host.synchronize();assert.equal(scenes[0].active,false);
  host.frozenReady({currentTarget:{dataset:{captureId:firstCapture}}});assert.equal(host.data.canvasCovered,false,'旧截图回调不能提前切换新截图');
  host.frozenReady({currentTarget:{dataset:{captureId:host.data.frozenFrames[0].id}}});assert.equal(host.data.canvasCovered,true);
  host.properties.covered=false;host.synchronize();assert.equal(scenes[0].active,true);
 }
 assert.equal(scenes.length,1,'连续开关弹窗仍保留原场景');
 scenes[0].capture=()=>'';host.properties.covered=true;host.synchronize();
 assert.equal(host.data.canvasCovered,true,'截图失败也必须隐藏原生层，避免卡片永久等待');
 assert.equal(coverEvents.at(-1),true);host.properties.covered=false;host.synchronize();
 const eventCount=coverEvents.length;committed();assert.equal(coverEvents.length,eventCount,'关闭后迟到的隐藏提交不再通知显示卡片');
 host.touchStart(gesture(0));definition.pageLifetimes.hide.call(host);host.touchMove(gesture(180));assert.equal(scenes[0].angle,Math.PI/2);assert.equal(scenes[0].active,false);
 definition.pageLifetimes.show.call(host);host.touchMove(gesture(360));assert.equal(scenes[0].angle,Math.PI/2);
 host.touchStart(gesture(0));host.touchMove(gesture(180));assert.equal(scenes[0].angle,Math.PI);
 definition.pageLifetimes.resize.call(host);assert.equal(scenes[1].angle,Math.PI);assert(scenes[0].disposed);
 host.properties.paused=true;host.synchronize();host.touchStart(gesture(0));host.touchMove(gesture(180));assert.equal(scenes[1].angle,Math.PI);
 definition.lifetimes.detached.call(host);host.touchMove(gesture(360));assert(scenes[1].disposed);
});
