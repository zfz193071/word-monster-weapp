import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawGuardianRig, guardianMuzzleFlash, guardianRecoil, guardianRig } from '../miniprogram/fortress/guardian-rig';
import { createOpeningEncounter } from '../miniprogram/fortress/opening-encounter';
import { stepCombat } from '../miniprogram/fortress/combat';

// Capture actual Canvas matrices, including reflection and nested save/restore.
type Matrix = [number, number, number, number, number, number];
function recording() {
  let m: Matrix = [1,0,0,1,0,0]; const stack: Matrix[] = [];
  const draws: {args: any[]; matrix: Matrix}[] = [];
  const context = new Proxy({}, {set: () => true, get: (_target, method) => (...args: any[]) => {
    const [a,b,c,d,e,f] = m;
    if (method === 'save') stack.push([...m]);
    if (method === 'restore') m = stack.pop()!;
    if (method === 'translate') m = [a,b,c,d,e+a*args[0]+c*args[1],f+b*args[0]+d*args[1]];
    if (method === 'scale') m = [a*args[0],b*args[0],c*args[1],d*args[1],e,f];
    if (method === 'rotate') { const co=Math.cos(args[0]),si=Math.sin(args[0]); m=[a*co+c*si,b*co+d*si,c*co-a*si,d*co-b*si,e,f]; }
    if (method === 'drawImage') draws.push({args,matrix:[...m]});
  }}) as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
  return {context,draws,stack};
}
function sourcePoint(draw: ReturnType<typeof recording>['draws'][number], x: number, y: number) {
  const [image] = draw.args;
  const [,sx,sy,sw,sh,dx,dy,dw,dh] = draw.args.length === 5
    ? [image,0,0,image.width,image.height,...draw.args.slice(1)] : draw.args;
  const px=dx+(x-sx)/sw*dw,py=dy+(y-sy)/sh*dh,[a,b,c,d,e,f]=draw.matrix;
  return {x:a*px+c*py+e,y:b*px+d*py+f};
}

test('七套关节主角在宽屏两侧瞄准时脚底固定、枪口与真实弹道一致，绘制不写战斗状态', () => {
  // Independent measured muzzle/barrel coordinates in original atlases.
  const points = [[1,1634,103,1514,220],[2,1651,135,1521,243],[3,1690,108,1570,201],
    [4,1660,105,1510,230],[5,1663,135,1531,233],[6,1674,130,1538,235],[7,1660,105,1510,230]];
  for (const [level,mx,my,rx,ry] of points) for (const targetX of [0,40,400,500,600,960,1000]) {
    const opening=createOpeningEncounter('rig-test','apple',0,0,undefined,undefined,[],1,level);
    const fired=stepCombat({...opening,arenaWidth:1000,player:{x:500,y:510},shotRemainingMs:0,
      monsters:[{...opening.monsters[0],status:'alive',spawnAtMs:0,position:{x:targetX,y:448}}]}).state;
    const before=JSON.stringify(fired),h=recording(),image={width:720,height:360} as WechatMiniprogram.Image;
    drawGuardianRig(h.context,image,image,guardianRig(level)!,fired.player,fired.aimDirection!,0,fired.aimFacing);
    assert.equal(h.draws.length,3); assert.equal(h.stack.length,0);
    const foot=sourcePoint(h.draws[0],image.width / 2,image.height * 63 / 68);
    assert.ok(Math.abs(foot.x-500)<1e-8);assert.ok(Math.abs(foot.y-537)<1e-8);
    assert.ok(h.draws[0].matrix[1] === 0,'身体不随瞄准倾斜');assert.ok(h.draws[0].matrix[2] === 0);
    const muzzle=sourcePoint(h.draws[2],mx/1774*720,my/887*360),rear=sourcePoint(h.draws[2],rx/1774*720,ry/887*360);
    const shot=fired.projectiles[0];assert.ok(shot);
    assert.ok(Math.hypot(muzzle.x-shot.position.x,muzzle.y-shot.position.y)<1e-8);
    const length=Math.hypot(muzzle.x-rear.x,muzzle.y-rear.y);
    assert.ok(Math.abs((muzzle.x-rear.x)/length-fired.aimDirection!.x)<1e-8);
    assert.ok(Math.abs((muzzle.y-rear.y)/length-fired.aimDirection!.y)<1e-8);
    assert.equal(JSON.stringify(fired),before);
  }
  assert.equal(guardianRig(0),undefined); assert.equal(guardianRig(8),undefined);
});

