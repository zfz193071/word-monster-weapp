import { sessionStore } from '../../services/session';
import { FORTRESS_ASSETS } from '../../fortress/content';

Page({
  data: { opening: false, showCredits: false, credits: FORTRESS_ASSETS },
  sessionId: '',
  enteredBattle: false,
  disposed: false,

  toggleCredits() { this.setData({ showCredits: !this.data.showCredits }); },

  onShow() {
    if (this.enteredBattle) {
      sessionStore.release(this.sessionId);
      this.sessionId = '';
      this.enteredBattle = false;
      this.setData({ opening: false });
    }
  },

  onUnload() {
    this.disposed = true;
    if (!this.enteredBattle) sessionStore.release(this.sessionId);
  },

  openBattle() {
    if (this.disposed || this.data.opening) return;
    this.setData({ opening: true });
    try {
      this.sessionId = sessionStore.start().sessionId;
    } catch {
      this.setData({ opening: false });
      wx.showToast({ title: '暂时没能准备好，请再试一次', icon: 'none' });
      return;
    }
    const sessionId = this.sessionId;
    wx.navigateTo({
      url: `/pages/battle/battle?sessionId=${encodeURIComponent(sessionId)}`,
      success: () => {
        if (!this.disposed && this.sessionId === sessionId) this.enteredBattle = true;
      },
      fail: () => {
        sessionStore.release(sessionId);
        if (this.disposed || this.sessionId !== sessionId) return;
        this.sessionId = '';
        this.setData({ opening: false });
        wx.showToast({ title: '暂时没能出发，请再试一次', icon: 'none' });
      },
    });
  },
});
