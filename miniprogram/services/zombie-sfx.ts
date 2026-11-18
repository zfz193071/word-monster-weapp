/** 背景音乐播放时，随机播放带音节的卡通僵尸含混声。 */

type HitChannel = Pick<WechatMiniprogram.InnerAudioContext,
  'src' | 'autoplay' | 'loop' | 'volume' | 'obeyMuteSwitch' | 'stop' | 'play' | 'destroy' |
  'onError'>;

export function createZombieSfx(options: {
  readonly volume?: number;
  readonly createContext?: () => HitChannel;
  readonly random?: () => number;
}) {
  let volume = Math.max(0, Math.min(1, options.volume ?? 0.25));
  let disposed = false;
  let active = false;
  let channel: HitChannel | undefined;
  let timer: number | undefined;
  let lastPlayTime = 0;
  
  const MUMBLE_PATHS = ['/assets/audio/zombie-mumble-1.mp3', '/assets/audio/zombie-mumble-2.mp3', '/assets/audio/zombie-mumble-3.mp3'] as const;
  const MUMBLE_COOLDOWN = 4500;
  const MUMBLE_RANDOM_MAX = 6500;
  const random = options.random ?? Math.random;
  let lastVariant = -1;
  
  function createChannel(): HitChannel {
    const ch = (options.createContext ?? (() => wx.createInnerAudioContext()))();
    ch.autoplay = false;
    ch.loop = false;
    ch.obeyMuteSwitch = true;
    ch.onError(() => undefined);
    return ch;
  }

  function nextPath(): string {
    let index = Math.min(MUMBLE_PATHS.length - 1, Math.floor(random() * MUMBLE_PATHS.length));
    if (index === lastVariant) index = (index + 1) % MUMBLE_PATHS.length;
    lastVariant = index;
    return MUMBLE_PATHS[index];
  }
  
  function playMumble() {
    if (!active || disposed) return;
    const now = Date.now();
    if (now - lastPlayTime < MUMBLE_COOLDOWN) { scheduleNext(); return; }
    
    try {
      if (!channel) channel = createChannel();
      channel.volume = volume;
      channel.stop();
      channel.src = nextPath();
      channel.play();
      lastPlayTime = now;
      
    } catch {}
    scheduleNext();
  }
  
  function scheduleNext() {
    if (!active || disposed) return;
    const randomDelay = MUMBLE_COOLDOWN + random() * MUMBLE_RANDOM_MAX;
    timer = setTimeout(() => { timer = undefined; playMumble(); }, randomDelay) as unknown as number;
  }
  
  return {
    setActive(value: boolean) {
      if (!disposed && active !== value) {
        active = value;
        if (value) {
          scheduleNext();
        } else {
          if (timer) { clearTimeout(timer); timer = undefined; }
          if (channel) {
            try { channel.stop(); } catch {}
          }
        }
      }
    },
    
    setVolume(value: number) {
      if (!disposed && Number.isFinite(value)) {
        volume = Math.max(0, Math.min(1, value));
        if (channel) channel.volume = volume;
      }
    },
    
    dispose() {
      if (!disposed) {
        disposed = true;
        if (timer) { clearTimeout(timer); timer = undefined; }
        if (channel) {
          try { channel.stop(); channel.destroy(); } catch {}
          channel = undefined;
        }
      }
    },
  };
}
