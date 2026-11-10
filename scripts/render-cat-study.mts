import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {drawCatRun,CAT_STRIDE} from '../miniprogram/fortress/cat-run-art';
const require=createRequire(import.meta.url);
const {createCanvas}=require(process.env.WM_CANVAS_MODULE??'@napi-rs/canvas');
const output='docs/visual-audit/locomotion/cat-study';await mkdir(output,{recursive:true});
const canvas=createCanvas(780,520), c=canvas.getContext('2d');
const encoder=spawn('ffmpeg',['-v','error','-y','-f','rawvideo','-pixel_format','rgba','-video_size','780x520','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',`${output}/cat-closeup.mp4`]);
let errors='';encoder.stderr.on('data',x=>errors+=x);
const done=new Promise<void>((resolve,reject)=>{encoder.on('error',reject);encoder.on('close',code=>code===0?resolve():reject(Error(errors)));});
for(let frame=0;frame<180;frame++){
 c.fillStyle='#e1e7d7';c.fillRect(0,0,780,520);c.fillStyle='#354538';c.font='22px sans-serif';c.fillText('Cat motion study — 1× / 4×',30,35);
 // Isolated diagnostic at 20 logical pixels/sec; battle replay uses actual combat movement.
 const y=frame/30*20;
 for(const [x,scale] of [[180,2],[500,8]]){
  c.save();c.translate(x,280);c.scale(scale,scale);drawCatRun(c,y,0);c.restore();
 }
 if(!encoder.stdin.write(canvas.data()))await once(encoder.stdin,'drain');
}
encoder.stdin.end();await done;
const sheet=createCanvas(960,180),sc=sheet.getContext('2d');sc.fillStyle='#e1e7d7';sc.fillRect(0,0,960,180);
for(let i=0;i<8;i++){sc.save();sc.translate(60+i*120,100);sc.scale(2.6,2.6);drawCatRun(sc,i*CAT_STRIDE/8,0);sc.restore();}
await writeFile(`${output}/cat-poses.png`,sheet.toBuffer('image/png'));
