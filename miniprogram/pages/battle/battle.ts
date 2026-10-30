import { sessionStore } from '../../services/session';
import type { GameState } from '../../game/engine';
import type { RoundEventContext } from '../../game/types';
import { createBattleController } from '../../services/battle';
import type { BattleView } from '../../services/battle';

function eventTarget(event: WechatMiniprogram.BaseEvent): { context: RoundEventContext; wordId: string } | undefined {
  const data = event.currentTarget.dataset;
  const revision = Number(data.revision);
  if (typeof data.sessionId !== 'string' || typeof data.roundId !== 'string' ||
    !Number.isInteger(revision) || revision < 0) return undefined;
  return { context: { sessionId: data.sessionId, roundId: data.roundId, revision },
    wordId: typeof data.wordId === 'string' ? data.wordId : '' };
}

Page({
  data: { view: null as BattleView | null },
  session: undefined as GameState | undefined,
  controller: undefined as ReturnType<typeof createBattleController> | undefined,

  onLoad(query: Record<string, string | undefined>) {
    this.session = sessionStore.claim(query.sessionId ?? '');
    if (!this.session) { wx.reLaunch({ url: '/pages/home/home' }); return; }
    this.controller = createBattleController(this.session, {
      render: (view, state) => { this.session = state; this.setData({ view }); },
    });
  },

  onReady() { this.controller?.start(); },
  onShow() { this.controller?.resume(); },
  onHide() { this.controller?.pause(); },

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

  onUnload() {
    this.controller?.dispose();
    this.controller = undefined;
    if (this.session) sessionStore.release(this.session.sessionId);
    this.session = undefined;
  },

  returnHome() {
    wx.reLaunch({ url: '/pages/home/home' });
  },
});
