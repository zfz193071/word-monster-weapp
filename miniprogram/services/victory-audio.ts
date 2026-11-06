type Channel = Pick<WechatMiniprogram.InnerAudioContext,
  'src' | 'autoplay' | 'loop' | 'obeyMuteSwitch' | 'play' | 'pause' | 'stop' | 'destroy' |
  'onEnded' | 'offEnded' | 'onError' | 'offError' | 'volume'>;

// One celebration per completed session: applause, cheering, then the praise voice.
// Pause the channel itself to resume the current stage in place.
export function createVictoryAudio(createContext: () => Channel = () => wx.createInnerAudioContext()) {
  let channel: Channel | undefined;
  let active = false; let finished = false; let disposed = false;
  let stage: 'applause' | 'cheer' | 'praise' = 'applause';
  let volume = 1;
  function playStage(next: 'applause' | 'cheer' | 'praise') {
    stage = next;
    try {
      if (!channel) return;
      channel.src = `/assets/audio/victory-${stage}.mp3`;
      channel.volume = stage === 'praise' ? 1 : volume;
      if (active) channel.play();
    } catch { finished = true; release(); }
  }
  function release() {
    const previous = channel; channel = undefined;
    if (!previous) return;
    for (const action of [() => previous.offEnded(ended), () => previous.offError(failed), () => previous.stop(), () => previous.destroy()]) {
      try { action(); } catch { /* Release other resources even if a platform operation fails. */ }
    }
  }
  function ended() { if (!channel || disposed) return; if (stage !== 'praise') { playStage(stage === 'applause' ? 'cheer' : 'praise'); return; } finished = true; release(); }
  function failed() { if (!channel || disposed) return; if (stage !== 'praise') { playStage(stage === 'applause' ? 'cheer' : 'praise'); return; } finished = true; release(); }
  return {
    setActive(value: boolean) {
      if (disposed || finished || value === active) return;
      active = value;
      try {
        if (!value) { channel?.pause(); return; }
        if (!channel) {
          channel = createContext(); channel.autoplay = false; channel.loop = false; channel.obeyMuteSwitch = true;
          channel.src = '/assets/audio/victory-applause.mp3';
          channel.volume = volume;
          channel.onEnded(ended); channel.onError(failed);
        }
        channel.play();
      } catch { finished = true; release(); }
    },
    setVolume(value: number) { if (!disposed && Number.isFinite(value)) { volume = Math.max(0, Math.min(1, value)); if (channel && stage !== 'praise') channel.volume = volume; } },
    dispose() { if (disposed) return; disposed = true; release(); },
  };
}
