import { sessionStore } from '../../services/session';
import type { GameState } from '../../game/engine';

Page({
  session: undefined as GameState | undefined,

  onLoad(query: Record<string, string | undefined>) {
    this.session = sessionStore.claim(query.sessionId ?? '');
    if (!this.session) wx.reLaunch({ url: '/pages/home/home' });
  },

  onUnload() {
    if (this.session) sessionStore.release(this.session.sessionId);
    this.session = undefined;
  },

  returnHome() {
    wx.reLaunch({ url: '/pages/home/home' });
  },
});
