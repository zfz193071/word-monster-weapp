import { CanvasScene } from '../../fortress/canvas-scene';
import type { SceneArt } from '../../fortress/canvas-scene';
import { createCombat } from '../../fortress/combat';
import { createSessionPlan } from '../../fortress/plans';
import type { CombatState } from '../../fortress/types';

interface InstanceState { scene?: CanvasScene; epoch: number; visible: boolean; alive: boolean }
const instances = new WeakMap<object, InstanceState>();
let previewSequence = 0;
function previewCombat(): CombatState {
  const id = `preview-${++previewSequence}`;
  return createCombat({ plan: createSessionPlan(id, () => 0.5), waveIndex: 0, combatId: id, generation: 0,
    baseHp: 5, playerX: 180, skills: { doubleShot: 0, fireRate: 0, bulletWidth: 0 },
    monsterHitbox: { x: -32, y: -32, width: 64, height: 64 } });
}
Component({
  properties: {
    preview: { type: Boolean, value: false },
    initialState: { type: Object, value: null },
    art: { type: Object, value: null },
    paused: { type: Boolean, value: false, observer() { this.applyPause(); } },
  },
  observers: {
    initialState() { if (instances.get(this)?.scene) this.mount(true); },
  },
  data: { ready: false, error: '', hud: { hp: 5, maxHp: 5, status: 'fighting' }, hpPercent: 100 },
  lifetimes: {
    attached() { instances.set(this, { epoch: 0, visible: true, alive: true }); },
    ready() { this.mount(); },
    detached() { const state = instances.get(this); if (state) { state.alive = false; state.epoch++; state.scene?.dispose(); } instances.delete(this); },
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
      const epoch = ++instance.epoch;
      this.setData({ ready: false, error: '' });
      const valid = () => instance.alive && instance.epoch === epoch;
      this.createSelectorQuery().select('#battle-canvas').fields({ node: true, size: true, rect: true }, result => {
        if (!valid()) return;
        try {
          if (!result?.node || !result.width || !result.height) throw new Error('Canvas 节点尚未就绪');
          if (this.properties.preview && wx.getAccountInfoSync().miniProgram.envVersion !== 'develop') throw new Error('开发预览仅在开发版可用');
          const initial = this.properties.preview ? previewCombat() : retained ?? this.properties.initialState as CombatState | null;
          if (!initial) throw new Error('战斗尚未开始');
          const scene = new CanvasScene(result.node, {
            initial, width: result.width, height: result.height, dpr: wx.getWindowInfo().pixelRatio, clientLeft: result.left ?? 0,
            preview: this.properties.preview, art: this.properties.art as SceneArt | undefined,
            onHud: hud => { if (valid()) this.setData({ hud, hpPercent: hud.hp / hud.maxHp * 100 }); },
            onEvents: events => { if (valid()) this.triggerEvent('combatevents', { events, state: scene.snapshot }); },
            onError: message => { if (valid()) this.setData({ error: message, ready: false }); },
          });
          instance.scene = scene; this.applyPause();
          void scene.load().then(ready => { if (valid() && ready) { this.setData({ ready: true }); this.triggerEvent('sceneready'); } });
        } catch (error) { if (valid()) this.setData({ error: error instanceof Error ? error.message : '战场初始化失败' }); }
      }).exec();
    },
    applyPause() { const state = instances.get(this); state?.scene?.setPaused(this.properties.paused || !state.visible); },
    retry() { this.mount(); },
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
