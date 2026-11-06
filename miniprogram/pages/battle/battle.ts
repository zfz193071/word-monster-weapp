import { strengthGuide } from '../../services/strength-guide';
import { fortressEntryStore } from '../../services/fortress-entry';
import { sessionStore } from '../../services/session';
import type { GameState } from '../../game/engine';
import type { RoundEventContext } from '../../game/types';
import { createBattleController } from '../../services/battle';
import type { BattleView } from '../../services/battle';
import { FORTRESS_WORDS } from '../../fortress/content';
import { createSeededRandom, createSessionPlan } from '../../fortress/plans';
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
  data: { musicVolume: 22, combatSpeed: 1, volumeOpen: false, fromHome: false, coinBalance: 0, view: null as BattleView | null, preview: false, previewPaused: true, previewWord: 'apple', previewWords: FORTRESS_WORDS,
    choicePreview: false, choiceStarted: false, choiceRequest: null as { plan: SessionPlan; waveIndex: number; generation: number } | null },
  session: undefined as GameState | undefined,
  controller: undefined as ReturnType<typeof createBattleController> | undefined,

  onLoad(query: Record<string, string | undefined>) {
    if (query.preview === 'fortress-choice' && wx.getAccountInfoSync().miniProgram.envVersion === 'develop') {
      this.setData({ preview: true, choicePreview: true }); this.resetChoicePreview(); return;
    }
    if (query.mode === 'fortress') {
      const entry = fortressEntryStore.claim(query.entry ?? '');
      if (!entry) { wx.reLaunch({ url: '/pages/home/home' }); return; }
      this.setData({ fromHome: true, preview: true, choiceStarted: true, previewPaused: false,
        previewWord: entry.request.plan.waves[0].targetWordId, choiceRequest: entry.request });
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

  onReady() { this.controller?.start(); },
  onShow() { this.controller?.resume(); },
  onHide() { if (this.data.volumeOpen) this.setData({ volumeOpen: false }); this.controller?.pause(); },

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

  changeMusicVolume(event: WechatMiniprogram.CustomEvent<{ value: number }>) { const value = event.detail.value; if (Number.isFinite(value)) this.setData({ musicVolume: Math.max(0, Math.min(100, value)) }); },
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
  returnHome() { this.closeVolume(); this.selectComponent('.fortress-preview')?.endRun?.(); wx.navigateBack({ fail: () => { wx.reLaunch({ url: '/pages/home/home' }); } }); },
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
    this.selectComponent('.fortress-preview')?.endRun?.();
    if (this.data.fromHome && this.data.choiceRequest) fortressEntryStore.release(this.data.choiceRequest.plan.sessionId);
    this.controller?.dispose();
    this.controller = undefined;
    if (this.session) sessionStore.release(this.session.sessionId);
    this.session = undefined;
  },
});
