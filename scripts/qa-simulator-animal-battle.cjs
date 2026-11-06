// Capture naturally spawned animals at actual battle size in WeChat DevTools.
// No combat-state or storage injection. Start this project's automator on 9420.
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const automator = require(process.env.WM_AUTOMATOR_MODULE || 'miniprogram-automator');
const { answerSkillQuiz } = require('./qa-skill-quiz.cjs');

const output = process.env.WM_QA_OUTPUT || '/private/tmp/wm-animal-battle-qa';
mkdirSync(output, { recursive: true });
const report = { frames: [], note: '正常战斗随机出怪；截图只证明该次模拟器所见动物，不代表全部16种或真机儿童盲认' };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let mini;
async function bounded(promise, label, ms = 15000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label}: timeout`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function enter() {
  const home = await bounded(mini.reLaunch('/pages/home/home'), 'home');
  await wait(700);
  await bounded((await bounded(home.$('.levels-button'), 'level map')).tap(), 'open level map');
  let levelSelected = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (!levelSelected) {
      for (const card of await bounded(home.$$('.level-card'), 'level cards')) {
        if (await bounded(card.attribute('data-level-id'), 'level id') === '3') {
          const disabled = await bounded(card.property('disabled'), 'level readiness');
          if (disabled && disabled !== 'false') throw Error('动物关第3关尚未解锁');
          await bounded(card.tap(), 'select animal level');
          levelSelected = true;
          break;
        }
      }
    }
    const request = (await bounded(home.data(), 'entry')).request;
    const choice = await bounded(home.$('.fruit-dialog-choice'), 'entry choice');
    if (request && choice) {
      report.levelId = request.plan.levelId;
      report.plannedAnimals = [...new Set(request.plan.waves.flatMap(wave => wave.spawnPlan.map(monster => monster.wordId)))];
      const target = request.plan.waves[0].targetWordId;
      for (const card of await bounded(choice.$$('.choice'), 'entry cards')) {
        if (await bounded(card.attribute('data-word-id'), 'word id') !== target) continue;
        const disabled = await bounded(card.property('disabled'), 'entry ready');
        if (disabled && disabled !== 'false') break;
        await bounded(card.tap(), 'answer entry');
        for (let poll = 0; poll < 120; poll++) {
          const page = await bounded(mini.currentPage(), 'current page');
          if (page.path === 'pages/battle/battle') {
            const scene = await bounded(page.$('.fortress-preview'), 'scene');
            if (scene && (await bounded(scene.data(), 'ready state')).ready) return { page, scene };
          }
          await wait(150);
        }
        throw Error('战斗页未就绪');
      }
    }
    await wait(250);
  }
  throw Error('开战听词卡未就绪');
}
async function chooseSkill(scene, offer) {
  const panel = await bounded(scene.$('.upgrade-choice'), 'skill panel');
  const offered = new Set(offer.cards.map(card => card.id));
  for (const card of await bounded(panel.$$('.skill-card'), 'skill cards')) {
    if (offered.has(await bounded(card.attribute('data-card-id'), 'skill id'))) {
      await bounded(card.tap(), 'choose skill'); return;
    }
  }
  throw Error('技能面板没有可选择的卡');
}
(async () => {
  try {
    mini = await bounded(automator.connect({ wsEndpoint: process.env.WM_AUTOMATOR_ENDPOINT || 'ws://127.0.0.1:9420' }), 'connect');
    const info = await bounded(mini.systemInfo(), 'system info');
    report.simulator = Object.fromEntries(['model', 'platform', 'SDKVersion', 'windowWidth', 'windowHeight'].map(key => [key, info[key]]));
    const { scene } = await enter();
    assert.equal(report.levelId, 3, `当前默认是第${report.levelId}关，请从首页选择动物关后重试`);
    for (let index = 0; index < 20; index++) {
      const state = await bounded(scene.data(), 'battle state');
      if (state.failed || state.completed) break;
      if (state.skillQuiz) await answerSkillQuiz(scene, true);
      else if (state.upgradeOffer) await chooseSkill(scene, state.upgradeOffer);
      else {
        const file = `animal-battle-${String(index).padStart(2, '0')}.png`;
        await bounded(mini.screenshot({ path: join(output, file) }), 'battle screenshot');
        report.frames.push({ file, wave: state.waveNumber, hp: state.hud.hp, experience: state.experience });
      }
      await wait(1200);
    }
    assert(report.frames.length >= 3, '自然战斗截图不足三帧');
    report.passed = true;
  } catch (error) { report.passed = false; report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error); }
  finally {
    if (mini) {
      try { await bounded(mini.reLaunch('/pages/home/home'), 'return home', 6000); report.returnedHome = true; } catch (error) { report.cleanupError = String(error); }
      try { await bounded(mini.disconnect(), 'disconnect', 3000); } catch {}
    }
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, frames: report.frames.length, output }));
  }
})();
