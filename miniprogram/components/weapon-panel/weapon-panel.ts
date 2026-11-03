import { coinWallet } from '../../services/coin-wallet';
import { weaponForLevel, WEAPONS } from '../../weapons/catalog';
import { createUpgradeHold } from '../../weapons/upgrade-hold';
interface State { controller: ReturnType<typeof createUpgradeHold>; finger?: number; visible: boolean; previewLevel: number; currentLevel: number }
const states = new WeakMap<object, State>();
Component({
  properties: { paused: { type: Boolean, value: false, observer() { if (this.properties.paused) this.stopHold(); } } },
  data: { weapon: weaponForLevel(1), previewLevel: 1, currentLevel: 1, maxWeaponLevel: WEAPONS.length, glowColor: weaponForLevel(1).color, isCurrentWeapon: true, balance: 0, holding: false, progress: 0, error: '', affordable: false },
  lifetimes: {
    attached() {
      let state: State | undefined;
      const controller = createUpgradeHold({ wallet: coinWallet, onChange: view => {
        const currentLevel = view.level;
        if (state && state.currentLevel !== currentLevel) state.previewLevel = currentLevel;
        if (state) state.currentLevel = currentLevel;
        const previewLevel = state?.previewLevel ?? currentLevel;
        const weapon = weaponForLevel(previewLevel);
        const isCurrentWeapon = previewLevel === currentLevel;
        this.setData({ weapon, previewLevel, currentLevel, isCurrentWeapon,
          glowColor: previewLevel === WEAPONS.length ? '#ffd94f' : weapon.color,
          balance: view.balance, holding: view.holding && isCurrentWeapon, progress: view.holding && isCurrentWeapon ? view.progress : 0, error: view.error,
          affordable: isCurrentWeapon && weapon.nextCost !== null && view.balance >= weapon.nextCost });
        // Publish saved state only; progress ticks do not need a parent render.
        if (!view.holding || view.progress === 0) this.triggerEvent('equipmentchange', { level: view.level, balance: view.balance, error: !!view.error });
      } });
      const currentLevel = coinWallet.equipment().level;
      state = { controller, visible: true, previewLevel: currentLevel, currentLevel };
      states.set(this, state); controller.refresh();
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
      if (!state?.visible || state.finger !== undefined || this.properties.paused || state.previewLevel !== state.currentLevel || !event.touches.length) return;
      state.finger = event.touches[0].identifier; state.controller.start();
    },
    endHold(event: WechatMiniprogram.TouchEvent) {
      const state = states.get(this);
      if (state && event.changedTouches.some(touch => touch.identifier === state.finger)) this.stopHold();
    },
    stopHold() { const state = states.get(this); if (state) { state.finger = undefined; state.controller.stop(); } },
    close() { this.stopHold(); this.triggerEvent('close'); },
    retry() { const state = states.get(this); if (state?.visible && !this.properties.paused) state.controller.refresh(); },
    previousWeapon() {
      const state = states.get(this); if (!state || state.previewLevel <= 1) return;
      this.stopHold();
      state.previewLevel--; this.showPreview(state);
    },
    nextWeapon() {
      const state = states.get(this); if (!state || state.previewLevel >= WEAPONS.length) return;
      this.stopHold();
      state.previewLevel++; this.showPreview(state);
    },
    showPreview(state: State) {
      const weapon = weaponForLevel(state.previewLevel); const isCurrentWeapon = state.previewLevel === state.currentLevel;
      this.setData({ weapon, previewLevel: state.previewLevel, currentLevel: state.currentLevel, isCurrentWeapon,
        glowColor: state.previewLevel === WEAPONS.length ? '#ffd94f' : weapon.color,
        holding: false, progress: 0, affordable: isCurrentWeapon && weapon.nextCost !== null && this.data.balance >= weapon.nextCost });
    },
    stopScroll() {},
  },
});
