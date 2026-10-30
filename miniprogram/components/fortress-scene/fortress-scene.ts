import { CanvasScene } from '../../fortress/canvas-scene';
import type { SceneArt } from '../../fortress/canvas-scene';
import { createPreviewCombat, createPreviewPlan, createPreviewPlanCombat } from '../../fortress/preview';
import { createSeededRandom } from '../../fortress/plans';
import { createSkillSession, skillCards } from '../../fortress/skills';
import type { SkillSession } from '../../fortress/skills';
import { FORTRESS_MONSTERS, MONSTER_ASSETS, monsterDrawWidth } from '../../fortress/content';
import type { RetirementView } from '../../fortress/retirement';
import type { CombatState, SessionPlan, SkillId, SkillOfferState } from '../../fortress/types';

interface InstanceState { scene?: CanvasScene; skills?: SkillSession; epoch: number; visible: boolean; alive: boolean }
const instances = new WeakMap<object, InstanceState>();
let previewSequence = 0;
function previewCombat(wordId: string): CombatState {
  const id = `preview-${++previewSequence}`;
  return createPreviewCombat(wordId, id);
}
Component({
  properties: {
    preview: { type: Boolean, value: false },
    previewRequest: { type: Object, value: null },
    previewWord: { type: String, value: 'apple', observer() { if (instances.get(this)?.scene && this.properties.preview) this.mount(true); } },
    initialState: { type: Object, value: null },
    art: { type: Object, value: null },
    paused: { type: Boolean, value: false, observer() { this.applyPause(); } },
  },
  observers: {
    initialState() { if (instances.get(this)?.scene) this.mount(true); },
  },
  data: { ready: false, error: '', hud: { hp: 5, maxHp: 5, status: 'fighting' }, hpPercent: 100, retirement: null as RetirementView | null,
    skillOffer: null as SkillOfferState | null, skillCards: [] as ReturnType<typeof skillCards>, skillSummary: '' },
  lifetimes: {
    attached() { instances.set(this, { epoch: 0, visible: true, alive: true }); },
    ready() { this.mount(); },
    detached() { const state = instances.get(this); if (state) { state.alive = false; state.epoch++; state.scene?.dispose(); state.skills?.dispose(); } instances.delete(this); },
  },
  pageLifetimes: {
    hide() { const state = instances.get(this); if (state) { state.visible = false; this.applyPause(); } },
    show() { const state = instances.get(this); if (state) { state.visible = true; this.applyPause(); } },
    resize() { this.measureResize(); },
  },
  methods: {
    mount(replace = false) {
      const instance = instances.get(this); if (!instance?.alive) return;
      const retained = replace ? null : instance.scene?.snapshot;
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
          const request = this.properties.previewRequest as { plan: SessionPlan; generation: number } | null;
          const initial = this.properties.preview ? (request ? createPreviewPlanCombat(request.plan, request.generation) : previewCombat(this.properties.previewWord)) : retained ?? this.properties.initialState as CombatState | null;
          if (!initial) throw new Error('战斗尚未开始');
          if (this.properties.preview) instance.skills = createSkillSession(request?.plan ?? createPreviewPlan(this.properties.previewWord, initial.context.sessionId), createSeededRandom(previewSequence));
          const visual = FORTRESS_MONSTERS.find(monster => monster.wordId === initial.monsters[0].wordId);
          const asset = MONSTER_ASSETS.find(asset => asset.wordId === initial.monsters[0].wordId);
          const scene = new CanvasScene(result.node, {
            initial, width: result.width, height: result.height, dpr: wx.getWindowInfo().pixelRatio, clientLeft: result.left ?? 0,
            preview: this.properties.preview, art: this.properties.art as SceneArt | undefined,
            previewMonster: this.properties.preview && visual && asset ? { monsterVisual: visual, monsterWidth: monsterDrawWidth(visual),
              monster: { ...asset, approved: asset.reviewStatus === 'approved' } } : undefined,
            retirement: {
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
            onEvents: events => { if (valid()) this.triggerEvent('combatevents', { events, state: scene.snapshot }); },
            onError: message => { if (valid()) this.setData({ error: message, ready: false }); },
          });
          instance.scene = scene; this.applyPause();
          void scene.load().then(ready => { if (valid() && ready) { this.setData({ ready: true }); this.triggerEvent('sceneready'); } });
        } catch (error) { if (valid()) this.setData({ error: error instanceof Error ? error.message : '战场初始化失败' }); }
      }).exec();
    },
    applyPause() { const state = instances.get(this); if (!state) return; const paused = this.properties.paused || !state.visible; state.scene?.setPaused(paused); state.skills?.setPaused(paused); },
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
