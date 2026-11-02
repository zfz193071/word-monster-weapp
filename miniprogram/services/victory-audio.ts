type Channel = Pick<WechatMiniprogram.InnerAudioContext,
  'src' | 'autoplay' | 'loop' | 'obeyMuteSwitch' | 'play' | 'pause' | 'stop' | 'destroy' |
  'onEnded' | 'offEnded' | 'onError' | 'offError'>;

// One celebration per completed session. Pause the channel itself to resume in place.
export function createVictoryAudio(createContext: () => Channel = () => wx.createInnerAudioContext()) {
  let channel: Channel | undefined;
  let active = false; let finished = false; let disposed = false;
  function release() {
    const previous = channel; channel = undefined;
    if (!previous) return;
    for (const action of [() => previous.offEnded(ended), () => previous.offError(failed), () => previous.stop(), () => previous.destroy()]) {
      try { action(); } catch { /* Release other resources even if a platform operation fails. */ }
    }
  }
  function ended() { if (!channel || disposed) return; finished = true; release(); }
  function failed() { if (!channel || disposed) return; finished = true; release(); }
  return {
    setActive(value: boolean) {
      if (disposed || finished || value === active) return;
      active = value;
      try {
        if (!value) { channel?.pause(); return; }
        if (!channel) {
          channel = createContext(); channel.autoplay = false; channel.loop = false; channel.obeyMuteSwitch = true;
          channel.src = '/assets/audio/victory-praise.mp3';
          channel.onEnded(ended); channel.onError(failed);
        }
        channel.play();
      } catch { finished = true; release(); }
    },
    dispose() { if (disposed) return; disposed = true; release(); },
  };
}
