type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
interface Point { x: number; y: number }
const TAU = Math.PI * 2;
export const CAT_STRIDE = 20;
const DEPTH = .62;
const mod = (p: number) => ((p % 1) + 1) % 1;
/** A planted paw moves opposite world travel, so its world position is constant. */
export function catPaw(distance: number, offset: number, hind: boolean) {
  const p = mod(distance / CAT_STRIDE + offset), stance = .27;
  const reach = CAT_STRIDE * stance / DEPTH / 2;
  if (p < stance) return { forward: reach - p * CAT_STRIDE / DEPTH, height: 0, planted: true };
  const t = (p - stance) / (1 - stance);
  const ease = t * t * (3 - 2 * t);
  return { forward: -reach + 2 * reach * ease, height: Math.sin(Math.PI * t) * (hind ? 9 : 7), planted: false };
}
function joint(a: Point, b: Point, lengthA: number, lengthB: number, bend: number): Point {
  const dx=b.x-a.x, dy=b.y-a.y, d=Math.max(.001,Math.hypot(dx,dy));
  const reach=Math.min(d,lengthA+lengthB-.01);
  const along=(lengthA*lengthA-lengthB*lengthB+reach*reach)/(2*reach);
  const across=Math.sqrt(Math.max(0,lengthA*lengthA-along*along))*bend;
  return {x:a.x+dx/d*along-dy/d*across,y:a.y+dy/d*along+dx/d*across};
}
/** Cat-only articulated study. The spine is horizontal in world space, above four paws. */
export function drawCatRun(c: Context, distance: number, seed: number): void {
  const travel=distance+seed/97*CAT_STRIDE, phase=travel/CAT_STRIDE;
  const gather=Math.cos(TAU*(phase-.12));
  const rise=1.4+1.4*Math.cos(TAU*(phase-.36));
  const hip={forward:-10+gather*2,height:17+rise};
  const shoulder={forward:10-gather*1.5,height:17+rise*.7};
  const project=(lateral:number,forward:number,height:number):Point => ({x:lateral+forward*.23,y:forward*DEPTH-height+14});
  const oval=(p:Point,rx:number,ry:number,color:string,angle=0)=>{c.fillStyle=color;c.beginPath();c.ellipse(p.x,p.y,rx,ry,angle,0,TAU);c.fill();};
  const stroke=(points:Point[],color:string,width:number)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(points[0].x,points[0].y);for(const p of points.slice(1))c.lineTo(p.x,p.y);c.stroke();};
  c.save();c.lineCap='round';c.lineJoin='round';
  oval({x:0,y:15},15,9,'rgba(37,62,56,.14)',-.28);
  const leg=(hind:boolean,far:boolean)=>{
    const offset=hind?(far?0:.1):(far?.49:.59);
    const paw=catPaw(travel,offset,hind), root=hind?hip:shoulder;
    const lateral=(far?-1:1)*5.2;
    const root2={x:root.forward,y:root.height};
    const tip={x:(hind?-10:10)+paw.forward,y:paw.height};
    // Solve joints in the vertical travel plane, then project; bones do not stretch.
    const knee=joint(root2,tip,hind?10:11,hind?12:11,hind?1:-1);
    const points=[project(lateral,root2.x,root2.y),project(lateral,knee.x,knee.y),project(lateral-paw.forward*.23,tip.x,tip.y)];
    stroke(points,'#52657c',hind?5.4:4.2);
    stroke(points,'#9cabbc',hind?3.4:2.5);
    oval(points[2],2.6,1.5,'#b3c0cc');
  };
  leg(true,true);leg(false,true);
  const h=project(0,hip.forward,hip.height),s=project(0,shoulder.forward,shoulder.height);
  const tail=project(0,hip.forward-4,hip.height+1);
  c.strokeStyle='#65768d';c.lineWidth=3;c.beginPath();c.moveTo(tail.x,tail.y);
  c.bezierCurveTo(tail.x-9,tail.y-2,tail.x-15,tail.y-9-gather*2,tail.x-12,tail.y-15-gather*2);c.stroke();
  // The back arches on collection and lengthens on extension; the belly follows the rib cage.
  c.fillStyle='#8295aa';c.beginPath();c.moveTo(h.x-6,h.y);
  c.bezierCurveTo(h.x-9,h.y-7,h.x-2,h.y-10-gather*2,s.x+2,s.y-5);
  c.bezierCurveTo(s.x+10,s.y-3,s.x+8,s.y+6,s.x+2,s.y+7);
  c.bezierCurveTo(h.x+4,h.y+8,h.x-8,h.y+7,h.x-6,h.y);c.fill();
  stroke([h,{x:(h.x+s.x)/2-2,y:(h.y+s.y)/2-4-gather},s],'#acb9c6',4);
  oval(h,6,7,'#8c9fb3');oval(s,6,7,'#92a5b7');
  leg(true,false);leg(false,false);
  // Shoulder covers the limb root; head stays level instead of pointing into the ground.
  oval({x:s.x+4,y:s.y},3.8,5.8,'#9baebf',-.2);
  const head=project(0,16-gather*.5,21+rise*.45);
  for(const side of [-1,1]){
    c.fillStyle='#71869c';c.beginPath();c.moveTo(head.x+side*3,head.y-3);c.lineTo(head.x+side*6,head.y-11);c.lineTo(head.x+side*8,head.y-2);c.closePath();c.fill();
    stroke([{x:head.x+side*5,y:head.y-5},{x:head.x+side*6,y:head.y-8}],'#c9a7ae',1.4);
  }
  oval(head,7.5,6.5,'#a8b8c6');
  for(const side of [-1,1]){
    oval({x:head.x+side*3.6,y:head.y},2.3,1.8,'#344555',side*-.15);
    oval({x:head.x+side*3.6,y:head.y+.1},1.1,1.3,'#d9c47c');
    oval({x:head.x+side*2.5,y:head.y+3},3,2,'#d6dce0');
    stroke([{x:head.x+side*4,y:head.y+3},{x:head.x+side*10,y:head.y+2}],'#ced6db',.65);
  }
  oval({x:head.x,y:head.y+2.2},1.4,1,'#8e6976');
  stroke([{x:head.x,y:head.y+3},{x:head.x,y:head.y+4.2}],'#526176',.7);
  c.restore();
}
