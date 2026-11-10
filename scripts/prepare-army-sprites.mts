// Preserve generated alpha; resize only. Never remove backgrounds by color.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SOLDIER_TYPES} from '../miniprogram/fortress/army';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require(process.env.WM_CANVAS_MODULE??'@napi-rs/canvas');
const root='docs/visual-audit/army';
await mkdir('miniprogram/assets/images/army',{recursive:true});
const manifest=[];
for(const type of SOLDIER_TYPES){
 const source=`${root}/originals/${type}.png`, data=await readFile(source), image=await loadImage(data);
 const probe=createCanvas(image.width,image.height),ctx=probe.getContext('2d');ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,image.width,image.height).data;
 let transparent=0,visible=0;
 for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]>0)visible++;}
 if(transparent<pixels.length/4*.1||!visible)throw Error(`${type}: no genuine alpha`);
 const canvas=createCanvas(128,128);canvas.getContext('2d').drawImage(image,0,0,128,128);
 const png=canvas.toBuffer('image/png'),path=`miniprogram/assets/images/army/${type}.png`;await writeFile(path,png);
 manifest.push({type,source,path,sourceSize:[image.width,image.height],size:128,bytes:png.length,sha256:createHash('sha256').update(png).digest('hex'),sourceSha256:createHash('sha256').update(data).digest('hex'),transparentFraction:transparent/(pixels.length/4)});
}
await writeFile(`${root}/sprites-manifest.json`,JSON.stringify({date:'2026-11-10',tool:'built-in image_gen',reference:'concept-01.png',rights:'AI-generated project assets; no claim of exclusive copyright',processing:'Alpha-preserving downscale only',assets:manifest},null,2)+'\n');
