type Channel = Pick<WechatMiniprogram.InnerAudioContext,
  'src' | 'autoplay' | 'loop' | 'obeyMuteSwitch' | 'volume' | 'play' | 'pause' | 'stop' | 'destroy' | 'onEnded' | 'offEnded' | 'onError' | 'offError'>;
interface Options {
  createContext?: () => Channel;
  now?: () => number;
  schedule?: (run: () => void, delay: number) => () => void;
}

// One feedback per answer. Foreground time only; audio errors never trap the reward flow.
export function createQuizFeedback(correct: boolean, onComplete: () => void, options: Options = {}) {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((run, delay) => { const id = setTimeout(run, delay); return () => clearTimeout(id); });
  const minimum = correct ? 1800 : 600;
  const maximum = correct ? 12000 : 8000;
  let active = false, disposed = false, completed = false, audioDone = false, effectDone = false;
  let elapsed = 0, startedAt = 0, revision = 0;
  let cancel: (() => void) | undefined;
  let voice: Channel | undefined, effect: Channel | undefined;
  let voiceListener: (() => void) | undefined, effectListener: (() => void) | undefined;
  let effectVolume = 1;
  const create = () => (options.createContext ?? (() => wx.createInnerAudioContext()))();
  function unlisten(channel: Channel | undefined, listener: (() => void) | undefined) {
    if (!channel || !listener) return;
    try { channel.offEnded(listener); } catch {}
    try { channel.offError(listener); } catch {}
  }
  function detach() {
    revision++;
    unlisten(voice, voiceListener); unlisten(effect, effectListener);
    voiceListener = effectListener = undefined;
  }
  function release() {
    detach();
    for (const channel of [voice, effect]) if (channel) {
      try { channel.stop(); } catch {}
      try { channel.destroy(); } catch {}
    }
    voice = effect = undefined;
  }
  function progress() {
    if (!active || disposed || completed) return;
    cancel?.(); cancel = undefined;
    const time = elapsed + Math.max(0, now() - startedAt);
    if ((audioDone && time >= minimum) || time >= maximum) {
      completed = true; release(); onComplete(); return;
    }
    cancel = schedule(progress, Math.max(1, (audioDone ? minimum : maximum) - time));
  }
  function listen() {
    const token = ++revision;
    if (voice && !audioDone) {
      const current = voice;
      voiceListener = () => {
        if (disposed || !active || token !== revision || voice !== current || audioDone) return;
        audioDone = true; unlisten(current, voiceListener); voiceListener = undefined; progress();
      };
      current.onEnded(voiceListener); current.onError(voiceListener);
    }
    if (effect && !effectDone) {
      const current = effect;
      effectListener = () => {
        if (disposed || !active || token !== revision || effect !== current || effectDone) return;
        effectDone = true; unlisten(current, effectListener); effectListener = undefined;
        try { current.stop(); } catch {} try { current.destroy(); } catch {}
        effect = undefined;
      };
      current.onEnded(effectListener); current.onError(effectListener);
    }
  }
  return {
    setActive(value: boolean) {
      if (disposed || completed || active === value) return;
      if (!value) {
        elapsed += Math.max(0, now() - startedAt); active = false; cancel?.(); cancel = undefined; detach();
        try { voice?.pause(); } catch { audioDone = true; }
        try { effect?.pause(); } catch { effectDone = true; }
        return;
      }
      active = true; startedAt = now();
      try {
        if (!voice && !audioDone) {
          voice = create(); voice.src = correct ? '/assets/audio/quiz-praise-bilingual.mp3' : '/assets/audio/quiz-encouragement.mp3';
          voice.autoplay = false; voice.loop = false; voice.obeyMuteSwitch = true; voice.volume = 1;
        }
        if (correct && !effect && !effectDone) {
          effect = create(); effect.src = '/assets/audio/victory-applause.mp3';
          effect.autoplay = false; effect.loop = false; effect.obeyMuteSwitch = true; effect.volume = effectVolume;
        }
        listen();
        if (effect && !effectDone) effect.play();
        if (voice && !audioDone) voice.play();
      } catch { audioDone = true; release(); }
      progress();
    },
    setVolume(value: number) { if (!disposed && Number.isFinite(value)) { effectVolume = Math.max(0, Math.min(1, value)); if (effect) effect.volume = effectVolume; } },
    dispose() { if (disposed) return; disposed = true; cancel?.(); cancel = undefined; release(); },
  };
}
