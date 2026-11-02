import { normalizeRoomYaw } from './room-orbit';
type Point3 = readonly [number, number, number];
interface Face { readonly wall?: 'x' | 'z'; readonly layer?: number; readonly points: readonly Point3[]; readonly color: string; readonly normal: Point3; readonly opacity?: number }
interface ProjectedFace { readonly layer: number; readonly points: readonly (readonly [number, number])[]; readonly color: string; readonly depth: number; readonly opacity: number }
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
// Project the slab and the two tall walls onto the ground along a fixed world light.
export function roomShadowPolygon(yaw:number):readonly (readonly [number,number])[] {
  const ground=-.48;
  const corners:Point3[]=[[-3.2,0,-3.2],[-3.2,0,3.2],[3.2,0,-3.2],[3.2,0,3.2],
    [-3.2,3.2,-3.2],[-3.2,3.2,3.2],[3.2,3.2,-3.2]];
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
function room():Face[]{
  const f:Face[]=[];
  box(f,0,-.20,0,6.3,.4,6.3,'#d4b88b');
  box(f,0,-.035,0,6.4,.10,6.4,'#f2d7a5');
  for(let row=0;row<8;row++)for(let col=0;col<4;col++){
    box(f,-2.36+col*1.575,.025,-2.75+row*.785,1.55,.06,.76,(row+col)%3?'#dfcba6':'#ead8b5');
  }
  const floorEnd=f.length;
  // Two solid walls, open front; trim makes their thickness visible.
  box(f,-3.1,1.55,0,.2,3.1,6.3,'#b5c998');
  box(f,0,1.55,-3.1,6.3,3.1,.2,'#e9e6cc');
  box(f,-3.1,3.13,0,.27,.10,6.4,'#fff2d0');box(f,0,3.13,-3.1,6.4,.10,.27,'#fff2d0');
  box(f,-2.97,.15,0,.06,.25,6.1,'#e9e3bd');box(f,0,.15,-2.97,6.1,.25,.06,'#f7edcb');
  const wallsEnd=f.length;
  for(let i=floorEnd;i<wallsEnd;i++) {
    f[i]={...f[i],wall:Math.floor((i-floorEnd)/5)%2===0 ? 'x' : 'z'};
  }
  // Recessed window with bright sill and panes.
  box(f,1.1,2.03,-2.965,1.75,1.56,.05,'#91b8b9');
  for(const x of [.20,2.0])box(f,x,2.03,-2.87,.12,1.74,.18,'#fff7df');
  for(const y of [1.20,2.87])box(f,1.1,y,-2.87,1.94,.12,.18,'#fff7df');
  box(f,1.1,2.03,-2.83,.07,1.56,.10,'#fff7df');box(f,1.1,2.03,-2.83,1.75,.07,.10,'#fff7df');
  box(f,1.1,1.10,-2.68,2.08,.12,.52,'#e7d4ac');
  // Curtains are pleated volumes rather than a flat printed texture.
  for(const x of [-.10,2.28])for(let i=0;i<3;i++)box(f,x+i*.075,2.02,-2.76,.08,1.76,.16+(i%2)*.07,'#c7d499');
  box(f,1.1,2.99,-2.67,2.6,.055,.055,'#8c7659');
  // Framed botanical print on the left wall.
  box(f,-2.94,2.02,-.75,.08,1.03,.82,'#fff2d0');box(f,-2.88,2.02,-.75,.045,.80,.62,'#e3dcb3');
  ellipsoid(f,-2.84,2.04,-.75,.04,.25,.16,'#7f9d65');
  // Wooden bed and thick mattress along the back-right side.
  for(const x of [.9,2.35])for(const z of [-2.25,.20])box(f,x,.30,z,.14,.60,.14,'#8e8665');
  box(f,1.63,.58,-1.02,1.75,.22,2.85,'#b3ba94');
  box(f,1.63,.78,-1.02,1.72,.22,2.78,'#fff3d7');
  box(f,1.63,.93,-.62,1.75,.14,1.94,'#a6bf8e');
  box(f,1.63,1.0,-1.93,1.30,.24,.68,'#e5ebc9');
  box(f,1.63,1.0,-2.47,1.88,1.15,.10,'#e5e9cd');
  for(const x of [.68,2.58]){box(f,x,.78,.40,.13,1.25,.13,'#e5e9cd');ellipsoid(f,x,1.44,.40,.09,.09,.09,'#f8f2d8');}
  box(f,1.63,1.20,.40,1.95,.10,.10,'#e5e9cd');box(f,1.63,.83,.40,1.95,.09,.10,'#e5e9cd');
  for(let i=0;i<5;i++)box(f,.90+i*.36,1.0,.40,.055,.36,.06,'#e5e9cd');
  // Plant stand and rounded leaves, behind the hero.
  box(f,-2.18,.53,-1.95,.78,1.0,.76,'#baa47c');box(f,-2.18,1.06,-1.95,.90,.12,.86,'#dfc99b');
  ellipsoid(f,-2.18,1.30,-1.95,.28,.30,.28,'#d9a77c');
  box(f,-2.18,1.67,-1.95,.04,.55,.04,'#688459');
  ellipsoid(f,-2.32,1.78,-1.93,.23,.36,.15,'#7c9d66');ellipsoid(f,-2.0,1.92,-1.95,.21,.38,.15,'#a0bb78');
  floorEllipse(f,-.5,1.08,1.68,1.30,.075,'#ba9b6a');floorEllipse(f,-.5,1.08,1.56,1.19,.078,'#f0dfb4');
  // Gentle contact shadow on the rug.
  floorEllipse(f,-.48,1.02,.62,.43,.085,'#7f8969',.25);
  return f.map((face,index)=>({...face,layer:index<floorEnd?0:index<wallsEnd?1:face.layer??3}));
}
function hero(seconds:number):Face[]{
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
  // Eyes face the open room; the entire model turns slightly in world space.
  for(const x of [-.14,.14])box(f,x,1.46,.315,.065,.055,.025,'#4b5a45');
  box(f,0,1.33,.314,.13,.025,.022,'#b68863');
  box(f,.46,1.0,.42,.16,.35,.18,'#718477');box(f,.46,1.29,.42,.085,.35,.10,'#4e6659');
  box(f,.46,1.08,.52,.17,.065,.05,'#dbc080');
  const sin=Math.sin(pose.yaw),cos=Math.cos(pose.yaw);
  const transform=(p:Point3):Point3=>{
    const x=p[0]+p[1]*pose.lean;
    return [x*cos+p[2]*sin-.5,p[1]+pose.lift,-x*sin+p[2]*cos+1.1];
  };
  return f.map(face=>({...face,points:face.points.map(transform),normal:normalize([face.normal[0]*cos+face.normal[2]*sin,face.normal[1],-face.normal[0]*sin+face.normal[2]*cos])}));
}
function projectFaces(faces:readonly Face[],yaw:number):ProjectedFace[]{
  const view=rotateRoomPoint(VIEW,-yaw);
  return faces.filter(face=>dot(face.normal,view)>0.001).map(face=>{
    const p=face.points.map(point=>projectRoomPoint(point,yaw));
    // A near solid wall must occlude the room, rather than remain behind actors.
    const layer=face.wall ? (view[face.wall==='x'?0:2]<0 ? 4 : 1) : face.layer??3;
    return { layer, points:p.map(point=>[point.x,point.y] as const),depth:p.reduce((sum,point)=>sum+point.depth,0)/p.length,
      color:shade(face.color,face.normal),opacity:face.opacity??1 };
  });
}
export class HomeRoomScene {
  private readonly context:Context;
  private readonly roomFaces=room();
  private staticFaces:ProjectedFace[];
  private yaw:number;
  private shadow:readonly (readonly [number,number])[];
  private frame:number|undefined;
  private frameVersion=0;
  private active=false;
  private disposed=false;
  private elapsed=0;
  private previous:number|undefined;
  private width=0;private height=0;private dpr=1;
  constructor(private readonly canvas:WechatMiniprogram.Canvas,width:number,height:number,dpr:number,yaw=0){
    this.yaw=normalizeRoomYaw(yaw);this.staticFaces=projectFaces(this.roomFaces,this.yaw);this.shadow=roomShadowPolygon(this.yaw);
    this.context=canvas.getContext('2d');this.resize(width,height,dpr);
  }
  get viewYaw():number{return this.yaw;}
  setYaw(yaw:number){
    if(this.disposed)return;
    const next=normalizeRoomYaw(yaw);if(next===this.yaw)return;
    this.yaw=next;this.staticFaces=projectFaces(this.roomFaces,this.yaw);this.shadow=roomShadowPolygon(this.yaw);
    // The existing animation loop renders the latest angle; no extra frame loop.
    if(!this.active)this.draw();
  }
  resize(width:number,height:number,dpr:number){
    if(this.disposed)return;
    this.width=width;this.height=height;this.dpr=Math.min(2,dpr);
    this.canvas.width=Math.round(width*this.dpr);this.canvas.height=Math.round(height*this.dpr);this.draw();
  }
  setActive(active:boolean){
    if(this.disposed||this.active===active)return;
    this.active=active;this.previous=undefined;this.frameVersion++;
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
      }
      this.schedule();
    });
  }
  private draw(){
    const c=this.context;const scale=Math.min(this.width/9.6,this.height/9.2);
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);
    c.save();c.translate(this.width/2,this.height*.56);
    const shadowCenter=this.shadow.reduce((center,p)=>[center[0]+p[0]/this.shadow.length,center[1]+p[1]/this.shadow.length],[0,0]);
    for(const [spread,opacity] of [[1.10,.025],[1.05,.035],[1,.065]]){
      c.fillStyle=`rgba(77,100,73,${opacity})`;c.beginPath();
      this.shadow.forEach(([x,y],i)=>{
        const px=(shadowCenter[0]+(x-shadowCenter[0])*spread)*scale;
        const py=(shadowCenter[1]+(y-shadowCenter[1])*spread)*scale;
        if(i===0)c.moveTo(px,py);else c.lineTo(px,py);
      });c.closePath();c.fill();
    }
    const faces=[...this.staticFaces,...projectFaces(hero(this.elapsed),this.yaw)].sort((a,b)=>a.layer-b.layer||a.depth-b.depth);
    for(const face of faces){
      c.globalAlpha=face.opacity;c.fillStyle=face.color;c.strokeStyle=face.color;c.lineWidth=.45;
      c.beginPath();face.points.forEach(([x,y],i)=>{if(i===0)c.moveTo(x*scale,y*scale);else c.lineTo(x*scale,y*scale);});c.closePath();c.fill();c.stroke();
    }
    c.globalAlpha=1;c.restore();
  }
}
