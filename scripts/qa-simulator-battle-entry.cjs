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
  } catch (error) { throw new Error(`${label}: ${error.message}`, { cause: error }); } finally { clearTimeout(timer); }
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
    assert.equal(await bounded(home.$('loading-progress'), 'home progress absent'), null, '首页不应显示战斗进度条');
    await bounded((await bounded(home.$('.start-button'), 'start button')).tap(), 'start battle');
    report.word = await selectCorrectWord(home);
    let capturedLoading = false;

    let page;
    let scene;
    for (let attempt = 0; attempt < 120; attempt++) {
      const current = await bounded(mini.currentPage(), 'current page');
      if (current.path === 'pages/battle/battle') {
        page = current;
        const entry = await bounded(page.data(), 'battle entry state');
        report.observations.push({ page: 'battle-entry', loading: entry.entryLoading, progress: entry.entryProgress, assetsReady: entry.assetsReady, error: entry.entryError });
        if (entry.entryLoading) {
          const music = await bounded(mini.evaluate(() => {
            const pages = getCurrentPages();
            return pages[pages.length - 1].loadingMusic?.view;
          }), 'loading music state');
          report.observations.push({page: 'loading-music', ...music});
        }
        if (entry.entryError) throw Error(entry.entryError);
        assert(entry.entryLoading || entry.entryProgress === 100, '进场尚未就绪却没有加载层');
        if (entry.entryLoading) {
          const overlay = await bounded(page.$('.entry-loading'), 'entry progress overlay');
          if (!overlay) assert.equal((await bounded(page.data(), 'loading handoff race')).entryLoading, false, '加载未完成却缺少进度层');
          assert.equal(await bounded(page.$('.entry-cover'), 'obsolete entry cover'), null, '加载期间不能显示战场底图');
          if (overlay && !capturedLoading && !process.env.WM_QA_LIVE_HANDOFF) {
            await bounded(mini.screenshot({ path: join(output, 'entry-loading.png') }), 'entry animation screenshot');
            capturedLoading = true;
          }
        }
        scene = await bounded(page.$('.fortress-preview'), 'battle scene');
        if (scene) break;
      } else {
        const state = await bounded(home.data(), 'home loading state');
        report.observations.push({ page: 'home', progress: state.entryProgress, opening: state.opening });
      }
      await wait(150);
    }
    assert(page && scene, '听词答对后未进入战斗页');
    const first = await bounded(scene.data(), 'first battle state');
    report.firstBattle = { ready: first.ready, progress: first.loadingProgress, color: first.stageLoadingColor, error: first.error };
    assert(first.ready || first.stageLoadingColor, '加载中缺少纯色背景');
    if (!first.ready) assert(first.loadingProgress < 100, '首帧未就绪时进度已到100%');
    // Capture after readiness: taking a simulator screenshot during Canvas decoding can time out.
    report.checks.push('首页正常听词后进入战斗；加载层使用纯色背景');

    for (let attempt = 0; attempt < 120; attempt++) {
      const state = await bounded(scene.data(), 'battle loading state');
      report.observations.push({ page: 'battle', ready: state.ready, progress: state.loadingProgress, error: state.error });
      if (state.error) throw Error(`战场资源加载失败：${state.error}`);
      if (state.ready) {
        assert.equal(state.loadingProgress, 100);
        const entry = await bounded(page.data(), 'entry handoff');
        if (!entry.entryLoading) { assert.equal(entry.entryProgress, 100); assert.ok(state.entryFrame, '进度消失时缺少完整首帧兜底'); break; }
      }
      await wait(150);
    }
    assert((await bounded(scene.data(), 'ready state')).ready, '战斗页一直未就绪');
    assert.equal((await bounded(page.data(), 'completed handoff')).entryLoading, false);
    // Observe the unpaused handoff, not just a screenshot several seconds after pausing.
    report.handoffFrames = [];
    const handoffAt = Date.now();
    for (let index = 0; index < 4; index++) {
      const startedMs = Date.now() - handoffAt;
      const file = `handoff-${index}.png`;
      await bounded(mini.screenshot({ path: join(output, file) }), `live handoff frame ${index}`);
      const state = await bounded(scene.data(), 'live scene state');
      assert.equal(state.ready, true); assert.ok(state.entryFrame);
      report.handoffFrames.push({file, startedMs, completedMs: Date.now() - handoffAt});
      if (index < 3) await wait(250);
    }
    await bounded((await bounded(page.$('.pause-button'), 'pause control')).tap(), 'pause ready battlefield');
    await bounded(mini.screenshot({ path: join(output, 'battle-ready.png') }), 'ready battle screenshot');
    report.checks.push('进度达到100%时场景已就绪；battle-ready.png 保留交接后暂停的角色画面，需视觉核对');
    assert.equal((await bounded(page.data(), 'entry paused state')).previewPaused, true);
    await bounded((await bounded(page.$('.pause-button'), 'pause control')).tap(), 'resume combat after first frame capture');

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
