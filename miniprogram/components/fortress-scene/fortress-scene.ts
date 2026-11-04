import { petStore } from '../../services/pet-store';
import { createPetDrops } from '../../services/pet-drops';
import { coinWallet, victoryCoinsForLevel } from '../../services/coin-wallet';
import { createBattleDrops } from '../../services/battle-drops';
import { createVictoryAudio } from '../../services/victory-audio';
import { BATTLE_WORDS } from '../../fortress/fruit-catalog';
import { getLevel } from '../../fortress/levels';
import { createBattleAudio } from '../../services/battle-audio';
import type { ListeningResult } from '../../fortress/listening';
import { createOpeningEncounter, openingArt, openingSkillOffer, OPENING_EXPERIENCE, OPENING_WAVE_COUNT, MAX_HERO_LEVEL, ZERO_SKILLS } from '../../fortress/opening-encounter';
import { createExperience } from '../../fortress/experience';
import { createUpgradeChoices } from '../../fortress/upgrade-choice';
import type { UpgradeOffer } from '../../fortress/upgrade-choice';
import type { BattleSkillId, SkillLevels } from '../../fortress/types';
import { CanvasScene } from '../../fortress/canvas-scene';
import type { SceneArt } from '../../fortress/canvas-scene';
import { createPreviewCombat, createPreviewPlan, createPreviewPlanCombat } from '../../fortress/preview';
import { createSeededRandom } from '../../fortress/plans';
import { createSkillSession, skillCards } from '../../fortress/skills';
import type { SkillSession } from '../../fortress/skills';
import { FORTRESS_MONSTERS, MONSTER_ASSETS, monsterDrawWidth } from '../../fortress/content';
import type { RetirementView } from '../../fortress/retirement';
import type { CombatState, SessionPlan, SkillId, SkillOfferState, SupportSoldierState } from '../../fortress/types';

