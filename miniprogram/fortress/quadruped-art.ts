import { drawCatRun } from './cat-run-art';
import { footCycle } from './monster-gait';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
type RunStyle = 'gallop' | 'bound' | 'heavy';
interface AnimalShape {
  color: string; dark: string; length: number; width: number; leg: number;
  head: number; style: RunStyle; stride: number;
}
/** Proportions and contact order belong to the animal, not a generic humanoid rig. */
export const QUADRUPED_SHAPES: Readonly<Record<string, AnimalShape>> = {
  bear: {color:'#9b704b', dark:'#674d38', length:18,width:12,leg:10,head:9,style:'bound',stride:28},
  cat: {color:'#77859a', dark:'#46566e', length:18,width:8,leg:12,head:7,style:'gallop',stride:26},
  cow: {color:'#e5e0cb', dark:'#60665e', length:20,width:11,leg:13,head:8,style:'gallop',stride:30},
  dog: {color:'#b99770', dark:'#765e4c', length:18,width:9,leg:12,head:8,style:'gallop',stride:26},
  elephant: {color:'#87a9a8', dark:'#577c7d', length:21,width:13,leg:11,head:10,style:'heavy',stride:32},
  horse: {color:'#ad7657', dark:'#624936', length:20,width:9,leg:16,head:7,style:'gallop',stride:34},
  lion: {color:'#d2aa52', dark:'#a6733e', length:20,width:10,leg:12,head:8,style:'gallop',stride:30},
  panda: {color:'#e1e2d2', dark:'#405149', length:18,width:12,leg:10,head:9,style:'bound',stride:28},
  rabbit: {color:'#b8a9ca', dark:'#887b99', length:15,width:9,leg:10,head:7,style:'bound',stride:24},
  sheep: {color:'#e5e4cc', dark:'#937965', length:18,width:11,leg:12,head:7,style:'gallop',stride:28},
  tiger: {color:'#de9749', dark:'#584a36', length:20,width:10,leg:12,head:8,style:'gallop',stride:30},
};

export function quadrupedPose(id: string, distance: number, seed: number) {
  const shape = QUADRUPED_SHAPES[id];
  const phase = distance / shape.stride + seed / 97;
  // Hind pair then fore pair. Bounds synchronize pairs; gallops stagger contacts.
  // Elephants retain ground contact instead of an anatomically false aerial gallop.
  const offsets = shape.style === 'bound' ? [0,.04,.48,.52]
    : shape.style === 'heavy' ? [0,.5,.25,.75] : [0,.12,.48,.6];
  const stance = shape.style === 'heavy' ? .64 : shape.style === 'bound' ? .3 : .34;
  const feet = offsets.map(offset => footCycle(phase + offset, stance));
  const airborne = feet.every(foot => foot.lift > 0);
  const flex = Math.cos(phase * Math.PI * 2);
  return {feet, airborne, flex, rise: shape.style === 'heavy' ? .5 * Math.sin(phase * Math.PI * 4)
    : Math.min(...feet.map(foot => foot.lift)) * 5 + Math.sin(phase * Math.PI * 4) * .5};
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
  oval(0,22,21-pose.rise*.3,4,'rgba(37,62,56,.18)');
  // Project the horizontal spine onto the ground plane; head never sits atop a human torso.
  const rear = {x:-7,y:-10-pose.rise}, front = {x:5,y:3-pose.rise};
  const limb = (index:number) => {
    const hind=index<2, far=index%2===0, foot=pose.feet[index];
    const root=hind?rear:front, side=far?-1:1;
    const hipX=root.x+side*s.width*.65, hipY=root.y+2;
    const reach=foot.travel*(s.style==='heavy'?3.5:7);
    const footX=hipX+reach*.32, footY=root.y+s.leg+reach-foot.lift*7+pose.rise;
    // Opposite joint bend in fore and hind limbs; roots stay fixed under the torso.
    const kneeX=(hipX+footX)/2+(hind?-3:2);
    const kneeY=(hipY+footY)/2+(hind?-3:1)-foot.lift*3;
    const color=id==='panda'?s.dark:s.color;
    line([hipX,hipY,kneeX,kneeY,footX,footY],s.dark,s.width*.43+1.5);
    line([hipX,hipY,kneeX,kneeY,footX,footY],color,s.width*.34);
    oval(footX+.5,footY, id==='rabbit'&&hind?4.5:2.8,1.7,
      ['horse','cow','sheep'].includes(id)?s.dark:color,.15);
  };
  limb(0); limb(2);
  const tailX=rear.x-6, tailY=rear.y-6;
  if(id==='rabbit') oval(tailX,tailY,4,4,'#ede5eb');
  else if(!['bear','panda'].includes(id)) {
    line([tailX,tailY,tailX-8,tailY-5,tailX-10+pose.flex*2,tailY-11],s.dark,id==='horse'?5:2.5);
    if(['lion','cow'].includes(id))oval(tailX-10+pose.flex*2,tailY-11,2.5,3,s.dark);
  }
  c.save(); c.translate(-1,-4-pose.rise); c.rotate(-.58+pose.flex*(s.style==='bound'?.07:.025));
  oval(0,0,s.width,s.length*(1+pose.flex*.035),s.dark);
  oval(-1,-1,s.width-1,s.length-1,s.color);
  oval(-3,-3,s.width*.45,s.length*.7,'rgba(255,248,219,.18)');
  if(id==='cow'){oval(-4,-6,4,6,s.dark);oval(4,5,4,5,s.dark);}
  if(id==='panda')oval(0,8,s.width,5,s.dark);
  if(id==='tiger')for(const y of [-10,-4,3,9])line([-s.width+1,y,-2,y+3],s.dark,2);
  if(id==='sheep')for(let i=0;i<10;i++)oval(Math.cos(i*Math.PI/5)*8,Math.sin(i*Math.PI/5)*14,4,4,'#f5f0da');
  c.restore();
  limb(1); limb(3);
  // The neck projects from the shoulders toward the camera, with species-specific length.
  const hx=front.x+3, hy=front.y+(id==='horse'?-5:3);
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
