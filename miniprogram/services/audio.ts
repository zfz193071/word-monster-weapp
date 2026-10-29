import type { RoundEventContext } from '../game/types';

export type AudioChannel = Pick<WechatMiniprogram.InnerAudioContext,
  'src' | 'autoplay' | 'loop' | 'play' | 'stop' | 'destroy' |
  'onEnded' | 'offEnded' | 'onError' | 'offError' | 'onStop' | 'offStop' | 'onPause' | 'offPause'>;
export type AudioKind = 'prompt' | 'reveal' | 'effect';
export type AudioEvent = RoundEventContext & { readonly type: 'audioReady' | 'audioFailed' };
export interface AudioFailure {
  readonly kind: AudioKind;
  readonly context: RoundEventContext;
  readonly reason: 'platform' | 'timeout' | 'interrupted' | 'exception' | 'invalid-source';
  readonly message: string;
}
export interface AudioOptions {
  readonly sessionId: string;
  readonly emit: (event: AudioEvent) => void;
  readonly onFailure?: (failure: AudioFailure) => void;
  readonly createContext?: () => AudioChannel;
  readonly timeoutMs?: number;
  readonly schedule?: (callback: () => void, delay: number) => () => void;
}
type PlayResult = 'started' | 'failed' | 'ignored' | 'suppressed' | 'disposed';
interface Playback {
  readonly kind: AudioKind;
  readonly context: RoundEventContext;
  channel?: AudioChannel;
  cancelTimer?: () => void;
  ended: () => void;
  error: (error: WechatMiniprogram.InnerAudioContextOnErrorListenerResult) => void;
  interrupted: () => void;
  readonly complete?: (success: boolean) => void;
}

// One context per request: even callbacks queued before offEnded cannot complete a newer play.
export function createAudioAdapter(options: AudioOptions) {
  const timeout = options.timeoutMs ?? 15000;
  if (!options.sessionId.trim() || !Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('音频适配器需要会话 ID 和正数超时');
  }
  const create = options.createContext ?? (() => wx.createInnerAudioContext());
  const schedule = options.schedule ?? ((callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  });
  let active: Playback | undefined;
  let disposed = false;
  let latest: RoundEventContext | undefined;
  const seen = new Set<AudioKind>();

  function cleanup(playback: Playback): void {
    // Invalidate before stop, which may synchronously fire onStop.
    if (active === playback) active = undefined;
    const channel = playback.channel;
    const actions = [
      () => playback.cancelTimer?.(),
      () => channel?.offEnded(playback.ended),
      () => channel?.offError(playback.error),
      () => channel?.offStop(playback.interrupted),
      () => channel?.offPause(playback.interrupted),
      () => channel?.stop(),
      () => channel?.destroy(),
    ];
    // A failed detach/stop must not prevent destruction of the context.
    for (const action of actions) { try { action(); } catch { /* continue releasing */ } }
  }
  function stop(): void { if (active) cleanup(active); }
  function finish(playback: Playback, failure?: AudioFailure): void {
    if (disposed || active !== playback) return;
    cleanup(playback);
    if (playback.kind === 'prompt') {
      options.emit({ ...playback.context, type: failure ? 'audioFailed' : 'audioReady' });
    }
    if (failure) options.onFailure?.(failure);
    playback.complete?.(!failure);
  }
  function play(kind: AudioKind, src: string, context: RoundEventContext,
    complete?: (success: boolean) => void): PlayResult {
    if (disposed) return 'disposed';
    if (context.sessionId !== options.sessionId || !context.roundId ||
      !Number.isInteger(context.revision) || context.revision < 0 ||
      (latest && (context.revision < latest.revision ||
        (context.revision === latest.revision && (context.roundId !== latest.roundId || seen.has(kind)))))) {
      return 'ignored';
    }
    if (kind === 'effect' && active && active.kind !== 'effect') return 'suppressed';
    if (!latest || context.revision > latest.revision) seen.clear();
    latest = Object.freeze({ ...context });
    seen.add(kind);
    stop();
    const playback: Playback = {
      kind, context: latest, complete,
      ended: () => finish(playback),
      error: (error) => fail('platform', `${error.errCode}: ${error.errMsg}`),
      interrupted: () => fail('interrupted', '音频播放被中断'),
    };
    function fail(reason: AudioFailure['reason'], message: string): void {
      finish(playback, { kind, context: playback.context, reason, message });
    }
    active = playback;
    if (!/^\/assets\/audio\/[a-z0-9-]+\.(mp3|wav)$/.test(src)) {
      fail('invalid-source', '需要包内音频资源路径');
      return 'failed';
    }
    try {
      const channel = create();
      playback.channel = channel;
      channel.onEnded(playback.ended);
      channel.onError(playback.error);
      channel.onStop(playback.interrupted);
      channel.onPause(playback.interrupted);
      channel.autoplay = false;
      channel.loop = false;
      channel.src = src;
      if (active !== playback) return 'failed';
      playback.cancelTimer = schedule(() => fail('timeout', '音频播放超时，请重试'), timeout);
      if (active !== playback) {
        playback.cancelTimer();
        return 'failed';
      }
      channel.play();
      return 'started';
    } catch (error) {
      fail('exception', error instanceof Error ? error.message : String(error));
      return 'failed';
    }
  }
  return {
    playPrompt: (src: string, context: RoundEventContext) => play('prompt', src, context),
    playReveal: (src: string, context: RoundEventContext, complete?: (success: boolean) => void) =>
      play('reveal', src, context, complete),
    playEffect: (src: string, context: RoundEventContext, complete?: (success: boolean) => void) =>
      play('effect', src, context, complete),
    stop,
    dispose: () => { disposed = true; stop(); },
  };
}
