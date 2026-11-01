export type HomeMusicStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export interface HomeMusicView { readonly enabled: boolean; readonly status: HomeMusicStatus }
export type HomeMusicChannel = Pick<WechatMiniprogram.InnerAudioContext,
  'src' | 'autoplay' | 'loop' | 'volume' | 'obeyMuteSwitch' | 'play' | 'pause' | 'stop' | 'destroy' |
  'onPlay' | 'offPlay' | 'onPause' | 'offPause' | 'onError' | 'offError'>;

// Separate ambient channel: a prompt owns the foreground, so the host deactivates
// this controller before mounting the listening component. No global audio options.
export function createLoopMusic(options: {
  readonly src?: string;
  readonly volume?: number;
  readonly onChange: (view: HomeMusicView) => void;
  readonly createContext?: () => HomeMusicChannel;
}) {
  let volume = Math.max(0, Math.min(1, options.volume ?? 0.22));
  let enabled = true; let active = false; let disposed = false; let requested = false;
  let status: HomeMusicStatus = 'idle';
  let current: { channel: HomeMusicChannel; play: () => void; pause: () => void; error: () => void } | undefined;
  const publish = () => { if (!disposed) options.onChange({ enabled, status }); };
  function release() {
    const previous = current; current = undefined; requested = false;
    if (!previous) return;
    for (const action of [() => previous.channel.offPlay(previous.play), () => previous.channel.offPause(previous.pause),
      () => previous.channel.offError(previous.error), () => previous.channel.stop(), () => previous.channel.destroy()]) {
      try { action(); } catch { /* Release the remaining resources even after platform errors. */ }
    }
  }
  function fail() { release(); status = 'error'; publish(); }
  function synchronize() {
    if (disposed) return;
    if (!active || !enabled) {
      requested = false;
      try { current?.channel.pause(); } catch { release(); }
      if (status !== 'error') status = 'paused';
      publish(); return;
    }
    if (requested || status === 'error') { publish(); return; }
    try {
      if (!current) {
        const channel = (options.createContext ?? (() => wx.createInnerAudioContext()))();
        const instance = { channel,
          play() {
            if (current !== instance || disposed) return;
            if (!active || !enabled) { channel.pause(); return; }
            status = 'playing'; publish();
          },
          pause() { if (current === instance && !disposed) { requested = false; status = 'paused'; publish(); } },
          error() { if (current === instance && !disposed) fail(); },
        };
        current = instance;
        channel.onPlay(instance.play); channel.onPause(instance.pause); channel.onError(instance.error);
        channel.autoplay = false; channel.loop = true; channel.volume = volume; channel.obeyMuteSwitch = true;
        channel.src = options.src ?? '/assets/audio/home-garden.mp3';
        if (current !== instance) return;
      }
      requested = true; status = 'loading'; publish(); current.channel.play();
    } catch { fail(); }
  }
  return {
    get view(): HomeMusicView { return { enabled, status }; },
    setVolume(value: number) { if (!disposed && Number.isFinite(value)) { volume = Math.max(0, Math.min(1, value)); if (current) { try { current.channel.volume = volume; } catch { fail(); } } } },
    setActive(value: boolean) { if (!disposed && active !== value) { active = value; synchronize(); } },
    setEnabled(value: boolean) { if (!disposed && enabled !== value) { enabled = value; if (value && status === 'error') status = 'idle'; synchronize(); } },
    retry() { if (!disposed && status === 'error') { status = 'idle'; synchronize(); } },
    dispose() { if (!disposed) { disposed = true; release(); } },
  };
}

export const createHomeMusic = createLoopMusic;
