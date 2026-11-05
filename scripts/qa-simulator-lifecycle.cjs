// Start DevTools with `cli auto --project <repo> --auto-port 9420` first.
// WM_AUTOMATOR_MODULE and WM_CANVAS_MODULE may point to external installations
// of miniprogram-automator and @napi-rs/canvas respectively.
// Uses normal UI/gameplay; does not replace combat state or edit saved balances.
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createCanvas, loadImage } = require(process.env.WM_CANVAS_MODULE || '@napi-rs/canvas');
const automator = require(process.env.WM_AUTOMATOR_MODULE || 'miniprogram-automator');
const output = process.env.WM_QA_OUTPUT || '/private/tmp/wm-lifecycle-qa';
mkdirSync(output, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { checks: [], note: '微信开发者工具模拟器；不代表真机帧率或人工听审' };
let mini;
async function bounded(promise, label, ms = 15000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label}: timeout`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function selectWord(choice, target) {
  for (const card of await bounded(choice.$$('.choice'), 'choice cards')) {
    if (await bounded(card.attribute('data-word-id'), 'word id') !== target) continue;
    const disabled = await bounded(card.property('disabled'), 'choice readiness');
    if (disabled && disabled !== 'false') return false;
    await bounded(card.tap(), 'select word'); return true;
  }
  return false;
}
async function enter() {
  const home = await bounded(mini.reLaunch('/pages/home/home'), 'home'); await delay(800);
  await bounded((await bounded(home.$('.start-button'), 'start button')).tap(), 'start');
  let selected = false;
  for (let i = 0; i < 70; i++) {
    const request = await bounded(home.data('request'), 'entry request');
    const choice = await bounded(home.$('.fruit-dialog-choice'), 'home choice');
    if (request && choice && await selectWord(choice, request.plan.waves[0].targetWordId)) { selected = true; break; }
    await delay(250);
  }
  assert(selected, '听词卡片未就绪');
  for (let i = 0; i < 50; i++) {
    const page = await bounded(mini.currentPage(), 'current page');
    if (page.path === 'pages/battle/battle') {
      const scene = await bounded(page.$('.fortress-preview'), 'scene');
      if (scene && await bounded(scene.data('ready'), 'scene readiness')) return { page, scene };
    }
    await delay(250);
  }
  throw Error('未进入战斗');
}
async function capture(name, maskCards = false) {
  const path = join(output, name + '.png'); await bounded(mini.screenshot({path}), 'capture ' + name);
  const image = await loadImage(path); const canvas = createCanvas(image.width,image.height);const context = canvas.getContext('2d');context.drawImage(image,0,0);
  // Skill icons animate independently of the frozen battlefield. Mask the central
  // card band for this fixed simulator layout; retain the exposed field and hero.
  if (maskCards) context.clearRect(0, image.height * .35, image.width, image.height * .41);
  // Exclude the OS clock, navigation toolbar and bottom HUD; compare the battlefield.
  const y = Math.ceil(image.height*.18), height = Math.floor(image.height*.65);
  return context.getImageData(0,y,image.width,height).data;
}
function changedPixels(before, after) {
  assert.equal(before.length,after.length);let changed=0;
  for(let i=0;i<before.length;i+=4) if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>20) changed++;
  return changed;
}
async function chooseSkill(scene, offer) {
  const chooser = await bounded(scene.$('.upgrade-choice'), 'skill panel');
  const desired = offer.cards.find(card => card.id !== 'repair') || offer.cards[0];
  for (const card of await bounded(chooser.$$('.skill-card'), 'skill cards')) {
    if (await bounded(card.attribute('data-card-id'), 'skill id') === desired.id) {
      await bounded(card.tap(), 'choose skill'); return desired;
    }
  }
  throw Error('技能按钮缺失');
}
(async () => {
  try {
    mini = await bounded(automator.connect({wsEndpoint: 'ws://127.0.0.1:9420'}), 'connect');
    const info = await bounded(mini.systemInfo(), 'system info');
    report.simulator = Object.fromEntries(['model','platform','system','SDKVersion','windowWidth','windowHeight','pixelRatio'].map(key => [key, info[key]]));
    let { page, scene } = await enter();
    await bounded((await bounded(page.$('.pause-button'), 'pause button')).tap(), 'pause'); await delay(250);
    const paused = await capture('paused-before'); await delay(1200); const held = await capture('paused-after');
    const pausePixels=changedPixels(paused,held);assert(pausePixels<20,`暂停期间战场变化${pausePixels}像素`);
    await bounded((await bounded(page.$('.pause-button'), 'pause button')).tap(), 'resume'); await delay(300);
    const resumed=await capture('resumed-before');await delay(900);const moved=await capture('resumed-after');
    const resumePixels=changedPixels(resumed,moved);assert(resumePixels>100,'恢复后战场没有可见推进');
    report.pausePixels=pausePixels;report.resumePixels=resumePixels;
    report.checks.push('真实暂停按钮：1200ms战场像素保持不变，恢复后可见运动'); console.log(report.checks.at(-1));
    let offer;
    for (let i = 0; i < 160; i++) { offer = await bounded(scene.data('upgradeOffer'), 'upgrade offer'); if (offer) break; await delay(400); }
    assert(offer, '自然击杀未触发升级');
    await delay(300);
    const frozenState = await bounded(scene.data(), 'frozen state');
    assert(frozenState.frozenFrame, '技能选择缺少冻结帧');
    const choosing = await capture('skill-freeze-before', true); await delay(1200);
    report.skillFreezePixels = changedPixels(choosing, await capture('skill-freeze-after', true));
    assert(report.skillFreezePixels < 20);
    const heldState = await bounded(scene.data(), 'held state');
    assert.equal(heldState.frozenFrame, frozenState.frozenFrame);
    assert.equal(heldState.experience, frozenState.experience);
    await bounded(mini.screenshot({path:join(output,'skill-frozen.png')}), 'skill screenshot');
    const selected = await chooseSkill(scene, offer); await delay(900);
    assert.equal((await bounded(scene.data(), 'selected panel')).upgradeOffer, null);
    const selectedFrame=await capture('selected-before');await delay(900);assert(changedPixels(selectedFrame,await capture('selected-after'))>100,'选择技能后战场未恢复可见运动');
    const inventory = await bounded(scene.data('skillInventory'), 'inventory'); assert(inventory.some(item => item.id === selected.id));
    report.checks.push('自然升级面板冻结1200ms，选择后携带技能恢复战斗'); report.selected = selected; console.log(report.checks.at(-1));
    const observations = [];
    for (let i = 0; i < 20; i++) {
      await delay(500);
      const nextOffer = await bounded(scene.data('upgradeOffer'), 'follow-up offer'); if (nextOffer) await chooseSkill(scene, nextOffer);
      const request = await bounded(scene.data('waveRequest'), 'wave request');
      if (request) { const choice = await bounded(scene.$('.wave-choice'), 'wave choice'); if (choice) await selectWord(choice, request.plan.waves[request.waveIndex].targetWordId); }
      const current=await bounded(scene.data(),'battle view');observations.push({level:current.level,experience:current.experience,wave:current.waveNumber,hp:current.hud.hp,status:current.hud.status});
      if (await bounded(scene.data('failed'), 'failure state')) break;
    }
    report.observations = observations;
    await bounded((await bounded(page.$('.battle-toolbar button'), 'home button')).tap(), 'return home'); await delay(600);
    const home = await bounded(mini.currentPage(), 'returned page'); assert.equal(home.path,'pages/home/home');
    const homeData = await bounded(home.data(), 'returned home data'); assert.equal(homeData.opening,false); assert.equal(homeData.request,null); assert.equal(homeData.entryProgress,0);
    ({page,scene} = await enter()); await bounded((await bounded(page.$('.pause-button'), 'pause button')).tap(), 'pause fresh battle'); await delay(200);
    assert.equal((await bounded(scene.data('skillInventory'),'fresh inventory')).length,0);assert.equal(await bounded(scene.data('level'),'fresh level'),1);
    report.checks.push('退出后新开局技能面板为空、人物Lv.1，首页加载状态已清理'); console.log(report.checks.at(-1));
    await bounded(mini.screenshot({path:join(output,'fresh-run.png')}), 'fresh screenshot'); report.passed = true;
  } catch (error) { report.passed = false; report.error = error.stack; process.exitCode = 1; console.error(error.stack); }
  finally {
    if (mini) {
      try { await bounded(mini.reLaunch('/pages/home/home'), 'cleanup home', 6000); report.returnedHome = true; } catch (error) { report.cleanupError = error.message; }
      try { await bounded(mini.disconnect(), 'disconnect', 3000); } catch {}
    }
    writeFileSync(join(output,'report.json'), JSON.stringify(report,null,2)); console.log('report',join(output,'report.json'));
  }
})();
