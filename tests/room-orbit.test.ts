import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomOrbit } from '../miniprogram/home/room-orbit';
import { projectRoomPoint } from '../miniprogram/home/room-scene';
const touch=(clientX:number,identifier=1)=>({clientX,identifier});
test('左右拖动可完整环绕并反向返回，俯仰与高度投影不变',()=>{
 const orbit=new RoomOrbit();orbit.start([touch(0)]);assert.equal(orbit.move([touch(4)],360),false);
 orbit.move([touch(180)],360);assert.equal(orbit.yaw,Math.PI/2);orbit.move([touch(720)],360);assert.equal(orbit.yaw,0);
 orbit.move([touch(-180)],360);assert.equal(orbit.yaw,Math.PI*1.5);
 for(let i=0;i<8;i++){
  const yaw=i*Math.PI/4;const low=projectRoomPoint([1,0,2],yaw),high=projectRoomPoint([1,2,2],yaw);
  assert.equal(high.x,low.x);assert(Math.abs(high.y-low.y+1.732)<1e-9);
 }
 const original=projectRoomPoint([2,1,-1]);const rotated=projectRoomPoint([2,1,-1],Math.PI*2);
 assert(Math.abs(original.x-rotated.x)<1e-9);assert(Math.abs(original.y-rotated.y)<1e-9);
});
test('首指独占、取消与结束后不能继续旋转，新手势从已有角度开始',()=>{
 const orbit=new RoomOrbit();orbit.start([touch(100)]);orbit.start([touch(0,2)]);
 assert.equal(orbit.move([touch(200,2)],360),false);orbit.move([touch(280)],360);const angle=orbit.yaw;
 orbit.end([touch(200,2)]);orbit.move([touch(460)],360);assert.notEqual(orbit.yaw,angle);
 orbit.cancel();const paused=orbit.yaw;assert.equal(orbit.move([touch(700)],360),false);assert.equal(orbit.yaw,paused);
 orbit.start([touch(50,3)]);orbit.move([touch(230,3)],360);assert.equal(orbit.yaw,(paused+Math.PI/2)%(Math.PI*2));
 orbit.end([touch(230,3)]);assert.equal(orbit.move([touch(400,3)],360),false);
 assert.equal(orbit.move([touch(NaN)],0),false);
});

test('房屋阴影随视角投影改变，完整一周后回到相同轮廓',async()=>{
 const {roomShadowPolygon}=await import('../miniprogram/home/room-scene');
 const first=roomShadowPolygon(0),side=roomShadowPolygon(Math.PI/2),full=roomShadowPolygon(Math.PI*2);
 assert(first.length>=3);assert.notDeepEqual(first,side);assert.equal(first.length,full.length);
 for(let i=0;i<first.length;i++)for(let axis=0;axis<2;axis++)assert(Math.abs(first[i][axis]-full[i][axis])<1e-8);
 for(let yaw=0;yaw<Math.PI*2;yaw+=.1)assert(roomShadowPolygon(yaw).every(p=>p.every(Number.isFinite)));
});
