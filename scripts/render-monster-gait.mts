import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { CanvasScene } from '../miniprogram/fortress/canvas-scene';
import { createOpeningEncounter, openingArt } from '../miniprogram/fortress/opening-encounter';
import { ANIMAL_LOCOMOTION } from '../miniprogram/fortress/monster-gait';

const require = createRequire(import.meta.url);
const { createCanvas, Image } = require(process.env.WM_CANVAS_MODULE ?? '@napi-rs/canvas');
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, process.env.WM_GAIT_OUTPUT ?? 'docs/visual-audit/locomotion/revised');
await mkdir(output, {recursive: true});
(globalThis as any).wx = {createOffscreenCanvas: ({width, height}: any) => createCanvas(width, height)};
const reports: any[] = [];
for (const [device, width, height] of [['phone',390,620],['ipad',1024,580]] as const) {
 for (const [word, level] of [['apple',1],['cat',3],['chicken',3],['rabbit',3],['elephant',3]] as const) {
  if (process.env.WM_GAIT_CAT_ONLY === '1' && word !== 'cat') continue;
  const canvas = createCanvas(width * 2, height * 2);
  let id = 0;
  const frames = new Map<number, (now: number) => void>();
  canvas.requestAnimationFrame = (cb: (now: number) => void) => {frames.set(++id, cb); return id;};
  canvas.cancelAnimationFrame = (id: number) => frames.delete(id);
  canvas.createImage = () => {
   const image = new Image(), src = Object.getOwnPropertyDescriptor(Image.prototype, 'src')!;
   Object.defineProperty(image, 'src', {set(value: string) {src.set!.call(image, resolve(root, 'miniprogram', value.replace(/^\//,'')));}, get() {return src.get!.call(image);}});
   return image;
  };
  const history = word === 'chicken' ? ['duck','cat','horse'] : [];
  const initial = createOpeningEncounter('gait-natural-99', word, 1, 0, undefined, undefined, history, level);
  const words = [...new Set([...initial.monsters, ...(initial.incomingMonsters ?? [])].map(m => m.wordId))];
  const scene = new CanvasScene(canvas, {initial, width, height, dpr:2, levelId:level, clientLeft:0, preview:false,
   art:openingArt(initial.monsters[0].wordId, words), onHud(){}, onEvents(){}, onError(message){throw Error(message);}});
  const name = `${device}-${word}`;
  const encoder = spawn('ffmpeg',['-v','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size',`${width*2}x${height*2}`,'-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','ultrafast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',resolve(output,`${name}.mp4`)],{stdio:['pipe','ignore','pipe']});
  let error = ''; encoder.stderr.on('data', data => error += data);
  const encoded = new Promise<void>((resolve,reject) => {encoder.on('error',reject); encoder.on('close',code => code === 0 ? resolve() : reject(Error(error)));});
  encoded.catch(()=>{}); encoder.stdin.on('error',()=>{});
  const samples: any[] = [];
  try {
   assert.equal(await scene.load(),true);
   for(let frame=0;frame<360;frame++) {
    const callbacks=[...frames.values()]; frames.clear(); callbacks.forEach(cb=>cb(frame*1000/30));
    if(frame % 30 === 0) samples.push({second:frame/30, tick:scene.snapshot!.tick, monsters:scene.snapshot!.monsters.map(m=>({id:m.id,word:m.wordId,y:m.position.y,status:m.status}))});
    if(frame===240) await writeFile(resolve(output,`${name}.png`),canvas.toBuffer('image/png'));
    if(!encoder.stdin.write(canvas.data())) await once(encoder.stdin,'drain');
   }
   encoder.stdin.end(); await encoded;
   reports.push({name,width,height,dpr:2,frames:360,seconds:12,words,samples,source:'Unmodified opening encounter and production frame loop; offscreen first 12 seconds, not full-wave/device acceptance'});
  } finally {scene.dispose(); if(!encoder.stdin.writableEnded) encoder.kill();}
  console.log(name);
 }
}
await writeFile(resolve(output,'report.json'),JSON.stringify({mapping:ANIMAL_LOCOMOTION,runs:reports},null,2)+'\n');
await writeFile(resolve(output,'review.html'),`<!doctype html><html lang="zh"><meta charset="utf-8"><title>怪物步态动态审查</title><style>body{font:16px system-ui;background:#f6f1e7;margin:24px}video{width:100%;max-width:1024px}article{margin:24px 0}</style><h1>#99 怪物移动姿态</h1><p>正式出怪与Canvas帧循环，手机/平板DPR2、30fps、前12秒。苹果僵尸、四足猫、鸡鸭与猫马混编、兔子、大象。离屏证据，不是微信模拟器、真机或完整关卡验收。现有动物材质仍待#85/#88升级。</p>${reports.map(r=>`<article><h2>${r.name}</h2><video controls loop muted preload="metadata" src="${r.name}.mp4" poster="${r.name}.png"></video></article>`).join('')}</html>`);
