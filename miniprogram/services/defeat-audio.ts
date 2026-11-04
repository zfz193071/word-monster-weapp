type Channel = Pick<WechatMiniprogram.InnerAudioContext,
  'src' | 'autoplay' | 'loop' | 'obeyMuteSwitch' | 'play' | 'pause' | 'stop' | 'destroy' | 'onEnded' | 'offEnded' | 'onError' | 'offError'>;
export function createDefeatAudio(createContext: () => Channel = () => wx.createInnerAudioContext()) {
  let channel: Channel | undefined; let active = false; let finished = false;
  function release() {
    const old = channel; channel = undefined;
    if (!old) return;
    for (const action of [() => old.offEnded(finish), () => old.offError(finish), () => old.stop(), () => old.destroy()]) {
      try { action(); } catch { /* Continue releasing platform resources. */ }
    }
  }
  function finish() { finished = true; release(); }
  return {
    setActive(value: boolean) {
      if (finished || active === value) return;
      active = value;
      try {
        if (!active) { channel?.pause(); return; }
        if (!channel) {
          channel = createContext(); channel.src = '/assets/audio/defeat-sad.mp3';
          channel.autoplay = false; channel.loop = false; channel.obeyMuteSwitch = true;
          channel.onEnded(finish); channel.onError(finish);
        }
        channel.play();
      } catch { finish(); }
    },
    dispose: finish,
  };
}
