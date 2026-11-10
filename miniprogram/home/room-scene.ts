import { houseForLevel } from '../houses/catalog';
import { weaponAppearance, weaponMaterial } from '../weapons/appearance';
import type { StrengthTarget } from '../services/strength-guide';
import type { PetAppearance } from '../pets/catalog';
import { weaponForLevel } from '../weapons/catalog';
import { normalizeRoomYaw } from './room-orbit';
type Point3 = readonly [number, number, number];
interface Face { readonly house?: boolean; readonly actor?: boolean; readonly pet?: boolean; readonly layer?: number; readonly points: readonly Point3[]; readonly color: string; readonly normal: Point3; readonly opacity?: number }
interface ProjectedFace { readonly house?: boolean; readonly actor?: boolean; readonly pet?: boolean; readonly layer: number; readonly points: readonly (readonly [number, number])[]; readonly color: string; readonly depth: number; readonly opacity: number }
type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
const VIEW: Point3 = [.6124, .5, .6124];
const LIGHT: Point3 = [-.35, .85, .4];
const dot = (a: Point3,b: Point3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const normalize = (a: Point3): Point3 => { const d=Math.hypot(...a); return [a[0]/d,a[1]/d,a[2]/d]; };
function rotateRoomPoint(p: Point3, yaw: number): Point3 {
  const cos=Math.cos(yaw),sin=Math.sin(yaw);
  return [p[0]*cos+p[2]*sin,p[1],-p[0]*sin+p[2]*cos];
}
export function projectRoomPoint(point: Point3, yaw=0) {
  const p=rotateRoomPoint(point,yaw);
  return { x: (p[0]-p[2]) * .7071, y: (p[0]+p[2]) * .35355-p[1]*.866, depth: dot(p,VIEW) };
}
// Project the courtyard, roof ridge and chimney along the same world light.
export function roomShadowPolygon(yaw:number):readonly (readonly [number,number])[] {
  const ground=-.48;
  const corners:Point3[]=[[-3.2,0,-3.2],[-3.2,0,3.2],[3.2,0,-3.2],[3.2,0,3.2],
    [0,3.24,-3.1],[0,3.24,-.2],[1.26,3.49,-2.43]];
  const points=corners.map(([x,y,z])=>{
    const distance=(y-ground)/LIGHT[1];
    const projected=projectRoomPoint([x-LIGHT[0]*distance,ground,z-LIGHT[2]*distance],yaw);
    return [projected.x,projected.y] as const;
  }).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a:readonly number[],b:readonly number[],c:readonly number[])=>
    (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=(vertices:typeof points)=>{
    const hull:typeof points=[];
    for(const point of vertices){while(hull.length>=2&&cross(hull[hull.length-2],hull[hull.length-1],point)<=0)hull.pop();hull.push(point);}
    hull.pop();return hull;
  };
  return [...half(points),...half([...points].reverse())];
}
export function homeHeroPose(seconds: number) {
  return { yaw: .18 + Math.sin(seconds * 1.25) * .13,
    lean: Math.sin(seconds * 1.25) * .035, lift: Math.sin(seconds * 2.5) * .018 };
}
function shade(hex: string, normal: Point3): string {
  const amount = .84 + .16 * Math.max(0,dot(normal,normalize(LIGHT)));
  const value=parseInt(hex.slice(1),16);
  return `rgb(${[16,8,0].map(shift=>Math.round(((value>>shift)&255)*amount)).join(',')})`;
}
function box(faces: Face[], x: number,y: number,z: number,w: number,h: number,d: number,color: string) {
  const x0=x-w/2,x1=x+w/2,y0=y-h/2,y1=y+h/2,z0=z-d/2,z1=z+d/2;
  const add=(points: Point3[],normal: Point3)=>faces.push({points,normal,color});
  add([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],[0,1,0]);
  add([[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]],[1,0,0]);
  add([[x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1]],[-1,0,0]);
  add([[x0,y0,z1],[x0,y1,z1],[x1,y1,z1],[x1,y0,z1]],[0,0,1]);
  add([[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z0]],[0,0,-1]);
}
function ellipsoid(faces: Face[], x:number,y:number,z:number,rx:number,ry:number,rz:number,color:string) {
  const rings=6,segments=12;
  const point=(lat:number,lon:number):Point3=>[x+rx*Math.sin(lat)*Math.cos(lon),y+ry*Math.cos(lat),z+rz*Math.sin(lat)*Math.sin(lon)];
  for(let i=0;i<rings;i++)for(let j=0;j<segments;j++){
    const a=i*Math.PI/rings,b=(i+1)*Math.PI/rings,c=j*Math.PI*2/segments,d=(j+1)*Math.PI*2/segments;
    const mid=point((a+b)/2,(c+d)/2);
    const normal=normalize([(mid[0]-x)/(rx*rx),(mid[1]-y)/(ry*ry),(mid[2]-z)/(rz*rz)]);
    faces.push({points:[point(a,c),point(b,c),point(b,d),point(a,d)],normal,color});
  }
}
function floorEllipse(faces:Face[],x:number,z:number,rx:number,rz:number,y:number,color:string,opacity=1) {
  const points:Point3[]=Array.from({length:40},(_,i)=>[x+rx*Math.cos(i*Math.PI/20),y,z+rz*Math.sin(i*Math.PI/20)]);
  faces.push({points,color,normal:[0,1,0],opacity,layer:2});
}
// The exterior is world geometry: orbit, lighting and picking use the same faces.
function room(level=1):Face[]{
  houseForLevel(level);
  const f:Face[]=[];
  const stone=level>=5?'#77949c':level>=3?'#a6b7ad':'#bcbba3';
  const trim=level===5?'#dfbd70':'#e0d4b4';
  box(f,0,-.20,0,6.4,.4,6.4,'#b4a789');
  box(f,0,.015,0,6.4,.08,6.4,'#a7b587');
  // Courtyard paving and a path from the door to the open front gate.
  for(let row=0;row<5;row++)for(let col=0;col<4;col++){
    box(f,-1.2+col*.8,.07,.1+row*.62,.76,.06,.58,(row+col)%2?'#e5d8b8':'#d6c9aa');
  }
  const groundEnd=f.length;
  // A compact closed house behind the actors, with complete front/back gables.
  box(f,0,.18,-1.65,3.65,.28,2.55,stone);
  box(f,0,1.12,-1.65,3.35,1.75,2.25,level>=3?'#d5d9c0':'#e6c78e');
  for(const x of [-1.62,0,1.62])box(f,x,1.16,-.48,.14,1.85,.14,'#8e6b48');
  for(const z of [-2.81,-.49])box(f,0,1.97,z,3.5,.18,.18,'#8e6b48');
  box(f,0,.74,-.45,.65,1.15,.10,'#786146');
  box(f,.20,.72,-.38,.06,.06,.04,trim);
  for(const x of [-1.06,1.06]){
    box(f,x,1.22,-.43,.61,.70,.12,trim);
    box(f,x,1.22,-.35,.46,.55,.05,'#82b9bd');
    box(f,x,1.22,-.31,.045,.56,.04,'#fff1ca');
    box(f,x,1.22,-.31,.47,.045,.04,'#fff1ca');
    box(f,x,.83,-.35,.74,.10,.28,trim);
  }
  const roofColor=level>=4?'#718c8b':'#b77b51';
  for(const z of [-3.04,-.24]){
    f.push({points:[[-2,2.06,z],[2,2.06,z],[0,3.16,z]],normal:[0,0,z< -1?-1:1],color:'#cfb281'});
  }
  // Tile strips subdivide roof depth, avoiding one giant painter-sorted face.
  for(const side of [-1,1])for(let row=0;row<5;row++)for(let col=0;col<8;col++){
    const x0=side*row*.4,x1=side*(row+1)*.4;
    const y0=3.16-row*.22,y1=3.16-(row+1)*.22;
    const z=-3.04+col*.35;
    f.push({points:[[x0,y0,z],[x1,y1,z],[x1,y1,z+.35],[x0,y0,z+.35]],normal:normalize([side*.55,1,0]),color:(row+col)%3?roofColor:level>=4?'#819e99':'#c38a5c'});
  }
  box(f,0,3.17,-1.65,.16,.13,2.9,trim);
  box(f,1,2.88,-2.15,.40,1.05,.43,stone);
  box(f,1,3.43,-2.15,.52,.12,.55,trim);
  if(level>=2){
    for(const x of [-1.69,1.69])for(const z of [-2.8,-.5])box(f,x,1.12,z,.23,1.95,.23,stone);
    box(f,0,.24,-.16,1.1,.16,.45,trim);
  }
  if(level>=3){
    for(const side of [-1,1])for(let row=0;row<4;row++)for(let col=0;col<4;col++){
      box(f,side*1.70,.48+row*.4,-2.5+col*.55,.09,.33,.50,(row+col)%2?stone:'#bac6b8');
    }
  }
  // Low perimeter walls leave the courtyard visible; the entrance is an actual gap.
  const wall=(x:number,z:number,w:number,d:number)=>{
    box(f,x,.35,z,w,.62,d,stone);
    box(f,x,.68,z,w+.04,.12,d+.04,trim);
    const count=Math.max(1,Math.round(Math.max(w,d)/.60));
    for(let i=0;i<count;i++){
      const along=(i-(count-1)/2)*.60;
      box(f,x+(w>d?along:0),.86,z+(d>w?along:0),w>d?.30:.28,.25,d>w?.30:.28,stone);
    }
  };
  wall(-3.04,0,.24,5.9);wall(3.04,0,.24,5.9);wall(0,-3.04,5.9,.24);
  wall(-1.96,3.04,2.16,.24);wall(1.96,3.04,2.16,.24);
  for(const x of [-3.02,3.02])for(const z of [-3.02,3.02]){
    const height=level>=4?1.23:.92;
    box(f,x,height/2,z,.54,height,.54,stone);
    box(f,x,height,z,.68,.16,.68,trim);
    if(level>=4)for(const dx of [-.23,.23])for(const dz of [-.23,.23])box(f,x+dx,height+.2,z+dz,.20,.28,.20,stone);
    if(level===5)box(f,x,height+.05,z,.15,.68,.15,'#dfbd70');
  }
  if(level===5){
    for(const x of [-1.4,1.4])box(f,x,1.51,-.33,.22,.54,.08,'#637f90');
  }
  floorEllipse(f,-.5,1.08,.62,.43,.13,'#647457',.22);
  return f.map((face,index)=>({...face,house:true,layer:index<groundEnd?0:face.layer??3}));
}
// Fixed framing across levels and yaw prevents zoom jumps during orbit/upgrades.
// Bounds include the roof, corner towers and projected ground shadow.
export function homeRoomViewport(width:number,height:number){
  return {scale:Math.min(width/11.8,height/10.4),x:width/2,y:height*.53};
}
function hero(seconds:number,level=1):Face[]{
  const f:Face[]=[];const pose=homeHeroPose(seconds);
  const green='#9dab72',dark='#596750',skin='#e7bb8b';
  for(const x of [-.24,.24]){
    box(f,x,.17,.06,.31,.28,.53,'#455848');box(f,x,.50,0,.26,.52,.28,dark);
  }
  box(f,0,.94,0,.72,.55,.43,green);
  box(f,0,1.07,.26,.54,.40,.13,'#bdc58f');box(f,0,1.02,.35,.17,.15,.03,'#e5cb82');
  box(f,0,.72,.25,.72,.08,.08,'#687856');
  // Rounded sleeves and mitten hands keep the same friendly guardian identity.
  ellipsoid(f,-.47,1.0,0,.17,.28,.18,green);ellipsoid(f,.47,1.0,.08,.17,.28,.18,green);
  ellipsoid(f,-.48,.76,.08,.14,.14,.14,skin);ellipsoid(f,.48,.84,.28,.14,.14,.14,skin);
  ellipsoid(f,0,1.48,.03,.34,.37,.30,skin);
  ellipsoid(f,0,1.70,-.015,.40,.29,.37,'#a3b67a');
  box(f,0,1.63,.10,.82,.08,.55,'#c2ce94');box(f,0,1.84,.02,.12,.06,.50,'#cad6a0');
  // Eyes face the courtyard; the entire model turns slightly in world space.
  for(const x of [-.14,.14])box(f,x,1.46,.315,.065,.055,.025,'#4b5a45');
  box(f,0,1.33,.314,.13,.025,.022,'#b68863');
  // The same seven silhouettes used in the upgrade card and battle sprite.
  const weapon=weaponForLevel(level), design=weaponAppearance(level);
  for(const part of design.parts){
    const x=.50+(150-part.y-part.h/2)*.0026;
    const y=.72+(part.x+part.w/2)*.0022;
    const color=weaponMaterial(part,weapon.color,design.light);
    box(f,x,y,.24,part.h*.0026,part.w*.0022,part.material==='light'?.29:.23,color);
  }
  // Small orbiting energy motes; animation follows the existing room clock.
  if(level>=4)for(let i=0;i<level-3;i++){
    const angle=seconds*1.8+i*Math.PI*2/(level-3);
    box(f,.50+Math.cos(angle)*.28,1.45+Math.sin(angle)*.30,.28,.035,.06,.035,design.light);
  }
  ellipsoid(f,.48,1.0,.40,.14,.14,.14,skin);
  const sin=Math.sin(pose.yaw),cos=Math.cos(pose.yaw);
  const transform=(p:Point3):Point3=>{
    const x=p[0]+p[1]*pose.lean;
    return [x*cos+p[2]*sin-.5,p[1]+pose.lift,-x*sin+p[2]*cos+1.1];
  };
  return f.map(face=>({...face,actor:true,points:face.points.map(transform),normal:normalize([face.normal[0]*cos+face.normal[2]*sin,face.normal[1],-face.normal[0]*sin+face.normal[2]*cos])}));
}
// Original low-poly companion, sharing the room's lighting, depth and orbit.
function fox(seconds:number, appearance:PetAppearance):Face[]{
  const f:Face[]=[]; const adult=appearance.level>=7, teen=appearance.level>=4;
  const scale=adult?1:teen?.85:.68; const blue='#85bdcf', cream='#fff0ce';
  const rhythm=Math.sin(seconds*4);
  const sway=Math.sin(seconds*6)*.20;
  ellipsoid(f,.4,.45,-.36+sway,.22,.22,.64,blue);
  ellipsoid(f,.4,.48,-.84+sway,.19,.18,.28,cream);
  for(const x of [-.22,.22])for(const z of [-.18,.22])ellipsoid(f,x,.13,z,.13,.16,.16,'#587e9d');
  ellipsoid(f,0,.48,0,.36,.41,.43,blue);
  ellipsoid(f,0,.54,.32,.24,.25,.14,cream);
  ellipsoid(f,0,.94,.13,.42,.35,.34,blue);
  for(const x of [-.27,.27]){
    const front:Point3[]=[[x-.18,1.1,.18],[x+.18,1.1,.18],[x,1.65,.07]];
    f.push({points:front,color:blue,normal:[0,.15,1]});
    f.push({points:front.map(p=>[p[0],p[1],p[2]-.15] as Point3),color:blue,normal:[0,.15,-1]});
    f.push({points:[[x-.1,1.16,.19],[x+.1,1.16,.19],[x,1.48,.12]],color:'#e6b8b4',normal:[0,0,1]});
  }
  for(const x of [-.19,.19]){
    ellipsoid(f,x,.85,.40,.19,.15,.08,cream);
    box(f,x,1.0,.435,.07,.09,.025,'#354c63');
    box(f,x-.015,1.03,.45,.02,.025,.012,'#ffffff');
  }
  ellipsoid(f,0,.86,.47,.07,.055,.045,'#354c63');
  box(f,0,1.19,.38,.06,.14,.025,'#ffe291');
  if(appearance.equipped.includes('collar')){box(f,0,.67,.32,.55,.09,.15,'#9b83c1');ellipsoid(f,0,.61,.43,.065,.065,.035,'#ffe291');}
  if(appearance.equipped.includes('hat')){box(f,0,1.27,.07,.85,.08,.63,'#bfa478');box(f,0,1.41,.03,.42,.24,.4,'#dec294');}
  if(appearance.equipped.includes('charm')){box(f,.32,.53,.3,.05,.24,.04,'#f4d271');box(f,.37,.42,.34,.12,.09,.06,'#ffe291');box(f,.33,.35,.34,.06,.14,.06,'#ffe291');}
  // Rock the whole companion around its feet; clothing and hit geometry follow.
  const angle=rhythm*.12,cos=Math.cos(angle),sin=Math.sin(angle);
  return f.map(face=>({...face,pet:true,
    normal:[face.normal[0]*cos-face.normal[1]*sin,face.normal[0]*sin+face.normal[1]*cos,face.normal[2]] as Point3,
    points:face.points.map(p=>[(p[0]*cos-p[1]*sin)*scale+.85+rhythm*.10,
      (p[0]*sin+p[1]*cos)*scale+Math.abs(rhythm)*.06,p[2]*scale+1.45] as Point3)}));
}
function projectFaces(faces:readonly Face[],yaw:number):ProjectedFace[]{
  const view=rotateRoomPoint(VIEW,-yaw);
  return faces.filter(face=>dot(face.normal,view)>0.001).map(face=>{
    const p=face.points.map(point=>projectRoomPoint(point,yaw));
    const layer=face.layer??3;
    return { house:face.house, actor:face.actor, pet:face.pet, layer, points:p.map(point=>[point.x,point.y] as const),depth:p.reduce((sum,point)=>sum+point.depth,0)/p.length,
      color:shade(face.color,face.normal),opacity:face.opacity??1 };
  });
}
export class HomeRoomScene {
  private readonly context:Context;
  private weaponLevel=1;
  private guide:StrengthTarget='';
  private pet:PetAppearance|null=null;
  private drawnFaces:ProjectedFace[]=[];
  private houseLevel=1;
  private roomFaces=room();
  private staticFaces:ProjectedFace[];
  private yaw:number;
  private shadow:readonly (readonly [number,number])[];
  private frame:number|undefined;
  private frameVersion=0;
  private active=false;
  private afterDraw:(()=>void)|undefined;
  private disposed=false;
  private elapsed=0;
  private previous:number|undefined;
  private width=0;private height=0;private dpr=1;
  constructor(private readonly canvas:WechatMiniprogram.Canvas,width:number,height:number,dpr:number,yaw=0){
    this.yaw=normalizeRoomYaw(yaw);this.staticFaces=projectFaces(this.roomFaces,this.yaw);this.shadow=roomShadowPolygon(this.yaw);
    this.context=canvas.getContext('2d');this.resize(width,height,dpr);
  }
  get viewYaw():number{return this.yaw;}
  setWeaponLevel(level:number){
    weaponForLevel(level);this.weaponLevel=level;if(!this.active&&!this.disposed)this.draw();
  }
  setHouseLevel(level:number){
    houseForLevel(level);if(level===this.houseLevel||this.disposed)return;
    this.houseLevel=level;this.roomFaces=room(level);this.staticFaces=projectFaces(this.roomFaces,this.yaw);
    if(!this.active)this.draw();
  }
  hitHouse(x:number,y:number):boolean{return this.hitActor(x,y,'house');}
  setGuide(target:StrengthTarget){this.guide=target;if(!this.disposed&&!this.active)this.draw();}
  setPet(pet:PetAppearance|null){this.pet=pet;if(!this.disposed&&!this.active)this.draw();}
  hitHero(x:number,y:number):boolean{return this.hitActor(x,y,'actor');}
  hitPet(x:number,y:number):boolean{return this.hitActor(x,y,'pet');}
  private hitActor(x:number,y:number,target:'actor'|'pet'|'house'):boolean{
    if(this.disposed||!Number.isFinite(x)||!Number.isFinite(y))return false;
    const viewport=homeRoomViewport(this.width,this.height);
    const px=(x-viewport.x)/viewport.scale,py=(y-viewport.y)/viewport.scale;
    // Walk the rendered faces front-to-back: opaque house/walls block hidden targets.
    for(let i=this.drawnFaces.length-1;i>=0;i--){
      const face=this.drawnFaces[i];let inside=false;
      for(let a=0,b=face.points.length-1;a<face.points.length;b=a++){
        const [ax,ay]=face.points[a], [bx,by]=face.points[b];
        if((ay>py)!==(by>py)&&px<(bx-ax)*(py-ay)/(by-ay)+ax)inside=!inside;
      }
      if(inside)return face[target]===true;
    }
    return false;
  }
  setYaw(yaw:number){
    if(this.disposed)return;
    const next=normalizeRoomYaw(yaw);if(next===this.yaw)return;
    this.yaw=next;this.staticFaces=projectFaces(this.roomFaces,this.yaw);this.shadow=roomShadowPolygon(this.yaw);
    // The existing animation loop renders the latest angle; no extra frame loop.
    if(!this.active)this.draw();
  }
  resize(width:number,height:number,dpr:number){
    if(this.disposed)return;
    this.width=width;this.height=height;this.dpr=Number.isFinite(dpr)&&dpr>0?dpr:1;
    this.canvas.width=Math.round(width*this.dpr);this.canvas.height=Math.round(height*this.dpr);this.draw();
  }
  setActive(active:boolean,afterDraw?:()=>void){
    if(this.disposed||this.active===active)return;
    this.active=active;this.previous=undefined;this.frameVersion++;this.afterDraw=active?afterDraw:undefined;
    if(!active&&this.frame!==undefined){this.canvas.cancelAnimationFrame(this.frame);this.frame=undefined;}
    if(active)this.schedule();
  }
  capture():string{try{return this.canvas.toDataURL('image/png',1);}catch{return '';}}
  dispose(){this.setActive(false);this.disposed=true;}
  private schedule(){
    if(this.disposed||!this.active||this.frame!==undefined)return;
    const version=this.frameVersion;
    this.frame=this.canvas.requestAnimationFrame(now=>{
      if(version!==this.frameVersion||this.disposed||!this.active)return;
      this.frame=undefined;
      // 30fps is sufficient for a gentle idle animation; no page setData per frame.
      if(this.previous===undefined||now-this.previous>=32){
        if(this.previous!==undefined)this.elapsed+=Math.min(60,now-this.previous)/1000;
        this.previous=now;this.draw();
        const afterDraw=this.afterDraw;this.afterDraw=undefined;afterDraw?.();
      }
      this.schedule();
    });
  }
  private draw(){
    const c=this.context;const {scale,x:originX,y:originY}=homeRoomViewport(this.width,this.height);
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);
    c.save();c.translate(originX,originY);
    const shadowCenter=this.shadow.reduce((center,p)=>[center[0]+p[0]/this.shadow.length,center[1]+p[1]/this.shadow.length],[0,0]);
    for(const [spread,opacity] of [[1.10,.025],[1.05,.035],[1,.065]]){
      c.fillStyle=`rgba(77,100,73,${opacity})`;c.beginPath();
      this.shadow.forEach(([x,y],i)=>{
        const px=(shadowCenter[0]+(x-shadowCenter[0])*spread)*scale;
        const py=(shadowCenter[1]+(y-shadowCenter[1])*spread)*scale;
        if(i===0)c.moveTo(px,py);else c.lineTo(px,py);
      });c.closePath();c.fill();
    }
    const faces=[...this.staticFaces,...projectFaces(hero(this.elapsed,this.weaponLevel),this.yaw),...projectFaces(this.pet?fox(this.elapsed,this.pet):[],this.yaw)].sort((a,b)=>a.layer-b.layer||a.depth-b.depth);
    this.drawnFaces=faces;
    for(const face of faces){
      c.globalAlpha=face.opacity;c.fillStyle=face.color;c.strokeStyle=face.color;c.lineWidth=.45;
      c.beginPath();face.points.forEach(([x,y],i)=>{if(i===0)c.moveTo(x*scale,y*scale);else c.lineTo(x*scale,y*scale);});c.closePath();c.fill();c.stroke();
    }
    c.globalAlpha=1;
    if(this.guide){
      const point=projectRoomPoint(this.guide==='pet'?[.85,1.1,1.6]:[-.5,1.9,1.1],this.yaw);
      c.save();c.translate(point.x*scale,point.y*scale-42+Math.sin(this.elapsed*5)*5);
      c.fillStyle='#ffe1ad';c.strokeStyle='#806447';c.lineWidth=2;c.lineJoin='round';
      c.beginPath();c.moveTo(-9,-12);c.lineTo(9,-12);c.lineTo(9,-3);
      c.quadraticCurveTo(15,-1,15,6);c.lineTo(15,13);c.quadraticCurveTo(13,18,9,13);
      c.quadraticCurveTo(6,18,2,13);c.lineTo(2,29);c.quadraticCurveTo(-1,37,-6,30);
      c.lineTo(-6,9);c.lineTo(-11,14);c.lineTo(-18,8);c.quadraticCurveTo(-23,0,-15,1);
      c.lineTo(-10,5);c.closePath();c.fill();c.stroke();c.fillStyle='#7c9f87';c.fillRect(-11,-16,22,7);c.restore();
    }
    c.restore();
  }
}
