import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawSoldier } from '../miniprogram/fortress/soldier-art';
import type { SupportSoldierState } from '../miniprogram/fortress/types';

test('士兵武器常驻，真实射击才画弹道；暂停冻结、过期及跨轮不重播', () => {
  const commands: unknown[][] = [];
  const context = new Proxy({}, {get: (_, name) => (...args: unknown[]) => commands.push([name, ...args]), set: () => true});
  const soldier: SupportSoldierState = {id:'soldier', slot:0, hp:30, maxHp:30, position:{x:150,y:530}, attackRemainingMs:2000};
  const draw = (state: SupportSoldierState, tick: number, combatId = 'battle') => {
    commands.length = 0;
    drawSoldier(context as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D, state, tick, combatId);
    return commands.map(command => [...command]);
  };
  const idle = draw(soldier, 0);
  assert.ok(idle.some(c => c[0] === 'fillRect' && c[1] === 5 && c[2] === -29), '未开火也装备枪管');
  assert.ok(!idle.some(c => c[0] === 'lineTo'));
  const fired = {...soldier, lastShotTick:200, shotCombatId:'battle', shotTarget:{x:180,y:200}};
  const shooting = draw(fired, 200);
  assert.ok(shooting.some(c => c[0] === 'lineTo' && c[1] === 30 && c[2] === -330));
  assert.deepEqual(draw(fired, 200), shooting, '暂停后使用同一tick，画面保持');
  assert.ok(!draw(fired, 216).some(c => c[0] === 'lineTo'));
  assert.ok(!draw(fired, 200, 'next-wave').some(c => c[0] === 'lineTo'));
});


test('图片兵种使用真实射击与战斗时钟，暂停保持悬停和后坐一致', () => {
  const commands: unknown[][] = [];
  const context = new Proxy({}, {get: (_, name) => (...args: unknown[]) => commands.push([name, ...args]), set: () => true});
  const image = {} as WechatMiniprogram.Image;
  const soldier: SupportSoldierState = {id:'jet',slot:0,soldierType:'jetpack',hp:30,maxHp:30,position:{x:100,y:400},attackRemainingMs:0,lastShotTick:200,shotCombatId:'battle',shotTarget:{x:100,y:100}};
  const draw = (tick: number, combatId='battle') => {commands.length=0;drawSoldier(context as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,soldier,tick,combatId,image);return commands.map(c=>[...c]);};
  const fired=draw(200);assert.ok(fired.some(c=>c[0]==='drawImage'&&c[1]===image));
  assert.ok(fired.some(c=>c[0]==='lineTo'&&c[1]===0&&c[2]===-300));
  assert.deepEqual(draw(200),fired);
  assert.ok(!draw(216).some(c=>c[0]==='lineTo'&&c[2]===-300));
  assert.ok(!draw(200,'next').some(c=>c[0]==='lineTo'&&c[2]===-300));
});

