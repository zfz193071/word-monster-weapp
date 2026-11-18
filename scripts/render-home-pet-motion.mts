import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { HomeRoomScene, homePetIdlePose } from '../miniprogram/home/room-scene';

const require=createRequire(import.meta.url);
const {createCanvas,Image}=require(process.env.WM_CANVAS_MODULE??'@napi-rs/canvas');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'docs/visual-audit/pets/home-motion');
await mkdir(output,{recursive:true});
const width=390,height=620,dpr=2;
const canvas=createCanvas(width*dpr,height*dpr);
canvas.requestAnimationFrame=()=>1;canvas.cancelAnimationFrame=()=>{};
canvas.createImage=()=>{
  const image=new Image();const source=Object.getOwnPropertyDescriptor(Image.prototype,'src')!;
  Object.defineProperty(image,'src',{set(value:string){source.set!.call(image,resolve(root,'miniprogram',value.replace(/^\//,'')));},get(){return source.get!.call(image);}});
  return image;
};
const scene=new HomeRoomScene(canvas,width,height,dpr);
scene.setPet({level:7,equipped:[]});await scene.loadCharacterImages();
const samples=[
  {time:0,label:'依偎脚边'},
  {time:3.59,label:'眨眼'},
  {time:4.96,label:'左耳轻动'},
  {time:6.4,label:'轻微呼吸'},
  {time:9.2,label:'自然站立'},
  {time:12.86,label:'右耳轻动'},
];
const cellWidth=260,cellHeight=270,sheet=createCanvas(cellWidth*3,cellHeight*2),context=sheet.getContext('2d');
context.fillStyle='#eef0e7';context.fillRect(0,0,sheet.width,sheet.height);
const report=[];
for(const [index,sample] of samples.entries()){
  (scene as any).elapsed=sample.time;(scene as any).draw();
  const column=index%3,row=Math.floor(index/3),x=column*cellWidth,y=row*cellHeight;
  context.fillStyle='#ffffff';context.fillRect(x+4,y+4,cellWidth-8,cellHeight-8);
  // Crop the pet at native DPR so eyelids and ear edges remain inspectable.
  context.drawImage(canvas,230,530,320,320,x+10,y+10,240,240);
  context.fillStyle='#263d38';context.font='15px system-ui';context.fillText(`${sample.label} · ${sample.time.toFixed(2)}s`,x+14,y+258);
  report.push({...sample,pose:homePetIdlePose(sample.time)});
}
scene.dispose();
await writeFile(resolve(output,'contact-sheet.png'),sheet.toBuffer('image/png'));
await writeFile(resolve(output,'report.json'),JSON.stringify({date:'2026-11-18',renderer:'HomeRoomScene',device:{width,height,dpr},samples},null,2)+'\n');
console.log(`Rendered ${samples.length} home pet motion samples.`);
