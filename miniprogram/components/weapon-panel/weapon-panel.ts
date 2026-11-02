import { coinWallet } from '../../services/coin-wallet';
import { weaponForLevel } from '../../weapons/catalog';
import { createUpgradeHold } from '../../weapons/upgrade-hold';
interface State { controller: ReturnType<typeof createUpgradeHold>; finger?: number; visible: boolean }
const states = new WeakMap<object, State>();
Component({
  properties: { paused: { type: Boolean, value: false, observer() { if (this.properties.paused) this.stopHold(); } } },
  data: { weapon: weaponForLevel(1), balance: 0, holding: false, progress: 0, error: '', affordable: false },
  lifetimes: {
    attached() {
      const controller = createUpgradeHold({ wallet: coinWallet, onChange: view => {
        const weapon = weaponForLevel(view.level);
        this.setData({ weapon, balance: view.balance, holding: view.holding, progress: view.progress, error: view.error,
          affordable: weapon.nextCost !== null && view.balance >= weapon.nextCost });
        // Publish saved state only; progress ticks do not need a parent render.
        if (!view.holding || view.progress === 0) this.triggerEvent('equipmentchange', { level: view.level, balance: view.balance, error: !!view.error });
      } });
      states.set(this, { controller, visible: true }); controller.refresh();
    },
    detached() { states.get(this)?.controller.dispose(); states.delete(this); },
  },
  pageLifetimes: {
    hide() { const state = states.get(this); if (state) { state.visible = false; this.stopHold(); } },
    show() { const state = states.get(this); if (state) { state.visible = true; state.controller.refresh(); } },
  },
  methods: {
    startHold(event: WechatMiniprogram.TouchEvent) {
      const state = states.get(this);
      if (!state?.visible || state.finger !== undefined || this.properties.paused || !event.touches.length) return;
      state.finger = event.touches[0].identifier; state.controller.start();
    },
    endHold(event: WechatMiniprogram.TouchEvent) {
      const state = states.get(this);
      if (state && event.changedTouches.some(touch => touch.identifier === state.finger)) this.stopHold();
    },
    stopHold() { const state = states.get(this); if (state) { state.finger = undefined; state.controller.stop(); } },
    close() { this.stopHold(); this.triggerEvent('close'); },
    retry() { const state = states.get(this); if (state?.visible && !this.properties.paused) state.controller.refresh(); },
    stopScroll() {},
  },
});
