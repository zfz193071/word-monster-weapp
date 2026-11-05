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
  const maximum = correct ? 3200 : 8000;
  let active = false, disposed = false, completed = false, audioDone = false;
  let elapsed = 0, startedAt = 0;
  let cancel: (() => void) | undefined;
  let channel: Channel | undefined;
  function release() {
    const old = channel; channel = undefined;
    if (!old) return;
    for (const action of [() => old.offEnded(ended), () => old.offError(ended), () => old.stop(), () => old.destroy()]) {
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
  function ended() { if (disposed || completed || audioDone) return; audioDone = true; release(); progress(); }
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
            channel.onEnded(ended); channel.onError(ended);
          }
          channel.play();
        }
      } catch { audioDone = true; release(); }
      progress();
    },
    dispose() { if (disposed) return; disposed = true; cancel?.(); cancel = undefined; release(); },
  };
}
