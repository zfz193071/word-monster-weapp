// Natural gameplay acceptance: no injected combat state or storage edits.
const a=require(process.env.WM_AUTOMATOR_MODULE || 'miniprogram-automator');const assert=require('node:assert/strict');const fs=require('node:fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let mini;const report={};let originalDifficulty;
async function timed(p,label){let t;try{return await Promise.race([p,new Promise((_,r)=>t=setTimeout(()=>r(Error(label+' timeout')),15000))]);}finally{clearTimeout(t);}}
async function setDifficulty(home,id){await(await home.$('.difficulty-button')).tap();await sleep(200);const panel=await home.$('.home-difficulty-panel');await(await panel.$('.'+id)).tap();await sleep(200);}
async function enter(){const home=await timed(mini.reLaunch('/pages/home/home'),'home');await sleep(800);originalDifficulty=(await home.data()).difficulty;await setDifficulty(home,'easy');await(await home.$('.start-button')).tap();let chosen=false;for(let i=0;i<80&&!chosen;i++){const d=await home.data();const chooser=await home.$('.fruit-dialog-choice');if(d.request&&chooser){for(const c of await chooser.$$('.choice')){if(await c.attribute('data-word-id')===d.request.plan.waves[0].targetWordId){const disabled=await c.property('disabled');if(!disabled||disabled==='false'){await c.tap();chosen=true;}}}}if(!chosen)await sleep(250);}assert(chosen);for(let i=0;i<60;i++){const p=await mini.currentPage();if(p.path==='pages/battle/battle'){const s=await p.$('.fortress-preview');if(s&&(await s.data()).ready)return{p,s};}await sleep(250);}throw Error('battle missing');}
const path=require('node:path');const output=process.env.WM_QA_OUTPUT||'/private/tmp/wm-continuous-qa';fs.mkdirSync(output,{recursive:true});
(async()=>{try{
mini=await timed(a.connect({wsEndpoint:'ws://127.0.0.1:9420'}),'connect');report.system=await mini.systemInfo();const {p,s}=await enter();
await mini.screenshot({path:path.join(output,'gentle-opening.png')});
let state;for(let i=0;i<600;i++){state=await s.data();assert.equal(state.waveRequest,null,'unexpected between-wave listening');if(state.upgradeOffer){const choice=await s.$('.upgrade-choice'),cards=await choice.$$('.skill-card');if(cards.length)await cards[0].tap();}if(state.waveNumber>=2)break;await sleep(150);}
assert(state.waveNumber>=2,'next wave did not start');
report.progress={wave:state.waveNumber,experience:state.experience,level:state.level};
await(await p.$('.pause-button')).tap();await sleep(250);const paused=await s.data();await sleep(1600);const held=await s.data();assert.equal(held.waveNumber,paused.waveNumber);assert.equal(held.experience,paused.experience);assert.equal(held.hud.hp,paused.hud.hp);
await mini.screenshot({path:path.join(output,'paced-waves.png')});report.pausedWave=held.waveNumber;console.log(JSON.stringify(report.progress));
await(await p.$('.pause-button')).tap();let later;
for(let i=0;i<160;i++){later=await s.data();assert.equal(later.waveRequest,null);if(later.upgradeOffer){const choice=await s.$('.upgrade-choice'),cards=await choice.$$('.skill-card');if(cards.length)await cards[0].tap();}
 if(later.waveNumber>held.waveNumber)break;await sleep(200);}
assert(later.waveNumber>held.waveNumber,'arrivals did not resume');report.resumedWave=later.waveNumber;
await(await p.$('.battle-toolbar button')).tap();await sleep(400);assert.equal((await mini.currentPage()).path,'pages/home/home');report.returnedHome=true;report.passed=true;
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('continuous arrivals and pause/resume passed');
}finally{if(mini){const home=await timed(mini.reLaunch('/pages/home/home'),'cleanup').catch(()=>null);try{if(home&&originalDifficulty)await setDifficulty(home,originalDifficulty);}finally{await mini.disconnect();}}}})().catch(e=>{report.passed=false;report.error=String(e);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1;});
