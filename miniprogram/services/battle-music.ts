/**
 * 战斗音乐控制器
 * 功能：激昂战斗 BGM、动态 ducking、音量混音
 */

export type BattleMusicStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export interface BattleMusicView { readonly enabled: boolean; readonly status: BattleMusicStatus; readonly volume: number; readonly ducking: boolean }

type MusicChannel = Pick<WechatMiniprogram.InnerAudioContext,
  'src' | 'autoplay' | 'loop' | 'volume' | 'obeyMuteSwitch' | 'play' | 'pause' | 'stop' | 'destroy' |
  'onPlay' | 'offPlay' | 'onPause' | 'offPause' | 'onError' | 'offError'>;

export function createBattleMusic(options: {
  readonly src?: string;
  readonly volume?: number;
  readonly onChange: (view: BattleMusicView) => void;
  readonly createContext?: () => MusicChannel;
}) {
  let volume = Math.max(0, Math.min(1, options.volume ?? 0.22));
  let duckingVolume = volume * 0.2; // 语音播放时 BGM 压降 80%
  let enabled = true; 
  let active = false; 
  let disposed = false; 
  let requested = false;
  let ducking = false;
  let status: BattleMusicStatus = 'idle';
  let current: { channel: MusicChannel; play: () => void; pause: () => void; error: () => void } | undefined;
  
  const publish = () => { 
    if (!disposed) options.onChange({ enabled, status, volume, ducking }); 
  };
  
  function release() {
    const previous = current; 
    current = undefined; 
    requested = false;
    if (!previous) return;
    for (const action of [
      () => previous.channel.offPlay(previous.play), 
      () => previous.channel.offPause(previous.pause),
      () => previous.channel.offError(previous.error), 
      () => previous.channel.stop(), 
      () => previous.channel.destroy()
    ]) {
      try { action(); } catch { /* Release the remaining resources even after platform errors. */ }
    }
  }
  
  function fail() { 
    release(); 
    status = 'error'; 
    publish(); 
  }
  
  function synchronize() {
    if (disposed) return;
    const targetVolume = ducking ? duckingVolume : volume;
    
    if (!active || !enabled) {
      requested = false;
      try { current?.channel.pause(); } catch { release(); }
      if (status !== 'error') status = 'paused';
      publish(); 
      return;
    }
    
    if (requested || status === 'error') { 
      publish(); 
      return; 
    }
    
    try {
      if (!current) {
        const channel = (options.createContext ?? (() => wx.createInnerAudioContext()))();
        const instance = { channel,
          play() {
            if (current !== instance || disposed) return;
            if (!active || !enabled) { channel.pause(); return; }
            status = 'playing'; 
            publish();
          },
          pause() { 
            if (current === instance && !disposed) { 
              requested = false; 
              status = 'paused'; 
              publish(); 
            } 
          },
          error() { 
            if (current === instance && !disposed) fail(); 
          },
        };
        current = instance;
        channel.onPlay(instance.play); 
        channel.onPause(instance.pause); 
        channel.onError(instance.error);
        channel.autoplay = false; 
        channel.loop = true; 
        channel.volume = targetVolume; 
        channel.obeyMuteSwitch = true;
        channel.src = options.src ?? '/assets/audio/battle-loop.mp3';
        if (current !== instance) return;
      }
      requested = true; 
      status = 'loading'; 
      publish(); 
      current.channel.play();
    } catch { 
      fail(); 
    }
  }
  
  return {
    get view(): BattleMusicView { return { enabled, status, volume, ducking }; },
    
    setVolume(value: number) { 
      if (!disposed && Number.isFinite(value)) { 
        volume = Math.max(0, Math.min(1, value)); 
        duckingVolume = volume * 0.2;
        if (current) { 
          try { 
            current.channel.volume = ducking ? duckingVolume : volume; 
          } catch { fail(); } 
        } 
      } 
    },
    
    setActive(value: boolean) { 
      if (!disposed && active !== value) { 
        active = value; 
        synchronize(); 
      } 
    },
    
    setEnabled(value: boolean) { 
      if (!disposed && enabled !== value) { 
        enabled = value; 
        if (value && status === 'error') status = 'idle'; 
        synchronize(); 
      } 
    },
    
    // Ducking 控制：语音播放时压降 BGM
    duck() { 
      if (!disposed && !ducking && current) { 
        ducking = true; 
        try { 
          current.channel.volume = duckingVolume; 
        } catch {} 
        publish(); 
      } 
    },
    
    restore() { 
      if (!disposed && ducking && current) { 
        ducking = false; 
        try { 
          current.channel.volume = volume; 
        } catch {} 
        publish(); 
      } 
    },
    
    retry() { 
      if (!disposed && status === 'error') { 
        status = 'idle'; 
        synchronize(); 
      } 
    },
    
    dispose() { 
      if (!disposed) { 
        disposed = true; 
        release(); 
      } 
    },
  };
}
