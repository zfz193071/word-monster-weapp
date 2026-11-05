type Channel = Pick<WechatMiniprogram.InnerAudioContext,
  'src' | 'autoplay' | 'loop' | 'obeyMuteSwitch' | 'play' | 'pause' | 'stop' | 'destroy' | 'onEnded' | 'offEnded' | 'onError' | 'offError'>;
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
  const maximum = correct ? 7000 : 8000;
  let active = false, disposed = false, completed = false, audioDone = false, praiseStarted = false;
  let elapsed = 0, startedAt = 0;
  let cancel: (() => void) | undefined;
  let channel: Channel | undefined;
  function release() {
    const old = channel; channel = undefined;
    if (!old) return;
    for (const action of [() => old.offEnded(advance), () => old.offError(advance), () => old.stop(), () => old.destroy()]) {
      try { action(); } catch { /* Always try the remaining cleanup operations. */ }
    }
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
  function advance() {
    if (disposed || completed || audioDone) return;
    if (correct && !praiseStarted) {
      praiseStarted = true;
      try {
        if (channel) { channel.src = '/assets/audio/victory-praise.mp3'; if (active) channel.play(); }
        else audioDone = true;
      } catch { audioDone = true; release(); }
    } else { audioDone = true; release(); }
    progress();
  }
  return {
    setActive(value: boolean) {
      if (disposed || completed || active === value) return;
      if (!value) {
        elapsed += Math.max(0, now() - startedAt); active = false; cancel?.(); cancel = undefined;
        try { channel?.pause(); } catch { audioDone = true; release(); }
        return;
      }
      active = true; startedAt = now();
      try {
        if (!audioDone) {
          if (!channel) {
            channel = (options.createContext ?? (() => wx.createInnerAudioContext()))();
            channel.src = correct ? '/assets/audio/victory-applause.mp3' : '/assets/audio/quiz-encouragement.mp3';
            channel.autoplay = false; channel.loop = false; channel.obeyMuteSwitch = true;
            channel.onEnded(advance); channel.onError(advance);
          }
          channel.play();
        }
      } catch { audioDone = true; release(); }
      progress();
    },
    dispose() { if (disposed) return; disposed = true; cancel?.(); cancel = undefined; release(); },
  };
}
