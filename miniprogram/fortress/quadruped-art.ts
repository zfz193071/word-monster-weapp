import { drawCatRun, articulatedJoint } from './cat-run-art';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
type RunStyle = 'gallop' | 'bound' | 'heavy';
interface AnimalShape {
  color: string; dark: string; length: number; width: number; leg: number;
  head: number; style: RunStyle; stride: number;
}
/** Proportions and contact order belong to the animal, not a generic humanoid rig. */
export const QUADRUPED_SHAPES: Readonly<Record<string, AnimalShape>> = {
  bear: {color:'#9b704b', dark:'#674d38', length:18,width:12,leg:10,head:9,style:'bound',stride:28},
  cat: {color:'#77859a', dark:'#46566e', length:18,width:8,leg:12,head:7,style:'gallop',stride:20},
  cow: {color:'#e5e0cb', dark:'#60665e', length:20,width:11,leg:13,head:8,style:'gallop',stride:30},
  dog: {color:'#b99770', dark:'#765e4c', length:18,width:9,leg:12,head:8,style:'gallop',stride:26},
  elephant: {color:'#87a9a8', dark:'#577c7d', length:21,width:13,leg:11,head:10,style:'heavy',stride:16},
  horse: {color:'#ad7657', dark:'#624936', length:20,width:9,leg:16,head:7,style:'gallop',stride:34},
  lion: {color:'#d2aa52', dark:'#a6733e', length:20,width:10,leg:12,head:8,style:'gallop',stride:30},
  panda: {color:'#e1e2d2', dark:'#405149', length:18,width:12,leg:10,head:9,style:'bound',stride:28},
  rabbit: {color:'#b8a9ca', dark:'#887b99', length:15,width:9,leg:10,head:7,style:'bound',stride:24},
  sheep: {color:'#e5e4cc', dark:'#937965', length:18,width:11,leg:12,head:7,style:'gallop',stride:28},
  tiger: {color:'#de9749', dark:'#584a36', length:20,width:10,leg:12,head:8,style:'gallop',stride:30},
};

export const QUADRUPED_DEPTH = .62;
/** The approved cat's planted-foot / smooth recovery model, with species contact order. */
export function quadrupedPose(id: string, distance: number, seed: number) {
  const shape = QUADRUPED_SHAPES[id];
  const phase = distance / shape.stride + seed / 97;
  const offsets = shape.style === 'bound' ? [0,.04,.48,.52]
    : shape.style === 'heavy' ? [0,.5,.25,.75] : [0,.1,.49,.59];
  const stance = shape.style === 'heavy' ? .64 : shape.style === 'bound' ? .3 : .27;
  const reach = shape.stride * stance / QUADRUPED_DEPTH / 2;
  const feet = offsets.map((offset, index) => {
    const p = ((phase + offset) % 1 + 1) % 1;
    const planted = p < stance;
    const t = planted ? 0 : (p - stance) / (1 - stance);
    const travel = planted ? 1 - 2 * p / stance : -1 + 2 * t * t * (3 - 2 * t);
    const lift = Math.sin(Math.PI * t);
    return {travel, lift, forward: travel * reach,
      height: lift * (shape.style === 'heavy' ? 3 : index < 2 ? 9 : 7), planted};
  });
  const airborne = feet.every(foot => !foot.planted);
  const flex = Math.cos((phase - .12) * Math.PI * 2);
  const rise = shape.style === 'heavy' ? .4 + .4 * Math.cos(phase * Math.PI * 4)
    : 1.4 + 1.4 * Math.cos((phase - .36) * Math.PI * 2);
  return {feet, airborne, flex, rise};
}

