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
function homeHarness(loadAssets: () => Promise<void> = async () => {}) {
  const sessionStore = createSessionStore();
  let saved: unknown = { version: 1, balance: 300, rewardedSessions: [] };
  const wallet = createCoinWallet({ getStorageSync: () => saved, setStorageSync: (_key, value) => { saved = value; } });
  const fortressEntryStore = createFortressEntryStore(id => wallet.canEnter(id));
  let petSaved:unknown;const petStore=createPetStore({getStorageSync:()=>petSaved,setStorageSync:(_key,value)=>{petSaved=structuredClone(value);}});
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
  return { petStore, audioCalls, wallet, sessionStore, get page() { return page; }, get navigation() { return navigation; },
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