test('图片枪口、闪光与弹道共用后坐和悬停后的坐标，旋转后仍相接', () => {
  for (const [type, px, py] of [['rifle',64,9],['flamethrower',64,6],['rocket',72,8],['jetpack',64,6],['tank',64,5]] as const) {
    for (const [dx,dy] of [[0,-200],[200,0],[-160,-120],[0,200]]) for(const tick of [200,207]) {
      let matrix=[1,0,0,1,0,0], style=''; const stack:number[][]=[];
      let path:number[][]=[], imageOrigin:number[]=[]; const flashes:number[][][]=[],traces:number[][][]=[];
      const point=(x:number,y:number)=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
      const image={} as WechatMiniprogram.Image;
      const methods={
        save(){stack.push([...matrix]);},restore(){matrix=stack.pop()!;},
        translate(x:number,y:number){const p=point(x,y);matrix[4]=p[0];matrix[5]=p[1];},
        rotate(a:number){const [m0,m1,m2,m3]=matrix,c=Math.cos(a),s=Math.sin(a);matrix[0]=m0*c+m2*s;matrix[1]=m1*c+m3*s;matrix[2]=m2*c-m0*s;matrix[3]=m3*c-m1*s;},
        drawImage(_image:unknown,x:number,y:number,w:number,h:number){imageOrigin=point(x+w*px/128,y+h*py/128);},
        beginPath(){path=[];},moveTo(x:number,y:number){path.push(point(x,y));},lineTo(x:number,y:number){path.push(point(x,y));},
        fill(){if(style==='#fff0a8')flashes.push(path);},stroke(){if(path.length===2)traces.push(path);},
      };
      const context=new Proxy(methods,{get:(target,name)=>target[name as keyof typeof methods]??(()=>{}),set:(_target,name,value)=>{if(name==='fillStyle')style=value;return true;}});
      drawSoldier(context as unknown as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
        {id:type,slot:0,soldierType:type,hp:30,maxHp:30,position:{x:150,y:400},attackRemainingMs:0,lastShotTick:200,shotCombatId:'battle',shotTarget:{x:150+dx,y:400+dy}},tick,'battle',image);
      const trace=traces.at(-1)!;
      assert.ok(trace,`${type}: committed shot has a trace`);
      assert.ok(Math.hypot(trace[0][0]-imageOrigin[0],trace[0][1]-imageOrigin[1])<1e-8,`${type}: trace starts at rendered muzzle`);
      assert.deepEqual(trace[1],[150+dx,400+dy]);
      const flash=flashes[0];
      const base=[(flash[1][0]+flash[2][0])/2,(flash[1][1]+flash[2][1])/2];
      assert.ok(Math.hypot(base[0]-imageOrigin[0],base[1]-imageOrigin[1])<1e-8,`${type}: flash base touches muzzle`);
    }
  }
});

test('六类图片攻击平滑回弹，闪光弹道渐退且不修改战斗状态', () => {
  for (const soldierType of ['rifle','shield','flamethrower','rocket','jetpack','tank'] as const) {
    const soldier: SupportSoldierState = {id:soldierType,slot:0,soldierType,hp:30,maxHp:30,position:{x:100,y:400},attackRemainingMs:0,lastShotTick:200,shotCombatId:'battle',shotTarget:{x:100,y:100}};
    const before=structuredClone(soldier);
    const sample=(tick:number,active:boolean) => {
      let alpha=1,y=0;const saved:number[]=[],effectAlpha:number[]=[];
      const methods={save(){saved.push(alpha);},restore(){alpha=saved.pop()!;},drawImage(_image:unknown,_x:number,imageY:number){y=imageY;},stroke(){effectAlpha.push(alpha);}};
      const context=new Proxy(methods,{get:(target,name)=>name==='globalAlpha'?alpha:target[name as keyof typeof methods]??(()=>{}),set:(_,name,value)=>{if(name==='globalAlpha')alpha=value;return true;}});
      drawSoldier(context as unknown as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,soldier,tick,active?'battle':'other',{} as WechatMiniprogram.Image);
      assert.equal(alpha,1,'effects restore caller opacity');
      return {y,effectAlpha};
    };
    let previous=Infinity;
    for(let tick=200;tick<216;tick++) {
      const active=sample(tick,true),idle=sample(tick,false),offset=active.y-idle.y;
      assert.ok(offset>0 && offset<previous,'each frame returns toward the resting pose, including hovering units');
      assert.ok(active.effectAlpha[0]>0 && active.effectAlpha[0]<=1);
      if(tick>200)assert.ok(active.effectAlpha[0]<sample(tick-1,true).effectAlpha[0]);
      assert.deepEqual(sample(tick,true),active,'paused tick freezes motion');
      previous=offset;
    }
    assert.deepEqual(sample(216,true),sample(216,false),'expiry returns to the exact idle pose');
    assert.deepEqual(soldier,before);
  }
});
