// Run with node --import tsx after starting the WeChat CLI auto service.
// Presentation fixtures only; no skill selection or storage injection.
const a=require(process.env.WM_AUTOMATOR_MODULE || 'miniprogram-automator');const assert=require('node:assert/strict');const fs=require('node:fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let mini;const report={};
async function timed(p,label){let t;try{return await Promise.race([p,new Promise((_,r)=>t=setTimeout(()=>r(Error(label+' timeout')),15000))]);}finally{clearTimeout(t);}}
async function enter(){const home=await timed(mini.reLaunch('/pages/home/home'),'home');await sleep(800);await(await home.$('.start-button')).tap();let chosen=false;for(let i=0;i<80&&!chosen;i++){const d=await home.data();const chooser=await home.$('.fruit-dialog-choice');if(d.request&&chooser){for(const c of await chooser.$$('.choice')){if(await c.attribute('data-word-id')===d.request.plan.waves[0].targetWordId){const disabled=await c.property('disabled');if(!disabled||disabled==='false'){await c.tap();chosen=true;}}}}if(!chosen)await sleep(250);}assert(chosen);for(let i=0;i<60;i++){const p=await mini.currentPage();if(p.path==='pages/battle/battle'){const s=await p.$('.fortress-preview');if(s&&(await s.data()).ready)return{p,s};}await sleep(250);}throw Error('battle missing');}
const path=require('node:path');
const {SKILL_IDS,SKILL_QUALITIES}=require('../miniprogram/fortress/skill-quality.ts');
const {qualitySkillOffer,bossSkillOffer}=require('../miniprogram/fortress/quality-skills.ts');
const output=process.env.WM_QA_OUTPUT || '/private/tmp/wm-quality-visual';fs.mkdirSync(output,{recursive:true});
(async()=>{try{
mini=await timed(a.connect({wsEndpoint:process.env.WM_AUTOMATOR_ENDPOINT || 'ws://127.0.0.1:9420'}),'connect');
report.system=await mini.systemInfo();report.fixture=true;report.note='Temporary display offers; no boss kill, skill acquisition, or device performance claim';report.qualities=[];
const {p,s}=await enter();let natural;
for(let i=0;i<240;i++){natural=await s.data();if(natural.upgradeOffer)break;await sleep(500);}
assert(natural.upgradeOffer && natural.frozenFrame,'natural upgrade must freeze battlefield first');
for(const q of SKILL_QUALITIES){
 const owned=Object.fromEntries(SKILL_IDS.map(id=>[id,{level:4,quality:q.id}]));
 const offer=q.id==='elite'||q.id==='legendary'?bossSkillOffer('visual-'+q.id,q.id,owned,()=>.99):qualitySkillOffer('visual-'+q.id,2,owned,{hp:1000,maxHp:1000},()=>({crude:.1,fine:.7,rare:.99})[q.id]);
 assert(offer.cards.every(c=>c.resultingQuality===q.id&&c.skillLevel===5));
 await s.setData({upgradeOffer:offer});await sleep(800);
 const choice=await s.$('.upgrade-choice');const cards=await choice.$$('.skill-card');assert.equal(cards.length,3);
 const boxes=[];
 for(let i=0;i<cards.length;i++){
  assert((await cards[i].attribute('class')).includes('quality-'+q.id));
  const badge=await cards[i].$('.quality-badge');assert((await badge.text()).includes(q.label));
  const offset=await cards[i].offset(),size=await cards[i].size();
  assert(offset.left>=0 && offset.top>=0 && offset.left+size.width<=report.system.windowWidth+1 && offset.top+size.height<=report.system.windowHeight+1,'card outside viewport');
  boxes.push({offset,size});
 }
 await mini.screenshot({path:path.join(output,q.id+'.png')});report.qualities.push({quality:q.id,cards:offer.cards,boxes});console.log('checked '+q.id);
}
await s.setData({upgradeOffer:natural.upgradeOffer});
await(await p.$('.battle-toolbar button')).tap();await sleep(500);assert.equal((await mini.currentPage()).path,'pages/home/home');report.returnedHome=true;
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log('five qualities verified; returned home');
}finally{if(mini){await timed(mini.reLaunch('/pages/home/home'),'cleanup home').catch(()=>{});await mini.disconnect();}}})().catch(e=>{console.error(e);process.exitCode=1;});
