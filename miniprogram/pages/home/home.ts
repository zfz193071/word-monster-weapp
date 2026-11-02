import { coinWallet } from '../../services/coin-wallet';
import { createHomeMusic } from '../../services/home-music';
import type { HomeMusicStatus } from '../../services/home-music';
import { BATTLE_ASSETS } from '../../fortress/content';
import type { ListeningResult } from '../../fortress/listening';
import { fortressEntryStore } from '../../services/fortress-entry';
import type { FruitRequest } from '../../services/fortress-entry';

Page({
  data: { coinBalance: 0, coinError: false, homeVisible: false, musicEnabled: true, musicStatus: 'idle' as HomeMusicStatus, opening: false, showCredits: false, credits: BATTLE_ASSETS,
    request: null as FruitRequest | null, choiceComplete: false, navigationError: false },
  music: undefined as ReturnType<typeof createHomeMusic> | undefined,
  navigationId: 0,
  enteredBattle: false,
  disposed: false,

  toggleCredits() { this.setData({ showCredits: !this.data.showCredits }); },
  onShow() {
    try { this.setData({ coinBalance: coinWallet.balance(), coinError: false }); } catch { this.setData({ coinError: true }); }
    if (!this.music) this.music = createHomeMusic({ onChange: view => {
      if (!this.disposed) this.setData({ musicEnabled: view.enabled, musicStatus: view.status });
    } });
    this.setData({ homeVisible: true });
    if (this.enteredBattle) {
      this.enteredBattle = false;
      this.clearChallenge();
    }
    this.synchronizeMusic();
  },
  onHide() { this.setData({ homeVisible: false }); this.synchronizeMusic(); },
  onUnload() { this.disposed = true; this.music?.dispose(); this.music = undefined; this.releaseEntry(); },
  synchronizeMusic() { this.music?.setActive(this.data.homeVisible && !this.data.request); },
  toggleMusic() {
    if (this.data.musicStatus === 'error') this.music?.retry();
    else this.music?.setEnabled(!this.data.musicEnabled);
  },
  releaseEntry() { if (this.data.request) fortressEntryStore.release(this.data.request.plan.sessionId); },
  clearChallenge() {
    this.releaseEntry();
    this.navigationId++;
    this.setData({ request: null, opening: false, choiceComplete: false, navigationError: false });
    this.synchronizeMusic();
  },
  closeChallenge() { if (!this.data.opening && !this.disposed) this.clearChallenge(); },
  // Captures the modal background touchmove without blocking card taps.
  stopScroll() {},
  openBattle() {
    if (this.disposed || this.data.request) return;
    this.music?.setActive(false);
    this.setData({ request: fortressEntryStore.start(), showCredits: false, choiceComplete: false, navigationError: false });
  },
  choiceSucceeded(event: WechatMiniprogram.CustomEvent<ListeningResult>) {
    if (this.disposed || this.data.choiceComplete || !fortressEntryStore.complete(event.detail)) return;
    this.setData({ choiceComplete: true });
    this.enterBattle();
  },
  enterBattle() {
    const request = this.data.request;
    if (this.disposed || this.data.opening || !this.data.choiceComplete || !request) return;
    this.setData({ opening: true, navigationError: false });
    const navigationId = ++this.navigationId;
    wx.navigateTo({
      url: `/pages/battle/battle?mode=fortress&entry=${encodeURIComponent(request.plan.sessionId)}`,
      success: () => {
        if (!this.disposed && this.navigationId === navigationId) this.enteredBattle = true;
      },
      fail: () => {
        if (this.disposed || this.navigationId !== navigationId) return;
        this.setData({ opening: false, navigationError: true });
      },
    });
  },
});
