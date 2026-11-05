import { createDailyCheckin, beijingDate } from '../miniprogram/services/daily-checkin';
import { createDifficultyStore } from '../miniprogram/services/difficulty-store';
import { DIFFICULTIES } from '../miniprogram/fortress/difficulty';
import { openingArt } from '../miniprogram/fortress/opening-encounter';
import { createStrengthGuide, strengthTarget } from '../miniprogram/services/strength-guide';
import { createPetStore } from '../miniprogram/services/pet-store';
import { collectionWords } from '../miniprogram/fortress/collection';
import { LEVELS } from '../miniprogram/fortress/levels';
import { createCoinWallet } from '../miniprogram/services/coin-wallet';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createSessionStore } from '../miniprogram/services/session';
import { createBattleController } from '../miniprogram/services/battle';
import { createFortressEntryStore } from '../miniprogram/services/fortress-entry';

// 在微信运行时之外验证导航行为，也为后续纯逻辑测试保留 Node 测试入口。
function homeHarness(loadAssets: () => Promise<void> = async () => {}, prepare?: (art:unknown, callbacks:any)=>()=>void) {
  let savedDifficulty: unknown;
  const difficultyStore = createDifficultyStore({getStorageSync:()=>savedDifficulty,setStorageSync:(_key,value)=>{savedDifficulty=value;}});
  const strengthGuide=createStrengthGuide();
  const sessionStore = createSessionStore();
  let saved: unknown = { version: 1, balance: 300, rewardedSessions: [] };
  const wallet = createCoinWallet({ getStorageSync: () => saved, setStorageSync: (_key, value) => { saved = value; } });
  const fortressEntryStore = createFortressEntryStore(id => wallet.canEnter(id), ()=>wallet.equipment().level, ()=>difficultyStore.read());
  let petSaved:unknown;const petStore=createPetStore({getStorageSync:()=>petSaved,setStorageSync:(_key,value)=>{petSaved=structuredClone(value);}});
  let checkinSaved: unknown;
  const dailyCheckin = createDailyCheckin({coins: wallet, pets: petStore, storage: {getStorageSync: () => checkinSaved, setStorageSync: (_key, value) => {checkinSaved=structuredClone(value);}}});
  let page: any;
  let navigation: any;
  let navigationCount = 0;
  let toastCount = 0;
  const audioCalls: any[] = [];
  const source = readFileSync(new URL('../miniprogram/pages/home/home.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  });
  runInNewContext(outputText, {
    exports: {},
    require(name: string) {
      if (name === '../../services/daily-checkin') return {dailyCheckin, beijingDate};
      if (name === '../../services/difficulty-store') return {difficultyStore};
      if (name === '../../fortress/difficulty') return {DIFFICULTIES};
      if (name === '../../fortress/opening-encounter') return {openingArt};
      if (name === '../../services/battle-assets') return {loadBattleAssets: prepare ?? ((_art:unknown, callbacks:any) => {callbacks.onProgress(100);callbacks.onReady();return ()=>{};})};
      if (name === '../../services/strength-guide') return {strengthGuide,strengthTarget};
      if (name === '../../services/pet-store') return {petStore};
      if (name === '../../services/audio') return { createAudioAdapter: () => { const call:any = { disposed: false }; audioCalls.push(call); return { dispose() { call.disposed = true; }, playReveal(path:string, _context:unknown, done:Function) { call.path = path; call.done = done; } }; } };
      if (name === '../../services/level-assets') return { loadLevelAssets: loadAssets };
      if (name === '../../services/coin-wallet') return { coinWallet: wallet };
      if (name === '../../fortress/collection') return { collectionWords };
      if (name === '../../fortress/levels') return { LEVELS };
      if (name === '../../services/home-music') return { createHomeMusic: () => ({ setActive() {}, setEnabled() {}, retry() {}, dispose() {} }) };
      if (name === '../../services/fortress-entry') return { fortressEntryStore };
      assert.equal(name, '../../services/session');
      return { sessionStore };
    },
    Page(definition: any) {
      page = definition;
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    },
    wx: {
      navigateTo(options: any) { navigationCount++; navigation = options; },
      showToast() { toastCount++; },
    },
  });
  return { fortressEntryStore, strengthGuide, petStore, audioCalls, wallet, sessionStore, get page() { return page; }, get navigation() { return navigation; },
    get navigationCount() { return navigationCount; }, get toastCount() { return toastCount; } };
}

function correct(page: any) {
  const request = page.data.request;
  const wave = request.plan.waves[0];
  page.choiceSucceeded({ detail: {
    context: { sessionId: request.plan.sessionId, waveId: wave.waveId, generation: request.generation },
    attempts: [{ sessionId: request.plan.sessionId, waveId: wave.waveId, targetWordId: wave.targetWordId,
      selectedWordId: wave.targetWordId, correct: true, taskKind: 'listeningChoice', attemptIndex: 1, replayCount: 0, hintUsed: false }],
  } });
}
test('首页点击仅开三选一弹窗，选对后导航一次，返回后重新听词', () => {
  const h = homeHarness(); h.page.onShow();
  h.page.openBattle(); const first = h.page.data.request;
  h.page.openBattle(); assert.equal(h.navigationCount, 0); assert.equal(h.page.data.request, first);
  assert.equal(first.variant, 'fruit');
  correct(h.page); correct(h.page);
  assert.equal(h.navigationCount, 1);
  assert.equal(h.navigation.url, `/pages/battle/battle?mode=fortress&entry=${first.plan.sessionId}`);
  h.navigation.success(); h.page.onShow();
  assert.equal(h.page.data.request, null);
  h.page.openBattle(); assert.notEqual(h.page.data.request.plan.sessionId, first.plan.sessionId);
  assert.equal(h.navigationCount, 1);
});
test('导航失败可重试，旧失败回调不能解除新导航锁', () => {
  const h = homeHarness(); h.page.openBattle(); correct(h.page);
  const oldFail = h.navigation.fail; oldFail();
  assert.equal(h.page.data.navigationError, true);
  h.page.enterBattle(); oldFail();
  assert.equal(h.page.data.opening, true); assert.equal(h.navigationCount, 2);
  h.page.closeChallenge(); assert.ok(h.page.data.request);
});
test('取消重开丢弃旧听词结果，卸载后回调不得导航或更新页面', () => {
  const h = homeHarness(); h.page.openBattle();
  const oldRequest = h.page.data.request;
  h.page.closeChallenge(); h.page.openBattle(); const current = h.page.data.request;
  h.page.data.request = oldRequest; correct(h.page); h.page.data.request = current;
  assert.equal(h.navigationCount, 0);
  correct(h.page); h.page.onUnload();
  h.navigation.fail(); h.navigation.success(); h.page.openBattle();
  assert.equal(h.navigationCount, 1); assert.equal(h.toastCount, 0);
});

test('会话仅在内存中保存，释放后新局重置，旧释放不能影响新局', () => {
  const store = createSessionStore();
  const first = store.start();
  assert.equal(store.start(), first);
  assert.equal(store.claim('invalid'), undefined);
  assert.equal(store.claim(first.sessionId), first);
  store.release(first.sessionId);
  const second = store.start();
  store.release(first.sessionId);
  assert.equal(store.claim(second.sessionId), second);
  assert.notEqual(first.sessionId, second.sessionId);
  assert.equal(second.energy, 0);
  assert.equal(second.roundIndex, 0);
  assert.equal(second.attempts.length, 0);
  assert.equal(createSessionStore().claim(second.sessionId), undefined);
});

test('战斗页只领取一次合法会话，卸载释放，缺失或失效入口返回首页', () => {
  const sessionStore = createSessionStore();
  let redirects = 0;
  function loadPage() {
    let petSaved:unknown;const petStore=createPetStore({getStorageSync:()=>petSaved,setStorageSync:(_key,value)=>{petSaved=structuredClone(value);}});
  let page: any;
    const source = readFileSync(new URL('../miniprogram/pages/battle/battle.ts', import.meta.url), 'utf8');
    runInNewContext(ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText, {
      exports: {}, require: (name: string) => name === '../../services/fortress-entry' ? { fortressEntryStore: createFortressEntryStore() } : name === '../../services/session' ? { sessionStore } : { createBattleController },
      Page: (definition: any) => {
        page = definition;
        page.selectComponent = () => null;
        page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
      },
      wx: { reLaunch: ({ url }: { url: string }) => {
        assert.equal(url, '/pages/home/home'); redirects++;
      } },
    });
    return page;
  }
  const fortress = loadPage();
  fortress.onLoad({ mode: 'fortress' });
  assert.equal(fortress.data.preview, false);
  assert.equal(fortress.session, undefined);
  assert.equal(redirects, 1);
  const session = sessionStore.start();
  const battle = loadPage();
  battle.onLoad({ sessionId: session.sessionId });
  assert.equal(battle.session, session);
  loadPage().onLoad({ sessionId: session.sessionId });
  assert.equal(redirects, 2);
  battle.onUnload();
  assert.equal(battle.session, undefined);
  assert.equal(sessionStore.claim(session.sessionId), undefined);
  loadPage().onLoad({});
  assert.equal(redirects, 3);
});

test('首页关卡锁定、通关刷新和默认进入首个未完成关卡', async () => {
 const h = homeHarness(); h.page.onShow(); h.page.toggleLevels();
 assert.equal(h.page.data.levels.length, 8); assert.equal(h.page.data.levels.filter((l:any)=>!l.locked).length,1);
 h.page.selectLevel({currentTarget:{dataset:{levelId:2}}}); assert.equal(h.page.data.request,null);
 h.wallet.rewardVictory('first',1); h.page.onShow(); assert.equal(h.page.data.levels[1].locked,false);
 await h.page.openBattle(); assert.equal(h.page.data.request.plan.levelId,2); h.page.closeChallenge();
 h.page.selectLevel({currentTarget:{dataset:{levelId:1}}}); assert.equal(h.page.data.request.plan.levelId,1);
});

test('素材集合默认水果、全部分类可浏览，快速切换和关闭不接受旧加载结果', async () => {
 const pending: (()=>void)[]=[];const h=homeHarness(()=>new Promise<void>(resolve=>pending.push(resolve)));
 h.page.toggleCredits();assert.equal(h.page.data.collectionLevel,1);assert.equal(h.page.data.collectionItems.length,11);
 const colors=h.page.selectCollection({currentTarget:{dataset:{levelId:2}}});
 const animals=h.page.selectCollection({currentTarget:{dataset:{levelId:3}}});
 pending[1]();await animals;assert.equal(h.page.data.collectionItems.length,16);
 pending[0]();await colors;assert.equal(h.page.data.collectionLevel,3);assert.equal(h.page.data.collectionItems.length,16);
 const tools=h.page.selectCollection({currentTarget:{dataset:{levelId:4}}});h.page.toggleCredits();pending[2]();await tools;assert.equal(h.page.data.showCredits,false);
 h.page.toggleCredits();assert.equal(h.page.data.collectionLevel,1);assert.equal(h.page.data.collectionItems.length,11);
 for(const level of LEVELS)assert.ok(collectionWords(level.id).every(word=>word.phonetic.startsWith('/')&&!word.phonetic.includes('undefined')));
});

test('集合播放对应标准音频，连续点击不重叠，旧回调与关闭/后台不残留声音', () => {
 const h=homeHarness();h.page.onShow();h.page.toggleCredits();
 const tap=(wordId:string)=>h.page.playCollectionWord({currentTarget:{dataset:{wordId}}});
 tap('apple');assert.equal(h.audioCalls[0].path,'/assets/audio/learn-apple.mp3');assert.equal(h.page.data.collectionPlaying,'apple');
 tap('banana');assert.equal(h.audioCalls[0].disposed,true);h.audioCalls[0].done(true);assert.equal(h.page.data.collectionPlaying,'banana');
 h.audioCalls[1].done(false);assert.equal(h.page.data.collectionAudioError,'banana');tap('banana');assert.equal(h.page.data.collectionAudioError,'');
 h.page.toggleCredits();assert.equal(h.audioCalls[2].disposed,true);assert.equal(h.page.data.collectionPlaying,'');
 h.page.toggleCredits();tap('apple');h.page.onHide();assert.equal(h.audioCalls[3].disposed,true);tap('banana');assert.equal(h.audioCalls.length,4);
 h.page.onUnload();h.audioCalls[3].done(false);assert.equal(h.page.data.collectionAudioError,'');
});

test('伙伴面板打开暂停场景覆盖，喂养和换装读写真实存档，后台拒绝操作',()=>{
 const h=homeHarness();h.petStore.rewardBoss('pet','pet:wave:1:zombie:1');
 let i=0;while(h.petStore.view().food===0){const session=`food-${i++}`;h.petStore.rewardBoss(session,`${session}:wave:1:zombie:1`);}
 h.page.onShow();h.page.openPet();assert.equal(h.page.data.showPet,true);assert.equal(h.page.data.petView.owned,true);
 const revision=h.page.data.petView.revision;const before=h.page.data.petView.food;
 const event={currentTarget:{dataset:{action:'feed',revision}}};h.page.petAction(event);
 assert.equal(h.page.data.petView.food,before-1);h.page.petAction(event);assert.equal(h.page.data.petView.food,before-1);
 h.page.onHide();h.page.petAction({currentTarget:{dataset:{action:'feed',revision:h.page.data.petView.revision}}});assert.equal(h.petStore.view().food,before-1);
 h.page.onShow();h.page.closePet();assert.equal(h.page.data.showPet,false);h.page.openWeapon();assert.equal(h.page.data.showWeapon,true);
});


test('失败后一次性引导主角，点击打开武器面板后清除指引',()=>{
 const h=homeHarness();h.strengthGuide.request();h.page.onShow();assert.equal(h.page.data.strengthTarget,'weapon');
 h.page.openWeapon();assert.equal(h.page.data.showWeapon,true);assert.equal(h.page.data.strengthTarget,'');
 h.page.closeWeapon();h.page.onShow();assert.equal(h.page.data.strengthTarget,'','普通返回不重复出现');
 assert.equal(strengthTarget(7,{owned:true,level:9}),'pet');assert.equal(strengthTarget(7,{owned:true,level:10}),'');assert.equal(strengthTarget(7,{owned:false,level:1}),'');
});

test('首页图片就绪后显示50%并交由战斗页继续加载，失败重试和过期回调不误改当前状态', () => {
  const h = homeHarness(); h.page.openBattle(); correct(h.page);
  assert.equal(h.page.data.entryProgress, 50);
  const oldSuccess = h.navigation.success;
  h.navigation.fail();
  assert.equal(h.page.data.entryProgress, 50);
  h.page.enterBattle(); oldSuccess();
  assert.equal(h.page.data.entryProgress, 50);
  h.navigation.success();
  assert.equal(h.page.data.entryProgress, 50);
  h.page.onShow(); h.page.openBattle(); correct(h.page);
  assert.equal(h.page.data.entryProgress, 50);
  h.page.onUnload(); h.navigation.success();
  assert.equal(h.page.data.entryProgress, 50);
});

test('我要变强返回时无论导航成功标记是否保留都清除入口弹窗并展示指引', () => {
  const h = homeHarness(); h.page.onShow(); h.page.openBattle(); correct(h.page);
  h.page.onHide();
  h.strengthGuide.request(); h.page.onShow();
  assert.equal(h.page.data.request, null);
  assert.equal(h.page.data.opening, false);
  assert.equal(h.page.data.strengthTarget, 'weapon');
  h.navigation.success();
  assert.equal(h.page.enteredBattle, false, '迟到导航回调不能污染返回后的首页');
});


test('战斗入口等待场景遮挡就绪，关闭重开不沿用上次就绪标记', () => {
  const h=homeHarness();h.page.openBattle();
  assert.equal(h.page.data.sceneCoverReady,false);
  h.page.sceneCoverChanged({detail:{ready:true}});
  assert.equal(h.page.data.sceneCoverReady,true);
  h.page.closeChallenge();h.page.openBattle();
  assert.equal(h.page.data.sceneCoverReady,false);
  const markup=readFileSync(new URL('../miniprogram/pages/home/home.wxml',import.meta.url),'utf8');
  assert.match(markup,/class="choice-modal" hidden="{{!sceneCoverReady}}"/);
  assert.match(markup,/wx:if="{{!choiceComplete && sceneCoverReady}}"/);
});


for (const releasedBeforeShow of [false,true]) test(`普通战斗返回清理进度圆环，不依赖导航成功回调（先释放=${releasedBeforeShow}）`, () => {
  const h=homeHarness();h.page.onShow();h.page.openBattle();correct(h.page);
  const id=h.page.data.request.plan.sessionId;
  h.page.onHide();assert.ok(h.fortressEntryStore.claim(id));
  if(releasedBeforeShow)h.fortressEntryStore.release(id);
  h.page.onShow();
  assert.equal(h.page.data.request,null);
  assert.equal(h.page.data.opening,false);assert.equal(h.page.data.choiceComplete,false);
  assert.equal(h.page.data.entryProgress,0);assert.equal(h.page.data.sceneCoverReady,false);
  h.navigation.success();h.navigation.fail();
  assert.equal(h.page.data.request,null);assert.equal(h.page.data.entryProgress,0);
  assert.equal(h.page.enteredBattle,false);
  h.page.openBattle();assert.notEqual(h.page.data.request.plan.sessionId,id);
});

test('仅切到后台再回首页，尚未进入战斗的听词题保持原题', () => {
  const h=homeHarness();h.page.onShow();h.page.openBattle();
  const request=h.page.data.request;h.page.onHide();h.page.onShow();
  assert.equal(h.page.data.request,request);
});


test('战斗图片逐张加载时更新圆环，完成前不导航，失败可重试且取消后无迟到跳转', () => {
  const jobs:any[]=[];
  const h=homeHarness(undefined,(_art,callbacks)=>{const job={callbacks,cancelled:false};jobs.push(job);callbacks.onProgress(0);return()=>{job.cancelled=true;};});
  h.page.openBattle();correct(h.page);assert.equal(h.navigationCount,0);assert.equal(h.page.data.entryProgress,0);
  jobs[0].callbacks.onProgress(37);assert.equal(h.page.data.entryProgress,18);assert.equal(h.navigationCount,0);
  jobs[0].callbacks.onError();assert.equal(h.page.data.navigationError,true);assert.equal(h.page.data.opening,false);
  h.page.enterBattle();assert.equal(h.page.data.entryProgress,0);assert.equal(jobs[0].cancelled,true);
  jobs[0].callbacks.onReady();assert.equal(h.navigationCount,0);
  jobs[1].callbacks.onProgress(100);jobs[1].callbacks.onReady();assert.equal(h.navigationCount,1);
  h.page.onUnload();jobs[1].callbacks.onReady();assert.equal(h.navigationCount,1);assert.equal(jobs[1].cancelled,true);
});

test('关卡资源准备失败后退出0%等待并解除按钮锁，重试可以进入听词',async()=>{
 let attempts=0;
 const h=homeHarness(async()=>{if(++attempts===1)throw Error('关卡资源加载超时');});
 h.wallet.rewardVictory('unlock-colors',1);h.page.onShow();
 await h.page.openBattle();
 assert.equal(h.page.data.preparingLevel,false);assert.equal(h.page.data.request,null);
 assert.ok(h.page.data.entryError);
 await h.page.openBattle();
 assert.equal(h.page.data.preparingLevel,false);assert.equal(h.page.data.entryError,'');
 assert.equal(h.page.data.request.plan.levelId,2);
});

test('首页难度选择保存后自动关闭，开战携带难度，已有听词时不能改档',async()=>{
 const h=homeHarness();h.page.onShow();assert.equal(h.page.data.difficulty,'normal');
 h.page.openDifficulty();assert.equal(h.page.data.showDifficulty,true);
 await h.page.openBattle();assert.equal(h.page.data.request,null);
 h.page.selectDifficulty({detail:{id:'nightmare'}});assert.equal(h.page.data.difficultyLabel,'噩梦');
 assert.equal(h.page.data.showDifficulty,false);
 await h.page.openBattle();assert.equal(h.page.data.request.plan.difficulty,'nightmare');
 h.page.openDifficulty();assert.equal(h.page.data.showDifficulty,false);
 h.page.selectDifficulty({detail:{id:'easy'}});assert.equal(h.page.data.difficulty,'nightmare');
});