interface InstanceState { petDrops?: ReturnType<typeof createPetDrops>; drops?: ReturnType<typeof createBattleDrops>; victoryAudio?: ReturnType<typeof createVictoryAudio>; audio?: ReturnType<typeof createBattleAudio>; pendingOffer?: UpgradeOffer; awaitingWaveEnd?: boolean; pending?: CombatState; supportSoldiers?: readonly SupportSoldierState[]; waveIndex?: number; baseHp?: number; experience?: ReturnType<typeof createExperience>; upgrades?: ReturnType<typeof createUpgradeChoices>; levels?: SkillLevels; scene?: CanvasScene; skills?: SkillSession; epoch: number; visible: boolean; alive: boolean }
const instances = new WeakMap<object, InstanceState>();
let previewSequence = 0;
function previewCombat(wordId: string): CombatState {
  const id = `preview-${++previewSequence}`;
  return createPreviewCombat(wordId, id);
}
Component({
  properties: {
    musicVolume: { type: Number, value: 22, observer(value: number) { instances.get(this)?.audio?.setVolume(value / 100); } },
    opening: { type: Boolean, value: false },
    preview: { type: Boolean, value: false },
    previewRequest: { type: Object, value: null },
    previewWord: { type: String, value: 'apple', observer() { if (instances.get(this)?.scene && this.properties.preview) this.mount(true); } },
    initialState: { type: Object, value: null },
    art: { type: Object, value: null },
    paused: { type: Boolean, value: false, observer() { this.applyPause(); this.presentUpgrade(); } },
  },
  observers: {
    initialState() { if (instances.get(this)?.scene) this.mount(true); },
  },
  data: { petReward: '', petDropError: false, rewardCoins: victoryCoinsForLevel(1), rewardSaved: false, rewardError: false, coinBalance: 0, fireworks: [{ id: 0, x: 16, y: 24, delay: 0 }, { id: 1, x: 83, y: 19, delay: 450 }, { id: 2, x: 50, y: 10, delay: 900 }, { id: 3, x: 18, y: 62, delay: 1350 }, { id: 4, x: 82, y: 60, delay: 1800 }], fireworkRays: Array.from({ length: 12 }, (_, id) => ({ id, angle: id * 30, color: ['#ff8fa9', '#ffe488', '#87efcb', '#92cdff', '#d9a3ff'][id % 5] })), victoryFruits: BATTLE_WORDS.map((word, index) => ({ id: word.id, image: word.fruitImagePath, delay: 650 + index * 70 })), victoryParticles: Array.from({ length: 24 }, (_, index) => ({ id: index, left: (index * 37 + 11) % 100, delay: (index % 8) * 95, duration: 1500 + (index % 5) * 160, color: ['#ffe49a', '#77e4b1', '#ff997e'][index % 3] })), waveCount: OPENING_WAVE_COUNT, speakingWord: '', voiceError: false, waveNumber: 1, completed: false, waveRequest: null as { plan: SessionPlan; waveIndex: number; generation: number; variant: 'fruit' } | null, xpCurrent: 0, xpRequired: 30, xpPercent: 0, frozenFrame: '', experience: 0, level: 1, upgradeOffer: null as UpgradeOffer | null, upgradeSummary: '', inputUnavailable: false, ready: false, error: '', hud: { hp: 50, maxHp: 50, status: 'fighting' }, hpPercent: 100, retirement: null as RetirementView | null,
    dropCoins: 0, dropError: false, skillOffer: null as SkillOfferState | null, skillCards: [] as ReturnType<typeof skillCards>, skillSummary: '' },
  lifetimes: {
    attached() { instances.set(this, { epoch: 0, visible: true, alive: true }); const balance = coinWallet.balance(); this.setData({ coinBalance: balance }); this.triggerEvent('coinbalancechange', { balance }); },
    ready() { this.mount(); },
    detached() { const state = instances.get(this); if (state) { state.alive = false; state.epoch++; state.scene?.dispose(); state.drops?.dispose(); state.petDrops?.dispose(); state.audio?.dispose(); state.victoryAudio?.dispose(); state.skills?.dispose(); state.experience?.dispose(); state.upgrades?.dispose(); } instances.delete(this); },
  },
  pageLifetimes: {
    hide() { const state = instances.get(this); if (state) { state.visible = false; this.applyPause(); } },
    show() { const state = instances.get(this); if (state) { state.visible = true; const balance = coinWallet.balance(); this.setData({ coinBalance: balance }); this.triggerEvent('coinbalancechange', { balance }); this.applyPause(); this.presentUpgrade(); } },
    resize() { this.measureResize(); },
  },
  methods: {
    mount(replace = false) {
      const instance = instances.get(this); if (!instance?.alive) return;
      const balance = coinWallet.balance(); this.setData({ coinBalance: balance }); this.triggerEvent('coinbalancechange', { balance });
      const retained = instance.pending ?? (replace ? null : instance.scene?.snapshot); instance.pending = undefined;
      instance.scene?.dispose(); instance.scene = undefined;
      instance.skills?.dispose(); instance.skills = undefined;
      const epoch = ++instance.epoch;
      this.setData({ ready: false, error: '', retirement: null, skillOffer: null, skillCards: [], skillSummary: '' });
      const valid = () => instance.alive && instance.epoch === epoch;
      this.createSelectorQuery().select('#battle-canvas').fields({ node: true, size: true, rect: true }, result => {
        if (!valid()) return;
        try {
          if (!result?.node || !result.width || !result.height) throw new Error('Canvas 节点尚未就绪');
          if (this.properties.preview && wx.getAccountInfoSync().miniProgram.envVersion !== 'develop') throw new Error('开发预览仅在开发版可用');
          const request = this.properties.previewRequest as { plan: SessionPlan; generation: number; variant?: 'fruit' } | null;
          const initial = this.properties.opening && request ? (retained ?? createOpeningEncounter(request.plan.sessionId, request.plan.waves[0].targetWordId, request.generation, 0, undefined, undefined, [], request.plan.levelId, request.plan.weaponLevel)) : this.properties.preview ? (request ? createPreviewPlanCombat(request.plan, request.generation) : previewCombat(this.properties.previewWord)) : retained ?? this.properties.initialState as CombatState | null;
          if (!initial) throw new Error('战斗尚未开始');
          if (this.properties.opening && !retained) {
            instance.experience?.dispose(); instance.upgrades?.dispose();
            instance.drops?.dispose(); instance.petDrops?.dispose();
            this.setData({ petReward: '', petDropError: false });
            instance.petDrops = createPetDrops({ sessionId: initial.context.sessionId,
              bossIds: request?.plan.waves.flatMap(wave => wave.spawnPlan.filter(monster => monster.boss).map(monster => monster.monsterId)) ?? [], store: petStore,
              onChange: (message, error) => { if (instance.alive) this.setData({ petReward: message, petDropError: error }); },
            });
            this.setData({ dropCoins: 0, dropError: false });
            instance.drops = createBattleDrops({ sessionId: initial.context.sessionId, levelId: request?.plan.levelId ?? 1, wallet: coinWallet,
              onChange: view => { if (instance.alive) { const balance = coinWallet.balance(); this.setData({ dropCoins: view.total, dropError: view.error, coinBalance: balance }); this.triggerEvent('coinbalancechange', { balance }); } },
              onAward: (position, amount) => { if (instance.alive) { instance.scene?.showCoinDrop(position, amount); instance.audio?.playCoin(); } },
            });
            instance.experience = createExperience(initial.context.sessionId, OPENING_EXPERIENCE);
            instance.upgrades = createUpgradeChoices(); instance.levels = ZERO_SKILLS; instance.waveIndex = 0; instance.supportSoldiers = [];
            this.setData({ rewardCoins: victoryCoinsForLevel(request?.plan.levelId ?? 1), rewardSaved: false, rewardError: false, victoryFruits: getLevel(request?.plan.levelId).words.map((word, index) => ({ id: word.id, image: word.fruitImagePath, delay: 650 + index * 70 })), frozenFrame: '', experience: 0, level: 1, upgradeOffer: null, upgradeSummary: '' });
          }
          if (this.properties.opening && !instance.audio) {
            instance.audio = createBattleAudio({ sessionId: initial.context.sessionId,
              onChange: view => { if (!instance.alive) return; this.setData({ speakingWord: view.speakingWord, voiceError: view.error }); },
              onDrained: () => { if (instance.alive) this.presentUpgrade(); },
            });
            instance.audio.setVolume(this.properties.musicVolume / 100);
          }
          if (this.properties.preview && request?.variant !== 'fruit') instance.skills = createSkillSession(request?.plan ?? createPreviewPlan(this.properties.previewWord, initial.context.sessionId), createSeededRandom(previewSequence));
          const visual = FORTRESS_MONSTERS.find(monster => monster.wordId === initial.monsters[0].wordId);
          const asset = MONSTER_ASSETS.find(asset => asset.wordId === initial.monsters[0].wordId);
          const scene = new CanvasScene(result.node, {
            levelId: request?.plan.levelId ?? 1, initial, width: result.width, height: result.height, dpr: wx.getWindowInfo().pixelRatio, clientLeft: result.left ?? 0,
            preview: this.properties.preview, art: this.properties.opening ? openingArt(initial.monsters[0].wordId, initial.monsters.map(monster => monster.wordId), initial.weaponLevel) : this.properties.art as SceneArt | undefined,
            previewMonster: this.properties.preview && visual && asset ? { monsterVisual: visual, monsterWidth: monsterDrawWidth(visual),
              monster: { ...asset, approved: asset.reviewStatus === 'approved' } } : undefined,
            retirement: this.properties.opening ? undefined : {
              onChange: retirement => { if (valid()) this.setData({ retirement }); },
              onComplete: result => {
                if (!valid()) return;
                const snapshot = scene.snapshot;
                const offer = snapshot && instance.skills?.open(snapshot);
                if (offer && instance.skills) this.setData({ skillOffer: offer, skillCards: skillCards(offer, instance.skills.levels) });
                this.triggerEvent('retirementcomplete', result);
              },
            },
            onHud: hud => { if (valid()) this.setData({ hud, hpPercent: hud.hp / hud.maxHp * 100 }); },
            onEvents: events => {
              if (!valid()) return;
              instance.audio?.handle(events);
              instance.drops?.handle(events);
              instance.petDrops?.handle(events);
              if (instance.experience && instance.upgrades) {
                const xp = instance.experience.record(events);
                const thresholds = [0, ...OPENING_EXPERIENCE.levelThresholds];
                const required = xp.level < MAX_HERO_LEVEL ? thresholds[xp.level] - thresholds[xp.level - 1] : 0;
                const current = xp.total - thresholds[xp.level - 1];
                this.setData({ experience: xp.total, level: xp.level, xpCurrent: current, xpRequired: required, xpPercent: required ? current / required * 100 : 100 });
                if (xp.upgrades.length > 0 && scene.snapshot?.status !== 'baseDestroyed') {
                  const candidate = openingSkillOffer(initial.context.sessionId, xp.level, instance.levels, scene.snapshot?.base);
                  if (candidate.cards.length) instance.pendingOffer = instance.upgrades.open(candidate) ?? undefined;
                }
                if (scene.snapshot?.status === 'cleared') { instance.awaitingWaveEnd = true; this.presentUpgrade(); }
              }
              if (scene.snapshot?.status === 'baseDestroyed') instance.audio?.setActive(false);
              this.triggerEvent('combatevents', { events, state: scene.snapshot });
            },
            onError: message => { if (valid()) { this.setData({ error: message, ready: false }); this.applyPause(); } },
          });
          instance.scene = scene; this.applyPause();
          void scene.load().then(ready => { if (valid() && ready) { this.setData({ ready: true }); this.applyPause(); this.triggerEvent('sceneready'); } });
        } catch (error) { if (valid()) this.setData({ error: error instanceof Error ? error.message : '战场初始化失败' }); }
      }).exec();
    },
    applyPause() { const state = instances.get(this); if (!state) return; const unavailable = this.properties.paused || !state.visible; this.setData({ inputUnavailable: unavailable }); state.victoryAudio?.setActive(!unavailable); const paused = unavailable || !!this.data.upgradeOffer || !!this.data.waveRequest || this.data.completed; state.scene?.setPaused(paused); state.skills?.setPaused(paused); state.audio?.setActive(!paused && this.data.ready && !this.data.error && this.data.hud.status !== 'baseDestroyed'); },
    presentUpgrade() {
      const state = instances.get(this);
      if (!state?.awaitingWaveEnd || state.audio?.busy || !state.scene || !state.visible || this.properties.paused) return;
      state.awaitingWaveEnd = false;
      if (!state.pendingOffer) { this.advanceWave(); return; }
      const offer = state.pendingOffer; state.pendingOffer = undefined;
      this.setData({ frozenFrame: state.scene.captureFrame(), upgradeOffer: offer }); this.applyPause();
    },
    retryVoice() { instances.get(this)?.audio?.retry(); },
    retryPetDrops() { const state = instances.get(this); if (state?.alive && state.visible && !this.properties.paused) state.petDrops?.retry(); },
    retryDrops() { const state = instances.get(this); if (state?.alive && state.visible && !this.properties.paused) state.drops?.retry(); },
    chooseUpgrade(event: WechatMiniprogram.CustomEvent<{ offerId: string; cardId: string }>) {
      const state = instances.get(this);
      if (!state?.levels || this.properties.paused || !state.visible || !state.scene || this.data.error) return;
      const selected = state.upgrades?.select(event.detail.offerId, event.detail.cardId);
      if (!selected) return;
      if (selected.id === 'repair') state.scene.restoreBase();
      else {
        const id = selected.id as BattleSkillId;
        state.levels = Object.freeze({ ...state.levels, [id]: (state.levels[id] ?? 0) + 1 });
        state.scene.applySkills(state.levels);
      }
      this.setData({ upgradeSummary: `${selected.label} · ${selected.description}` });
      this.advanceWave();
    },
    advanceWave() {
      const state = instances.get(this); const snapshot = state?.scene?.snapshot;
      if (!state?.scene || !snapshot || snapshot.status !== 'cleared' || state.audio?.busy || this.data.completed) return;
      state.baseHp = snapshot.base.hp;
      state.supportSoldiers = snapshot.supportSoldiers ?? [];
      const request = this.properties.previewRequest as { plan: SessionPlan; generation: number };
      const waveIndex = state.waveIndex ?? 0;
      if (waveIndex === OPENING_WAVE_COUNT - 1) {
        if (this.data.level < MAX_HERO_LEVEL) return;
        this.setData({ frozenFrame: state.scene.captureFrame(), upgradeOffer: null, completed: true, upgradeSummary: this.data.upgradeSummary });
        this.applyPause(); this.claimVictoryReward();
        state.victoryAudio?.dispose();
        state.victoryAudio = createVictoryAudio();
        state.victoryAudio.setActive(state.visible && !this.properties.paused);
        return;
      }
      this.setData({ frozenFrame: state.scene.captureFrame() });
      state.audio?.setActive(false); state.scene.dispose(); state.scene = undefined; state.epoch++;
      this.setData({ upgradeOffer: null, upgradeSummary: '', waveRequest: { ...request, waveIndex: waveIndex + 1, generation: request.generation + waveIndex + 1, variant: 'fruit' } });
    },
    nextWave(event: WechatMiniprogram.CustomEvent<ListeningResult>) {
      const state = instances.get(this); const request = this.data.waveRequest;
      if (!state?.alive || !state.visible || this.properties.paused || !request || !state.levels) return;
      const result = event.detail; const wave = request.plan.waves[request.waveIndex];
      if (result.context.sessionId !== request.plan.sessionId || result.context.waveId !== wave.waveId || result.context.generation !== request.generation || !result.attempts.length || !result.attempts[result.attempts.length - 1].correct) return;
      state.waveIndex = request.waveIndex;
      state.pending = createOpeningEncounter(request.plan.sessionId, wave.targetWordId, request.generation, request.waveIndex, state.levels, state.baseHp, request.plan.waves.slice(0, request.waveIndex).map(wave => wave.targetWordId), request.plan.levelId, request.plan.weaponLevel, state.supportSoldiers);
      this.setData({ waveRequest: null, waveNumber: request.waveIndex + 1, frozenFrame: '', ready: false }, () => this.mount());
    },
    claimVictoryReward() {
      const state = instances.get(this);
      if (!this.data.completed || !state?.visible || this.data.rewardSaved) return;
      const request = this.properties.previewRequest as { plan: SessionPlan };
      try { const result = coinWallet.rewardVictory(request.plan.sessionId, request.plan.levelId ?? 1); this.setData({ rewardSaved: true, rewardError: false, coinBalance: result.balance }); this.triggerEvent('coinbalancechange', { balance: result.balance }); }
      catch { this.setData({ rewardError: true, rewardSaved: false }); }
    },
    returnHome() { this.triggerEvent('returnhome'); },
    choosePreviewSkill(event: WechatMiniprogram.TouchEvent) {
      const skills = instances.get(this)?.skills;
      const selected = skills?.select(event.currentTarget.dataset.offerId, event.currentTarget.dataset.skillId as SkillId);
      if (!selected || selected.status !== 'selected' || !skills) return;
      const card = skillCards(selected, skills.levels).find(card => card.id === selected.selection.skillId)!;
      this.setData({ skillOffer: selected, skillSummary: `${card.label}：${card.description}（仅本局）` });
    },
    retry() { this.mount(); },
    retryRetirement() { instances.get(this)?.scene?.retryRetirement(); },
    continueRetirement() { instances.get(this)?.scene?.continueRetirement(); },
    restartPreview() { if (this.properties.preview) this.mount(); },
    getDiagnostics() { return instances.get(this)?.scene?.diagnostics; },
    getSnapshot() { return instances.get(this)?.scene?.snapshot; },
    measureResize() {
      const state = instances.get(this); if (!state?.scene) return;
      const epoch = state.epoch;
      this.createSelectorQuery().select('#battle-canvas').boundingClientRect(rect => {
        if (state.alive && state.epoch === epoch && !Array.isArray(rect) && rect?.width && rect.height) {
          state.scene?.resize(rect.width, rect.height, wx.getWindowInfo().pixelRatio, rect.left);
        }
      }).exec();
    },
    touchStart(event: WechatMiniprogram.TouchEvent) { instances.get(this)?.scene?.touchStart(event.touches); },
    touchMove(event: WechatMiniprogram.TouchEvent) { instances.get(this)?.scene?.touchMove(event.touches); },
    touchEnd(event: WechatMiniprogram.TouchEvent) { instances.get(this)?.scene?.touchEnd(event.changedTouches); },
    touchCancel() { instances.get(this)?.scene?.touchCancel(); },
  },
});