/** Three-quarter front view: rump behind shoulders, muzzle forward, four rooted limbs. */
export function drawQuadruped(c: Context, id: string, distance: number, seed: number): void {
  if (id === 'cat') { drawCatRun(c, distance, seed); return; }
  const s = QUADRUPED_SHAPES[id], pose = quadrupedPose(id, distance, seed);
  const oval = (x:number,y:number,rx:number,ry:number,color:string,angle=0) => {
    c.fillStyle=color; c.beginPath(); c.ellipse(x,y,rx,ry,angle,0,Math.PI*2); c.fill();
  };
  const line = (points:number[],color:string,width:number) => {
    c.strokeStyle=color; c.lineWidth=width; c.beginPath(); c.moveTo(points[0],points[1]);
    for(let i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]); c.stroke();
  };
  c.save(); c.lineCap='round'; c.lineJoin='round';
  oval(0,15,21-pose.rise*.3,7,'rgba(37,62,56,.14)');
  const project = (lateral:number,forward:number,height:number) => ({
    x:lateral+forward*.23, y:forward*QUADRUPED_DEPTH-height+14,
  });
  // Spine stays horizontal in world space; heavy animals flex less than bounding animals.
  const flex = pose.flex * (s.style === 'heavy' ? .2 : 1);
  const hip = {forward:-s.length/2+flex*2,height:s.leg+5+pose.rise};
  const shoulder = {forward:s.length/2-flex*1.5,height:s.leg+5+pose.rise*.7};
  const rear=project(0,hip.forward,hip.height), front=project(0,shoulder.forward,shoulder.height);
  const limb = (index:number) => {
    const hind=index<2, far=index%2===0, foot=pose.feet[index];
    const root=hind?hip:shoulder, lateral=(far?-1:1)*s.width*.65;
    const tip={x:(hind?-s.length/2:s.length/2)+foot.forward,y:foot.height};
    const joint=articulatedJoint({x:root.forward,y:root.height},tip,
      (s.leg+5)*.72,(s.leg+5)*.85,hind?1:-1);
    const a=project(lateral,root.forward,root.height), b=project(lateral,joint.x,joint.y);
    // Counter both projected axes while planted: the paw does not slide under the body.
    const end=project(lateral-foot.forward*.23,tip.x,tip.y);
    const color=id==='panda'?s.dark:s.color;
    line([a.x,a.y,b.x,b.y,end.x,end.y],s.dark,s.width*.43+1.5);
    line([a.x,a.y,b.x,b.y,end.x,end.y],color,s.width*.34);
    oval(end.x,end.y,id==='rabbit'&&hind?4.5:2.8,1.7,
      ['horse','cow','sheep'].includes(id)?s.dark:color,.15);
  };
  limb(0); limb(2);
  const tailX=rear.x-4, tailY=rear.y;
  if(id==='rabbit') oval(tailX,tailY,4,4,'#ede5eb');
  else if(!['bear','panda'].includes(id)) {
    c.strokeStyle=s.dark;c.lineWidth=id==='horse'?5:2.5;c.beginPath();c.moveTo(tailX,tailY);
    c.bezierCurveTo(tailX-8,tailY-2,tailX-15,tailY-9-flex*2,tailX-12,tailY-15-flex*2);c.stroke();
    if(['lion','cow'].includes(id))oval(tailX-12,tailY-15-flex*2,2.5,3,s.dark);
  }
  // Rib cage and pelvis follow the cat study's collection / extension, scaled by species.
  c.fillStyle=s.color;c.beginPath();c.moveTo(rear.x-s.width*.7,rear.y);
  c.bezierCurveTo(rear.x-s.width,rear.y-7,rear.x-2,rear.y-10-flex*2,front.x+2,front.y-5);
  c.bezierCurveTo(front.x+s.width,front.y-3,front.x+s.width,front.y+6,front.x+2,front.y+7);
  c.bezierCurveTo(rear.x+4,rear.y+8,rear.x-s.width,rear.y+7,rear.x-s.width*.7,rear.y);c.fill();
  line([rear.x,rear.y-3,(rear.x+front.x)/2-2,(rear.y+front.y)/2-4-flex,front.x,front.y-3],
    'rgba(255,248,219,.2)',s.width*.45);
  oval(rear.x,rear.y,s.width*.72,7,s.color);oval(front.x,front.y,s.width*.72,7,s.color);
  if(id==='cow'){oval(rear.x-2,rear.y-3,4,5,s.dark);oval(front.x+2,front.y,4,4,s.dark);}
  if(id==='panda')oval(front.x,front.y,s.width*.75,5,s.dark);
  if(id==='tiger')for(const t of [.15,.4,.65,.9]) {
    const x=rear.x+(front.x-rear.x)*t,y=rear.y+(front.y-rear.y)*t;
    line([x-s.width*.65,y-4,x-1,y],s.dark,2);
  }
  if(id==='sheep')for(let i=0;i<10;i++)oval((rear.x+front.x)/2+Math.cos(i*Math.PI/5)*8,
    (rear.y+front.y)/2+Math.sin(i*Math.PI/5)*9,4,4,'#f5f0da');
  limb(1); limb(3);
  const head=project(0,s.length/2+6-flex*.5,s.leg+9+pose.rise*.45+(id==='horse'?5:0));
  const hx=head.x, hy=head.y;
  if(id==='horse')line([front.x,front.y,hx,hy-5],s.color,11);
  if(id==='lion')oval(hx,hy,s.head+4,s.head+5,s.dark);
  if(id==='elephant'){
    oval(hx-10,hy-2,7,10,s.dark,-.25);oval(hx+10,hy-2,7,10,s.color,.25);
  }
  for(const side of [-1,1]){
    const ex=hx+side*s.head*.7;
    if(id==='rabbit'){
      oval(ex,hy-13,3,10,s.color,side*.2);oval(ex,hy-13,1.3,7,'#dca8b6',side*.2);
    } else if(['cat','tiger','horse'].includes(id)){
      c.fillStyle=s.color;c.beginPath();c.moveTo(ex-3,hy-5);c.lineTo(ex+side*2,hy-13);c.lineTo(ex+3,hy-5);c.fill();
    } else if(id==='dog')oval(ex,hy,4,8,s.dark,side*-.2);
    else if(id!=='elephant')oval(ex,hy-6,3.5,3.5,id==='panda'?s.dark:s.color);
  }
  oval(hx,hy,s.head,id==='horse'?10:s.head,s.color);
  if(id==='horse')line([hx-4,hy-8,hx-2,hy-13,hx+2,hy-10],s.dark,3);
  if(id==='cow')for(const side of [-1,1])line([hx+side*5,hy-5,hx+side*10,hy-10],'#e0d8a0',2.5);
  if(id==='sheep')oval(hx,hy+1,6,7,s.dark);
  for(const side of [-1,1]){
    if(id==='panda')oval(hx+side*4,hy-1,3.5,4,s.dark,side*.3);
    oval(hx+side*3.5,hy,2,2.3,'#26352f');oval(hx+side*3.5,hy+.5,.9,1.2,'#ffe49b');
  }
  oval(hx,hy+5,id==='cow'?7:4.5,id==='horse'?5:3,id==='cow'?'#cfaeaa':'#d4c2a0');
  oval(hx,hy+4,2,1.5,s.dark);
  if(id==='elephant'){
    line([hx,hy+3,hx+2,hy+12,hx+7+pose.flex,hy+15],s.dark,5);
    for(const side of [-1,1])line([hx+side*5,hy+4,hx+side*6,hy+9],'#f1dfad',2);
  }
  if(id==='cat')for(const side of [-1,1])line([hx+side*3,hy+5,hx+side*11,hy+3],'#e6dcc1',1);
  if(id==='tiger')for(const side of [-1,1])line([hx+side*7,hy+1,hx+side*4,hy+3],s.dark,1.5);
  // Small stitched mark retains the established undead cue without changing anatomy.
  line([hx+2,hy-6,hx+6,hy-3],'#405149',1);line([hx+4,hy-6,hx+3,hy-3],'#d8cba8',1);
  c.restore();
}
