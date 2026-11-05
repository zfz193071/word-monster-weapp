import { loadLevelAssets } from '../../services/level-assets';
import { nextStageRequest } from '../../fortress/continuation';
import type { StageRequest } from '../../fortress/continuation';
import { bossSkillOffer, qualitySkillOffer, skillLevels, qualityDescription } from '../../fortress/quality-skills';
import { applySkillReward, SKILL_QUALITIES, qualityRank } from '../../fortress/skill-quality';
import type { SkillCollection } from '../../fortress/skill-quality';
import { createDefeatAudio } from '../../services/defeat-audio';
import { createBattlePet } from '../../pets/battle';
import type { BattlePet } from '../../pets/battle';
import { petStore } from '../../services/pet-store';
import { createPetDrops } from '../../services/pet-drops';
import { coinWallet, victoryCoinsForLevel } from '../../services/coin-wallet';
import { createBattleDrops } from '../../services/battle-drops';
import { createVictoryAudio } from '../../services/victory-audio';
import { BATTLE_WORDS } from '../../fortress/fruit-catalog';
import { getLevel } from '../../fortress/levels';
import { createBattleAudio } from '../../services/battle-audio';
import type { ListeningResult } from '../../fortress/listening';
import { createOpeningEncounter, openingArt, OPENING_EXPERIENCE, OPENING_WAVE_COUNT, MAX_HERO_LEVEL, ZERO_SKILLS } from '../../fortress/opening-encounter';
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

