import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';
import { summonSupportSoldier } from '../miniprogram/fortress/combat';
import { createBattlePet } from '../miniprogram/pets/battle';
const require = createRequire(import.meta.url);
const { createCanvas, Image, loadImage } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = fileURLToPath(new URL('../', import.meta.url));
const samples = resolve(root, 'docs/visual-audit/samples');
await mkdir(resolve(samples, 'scenes'), { recursive: true });
const rabbit = await loadImage(resolve(samples, 'variants/rabbit-battle-128.png'));
const bird = await loadImage(resolve(samples, 'variants/bird-battle-128.png'));
const report = [];
for (const [device, width, height] of [['phone',390,620], ['ipad',1024,580]] as const) {
 for (const density of ['low','high']) {
  const count = density === 'low' ? 6 : 18;
  let initial: any = createOpeningEncounter('sample-art-review', 'apple', 1);
  for (let i=0;i<3;i++) initial=summonSupportSoldier(initial,`sample-ally-${i}`)!;
  initial={...initial,pet:createBattlePet({level:1,equipped:[]}),monsters:Array.from({length:count},(_,i)=>({...initial.monsters[0],id:`sample-${i}`,wordId:['apple','rabbit','bird'][i%3],status:'alive',position:{x:40+(i%6)*56,y:90+Math.floor(i/6)*115+(i%2)*30}}))};
  const canvas=createCanvas(width*2,height*2);
  canvas.requestAnimationFrame=()=>1;canvas.cancelAnimationFrame=()=>{};
  canvas.createImage=()=>{const im=new Image();const prop=Object.getOwnPropertyDescriptor(Image.prototype,'src')!;Object.defineProperty(im,'src',{set(value:string){prop.set!.call(im,value==='/assets/images/apple.png'?resolve(samples,'variants/apple-battle-128.png'):resolve(root,'miniprogram',value.replace(/^\//,'')))},get(){return prop.get!.call(im)}});return im};
  (globalThis as any).wx={createOffscreenCanvas:({width,height}:any)=>createCanvas(width,height)};
  const scene=new CanvasScene(canvas,{initial,width,height,dpr:2,clientLeft:0,preview:false,art:openingArt('apple',['apple','rabbit','bird']),onHud(){},onEvents(){},onError(e){throw Error(e)}});
  // Review-only appearance substitution; no runtime code or hitboxes are changed.
  (scene as any).drawAnimal=(id:string,x:number,y:number)=>{const c=canvas.getContext('2d');c.drawImage(id==='rabbit'?rabbit:bird,x-24,y-26,48,48)};
  scene.setPaused(true);if(!await scene.load())throw Error('Scene load failed');
  const snapshot=scene.snapshot!;
  const state={...snapshot,tick:70,monsters:snapshot.monsters.map((m,i)=>({...m,position:{x:36+(i%6)*(snapshot.arenaWidth!-72)/5,y:90+Math.floor(i/6)*115+(i%2)*30}}))};
  (scene as any).draw(state);
  const name=`${device}-${density}`;
  await writeFile(resolve(samples,`scenes/${name}.png`),canvas.toBuffer('image/png'));
  report.push({name,width,height,dpr:2,count,arenaWidth:scene.snapshot!.arenaWidth,source:'Current CanvasScene with fixed review fixture and image substitutions; not gameplay/device capture',animalBox:48,appleBadge:21.25,petHealthBar:false});
  scene.dispose();
 }
}
await writeFile(resolve(samples,'scenes/report.json'),JSON.stringify(report,null,2)+'\n');
console.log('Rendered four static scene review fixtures.');
