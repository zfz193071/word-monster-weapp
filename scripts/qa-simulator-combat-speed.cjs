// Sample actual combat progression at each speed through the regular UI.
// No combat-state injection; interactive quiz/skill pauses are resolved normally.
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const automator = require(process.env.WM_AUTOMATOR_MODULE || 'miniprogram-automator');
const { answerSkillQuiz } = require('./qa-skill-quiz.cjs');
const { sampleWindows } = require('./qa-speed-sampling.cjs');

const output = process.env.WM_QA_OUTPUT || '/private/tmp/wm-speed-qa';
mkdirSync(output, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { intervals: [], note: '单次自然战斗；observedWindowMs仅计入两端未观察到暂停的等待窗口，不是精确战斗时间。读状态及处理答题的耗时不计入，短暂暂停可能漏采；经验差不用于验证倍率比例，不代表四档平衡或真机帧率。' };
let mini;
async function bounded(promise, label, ms = 15000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label}: timeout`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function findElement(page, selector, label) {
  for (let i = 0; i < 60; i++) {
    const element = await bounded(page.$(selector), label);
    if (element) return element;
    await wait(100);
  }
  throw Error(`${label}: element not found`);
}
async function resolvePrompts(scene) {
  let state = await bounded(scene.data(), 'combat state');
  if (state.skillQuiz) {
    for (let i = 0; i < 100; i++) {
      await bounded(answerSkillQuiz(scene, true), 'answer skill quiz');
      await wait(100);
      state = await bounded(scene.data(), 'quiz feedback');
      if (!state.skillQuiz) break;
    }
    assert(!state.skillQuiz, 'Skill quiz did not finish');
  }
  for (let i = 0; i < 3 && state.upgradeOffer; i++) {
    const offerId = state.upgradeOffer.id;
    const offered = new Set(state.upgradeOffer.cards.map(card => card.id));
    let panel;
    for (let poll = 0; poll < 120; poll++) {
      state = await bounded(scene.data(), 'skill offer state');
      if (!state.upgradeOffer) break;
      panel = await bounded(scene.$('.upgrade-choice'), 'skill panel');
      if (panel) break;
      await wait(100);
    }
    if (!state.upgradeOffer) break;
    if (!panel) throw Error(`Skill offer did not render: ${JSON.stringify({ skillPicksRemaining: state.skillPicksRemaining, skillShowGuide: state.skillShowGuide, skillQuiz: !!state.skillQuiz })}`);
    let chosen = false;
    for (const card of await bounded(panel.$$('.skill-card'), 'skill cards')) {
      if (offered.has(await bounded(card.attribute('data-card-id'), 'skill id'))) {
        await bounded(card.tap(), 'choose skill'); chosen = true; break;
      }
    }
    assert(chosen, 'No offered skill card was clickable');
    for (let poll = 0; poll < 80; poll++) {
      await wait(100);
      state = await bounded(scene.data(), 'post-skill state');
      if (!state.upgradeOffer || state.upgradeOffer.id !== offerId) break;
    }
    assert(!state.upgradeOffer || state.upgradeOffer.id !== offerId, 'Skill selection did not advance');
  }
  assert(!state.skillQuiz && !state.upgradeOffer, 'Pending reward was not resolved');
  return state;
}
async function selectWord(home) {
  for (let i = 0; i < 100; i++) {
    const state = await bounded(home.data(), 'home request');
    const choice = await bounded(home.$('.fruit-dialog-choice'), 'listening dialog');
    if (state.request && choice) {
      for (const card of await bounded(choice.$$('.choice'), 'word cards')) {
        if (await bounded(card.attribute('data-word-id'), 'word id') !== state.request.plan.waves[0].targetWordId) continue;
        const disabled = await bounded(card.property('disabled'), 'card state');
        if (!disabled || disabled === 'false') { await bounded(card.tap(), 'answer listening card'); return; }
      }
    }
    await wait(150);
  }
  throw Error('No correct listening card found');
}
(async () => {
  try {
    mini = await bounded(automator.connect({ wsEndpoint: process.env.WM_AUTOMATOR_ENDPOINT || 'ws://127.0.0.1:9420' }), 'connect');
    const info = await bounded(mini.systemInfo(), 'system info');
    report.simulator = Object.fromEntries(['model', 'platform', 'SDKVersion', 'windowWidth', 'windowHeight'].map(key => [key, info[key]]));
    const home = await bounded(mini.reLaunch('/pages/home/home'), 'home');
    await wait(700);
    await bounded((await findElement(home, '.start-button', 'start button')).tap(), 'start battle');
    await selectWord(home);
    let page; let scene;
    for (let i = 0; i < 120; i++) {
      page = await bounded(mini.currentPage(), 'current page');
      if (page.path === 'pages/battle/battle') {
        scene = await bounded(page.$('.fortress-preview'), 'battle scene');
        if (scene && (await bounded(scene.data(), 'scene ready')).ready) break;
      }
      await wait(150);
    }
    assert(scene && (await bounded(scene.data(), 'scene ready')).ready, 'Battle scene did not become ready');
    assert.equal((await bounded(page.data(), 'initial speed')).combatSpeed, 1);
    for (const speed of [1, 1.5, 2, 2.5]) {
      let currentSpeed = (await bounded(page.data(), 'speed state')).combatSpeed;
      for (let attempts = 0; currentSpeed !== speed && attempts < 4; attempts++) {
        await bounded((await findElement(page, '.speed-trigger', 'speed button')).tap(), 'cycle speed');
        await wait(200);
        currentSpeed = (await bounded(page.data(), 'speed state')).combatSpeed;
      }
      assert.equal(currentSpeed, speed, 'Speed button did not reach target');
      const sample = await sampleWindows({
        read: () => bounded(scene.data(), 'sample state'),
        resolvePrompts: () => resolvePrompts(scene), wait,
      });
      const { before, after } = sample;
      const item = { speed, wallMs: Math.round(sample.wallMs), observedWindowMs: Math.round(sample.observedWindowMs),
        excludedWindows: sample.excludedWindows, complete: sample.complete, startXp: before.experience, endXp: after.experience,
        xpDelta: after.experience - before.experience, startWave: before.waveNumber, endWave: after.waveNumber,
        startHp: before.hud.hp, endHp: after.hud.hp };
      report.intervals.push(item);
      assert(sample.complete, 'Battle ended before the sampling window completed');
      await bounded(mini.screenshot({ path: join(output, `${String(speed).replace('.', '_')}x.png`) }), 'speed screenshot');
    }
    report.finalSpeed = (await bounded(page.data(), 'final speed')).combatSpeed;
    assert.equal(report.intervals.length, 4);
    report.passed = true;
  } catch (error) {
    report.passed = false; report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error);
  } finally {
    if (mini) {
      try { await bounded(mini.reLaunch('/pages/home/home'), 'return home', 6000); report.returnedHome = true; } catch {}
      try { await bounded(mini.disconnect(), 'disconnect', 3000); } catch {}
    }
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, intervals: report.intervals.length, output }));
  }
})();
