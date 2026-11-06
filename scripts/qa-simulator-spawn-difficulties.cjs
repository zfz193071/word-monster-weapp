// Check natural spawn layouts in all four difficulties through the real UI.
// The original difficulty is restored before leaving; no combat/save injection.
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const automator = require(process.env.WM_AUTOMATOR_MODULE || 'miniprogram-automator');
const { answerSkillQuiz } = require('./qa-skill-quiz.cjs');

const output = process.env.WM_QA_OUTPUT || '/private/tmp/wm-spawn-difficulties-qa';
mkdirSync(output, { recursive: true });
const difficulties = ['easy', 'normal', 'hard', 'nightmare'];
const report = { runs: [], note: '自然战斗抽查；固定种子覆盖与精确位置检查由自动测试负责，未注入战斗状态' };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let mini;
let originalDifficulty;
async function bounded(promise, label, ms = 15000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label}: timeout`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function findElement(page, selector, label, ms = 5000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const element = await bounded(page.$(selector), label);
    if (element) return element;
    await wait(100);
  }
  throw Error(`${label}: element not found`);
}
async function setDifficulty(home, id) {
  if ((await bounded(home.data(), 'home settings')).difficulty === id) return;
  await bounded((await findElement(home, '.difficulty-button', 'difficulty button')).tap(), 'open difficulty');
  const panel = await findElement(home, '.home-difficulty-panel', 'difficulty panel');
  await bounded((await findElement(panel, `.${id}`, `${id} choice`)).tap(), `select ${id}`);
  for (let i = 0; i < 30; i++) {
    if ((await bounded(home.data(), 'saved difficulty')).difficulty === id) return;
    await wait(100);
  }
  throw Error(`难度${id}未保存`);
}
async function enter(home, difficulty) {
  await setDifficulty(home, difficulty);
  await bounded((await bounded(home.$('.start-button'), 'start button')).tap(), 'start');
  for (let attempt = 0; attempt < 100; attempt++) {
    const request = (await bounded(home.data(), 'entry request')).request;
    const choice = await bounded(home.$('.fruit-dialog-choice'), 'entry choice');
    if (request && choice) {
      assert.equal(request.plan.difficulty, difficulty);
      const target = request.plan.waves[0].targetWordId;
      for (const card of await bounded(choice.$$('.choice'), 'entry cards')) {
        if (await bounded(card.attribute('data-word-id'), 'word id') !== target) continue;
        const disabled = await bounded(card.property('disabled'), 'entry readiness');
        if (disabled && disabled !== 'false') break;
        await bounded(card.tap(), 'answer entry');
        for (let poll = 0; poll < 120; poll++) {
          const page = await bounded(mini.currentPage(), 'current page');
          if (page.path === 'pages/battle/battle') {
            const scene = await bounded(page.$('.fortress-preview'), 'scene');
            if (scene && (await bounded(scene.data(), 'scene ready')).ready) return { page, scene };
          }
          await wait(150);
        }
        throw Error('战斗页未就绪');
      }
    }
    await wait(200);
  }
  throw Error('开战词卡未就绪');
}
async function chooseSkill(scene, offer) {
  const panel = await bounded(scene.$('.upgrade-choice'), 'skill panel');
  const offered = new Set(offer.cards.map(card => card.id));
  for (const card of await bounded(panel.$$('.skill-card'), 'skill cards')) {
    if (offered.has(await bounded(card.attribute('data-card-id'), 'skill id'))) {
      await bounded(card.tap(), 'choose skill'); return;
    }
  }
  throw Error('没有可点技能卡');
}
(async () => {
  try {
    mini = await bounded(automator.connect({ wsEndpoint: process.env.WM_AUTOMATOR_ENDPOINT || 'ws://127.0.0.1:9420' }), 'connect');
    const info = await bounded(mini.systemInfo(), 'system info');
    report.simulator = Object.fromEntries(['model', 'platform', 'SDKVersion', 'windowWidth', 'windowHeight'].map(key => [key, info[key]]));
    for (const difficulty of difficulties) {
      const home = await bounded(mini.reLaunch('/pages/home/home'), 'home');
      await wait(700);
      if (!originalDifficulty) originalDifficulty = (await bounded(home.data(), 'initial settings')).difficulty;
      const { page, scene } = await enter(home, difficulty);
      const run = { difficulty, frames: [] };
      for (let index = 0; index < 12; index++) {
        const state = await bounded(scene.data(), 'combat state');
        if (state.failed || state.completed) break;
        if (state.skillQuiz) await answerSkillQuiz(scene, true);
        else if (state.upgradeOffer) await chooseSkill(scene, state.upgradeOffer);
        else {
          const file = `${difficulty}-${String(index).padStart(2, '0')}.png`;
          await bounded(mini.screenshot({ path: join(output, file) }), 'spawn screenshot');
          run.frames.push({ file, wave: state.waveNumber, xp: state.experience, hp: state.hud.hp });
        }
        await wait(1100);
      }
      assert(run.frames.length >= 3, `${difficulty}截图不足三帧`);
      report.runs.push(run);
      await bounded(mini.reLaunch('/pages/home/home'), 'return home');
      await wait(500);
    }
    const home = await bounded(mini.currentPage(), 'restore home');
    await setDifficulty(home, originalDifficulty);
    assert.equal((await bounded(home.data(), 'restored difficulty')).difficulty, originalDifficulty);
    report.restoredDifficulty = originalDifficulty;
    report.passed = true;
  } catch (error) { report.passed = false; report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error); }
  finally {
    if (mini) {
      try {
        const home = await bounded(mini.reLaunch('/pages/home/home'), 'cleanup home', 6000);
        if (originalDifficulty) await setDifficulty(home, originalDifficulty);
        report.returnedHome = true;
      } catch (error) { report.cleanupError = String(error); }
      try { await bounded(mini.disconnect(), 'disconnect', 3000); } catch {}
    }
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, runs: report.runs.length, output }));
  }
})();
