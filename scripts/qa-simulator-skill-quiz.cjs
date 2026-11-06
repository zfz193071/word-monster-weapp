const {answerSkillQuiz}=require('./qa-skill-quiz.cjs');
// Natural gameplay acceptance: no injected combat state or storage edits.
const a=require(process.env.WM_AUTOMATOR_MODULE || 'miniprogram-automator');const assert=require('node:assert/strict');const fs=require('node:fs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let mini;const report={};let originalDifficulty;
async function timed(p,label){let t;try{return await Promise.race([p,new Promise((_,r)=>t=setTimeout(()=>r(Error(label+' timeout')),15000))]);}finally{clearTimeout(t);}}
async function setDifficulty(home,id){await(await home.$('.difficulty-button')).tap();await sleep(200);const panel=await home.$('.home-difficulty-panel');await(await panel.$('.'+id)).tap();await sleep(200);}
async function enter(){const home=await timed(mini.reLaunch('/pages/home/home'),'home');await sleep(800);originalDifficulty=(await home.data()).difficulty;await setDifficulty(home,'easy');await(await home.$('.start-button')).tap();let chosen=false;for(let i=0;i<80&&!chosen;i++){const d=await home.data();const chooser=await home.$('.fruit-dialog-choice');if(d.request&&chooser){for(const c of await chooser.$$('.choice')){if(await c.attribute('data-word-id')===d.request.plan.waves[0].targetWordId){const disabled=await c.property('disabled');if(!disabled||disabled==='false'){await c.tap();chosen=true;}}}}if(!chosen)await sleep(250);}assert(chosen);for(let i=0;i<60;i++){const p=await mini.currentPage();if(p.path==='pages/battle/battle'){const s=await p.$('.fortress-preview');if(s&&(await s.data()).ready)return{p,s};}await sleep(250);}throw Error('battle missing');}
async function returnHome(p){await(await p.$('.battle-toolbar button')).tap();for(let i=0;i<40;i++){if((await mini.currentPage()).path==='pages/home/home')return;await sleep(250);}throw Error('return home timeout');}
const path=require('node:path');const output=process.env.WM_QA_OUTPUT||'/private/tmp/wm-continuous-qa';fs.mkdirSync(output,{recursive:true});

async function waitForQuiz(s){for(let i=0;i<400;i++){const d=await s.data();if(d.skillQuiz)return d;if(d.failed)throw Error('defeated before quiz');await sleep(250);}throw Error('quiz timeout');}
async function chooseCurrent(s){const d=await s.data();const panel=await s.$('.upgrade-choice');const cards=await panel.$$('.skill-card');assert(cards.length);const offered=new Set(d.upgradeOffer.cards.map(card=>card.id));for(const card of cards){const id=await card.attribute('data-card-id');if(offered.has(id)){await card.tap();return {offer:d.upgradeOffer,id};}}throw Error('没有可点的未选技能卡');}
(async()=>{try{
 mini=await timed(a.connect({wsEndpoint:'ws://127.0.0.1:9420'}),'connect');report.system=await mini.systemInfo();const {p,s}=await enter();
 for(const correct of [true,false]){
  const initial=await waitForQuiz(s);assert.equal(initial.skillPicksRemaining,0);
  for(let i=0;i<160;i++){await answerSkillQuiz(s,correct,false);const c=await s.$('.skill-quiz');if(c&&(await c.data()).view?.phase==='answered')break;await sleep(250);}
  const question=await s.$('.skill-quiz');const view=(await question.data()).view;assert.equal(view.phase,'answered');assert.equal(view.correct,correct);assert(view.answerText);const answeredAt=Date.now();
  await mini.screenshot({path:path.join(output,correct?'correct-answer.png':'wrong-answer.png')});
  const before=await s.data();await sleep(1200);const held=await s.data();assert.equal(held.experience,before.experience);assert.equal(held.hud.hp,before.hud.hp);assert.equal(held.waveNumber,before.waveNumber);
  await answerSkillQuiz(s,correct,true);
  for(let i=0;i<100&&(await s.data()).skillQuiz;i++)await sleep(100);
  let state=await s.data();const feedbackMs=Date.now()-answeredAt;assert.equal(state.skillQuiz,null);assert.equal(state.skillPicksRemaining,correct?2:1);assert.equal(state.skillShowGuide,false);assert.equal(await (await s.$('.upgrade-choice')).$('.owned-skills'),null);
  await mini.screenshot({path:path.join(output,correct?'two-skills.png':'one-skill.png')});
  const first=await chooseCurrent(s);await sleep(300);state=await s.data();
  if(correct){assert.equal(state.skillPicksRemaining,1);assert.equal(state.skillShowGuide,true);assert(await (await s.$('.upgrade-choice')).$('.skill-guide')); assert.equal(state.skillQuiz,null);assert(!state.upgradeOffer.cards.some(c=>c.id===first.id));await mini.screenshot({path:path.join(output,'second-skill.png')});await chooseCurrent(s);await sleep(300);}
  state=await s.data();assert.equal(state.upgradeOffer,null);assert.equal(state.skillPicksRemaining,0);
  report[correct?'correct':'wrong']={level:initial.level,picks:correct?2:1,answer:view.answerText,feedbackMs};console.log(correct?'correct: two different skills passed':'wrong: one skill passed');
 }
 await returnHome(p);report.passed=true;
} catch(e){report.passed=false;report.error=String(e);console.error(e);process.exitCode=1;}
finally{if(mini){await timed(mini.reLaunch('/pages/home/home'),'cleanup').catch(()=>{});await mini.disconnect();}fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}})();
