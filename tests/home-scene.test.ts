import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HomeRoomScene, homeHeroPose, projectRoomPoint } from '../miniprogram/home/room-scene';

test('房间使用三维坐标投影，角色扭动有界且随时间变化',()=>{
  const center=projectRoomPoint([0,0,0]);const high=projectRoomPoint([0,2,0]);
  assert.ok(high.y<center.y);assert.ok(projectRoomPoint([1,0,0]).x>center.x);assert.ok(projectRoomPoint([0,0,1]).x<center.x);
  const first=homeHeroPose(0);assert.notDeepEqual(homeHeroPose(1),first);
  for(let i=0;i<1000;i++){const pose=homeHeroPose(i/10);assert.ok(pose.yaw>=.05&&pose.yaw<=.31);assert.ok(Math.abs(pose.lift)<=.018);}
});
test('场景单帧循环，覆盖/隐藏停止动画，迟到旧帧不能复活或创建重复循环',()=>{
  let sequence=0;let draws=0;const frames=new Map<number,(time:number)=>void>();
  const context=new Proxy({}, {get(_target,key){if(key==='clearRect')return ()=>draws++;return ()=>{};},set(){return true;}});
  const canvas={width:0,height:0,getContext:()=>context,requestAnimationFrame(callback:(time:number)=>void){const id=++sequence;frames.set(id,callback);return id;},cancelAnimationFrame(id:number){frames.delete(id);},toDataURL:()=> 'data:image/png;base64,frame'};
  const scene=new HomeRoomScene(canvas as unknown as WechatMiniprogram.Canvas,360,400,3);
  assert.equal(canvas.width,720);scene.setActive(true);scene.setActive(true);assert.equal(frames.size,1);
  const stale=[...frames.values()][0];scene.setActive(false);assert.equal(frames.size,0);
  const count=draws;stale(100);assert.equal(draws,count);scene.setActive(true);stale(200);assert.equal(frames.size,1);
  scene.dispose();assert.equal(frames.size,0);stale(300);assert.equal(draws,count);
});

test('角色和枪的命中跟随投影，墙壁遮挡后不能隔墙点击',()=>{
 const context=new Proxy({}, {get(){return ()=>{};},set(){return true;}});
 const canvas={getContext:()=>context};
 const scene=new HomeRoomScene(canvas as unknown as WechatMiniprogram.Canvas,480,550,1);
 const pixel=(point:readonly [number,number,number],yaw:number)=>{const p=projectRoomPoint(point,yaw);return [240+p.x*50,308+p.y*50] as const;};
 // Front view: torso and the shoulder rifle are independently clickable.
 const pose=homeHeroPose(0),cos=Math.cos(pose.yaw),sin=Math.sin(pose.yaw);
 const world=(x:number,y:number,z:number):readonly [number,number,number]=>[x*cos+z*sin-.5,y,-x*sin+z*cos+1.1];
 assert(scene.hitHero(...pixel(world(0,1,.30),0)));
 assert(scene.hitHero(...pixel(world(.5,1.75,.2),0)));
 assert.equal(scene.hitHero(20,20),false);
 scene.setYaw(Math.PI);assert.equal(scene.hitHero(...pixel(world(0,1,.30),Math.PI)),false);
 scene.setYaw(Math.PI*1.5);assert(scene.hitHero(...pixel(world(0,1,.30),Math.PI*1.5)));
 scene.setWeaponLevel(7);scene.setYaw(0);assert(scene.hitHero(...pixel(world(.5,1.75,.2),0)));
 scene.dispose();assert.equal(scene.hitHero(...pixel(world(0,1,.30),0)),false);
});

test('恢复首帧绘制后才移除占位截图，暂停取消过期切换回调',()=>{
 let frame:((time:number)=>void)|undefined;let draws=0;let switches=0;
 const context=new Proxy({}, {get(_target,key){return key==='clearRect'?()=>draws++:()=>{};},set(){return true;}});
 const canvas={getContext:()=>context,requestAnimationFrame(fn:(time:number)=>void){frame=fn;return 1;},cancelAnimationFrame(){frame=undefined;}};
 const scene=new HomeRoomScene(canvas as unknown as WechatMiniprogram.Canvas,360,400,2);
 const before=draws;scene.setActive(true,()=>{assert.ok(draws>before);switches++;});
 assert.equal(switches,0);frame!(0);assert.equal(switches,1);frame!(40);assert.equal(switches,1);
 scene.setActive(false);scene.setActive(true,()=>switches++);const stale=frame!;scene.setActive(false);stale(80);assert.equal(switches,1);
 scene.dispose();
});

test('小雷狐成长和装扮参与原房间深度绘制，宠物点击与主角区分且隐藏后不可点击',()=>{
 const context=new Proxy({}, {get(){return ()=>{};},set(){return true;}});
 const scene=new HomeRoomScene({getContext:()=>context} as unknown as WechatMiniprogram.Canvas,480,550,1);
 const pixel=(point:readonly [number,number,number])=>{const p=projectRoomPoint(point,0);return [240+p.x*50,308+p.y*50] as const;};
 for(const level of [1,4,7,10]){
   scene.setPet({level,equipped:level>=7?['collar','hat','charm']:[]});
   const scale=level>=7?1:level>=4?.85:.68;
   const point=pixel([.85,.9*scale,1.45+.4*scale]);
   assert.equal(scene.hitPet(...point),true);assert.equal(scene.hitHero(...point),false);
 }
 scene.setPet(null);assert.equal(scene.hitPet(...pixel([.85,.9,1.85])),false);
 scene.dispose();
});