test('后坐按正式射击倒计时短促回弹，暂停采样冻结且不改变身体和枪管方向', () => {
  assert.equal(guardianRecoil(0,500,false),0);
  assert.equal(guardianRecoil(490,500,true),0);
  assert.equal(guardianRecoil(470,500,true),2.4);
  assert.ok(guardianRecoil(430,500,true)>0);
  assert.equal(guardianRecoil(380,500,true),0);
  assert.equal(guardianRecoil(470,500,true),guardianRecoil(470,500,true),'同一暂停状态姿态稳定');
  assert.equal(guardianRecoil(Number.NaN,500,true),0);

  const image={width:720,height:360} as WechatMiniprogram.Image, rig=guardianRig(1)!;
  for (const direction of [{x:-.8,y:-.6},{x:0,y:-1},{x:.8,y:-.6}]) {
    const rest=recording(),kick=recording();
    drawGuardianRig(rest.context,image,image,rig,{x:180,y:510},direction,0);
    drawGuardianRig(kick.context,image,image,rig,{x:180,y:510},direction,2.4);
    const restFoot=sourcePoint(rest.draws[0],image.width / 2,image.height * 63 / 68);
    const kickFoot=sourcePoint(kick.draws[0],image.width / 2,image.height * 63 / 68);
    assert.deepEqual(kickFoot,restFoot); assert.deepEqual(kick.draws[0].matrix,rest.draws[0].matrix);
    const restMuzzle=sourcePoint(rest.draws[2],rig.muzzle.x/1774*720,rig.muzzle.y/887*360);
    const kickMuzzle=sourcePoint(kick.draws[2],rig.muzzle.x/1774*720,rig.muzzle.y/887*360);
    assert.ok(Math.abs((kickMuzzle.x-restMuzzle.x)+direction.x*2.4)<1e-8);
    assert.ok(Math.abs((kickMuzzle.y-restMuzzle.y)+direction.y*2.4)<1e-8);
    const restRear=sourcePoint(rest.draws[2],rig.barrelRear.x/1774*720,rig.barrelRear.y/887*360);
    const kickRear=sourcePoint(kick.draws[2],rig.barrelRear.x/1774*720,rig.barrelRear.y/887*360);
    assert.ok(Math.abs((kickMuzzle.x-kickRear.x)-(restMuzzle.x-restRear.x))<1e-8);
    assert.ok(Math.abs((kickMuzzle.y-kickRear.y)-(restMuzzle.y-restRear.y))<1e-8);
  }
});

test('枪口火光只在真实首发后的50ms内显示，暂停采样不产生新粒子状态', () => {
  assert.equal(guardianMuzzleFlash(0,500,false),0);
  assert.equal(guardianMuzzleFlash(500,500,true),1);
  assert.equal(guardianMuzzleFlash(490,500,true),1);
  assert.equal(guardianMuzzleFlash(470,500,true),.5);
  assert.equal(guardianMuzzleFlash(450,500,true),0);
  assert.equal(guardianMuzzleFlash(470,500,true),guardianMuzzleFlash(470,500,true));
  assert.equal(guardianMuzzleFlash(Number.NaN,500,true),0);
});

 test('左右瞄准时身体和持枪手臂完整镜像，避免手臂横穿后背', () => {
  const image={width:720,height:360} as WechatMiniprogram.Image;
  for(let level=1;level<=7;level++) for(const x of [.2,.5,.9]) {
    const right=recording(),left=recording(),rig=guardianRig(level)!;
    drawGuardianRig(right.context,image,image,rig,{x:0,y:0},{x,y:-Math.sqrt(1-x*x)});
    drawGuardianRig(left.context,image,image,rig,{x:0,y:0},{x:-x,y:-Math.sqrt(1-x*x)});
    for(const p of [rig.muzzle,rig.elbow,rig.barrelRear]) {
      const r=sourcePoint(right.draws[2],p.x/1774*720,p.y/887*360);
      const l=sourcePoint(left.draws[2],p.x/1774*720,p.y/887*360);
      assert.ok(Math.abs(r.x+l.x)<1e-8,'手臂随脸部朝向完整镜像');
      assert.ok(Math.abs(r.y-l.y)<1e-8);
    }
  }
});

test('近中线目标按目标所在侧决定脸部朝向，不受枪口侧偏影响而反复翻面', () => {
  const opening=createOpeningEncounter('facing','apple',0);
  for(const offset of [-1,0,1]) {
    const state=stepCombat({...opening,shotRemainingMs:0,monsters:[{...opening.monsters[0],
      status:'alive',spawnAtMs:0,position:{x:opening.player.x+offset,y:250}}]}).state;
    assert.equal(state.aimFacing,offset<0?-1:1);
    assert.equal(stepCombat(state).state.aimFacing,state.aimFacing);
    const shot=state.projectiles[0],d=state.aimDirection!,target=state.monsters[0].position;
    assert.ok(Math.abs((target.x-shot.position.x)*d.y-(target.y-shot.position.y)*d.x)<1e-8);
  }
});