interface InstanceState { entrySessionId?: string; activeRequest?: StageRequest; preparedStage?: StageRequest; stageCarry?: {collection:SkillCollection; pet?:BattlePet}; preparingStage?: boolean; bossRewards?: {id:string; quality:'elite'|'legendary'}[]; bossSeen?: Set<string>; collection?: SkillCollection; sessionId?: string; defeatAudio?: ReturnType<typeof createDefeatAudio>; pet?: BattlePet; petDrops?: ReturnType<typeof createPetDrops>; drops?: ReturnType<typeof createBattleDrops>; victoryAudio?: ReturnType<typeof createVictoryAudio>; audio?: ReturnType<typeof createBattleAudio>; upgradeLevels?: number[]; awaitingWaveEnd?: boolean; pending?: CombatState; supportSoldiers?: readonly SupportSoldierState[]; waveIndex?: number; baseHp?: number; experience?: ReturnType<typeof createExperience>; upgrades?: ReturnType<typeof createUpgradeChoices>; levels?: SkillLevels; scene?: CanvasScene; skills?: SkillSession; epoch: number; visible: boolean; alive: boolean }
const instances = new WeakMap<object, InstanceState>();
let previewSequence = 0;
function previewCombat(wordId: string): CombatState {
  const id = `preview-${++previewSequence}`;
  return createPreviewCombat(wordId, id);
}
function inventory(collection: SkillCollection) {
  const labels: Record<BattleSkillId, string> = {doubleShot:'齐射',fireRate:'疾速',bulletWidth:'巨型弹丸',flame:'火花绽放',frost:'冰晶缓行',lightning:'跃动电弧',firepower:'火力激发',homing:'灵巧追踪'};
  return Object.entries(collection).map(([id, skill]) => ({id, quality:skill.quality, label:`${labels[id as BattleSkillId]} · ${SKILL_QUALITIES[qualityRank(skill.quality)].label} Lv.${skill.level}`, description:qualityDescription(id as BattleSkillId,collection)}));
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
    paused: { type: Boolean, value: false, observer() { this.applyPause(); this.presentUpgrade(); this.finishContinuation(); } },
  },
  observers: {
    previewRequest(request: { plan: SessionPlan } | null) {
      const state = instances.get(this);
      if (state?.sessionId && request && state.entrySessionId !== request.plan.sessionId) { state.activeRequest = undefined; state.stageCarry = undefined; state.preparedStage = undefined; state.preparingStage = false; this.mount(true); }
    },
    initialState() { if (instances.get(this)?.scene) this.mount(true); },
  },
  data: { failed: false, petReward: '', petDropError: false, rewardCoins: victoryCoinsForLevel(1), rewardSaved: false, rewardError: false, coinBalance: 0, fireworks: [{ id: 0, x: 16, y: 24, delay: 0 }, { id: 1, x: 83, y: 19, delay: 450 }, { id: 2, x: 50, y: 10, delay: 900 }, { id: 3, x: 18, y: 62, delay: 1350 }, { id: 4, x: 82, y: 60, delay: 1800 }], fireworkRays: Array.from({ length: 12 }, (_, id) => ({ id, angle: id * 30, color: ['#ff8fa9', '#ffe488', '#87efcb', '#92cdff', '#d9a3ff'][id % 5] })), victoryFruits: BATTLE_WORDS.map((word, index) => ({ id: word.id, image: word.fruitImagePath, delay: 650 + index * 70 })), victoryParticles: Array.from({ length: 24 }, (_, index) => ({ id: index, left: (index * 37 + 11) % 100, delay: (index % 8) * 95, duration: 1500 + (index % 5) * 160, color: ['#ffe49a', '#77e4b1', '#ff997e'][index % 3] })), waveCount: OPENING_WAVE_COUNT, speakingWord: '', voiceError: false, waveNumber: 1, completed: false, waveRequest: null as { plan: SessionPlan; waveIndex: number; generation: number; variant: 'fruit' } | null, xpCurrent: 0, xpRequired: OPENING_EXPERIENCE.levelThresholds[0], xpPercent: 0, frozenFrame: '', experience: 0, level: 1, upgradeOffer: null as UpgradeOffer | null, upgradeSummary: '', inputUnavailable: false, ready: false, error: '', hud: { hp: 1000, maxHp: 1000, status: 'fighting' }, hpPercent: 100, retirement: null as RetirementView | null,
    bossNotice: '', goldenLoot: false, canContinue: false, continueBusy: false, continueError: false,
    skillInventory: [] as { id: string; quality: string; label: string; description: string }[], dropCoins: 0, dropError: false, skillOffer: null as SkillOfferState | null, skillCards: [] as ReturnType<typeof skillCards>, skillSummary: '' },
  lifetimes: {
    attached() { instances.set(this, { epoch: 0, visible: true, alive: true }); const balance = coinWallet.balance(); this.setData({ coinBalance: balance }); this.triggerEvent('coinbalancechange', { balance }); },
    ready() { this.mount(); },
    detached() { this.endRun(); instances.delete(this); },
  },
  pageLifetimes: {
    hide() { const state = instances.get(this); if (state) { state.visible = false; this.applyPause(); } },
    show() { const state = instances.get(this); if (state) { state.visible = true; const balance = coinWallet.balance(); this.setData({ coinBalance: balance }); this.triggerEvent('coinbalancechange', { balance }); this.applyPause(); this.presentUpgrade(); this.finishContinuation(); } },
    resize() { this.measureResize(); },
  },
  methods: {
    mount(replace = false) {
      const instance = instances.get(this); if (!instance?.alive) return;
      const balance = coinWallet.balance(); this.setData({ coinBalance: balance }); this.triggerEvent('coinbalancechange', { balance });
      const retained = replace ? null : (instance.pending ?? instance.scene?.snapshot); instance.pending = undefined;
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
          const request = instance.activeRequest ?? this.properties.previewRequest as StageRequest | null;
          const carry = instance.stageCarry;
          const initial = this.properties.opening && request ? (retained ?? createOpeningEncounter(request.plan.sessionId, request.plan.waves[0].targetWordId, request.generation, 0, skillLevels(carry?.collection ?? {}), undefined, [], request.plan.levelId, request.plan.weaponLevel, [], request.plan.difficulty, carry?.collection ?? Object.freeze({}))) : this.properties.preview ? (request ? createPreviewPlanCombat(request.plan, request.generation) : previewCombat(this.properties.previewWord)) : retained ?? this.properties.initialState as CombatState | null;
          if (!initial) throw new Error('战斗尚未开始');
          instance.sessionId = initial.context.sessionId;
          if (!instance.activeRequest) instance.entrySessionId = request?.plan.sessionId;
          if (this.properties.opening && !retained) {
            instance.audio?.dispose(); instance.audio = undefined;
            instance.victoryAudio?.dispose(); instance.victoryAudio = undefined;
            instance.upgradeLevels = []; instance.bossRewards = []; instance.bossSeen = new Set(); instance.awaitingWaveEnd = false;
            instance.experience?.dispose(); instance.upgrades?.dispose();
            instance.drops?.dispose(); instance.petDrops?.dispose();
            instance.defeatAudio?.dispose(); instance.defeatAudio = undefined;
            this.setData({ completed: false, canContinue: false, continueBusy: false, continueError: false, bossNotice: '', goldenLoot: false, waveNumber: 1, waveRequest: null, speakingWord: '', voiceError: false, failed: false, petReward: '', petDropError: false });
            instance.petDrops = createPetDrops({ sessionId: initial.context.sessionId,
              bossIds: request?.plan.waves.flatMap(wave => wave.spawnPlan.filter(monster => monster.boss && monster.bossKind !== 'grand').map(monster => monster.monsterId)) ?? [], store: petStore,
              onChange: (message, error) => { if (instance.alive) { this.setData({ petReward: message, petDropError: error }); if (!error) this.syncBattlePet(); } },
            });
            this.setData({ dropCoins: 0, dropError: false });
            instance.drops = createBattleDrops({ sessionId: initial.context.sessionId, levelId: request?.plan.levelId ?? 1, difficulty: request?.plan.difficulty, wallet: coinWallet,
              monsterPosition: id => instance.scene?.snapshot?.monsters.find(monster => monster.id === id)?.position,
              grandBosses: Object.fromEntries(request?.plan.waves.flatMap(wave => wave.spawnPlan.filter(monster => monster.bossKind === 'grand').map(monster => [monster.monsterId, monster.position])) ?? []),
              onChange: view => { if (instance.alive) { const balance = coinWallet.balance(); this.setData({ dropCoins: view.total, dropError: view.error, coinBalance: balance }); this.triggerEvent('coinbalancechange', { balance }); } },
              onAward: (position, amount) => { if (instance.alive) { instance.scene?.showCoinDrop(position, amount); instance.audio?.playCoin(); } },
            });
            instance.experience = createExperience(initial.context.sessionId, OPENING_EXPERIENCE);
            instance.upgrades = createUpgradeChoices(); instance.collection = carry?.collection ?? Object.freeze({}); instance.levels = skillLevels(instance.collection); instance.waveIndex = 0; instance.supportSoldiers = []; instance.pet = carry?.pet; instance.stageCarry = undefined;
            this.setData({ skillInventory: inventory(instance.collection), rewardCoins: victoryCoinsForLevel(request?.plan.levelId ?? 1), rewardSaved: false, rewardError: false, victoryFruits: getLevel(request?.plan.levelId).words.map((word, index) => ({ id: word.id, image: word.fruitImagePath, delay: 650 + index * 70 })), frozenFrame: '', experience: 0, level: 1, xpCurrent: 0, xpRequired: OPENING_EXPERIENCE.levelThresholds[0], xpPercent: 0, upgradeOffer: null, upgradeSummary: '' });
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
              instance.drops?.handle(events);
              instance.petDrops?.handle(events);
              if (instance.experience && instance.upgrades) {
                const xp = instance.experience.record(events);
                const thresholds = [0, ...OPENING_EXPERIENCE.levelThresholds];
                const required = xp.level < MAX_HERO_LEVEL ? thresholds[xp.level] - thresholds[xp.level - 1] : 0;
                const current = xp.total - thresholds[xp.level - 1];
                this.setData({ experience: xp.total, level: xp.level, xpCurrent: current, xpRequired: required, xpPercent: required ? current / required * 100 : 100 });
                if (scene.snapshot?.status !== 'baseDestroyed') {
                  for (const event of events) {
                    if (event.type !== 'monsterDefeated' || event.context.sessionId !== instance.sessionId || instance.bossSeen?.has(event.monsterId)) continue;
                    const boss = request?.plan.waves.flatMap(wave => wave.spawnPlan).find(monster => monster.monsterId === event.monsterId && monster.boss);
                    if (!boss) continue;
                    instance.bossSeen?.add(event.monsterId);
                    if (boss.bossKind === 'grand' && request?.plan.levelId === 8) this.setData({goldenLoot:true, bossNotice:'堡垒破坏王已击败 · 金色战利品'});
                    else (instance.bossRewards ??= []).push({id:event.monsterId, quality:boss.bossKind === 'grand' ? 'legendary' : 'elite'});
                  }
                  instance.bossRewards?.sort((a,b) => (a.quality === 'elite' ? 0 : 1) - (b.quality === 'elite' ? 0 : 1));
                  (instance.upgradeLevels ??= []).push(...xp.upgrades);
                  if (scene.snapshot?.status === 'cleared') instance.awaitingWaveEnd = true;
                  instance.audio?.handle(events);
                  this.presentUpgrade();
                }
              }
              if (scene.snapshot?.status === 'baseDestroyed') this.presentDefeat();
              this.triggerEvent('combatevents', { events, state: scene.snapshot });
            },
            onError: message => { if (valid()) { this.setData({ error: message, ready: false }); this.applyPause(); } },
          });
          instance.scene = scene;
          if (instance.pet) scene.applyPet(instance.pet);
          this.syncBattlePet(); this.applyPause();
          void scene.load().then(ready => { if (valid() && ready) { this.setData({ ready: true }); this.applyPause(); this.triggerEvent('sceneready'); } });
        } catch (error) { if (valid()) this.setData({ error: error instanceof Error ? error.message : '战场初始化失败' }); }
      }).exec();
    },
    applyPause() { const state = instances.get(this); if (!state) return; const unavailable = this.properties.paused || !state.visible; this.setData({ inputUnavailable: unavailable }); state.victoryAudio?.setActive(!unavailable); state.defeatAudio?.setActive(!unavailable); const paused = unavailable || !!this.data.upgradeOffer || !!this.data.waveRequest || this.data.completed || this.data.failed; state.scene?.setPaused(paused); state.skills?.setPaused(paused); state.audio?.setActive(!paused && this.data.ready && !this.data.error && this.data.hud.status !== 'baseDestroyed'); },
    presentDefeat() {
      const state = instances.get(this);
      if (!this.properties.opening || !state?.alive || !state.scene || state.scene.snapshot?.status !== 'baseDestroyed' || this.data.failed) return;
      state.preparedStage = undefined; state.stageCarry = undefined; state.preparingStage = false;
      state.audio?.setActive(false); state.upgradeLevels = []; state.bossRewards = []; state.awaitingWaveEnd = false;
      state.upgrades?.dispose(); state.collection = Object.freeze({}); state.levels = ZERO_SKILLS; state.scene.applySkills(ZERO_SKILLS, state.collection);
      this.setData({ failed: true, canContinue: false, continueBusy: false, skillInventory: [], upgradeSummary: '', bossNotice: '', goldenLoot: false, upgradeOffer: null, frozenFrame: state.scene.captureFrame() });
      state.defeatAudio = createDefeatAudio(); this.applyPause();
    },
    becomeStronger() {
      const state = instances.get(this);
      if (!this.data.failed || !state?.visible || this.properties.paused) return;
      this.triggerEvent('strengthenguide');
    },
    presentUpgrade() {
      const state = instances.get(this);
      if (!state?.scene || !state.visible || this.properties.paused || this.data.upgradeOffer || this.data.failed || state.scene.snapshot?.status === 'baseDestroyed') return;
      while (state.upgradeLevels?.length) {
        const level = state.upgradeLevels.shift()!;
        const seed = [...`${state.sessionId}:${level}`].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 17);
        const candidate = qualitySkillOffer(state.sessionId!, level, state.collection ?? {}, state.scene.snapshot!.base, createSeededRandom(seed >>> 0));
        const offer = candidate.cards.length ? state.upgrades?.open(candidate) : null;
        if (offer) {
          this.setData({ frozenFrame: state.scene.captureFrame(), upgradeOffer: offer });
          this.applyPause(); return;
        }
      }
      while (state.bossRewards?.length) {
        const reward = state.bossRewards.shift()!;
        const seed = [...reward.id].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 17);
        const candidate = bossSkillOffer(reward.id, reward.quality, state.collection ?? {}, createSeededRandom(seed >>> 0));
        const offer = candidate.cards.length ? state.upgrades?.open(candidate) : null;
        if (offer) {
          this.setData({frozenFrame:state.scene.captureFrame(), upgradeOffer:offer}); this.applyPause(); return;
        }
        this.setData({bossNotice:'技能已满'});
      }
      this.applyPause();
      if (state.awaitingWaveEnd && !state.audio?.busy) { state.awaitingWaveEnd = false; this.advanceWave(); }
    },
    retryVoice() { instances.get(this)?.audio?.retry(); },
    syncBattlePet() {
      const state = instances.get(this);
      if (!this.properties.opening || !state?.alive || !state.scene || state.scene.snapshot?.pet) return;
      try {
        const pet = petStore.view();
        if (pet.owned) { state.scene.applyPet(createBattlePet(pet)); state.pet = state.scene.snapshot?.pet; }
      } catch { this.setData({ petReward: '宠物暂时无法读取，点击重试', petDropError: true }); }
    },
    retryPetDrops() { const state = instances.get(this); if (state?.alive && state.visible && !this.properties.paused) { this.setData({ petDropError: false, petReward: '' }); state.petDrops?.retry(); this.syncBattlePet(); } },
    retryDrops() { const state = instances.get(this); if (state?.alive && state.visible && !this.properties.paused) state.drops?.retry(); },
    chooseUpgrade(event: WechatMiniprogram.CustomEvent<{ offerId: string; cardId: string }>) {
      const state = instances.get(this);
      if (!state?.levels || this.properties.paused || !state.visible || !state.scene || this.data.error || this.data.failed || state.scene.snapshot?.status === 'baseDestroyed') return;
      const selected = state.upgrades?.select(event.detail.offerId, event.detail.cardId);
      if (!selected) return;
      if (selected.id === 'repair') state.scene.restoreBase();
      else {
        const id = selected.id as BattleSkillId;
        state.collection = applySkillReward(state.collection ?? {}, { id, quality: selected.quality ?? 'crude' });
        state.levels = skillLevels(state.collection);
        state.scene.applySkills(state.levels, state.collection);
        this.setData({skillInventory:inventory(state.collection)});
      }
      this.setData({ upgradeOffer: null, frozenFrame: '', upgradeSummary: `${selected.label} · ${selected.description}` });
      this.presentUpgrade();
    },
    advanceWave() {
      const state = instances.get(this); const snapshot = state?.scene?.snapshot;
      if (!state?.scene || !snapshot || snapshot.status !== 'cleared' || state.audio?.busy || this.data.upgradeOffer || state.upgradeLevels?.length || state.bossRewards?.length || this.data.completed) return;
      state.baseHp = snapshot.base.hp;
      state.supportSoldiers = snapshot.supportSoldiers ?? [];
      state.pet = snapshot.pet;
      const request = state.activeRequest ?? this.properties.previewRequest as StageRequest;
      const waveIndex = state.waveIndex ?? 0;
      if (waveIndex === OPENING_WAVE_COUNT - 1) {
        if (this.data.level < MAX_HERO_LEVEL) return;
        this.setData({ frozenFrame: state.scene.captureFrame(), upgradeOffer: null, completed: true, canContinue: (request.plan.levelId ?? 1) < 8, upgradeSummary: this.data.upgradeSummary });
        if (request.plan.levelId === 8) { state.collection = Object.freeze({}); state.levels = ZERO_SKILLS; state.scene.applySkills(ZERO_SKILLS, state.collection); state.upgrades?.dispose(); this.setData({skillInventory:[]}); }
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
      if (request.waveIndex === 0 && state.preparedStage?.plan.sessionId === request.plan.sessionId) {
        const target = wave.targetWordId; const last = result.attempts[result.attempts.length - 1];
        if (last.selectedWordId !== target || result.attempts.some(attempt => attempt.sessionId !== request.plan.sessionId || attempt.waveId !== wave.waveId || attempt.targetWordId !== target)) return;
        state.activeRequest = state.preparedStage; state.preparedStage = undefined;
        state.scene?.dispose(); state.scene = undefined;
        this.setData({waveRequest:null, frozenFrame:'', ready:false}, () => this.mount(true)); return;
      }
      state.waveIndex = request.waveIndex;
      state.pending = createOpeningEncounter(request.plan.sessionId, wave.targetWordId, request.generation, request.waveIndex, state.levels, state.baseHp, request.plan.waves.slice(0, request.waveIndex).map(wave => wave.targetWordId), request.plan.levelId, request.plan.weaponLevel, state.supportSoldiers, request.plan.difficulty, state.collection);
      this.setData({ waveRequest: null, waveNumber: request.waveIndex + 1, frozenFrame: '', ready: false }, () => this.mount());
    },
    claimVictoryReward() {
      const state = instances.get(this);
      if (!this.data.completed || !state?.visible || this.data.rewardSaved) return;
      const request = state.activeRequest ?? this.properties.previewRequest as StageRequest;
      try { const result = coinWallet.rewardVictory(request.plan.sessionId, request.plan.levelId ?? 1); this.setData({ rewardSaved: true, rewardError: false, coinBalance: result.balance }); this.triggerEvent('coinbalancechange', { balance: result.balance }); }
      catch { this.setData({ rewardError: true, rewardSaved: false }); }
    },
    async continueStage() {
      const state = instances.get(this);
      if (!state?.alive || !state.visible || this.properties.paused || !this.data.completed || !this.data.rewardSaved || this.data.dropError || this.data.petDropError || !this.data.canContinue || state.preparingStage || state.preparedStage) return;
      state.preparingStage = true; const epoch = state.epoch;
      this.setData({continueBusy:true, continueError:false});
      try {
        await loadLevelAssets();
        if (!state.alive || state.epoch !== epoch) return;
        const request = state.activeRequest ?? this.properties.previewRequest as StageRequest;
        state.preparedStage = nextStageRequest(request);
        state.stageCarry = {collection:state.collection ?? Object.freeze({}), ...(state.scene?.snapshot?.pet ? {pet:createBattlePet(state.scene.snapshot.pet)} : {})};
        state.preparingStage = false; this.finishContinuation();
      } catch {
        if (state.alive && state.epoch === epoch) { state.preparingStage = false; this.setData({continueBusy:false,continueError:true}); }
      }
    },
    finishContinuation() {
      const state = instances.get(this);
      if (!state?.alive || !state.visible || this.properties.paused || !this.data.completed || !state.preparedStage) return;
      state.scene?.dispose(); state.scene = undefined; state.epoch++;
      state.audio?.dispose(); state.audio = undefined; state.victoryAudio?.dispose(); state.victoryAudio = undefined;
      this.setData({completed:false,canContinue:false,continueBusy:false,continueError:false, waveRequest:{...state.preparedStage,variant:'fruit'}, upgradeOffer:null});
    },
    endRun() {
      const state = instances.get(this); if (!state?.alive) return;
      state.alive = false; state.epoch++; state.stageCarry = undefined; state.preparedStage = undefined; state.activeRequest = undefined;
      state.collection = Object.freeze({}); state.levels = ZERO_SKILLS; state.upgradeLevels = []; state.bossRewards = [];
      state.scene?.dispose(); state.scene = undefined; state.pending = undefined;
      state.audio?.dispose(); state.victoryAudio?.dispose(); state.defeatAudio?.dispose(); state.drops?.dispose(); state.petDrops?.dispose(); state.upgrades?.dispose(); state.experience?.dispose(); state.skills?.dispose();
      this.setData({skillInventory:[],upgradeOffer:null,waveRequest:null,canContinue:false,continueBusy:false});
    },
    returnHome() { this.endRun(); this.triggerEvent('returnhome'); },
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
