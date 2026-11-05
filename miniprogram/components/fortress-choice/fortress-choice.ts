import { createQuizFeedback } from '../../services/quiz-feedback';
import { createListening } from '../../fortress/listening';
import type { ListeningView } from '../../fortress/listening';
import type { SessionPlan } from '../../fortress/types';

interface Instance { feedback?: ReturnType<typeof createQuizFeedback>; controller?: ReturnType<typeof createListening>; ready: boolean; visible: boolean; epoch: number }
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
    detached() { const state = instances.get(this); if (state) { state.epoch++; state.feedback?.dispose(); state.controller?.dispose(); } instances.delete(this); },
  },
  pageLifetimes: {
    hide() { const state = instances.get(this); if (state) { state.visible = false; this.applyPause(); } },
    show() { const state = instances.get(this); if (state) { state.visible = true; this.applyPause(); } },
  },
  methods: {
    mount() {
      const state = instances.get(this); if (!state) return;
      state.feedback?.dispose(); state.feedback = undefined;
      state.controller?.dispose(); state.controller = undefined;
      const epoch = ++state.epoch;
      const valid = () => instances.get(this) === state && state.epoch === epoch;
      this.setData({ view: null, error: '' });
      if (!this.properties.request) return;
      try {
        const request = this.properties.request as { plan: SessionPlan; waveIndex: number; generation: number; variant?: 'fruit'; singleAttempt?: boolean };
        state.controller = createListening({ ...request,
          onChange: view => {
            if (!valid()) return;
            this.setData({ view });
            if (request.singleAttempt && view.phase === 'answered' && !state.feedback) {
              state.feedback = createQuizFeedback(view.correct === true, () => {
                if (valid() && state.visible && !this.properties.paused && state.controller) state.controller.continueQuiz(state.controller.view.token);
              });
            }
            state.feedback?.setActive(!view.paused && state.visible && !this.properties.paused);
          },
          onStartCombat: result => { if (valid()) this.triggerEvent('startcombat', result); },
        });
        this.setData({ view: state.controller.view }); this.applyPause(); state.controller.start();
      } catch { this.setData({ error: '听词挑战暂时无法准备，请重新进入' }); }
    },
    applyPause() { const state = instances.get(this); state?.controller?.setPaused(this.properties.paused || !state.visible); },
    changeSpeed() { instances.get(this)?.controller?.cyclePlaybackRate(); },
    choose(event: WechatMiniprogram.BaseEvent) { const data = event.currentTarget.dataset; instances.get(this)?.controller?.choose(data.token, data.wordId); },
    replay(event: WechatMiniprogram.BaseEvent) { instances.get(this)?.controller?.replay(event.currentTarget.dataset.token); },
    retryAudio(event: WechatMiniprogram.BaseEvent) { instances.get(this)?.controller?.retryAudio(event.currentTarget.dataset.token); },
    retryImages(event: WechatMiniprogram.BaseEvent) { instances.get(this)?.controller?.retryImages(event.currentTarget.dataset.token); },
    imageLoaded(event: WechatMiniprogram.BaseEvent) { const data = event.currentTarget.dataset; instances.get(this)?.controller?.imageResult(data.token, data.wordId, true); },
    imageFailed(event: WechatMiniprogram.BaseEvent) { const data = event.currentTarget.dataset; instances.get(this)?.controller?.imageResult(data.token, data.wordId, false); },
  },
});
