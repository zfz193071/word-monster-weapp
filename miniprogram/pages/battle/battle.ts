import { createLoopMusic } from '../../services/home-music';
import { battleAudioPaths, loadBattleAssets } from '../../services/battle-assets';
import { openingArt } from '../../fortress/opening-encounter';
import { getLevel } from '../../fortress/levels';
import { strengthGuide } from '../../services/strength-guide';
import { fortressEntryStore } from '../../services/fortress-entry';
import { sessionStore } from '../../services/session';
import type { GameState } from '../../game/engine';
import type { RoundEventContext } from '../../game/types';
import { createBattleController } from '../../services/battle';
import type { BattleView } from '../../services/battle';
import { FORTRESS_WORDS } from '../../fortress/content';
import { createSeededRandom, createSessionPlan } from '../../fortress/plans';
import { battleBackgroundColor, battleBackgroundCover } from '../../fortress/battle-background';
import type { SessionPlan } from '../../fortress/types';
import type { ListeningResult } from '../../fortress/listening';

const COMBAT_SPEEDS = [1, 1.5, 2, 2.5] as const;

function eventTarget(event: WechatMiniprogram.BaseEvent): { context: RoundEventContext; wordId: string } | undefined {
  const data = event.currentTarget.dataset;
  const revision = Number(data.revision);
  if (typeof data.sessionId !== 'string' || typeof data.roundId !== 'string' ||
    !Number.isInteger(revision) || revision < 0) return undefined;
  return { context: { sessionId: data.sessionId, roundId: data.roundId, revision },
    wordId: typeof data.wordId === 'string' ? data.wordId : '' };
}

