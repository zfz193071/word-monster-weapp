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
