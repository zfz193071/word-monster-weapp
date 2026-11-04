import { petStore } from '../../services/pet-store';
import type { PetView } from '../../services/pet-store';
import { createAudioAdapter } from '../../services/audio';
import { collectionWords } from '../../fortress/collection';
import { loadLevelAssets } from '../../services/level-assets';
import { LEVELS } from '../../fortress/levels';
import { coinWallet } from '../../services/coin-wallet';
import { createHomeMusic } from '../../services/home-music';
import type { HomeMusicStatus } from '../../services/home-music';
import type { ListeningResult } from '../../fortress/listening';
import { fortressEntryStore } from '../../services/fortress-entry';
import type { FruitRequest } from '../../services/fortress-entry';

Page({
  data: { showPet: false, petView: null as PetView|null, petError: '', petMessage: '', showWeapon:false, weaponLevel:1, collectionPlaying: '', collectionAudioError: '', preparingLevel: false, showLevels: false, progressError: false, entryError: '', levels: LEVELS.map(level => ({ id: level.id, title: level.title, cover: level.cover, locked: level.id > 1, completed: false })), coinBalance: 0, coinError: false, homeVisible: false, musicEnabled: true, musicStatus: 'idle' as HomeMusicStatus, opening: false, showCredits: false, collectionTabs: LEVELS.map(level => ({ id: level.id, title: level.title })), collectionLevel: 1, collectionItems: collectionWords(1), collectionLoading: false, collectionError: false, collectionScroll: 0,
    upperClouds: [] as { id: number; style: string; scale: string }[],
    request: null as FruitRequest | null, choiceComplete: false, navigationError: false },
  music: undefined as ReturnType<typeof createHomeMusic> | undefined,
  navigationId: 0,
  collectionRevision: 0,
  collectionAudioRevision: 0,
  collectionAudio: undefined as ReturnType<typeof createAudioAdapter> | undefined,
  enteredBattle: false,
  disposed: false,

  refreshPet() {
    try { this.setData({ petView: petStore.view(), petError: '' }); }
    catch { this.setData({ petError: '宠物记录暂时无法读取，请重试' }); }
  },
  openPet() {
    if (!this.data.homeVisible || this.data.request || this.data.preparingLevel || this.data.showWeapon) return;
    this.stopCollectionAudio(); this.refreshPet();
    this.setData({ showPet: true, showLevels: false, showCredits: false, petMessage: '' });
  },
  closePet() { this.setData({ showPet: false }); },
  petAction(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.homeVisible || !this.data.showPet || !this.data.petView || this.data.petError) return;
    const { action, gear, revision } = event.currentTarget.dataset;
    try {
      let message = '';
      if (action === 'feed' && petStore.feed(Number(revision))) message = '喂养成功 · 经验 +10';
      else if (action === 'hatch') message = petStore.hatch(Number(revision));
      else if (action === 'equip') petStore.toggleEquipment(String(gear), Number(revision));
      this.refreshPet(); this.setData({ petMessage: message });
    } catch { this.setData({ petError: '操作未保存，请重试', petMessage: '' }); }
  },
  refreshLevels() {
    try {
      const completed = coinWallet.completedLevels();
      this.setData({ progressError: false, levels: LEVELS.map(level => ({ id: level.id, title: level.title, cover: level.cover, locked: level.id > completed.length + 1, completed: completed.includes(level.id) })) });
    } catch { this.setData({ progressError: true }); }
  },
  toggleLevels() { if (this.data.showPet || this.data.request) return; this.stopCollectionAudio(); this.refreshLevels(); this.setData({ showLevels: !this.data.showLevels, showCredits: false }); },
  selectLevel(event: WechatMiniprogram.BaseEvent) { return this.beginLevel(Number(event.currentTarget.dataset.levelId)); },
  toggleCredits() {
    if (this.data.showPet) return;
    this.stopCollectionAudio();
    this.collectionRevision++;
    if (this.data.showCredits) { this.setData({ showCredits: false }); return; }
    this.setData({ showCredits: true, showLevels: false });
    void this.loadCollection(1);
  },
  selectCollection(event: WechatMiniprogram.BaseEvent) { return this.loadCollection(Number(event.currentTarget.dataset.levelId)); },
  retryCollection() { return this.loadCollection(this.data.collectionLevel); },
  async loadCollection(levelId: number) {
    const level = LEVELS.find(level => level.id === levelId);
    if (!level || this.disposed || !this.data.showCredits) return;
    this.stopCollectionAudio();
    const revision = ++this.collectionRevision;
    this.setData({ collectionLevel: levelId, collectionItems: [], collectionLoading: levelId > 1, collectionError: false, collectionScroll: this.data.collectionScroll === 0 ? 1 : 0 });
    const valid = () => !this.disposed && this.data.showCredits && revision === this.collectionRevision;
    try {
      if (levelId > 1) await loadLevelAssets();
      if (!valid()) return;
      this.setData({ collectionItems: collectionWords(levelId), collectionLoading: false, collectionScroll: 0 });
    } catch { if (valid()) this.setData({ collectionLoading: false, collectionError: true }); }
  },
  stopCollectionAudio() {
    this.collectionAudioRevision++;
    this.collectionAudio?.dispose(); this.collectionAudio = undefined;
    if (!this.disposed) { this.setData({ collectionPlaying: '', collectionAudioError: '' }); this.synchronizeMusic(); }
  },
  playCollectionWord(event: WechatMiniprogram.BaseEvent) {
    if (this.disposed || !this.data.homeVisible || !this.data.showCredits || this.data.collectionLoading) return;
    const word = this.data.collectionItems.find(item => item.id === event.currentTarget.dataset.wordId);
    if (!word) return;
    this.stopCollectionAudio();
    const revision = this.collectionAudioRevision;
    this.setData({ collectionPlaying: word.id }); this.synchronizeMusic();
    this.collectionAudio = createAudioAdapter({ sessionId: 'collection', emit() {} });
    this.collectionAudio.playReveal(word.audioPath, { sessionId: 'collection', roundId: word.id, revision }, success => {
      if (this.disposed || revision !== this.collectionAudioRevision) return;
      this.setData({ collectionPlaying: '', collectionAudioError: success ? '' : word.id }); this.synchronizeMusic();
    });
  },
  onLoad() {
    this.setData({ upperClouds: Array.from({ length: 3 }, (_, id) => {
      const duration = 70 + Math.random() * 20;
      // Stagger starting positions while keeping both turnarounds outside the viewport.
      const progress = .25 + id * .22 + Math.random() * .06;
      return {
        id,
        style: `top:${5 + Math.random() * 6}%;animation-duration:${duration}s;animation-delay:-${duration * progress}s`,
        scale: `transform:scale(${.55 + Math.random() * .4})`,
      };
    }) });
  },
  openWeapon() {
    if (!this.data.homeVisible || this.data.showPet || this.data.request || this.data.showCredits || this.data.showLevels || this.data.preparingLevel) return;
    this.setData({ showWeapon: true });
  },
  closeWeapon() { this.setData({ showWeapon: false }); },
  equipmentChanged(event: WechatMiniprogram.CustomEvent<{ level:number; balance:number; error:boolean }>) {
    if (event.detail.error) { this.setData({ coinError:true }); return; }
    this.setData({ weaponLevel:event.detail.level, coinBalance:event.detail.balance, coinError:false });
  },
  onShow() {
    this.refreshPet();
    try { const equipment=coinWallet.equipment();this.setData({ coinBalance: equipment.balance, weaponLevel:equipment.level, coinError: false }); } catch { this.setData({ coinError: true }); }
    if (!this.music) this.music = createHomeMusic({ onChange: view => {
      if (!this.disposed) this.setData({ musicEnabled: view.enabled, musicStatus: view.status });
    } });
    this.setData({ homeVisible: true });
    if (this.enteredBattle) {
      this.enteredBattle = false;
      this.clearChallenge();
    }
    this.refreshLevels(); this.synchronizeMusic();
  },
  onHide() { this.setData({ homeVisible: false }); this.stopCollectionAudio(); this.synchronizeMusic(); },
  onUnload() { this.disposed = true; this.stopCollectionAudio(); this.music?.dispose(); this.music = undefined; this.releaseEntry(); },
  synchronizeMusic() { this.music?.setActive(this.data.homeVisible && !this.data.request && !this.data.collectionPlaying); },
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
  async openBattle() {
    try { await this.beginLevel(coinWallet.defaultLevel()); }
    catch { this.setData({ entryError: '关卡记录暂时无法读取，请重试' }); }
  },
  async beginLevel(levelId: number) {
    if (this.disposed || this.data.request || this.data.preparingLevel || this.data.showWeapon || this.data.showPet) return;
    try {
      if (!coinWallet.canEnter(levelId)) return;
      if (levelId > 1) {
        this.setData({ preparingLevel: true, entryError: '' });
        await loadLevelAssets();
        if (this.disposed) return;
      }
      const request = fortressEntryStore.start(Date.now(), levelId);
      this.stopCollectionAudio(); this.music?.setActive(false);
      this.setData({ request, showLevels: false, showCredits: false, entryError: '', choiceComplete: false, navigationError: false });
    } catch { if (!this.disposed) this.setData({ entryError: '关卡暂时无法准备，请重试' }); }
    finally { if (!this.disposed) this.setData({ preparingLevel: false }); }
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