Page({
  data: { pageVisible: true, entryLoading: true, entryProgress: 0, entryError: '', assetsReady: false, sceneMounted: false, entryEpoch: 0, musicVolume: 22, combatSpeed: 1, volumeOpen: false, fromHome: false, loadingCover: battleBackgroundCover(1), loadingColor: battleBackgroundColor(1), coinBalance: 0, view: null as BattleView | null, preview: false, previewPaused: true, previewWord: 'apple', previewWords: FORTRESS_WORDS,
    choicePreview: false, choiceStarted: false, choiceRequest: null as { plan: SessionPlan; waveIndex: number; generation: number } | null },
  loadingMusic: undefined as ReturnType<typeof createLoopMusic> | undefined,
  loadEpoch: 0,
  audioProgress: 0,
  visualProgress: 0,
  scenePresented: false,
  disposed: false,
  cancelEntryLoad: undefined as (() => void) | undefined,
  session: undefined as GameState | undefined,
  controller: undefined as ReturnType<typeof createBattleController> | undefined,

  onLoad(query: Record<string, string | undefined>) {
    if (query.mode !== 'fortress') this.setData({ entryLoading: false });
    if (query.preview === 'fortress-choice' && wx.getAccountInfoSync().miniProgram.envVersion === 'develop') {
      this.setData({ preview: true, choicePreview: true }); this.resetChoicePreview(); return;
    }
    if (query.mode === 'fortress') {
      const entry = fortressEntryStore.claim(query.entry ?? '');
      if (!entry) { wx.reLaunch({ url: '/pages/home/home' }); return; }
      this.setData({ fromHome: true, preview: true, choiceStarted: true, previewPaused: false,
        loadingCover: battleBackgroundCover(entry.request.plan.levelId), loadingColor: battleBackgroundColor(entry.request.plan.levelId),
        previewWord: entry.request.plan.waves[0].targetWordId, choiceRequest: entry.request }, () => this.prepareEntry());
      return;
    }
    if (query.preview === 'fortress' && wx.getAccountInfoSync().miniProgram.envVersion === 'develop') {
      this.setData({ preview: true }); return;
    }
    this.session = sessionStore.claim(query.sessionId ?? '');
    if (!this.session) { wx.reLaunch({ url: '/pages/home/home' }); return; }
    this.controller = createBattleController(this.session, {
      render: (view, state) => { this.session = state; this.setData({ view }); },
    });
  },

  prepareEntry() {
    const request = this.data.choiceRequest;
    if (this.disposed || !this.data.fromHome || !request) return;
    this.cancelEntryLoad?.();
    const epoch = ++this.loadEpoch;
    const valid = () => !this.disposed && this.loadEpoch === epoch && !this.data.entryError;
    this.audioProgress = 0; this.visualProgress = 0; this.scenePresented = false;
    this.setData({ entryLoading: true, entryProgress: 0, entryError: '', assetsReady: false, sceneMounted: false, entryEpoch: epoch }, () => {
      if (!valid()) return;
      this.syncLoadingMusic();
      this.loadingMusic?.retry();
      const wordIds = [...new Set([
        ...getLevel(request.plan.levelId ?? 1).words.map(word => word.id),
        ...request.plan.waves.flatMap(wave => [wave.targetWordId, ...wave.spawnPlan.map(monster => monster.wordId)]),
      ])];
      this.cancelEntryLoad = loadBattleAssets(openingArt(request.plan.waves[0].targetWordId, wordIds, request.plan.weaponLevel), {
        onProgress: percent => { if (valid()) { this.audioProgress = percent; this.updateEntryProgress(); } },
        onError: () => { if (valid()) { this.setData({ entryError: '战场资源加载失败，请重试', sceneMounted: false }); this.syncLoadingMusic(); } },
        onReady: () => { if (valid()) { this.audioProgress = 100; this.setData({ assetsReady: true }); this.updateEntryProgress(); this.finishEntry(); } },
      }, { sceneDecodesImages: true, imagePaths: [this.data.loadingCover], audioPaths: battleAudioPaths(wordIds) });
      if (valid()) this.setData({ sceneMounted: true });
    });
  },
  syncLoadingMusic() {
    const active = !this.disposed && this.data.fromHome && this.data.entryLoading && this.data.pageVisible && !this.data.entryError;
    if (active && !this.loadingMusic) this.loadingMusic = createLoopMusic({src: '/assets/audio/battle-loop.mp3', onChange() {}});
    this.loadingMusic?.setVolume(this.data.musicVolume / 100);
    this.loadingMusic?.setActive(active);
  },
  updateEntryProgress() {
    this.setData({ entryProgress: Math.min(99, Math.floor(this.audioProgress / 2 + this.visualProgress / 2)) });
  },
  entrySceneProgress(event: WechatMiniprogram.CustomEvent<{ progress: number }>) {
    if (!this.disposed && this.data.entryLoading && !this.data.entryError &&
        (!event.currentTarget || Number(event.currentTarget.dataset.loadEpoch) === this.loadEpoch)) {
      this.visualProgress = Math.max(this.visualProgress, Math.max(0, Math.min(100, (event.detail.progress - 50) * 2)));
      this.updateEntryProgress();
    }
  },
  entrySceneReady(event?: WechatMiniprogram.CustomEvent) {
    if (this.disposed || this.data.entryError ||
        (event?.currentTarget && Number(event.currentTarget.dataset.loadEpoch) !== this.loadEpoch)) return;
    this.scenePresented = true; this.visualProgress = 100;
    this.updateEntryProgress(); this.finishEntry();
  },
  finishEntry() {
    if (!this.disposed && !this.data.entryError && this.data.assetsReady && this.scenePresented) {
      this.loadingMusic?.setActive(false);
      this.setData({ entryProgress: 100, entryLoading: false });
    }
  },
  entrySceneError(event: WechatMiniprogram.CustomEvent<{ message: string }>) {
    if (!this.disposed && this.data.entryLoading && (!event.currentTarget || Number(event.currentTarget.dataset.loadEpoch) === this.loadEpoch)) { this.cancelEntryLoad?.(); this.setData({ entryError: event.detail.message, sceneMounted: false }); this.syncLoadingMusic(); }
  },

  onReady() { this.controller?.start(); },
  onShow() { this.setData({ pageVisible: true }); this.syncLoadingMusic(); this.controller?.resume(); },
  onHide() { this.setData({ pageVisible: false }); this.syncLoadingMusic(); if (this.data.volumeOpen) this.setData({ volumeOpen: false }); this.controller?.pause(); },

  choose(event: WechatMiniprogram.BaseEvent) {
    const target = eventTarget(event);
    if (target) this.controller?.choose(target.context, target.wordId);
  },
  replay(event: WechatMiniprogram.BaseEvent) {
    const target = eventTarget(event);
    if (target) this.controller?.replay(target.context);
  },
  retryAudio(event: WechatMiniprogram.BaseEvent) {
    const target = eventTarget(event);
    if (target) this.controller?.retryAudio(target.context);
  },
  imageLoaded(event: WechatMiniprogram.BaseEvent) {
    const target = eventTarget(event);
    if (target) this.controller?.imageResult(target.context, target.wordId, true);
  },
  imageFailed(event: WechatMiniprogram.BaseEvent) {
    const target = eventTarget(event);
    if (target) this.controller?.imageResult(target.context, target.wordId, false);
  },
  attackFinished(event: WechatMiniprogram.BaseEvent) {
    const target = eventTarget(event);
    if (target) this.controller?.visualFinished(target.context, target.wordId);
  },

  changeMusicVolume(event: WechatMiniprogram.CustomEvent<{ value: number }>) { const value = event.detail.value; if (Number.isFinite(value)) { this.setData({ musicVolume: Math.max(0, Math.min(100, value)) }); this.syncLoadingMusic(); } },
  cycleCombatSpeed() { const index = COMBAT_SPEEDS.indexOf(this.data.combatSpeed as typeof COMBAT_SPEEDS[number]); this.setData({ combatSpeed: COMBAT_SPEEDS[(index + 1) % COMBAT_SPEEDS.length] }); },
  openVolume() { this.setData({ volumeOpen: true }); },
  closeVolume() { this.setData({ volumeOpen: false }); },
  noop() {},
  updateCoinBalance(event: WechatMiniprogram.CustomEvent<{ balance: number }>) { const balance = event.detail.balance; if (Number.isSafeInteger(balance) && balance >= 0) this.setData({ coinBalance: balance }); },
  becomingStronger: false,
  becomeStronger() {
    if (this.becomingStronger) return;
    this.selectComponent('.fortress-preview')?.endRun?.();
    this.becomingStronger = true; strengthGuide.request();
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home', fail: () => { this.becomingStronger = false; } }) });
  },
  returnHome() { const scene = this.selectComponent('.fortress-preview'); if (scene?.settleBeforeExit && !scene.settleBeforeExit()) return; this.closeVolume(); this.selectComponent('.fortress-preview')?.endRun?.(); wx.navigateBack({ fail: () => { wx.reLaunch({ url: '/pages/home/home' }); } }); },
  togglePreviewPause() { if (this.data.preview) this.setData({ previewPaused: !this.data.previewPaused }); },
  selectPreviewMonster(event: WechatMiniprogram.BaseEvent) {
    const wordId = event.currentTarget.dataset.wordId;
    if (this.data.preview && FORTRESS_WORDS.some(word => word.id === wordId)) this.setData({ previewPaused: true, previewWord: wordId });
  },
  resetChoicePreview() {
    const generation = (this.data.choiceRequest?.generation ?? 0) + 1;
    const plan = createSessionPlan(`choice-preview-${Date.now()}-${generation}`, createSeededRandom(Date.now() >>> 0));
    this.setData({ choiceStarted: false, previewPaused: false, choiceRequest: { plan, waveIndex: 0, generation } });
  },
  startChoiceCombat(event: WechatMiniprogram.CustomEvent<ListeningResult>) {
    const request = this.data.choiceRequest;
    const result = event.detail;
    if (!request || this.data.choiceStarted || result.context.sessionId !== request.plan.sessionId || result.context.waveId !== request.plan.waves[0].waveId || result.context.generation !== request.generation) return;
    this.setData({ choiceStarted: true, previewWord: request.plan.waves[0].targetWordId, previewPaused: false });
  },
  restartPreview() { if (this.data.preview) { if (this.data.choicePreview) { this.resetChoicePreview(); return; } this.setData({ previewPaused: true }); this.selectComponent('.fortress-preview')?.restartPreview(); } },

  onUnload() {
    this.disposed = true; this.loadingMusic?.dispose(); this.loadingMusic = undefined; this.loadEpoch++; this.cancelEntryLoad?.();
    this.selectComponent('.fortress-preview')?.endRun?.();
    if (this.data.fromHome && this.data.choiceRequest) fortressEntryStore.release(this.data.choiceRequest.plan.sessionId);
    this.controller?.dispose();
    this.controller = undefined;
    if (this.session) sessionStore.release(this.session.sessionId);
    this.session = undefined;
  },
});
