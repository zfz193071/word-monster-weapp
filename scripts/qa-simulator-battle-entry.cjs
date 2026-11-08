// Run against this project's WeChat DevTools automator on port 9420.
// Exercises the real home listening card and battle page; does not edit saves.
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const automator = require(process.env.WM_AUTOMATOR_MODULE || 'miniprogram-automator');

const output = process.env.WM_QA_OUTPUT || '/private/tmp/wm-battle-entry-qa';
mkdirSync(output, { recursive: true });
const report = { checks: [], observations: [], note: '微信开发者工具模拟器；不代表真机听感或性能' };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let mini;

async function bounded(promise, label, ms = 15000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`${label}: timeout`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}

async function selectCorrectWord(home) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const request = (await bounded(home.data(), 'home data')).request;
    const choice = await bounded(home.$('.fruit-dialog-choice'), 'home listening card');
    if (request && choice) {
      const target = request.plan.waves[0].targetWordId;
      for (const card of await bounded(choice.$$('.choice'), 'word cards')) {
        if (await bounded(card.attribute('data-word-id'), 'word id') !== target) continue;
        const disabled = await bounded(card.property('disabled'), 'card readiness');
        if (disabled && disabled !== 'false') break;
        await bounded(card.tap(), 'answer listening card');
        return target;
      }
    }
    await wait(250);
  }
  throw Error('首页听词卡未就绪');
}

(async () => {
  try {
    mini = await bounded(automator.connect({ wsEndpoint: process.env.WM_AUTOMATOR_ENDPOINT || 'ws://127.0.0.1:9420' }), 'connect');
    const info = await bounded(mini.systemInfo(), 'system info');
    report.simulator = Object.fromEntries(['model', 'platform', 'SDKVersion', 'windowWidth', 'windowHeight'].map(key => [key, info[key]]));
    const home = await bounded(mini.reLaunch('/pages/home/home'), 'home');
    await wait(700);
    await bounded((await bounded(home.$('.start-button'), 'start button')).tap(), 'start battle');
    report.word = await selectCorrectWord(home);
    let capturedLoading = false;

    let page;
    let scene;
    for (let attempt = 0; attempt < 120; attempt++) {
      const current = await bounded(mini.currentPage(), 'current page');
      if (current.path === 'pages/battle/battle') {
        page = current;
        scene = await bounded(page.$('.fortress-preview'), 'battle scene');
        if (scene) break;
      } else {
        const state = await bounded(home.data(), 'home loading state');
        report.observations.push({ page: 'home', progress: state.entryProgress, opening: state.opening });
        if (state.opening && !capturedLoading) {
          await bounded(mini.screenshot({ path: join(output, 'entry-loading.png') }), 'entry animation screenshot');
          capturedLoading = true;
        }
      }
      await wait(150);
    }
    assert(page && scene, '听词答对后未进入战斗页');
    const first = await bounded(scene.data(), 'first battle state');
    report.firstBattle = { ready: first.ready, progress: first.loadingProgress, cover: first.stageCover, background: !!first.loadingBackground, color: first.stageLoadingColor, error: first.error };
    assert(first.ready || first.stageCover || first.loadingBackground, '首个战斗状态既无画面又未就绪');
    if (!first.ready) assert(first.loadingProgress < 100, '首帧未就绪时进度已到100%');
    await bounded(mini.screenshot({ path: join(output, 'battle-first.png') }), 'first battle screenshot');
    report.checks.push('首页正常听词后进入战斗；首个战斗状态已有背景或战斗画面');

    for (let attempt = 0; attempt < 120; attempt++) {
      const state = await bounded(scene.data(), 'battle loading state');
      report.observations.push({ page: 'battle', ready: state.ready, progress: state.loadingProgress, error: state.error });
      if (state.error) throw Error(`战场资源加载失败：${state.error}`);
      if (state.ready) {
        assert.equal(state.loadingProgress, 100);
        break;
      }
      await wait(150);
    }
    assert((await bounded(scene.data(), 'ready state')).ready, '战斗页一直未就绪');
    await bounded(mini.screenshot({ path: join(output, 'battle-ready.png') }), 'ready battle screenshot');
    report.checks.push('进度达到100%时场景已就绪，可见战斗画面');

    const battleData = await bounded(page.data(), 'battle toolbar state');
    assert.equal(battleData.musicVolume, 22);
    assert.equal(battleData.combatSpeed, 1);
    await bounded((await bounded(page.$('.volume-trigger'), 'volume button')).tap(), 'open volume');
    await wait(350);
    assert.equal((await bounded(page.data(), 'volume window state')).volumeOpen, true);
    assert.equal((await bounded(scene.data(), 'covered battle state')).inputUnavailable, true);
    assert(await bounded(page.$('.volume-dialog'), 'volume dialog'));
    await bounded(mini.screenshot({ path: join(output, 'volume-dialog.png') }), 'volume screenshot');
    const slider = await bounded(page.$('.volume-control slider'), 'volume slider');
    // The automator's slideTo changes the native thumb without emitting change.
    // Dispatch change explicitly to verify the mini-program binding; a human
    // drag and audible level still require device acceptance.
    await bounded(slider.trigger('change', { value: 60 }), 'volume change event');
    await wait(300);
    await bounded(mini.screenshot({ path: join(output, 'volume-adjusted.png') }), 'adjusted volume screenshot');
    report.adjustedVolume = (await bounded(page.data(), 'adjusted volume state')).musicVolume;
    assert.equal(report.adjustedVolume, 60, `音量滑块未响应：${report.adjustedVolume}`);
    await bounded((await bounded(page.$('.volume-heading button'), 'close volume')).tap(), 'close volume');
    await wait(350);
    assert.equal((await bounded(page.data(), 'closed volume state')).volumeOpen, false);
    assert.equal((await bounded(scene.data(), 'resumed battle state')).inputUnavailable, false);
    await bounded(mini.screenshot({ path: join(output, 'volume-closed.png') }), 'closed volume screenshot');
    report.checks.push('默认音量22%，调节窗口可见；change事件更新数值，关闭后恢复战斗');

    for (const speed of [1.5, 2, 2.5, 1]) {
      await bounded((await bounded(page.$('.speed-trigger'), 'speed button')).tap(), 'cycle speed');
      await wait(250);
      assert.equal((await bounded(page.data(), 'speed state')).combatSpeed, speed);
    }
    report.checks.push('倍速按钮按1→1.5→2→2.5→1循环');
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.error = error.stack || String(error);
    process.exitCode = 1;
    console.error(report.error);
  } finally {
    if (mini) {
      try { await bounded(mini.reLaunch('/pages/home/home'), 'return home', 6000); report.returnedHome = true; }
      catch (error) { report.cleanupError = String(error); }
      try { await bounded(mini.disconnect(), 'disconnect', 3000); } catch {}
    }
    writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, checks: report.checks, output }));
  }
})();
