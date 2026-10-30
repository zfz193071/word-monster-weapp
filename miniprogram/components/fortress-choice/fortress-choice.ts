import { createListening } from '../../fortress/listening';
import type { ListeningView } from '../../fortress/listening';
import type { SessionPlan } from '../../fortress/types';

interface Instance { controller?: ReturnType<typeof createListening>; ready: boolean; visible: boolean; epoch: number }
const instances = new WeakMap<object, Instance>();
Component({
  properties: {
    request: { type: Object, value: null, observer() { if (instances.get(this)?.ready) this.mount(); } },
    paused: { type: Boolean, value: false, observer() { this.applyPause(); } },
  },
  data: { view: null as ListeningView | null, error: '' },
  lifetimes: {
    attached() { instances.set(this, { ready: false, visible: true, epoch: 0 }); },
    ready() { const state = instances.get(this)!; state.ready = true; this.mount(); },
    detached() { const state = instances.get(this); if (state) { state.epoch++; state.controller?.dispose(); } instances.delete(this); },
  },
  pageLifetimes: {
    hide() { const state = instances.get(this); if (state) { state.visible = false; this.applyPause(); } },
    show() { const state = instances.get(this); if (state) { state.visible = true; this.applyPause(); } },
  },
  methods: {
    mount() {
      const state = instances.get(this); if (!state) return;
      state.controller?.dispose(); state.controller = undefined;
      const epoch = ++state.epoch;
      const valid = () => instances.get(this) === state && state.epoch === epoch;
      this.setData({ view: null, error: '' });
      if (!this.properties.request) return;
      try {
        const request = this.properties.request as { plan: SessionPlan; waveIndex: number; generation: number };
        state.controller = createListening({ ...request,
          onChange: view => { if (valid()) this.setData({ view }); },
          onStartCombat: result => { if (valid()) this.triggerEvent('startcombat', result); },
        });
        this.setData({ view: state.controller.view }); this.applyPause(); state.controller.start();
      } catch { this.setData({ error: '听词挑战暂时无法准备，请重新进入' }); }
    },
    applyPause() { const state = instances.get(this); state?.controller?.setPaused(this.properties.paused || !state.visible); },
    choose(event: WechatMiniprogram.BaseEvent) { const data = event.currentTarget.dataset; instances.get(this)?.controller?.choose(data.token, data.wordId); },
    replay(event: WechatMiniprogram.BaseEvent) { instances.get(this)?.controller?.replay(event.currentTarget.dataset.token); },
    retryAudio(event: WechatMiniprogram.BaseEvent) { instances.get(this)?.controller?.retryAudio(event.currentTarget.dataset.token); },
    retryImages(event: WechatMiniprogram.BaseEvent) { instances.get(this)?.controller?.retryImages(event.currentTarget.dataset.token); },
    imageLoaded(event: WechatMiniprogram.BaseEvent) { const data = event.currentTarget.dataset; instances.get(this)?.controller?.imageResult(data.token, data.wordId, true); },
    imageFailed(event: WechatMiniprogram.BaseEvent) { const data = event.currentTarget.dataset; instances.get(this)?.controller?.imageResult(data.token, data.wordId, false); },
  },
});
