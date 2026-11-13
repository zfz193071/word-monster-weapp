/**
 * 僵尸低吼音效
 * 功能：背景音乐播放时随机触发低吼声
 */

type HitChannel = Pick<WechatMiniprogram.InnerAudioContext,
  'src' | 'autoplay' | 'loop' | 'volume' | 'obeyMuteSwitch' | 'stop' | 'play' | 'destroy' |
  'onError'>;

export function createZombieSfx(options: {
  readonly volume?: number;
  readonly createContext?: () => HitChannel;
}) {
  let volume = Math.max(0, Math.min(1, options.volume ?? 0.25));
  let disposed = false;
  let active = false;
  let channel: HitChannel | undefined;
  let timer: number | undefined;
  let lastPlayTime = 0;
  
  const GROWL_COOLDOWN = 3000; // 至少 3 秒间隔
  const GROWL_RANDOM_MAX = 8000; // 最多 8 秒随机间隔
  
  function createChannel(): HitChannel {
    const ch = (options.createContext ?? (() => wx.createInnerAudioContext()))();
    ch.autoplay = false;
    ch.loop = false;
    ch.obeyMuteSwitch = true;
    ch.src = '/assets/audio/zombie-growl.mp3';
    ch.onError(() => undefined);
    return ch;
  }
  
  function playGrowl() {
    if (!active || disposed) return;
    const now = Date.now();
    if (now - lastPlayTime < GROWL_COOLDOWN) return;
    
    try {
      if (!channel) channel = createChannel();
      channel.volume = volume;
      channel.stop();
      channel.play();
      lastPlayTime = now;
      
      // 播放完后安排下一次随机触发
      setTimeout(() => scheduleNext(), 1000);
    } catch {}
  }
  
  function scheduleNext() {
    if (!active || disposed) return;
    const randomDelay = GROWL_COOLDOWN + Math.random() * GROWL_RANDOM_MAX;
    timer = setTimeout(() => playGrowl(), randomDelay) as unknown as number;
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
