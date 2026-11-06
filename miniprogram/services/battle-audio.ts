import { createAudioAdapter } from './audio';
import type { AudioOptions } from './audio';
import { createLoopMusic } from './home-music';
import type { HomeMusicChannel } from './home-music';
import { ALL_BATTLE_WORDS as BATTLE_WORDS, defeatAudioPath } from '../fortress/levels';
import type { CombatEvent } from '../fortress/types';

type HitChannel = Pick<WechatMiniprogram.InnerAudioContext, 'src' | 'autoplay' | 'loop' | 'obeyMuteSwitch' | 'volume' | 'onError' | 'stop' | 'play' | 'destroy'>;
type DefeatWord = { wordId: string; monsterId: string };
const SETTLE_MS = 300;
export interface BattleAudioView { readonly speakingWord: string; readonly error: boolean }
export function createBattleAudio(options: {
  sessionId: string;
  onChange: (view: BattleAudioView) => void;
  onDrained: () => void;
  now?: () => number;
  audio?: Pick<AudioOptions, 'createContext' | 'schedule' | 'timeoutMs'>;
  createMusicContext?: () => HomeMusicChannel;
  createHitContext?: () => HitChannel;
  createBaseHitContext?: () => HitChannel;
  createCoinContext?: () => HitChannel;
}) {
  let disposed = false; let active = false; let volume = .22; let revision = 0; let playing = false; let error = false;
  let hit: HitChannel | undefined; let lastHit = -Infinity;
  let baseHit: HitChannel | undefined;
  let coin: HitChannel | undefined; let lastCoin = -Infinity;
  const heardAttacks = new Set<string>();
  // A speaking word owns its channel until completion. Only the pending word is replaceable.
  let current: DefeatWord | undefined; let pending: DefeatWord | undefined;
  let remaining = 0; let dueAt = 0; let timerRevision = 0; let cancelSettle: (() => void) | undefined;
  const now = options.now ?? Date.now;
  const schedule = options.audio?.schedule ?? ((callback, delay) => {
    const timer = setTimeout(callback, delay); return () => clearTimeout(timer);
  });
  const seen = new Set<string>();
  const busy = () => !!(current || pending);
  const music = createLoopMusic({ src: '/assets/audio/battle-loop.mp3', volume, createContext: options.createMusicContext, onChange() {} });
  const voice = createAudioAdapter({ ...options.audio, sessionId: options.sessionId, emit() {} });
  voice.setPlaybackRate(.8);
  const view = (): BattleAudioView => ({
    speakingWord: BATTLE_WORDS.find(word => word.id === (current ?? pending)?.wordId)?.text ?? '', error });
  const publish = () => { if (!disposed) options.onChange(view()); };
  const effectVolume = (level: number) => Math.min(1, volume / .22 * level);
  function mix() {
    music.setVolume(busy() ? volume * .2 : volume);
    if (hit) hit.volume = effectVolume(busy() ? .10 : .35);
    if (baseHit) baseHit.volume = effectVolume(busy() ? .12 : .4);
    if (coin) coin.volume = effectVolume(busy() ? .08 : .25);
  }
  function cancelTimer() { timerRevision++; cancelSettle?.(); cancelSettle = undefined; }
  function settle() {
    cancelTimer();
    if (disposed || !active || !pending) return;
    if (remaining <= 0) { speak(); return; }
    dueAt = now() + remaining;
    const token = timerRevision;
    cancelSettle = schedule(() => {
      if (disposed || !active || token !== timerRevision) return;
      cancelSettle = undefined; remaining = 0; speak();
    }, remaining);
  }
  function speak() {
    if (disposed || !active || playing || error) return;
    if (!current) {
      if (!pending || remaining > 0) return;
      current = pending; pending = undefined;
    }
    const entry = current; const word = BATTLE_WORDS.find(word => word.id === entry.wordId);
    if (!word) { error = true; publish(); return; }
    playing = true; const token = ++revision; mix(); publish();
    voice.playReveal(defeatAudioPath(word.id), { sessionId: options.sessionId, roundId: entry.monsterId, revision: token }, success => {
      if (disposed || !active || token !== revision) return;
      playing = false;
      if (!success) { error = true; publish(); return; }
      current = undefined; mix(); publish();
      if (pending) speak(); else options.onDrained();
    });
  }
  function impact() {
    const now = Date.now();
    if (!active || now - lastHit < 70) return;
    lastHit = now;
    try {
      if (!hit) {
        hit = (options.createHitContext ?? (() => wx.createInnerAudioContext()))();
        hit.autoplay = false; hit.loop = false; hit.obeyMuteSwitch = true; hit.src = '/assets/audio/battle-hit.mp3';
        hit.onError(() => undefined);
      }
      hit.volume = effectVolume(busy() ? .10 : .35);
      hit.stop(); hit.play();
    } catch { /* A missing effect must not stop combat or word playback. */ }
  }
  function baseImpact() {
    if (!active) return;
    try {
      if (!baseHit) {
        baseHit = (options.createBaseHitContext ?? (() => wx.createInnerAudioContext()))();
        baseHit.autoplay = false; baseHit.loop = false; baseHit.obeyMuteSwitch = true;
        baseHit.src = '/assets/audio/base-hit.mp3'; baseHit.onError(() => undefined);
      }
      baseHit.volume = effectVolume(busy() ? .12 : .4);
      baseHit.stop(); baseHit.play();
    } catch { /* Cosmetic effects cannot interrupt combat. */ }
  }
  return {
    playCoin() {
      const now = Date.now();
      if (disposed || !active || now - lastCoin < 100) return;
      lastCoin = now;
      try {
        if (!coin) {
          coin = (options.createCoinContext ?? (() => wx.createInnerAudioContext()))();
          coin.autoplay = false; coin.loop = false; coin.obeyMuteSwitch = true;
          coin.src = '/assets/audio/coin-collect.mp3'; coin.onError(() => undefined);
        }
        coin.volume = effectVolume(busy() ? .08 : .25);
        coin.stop(); coin.play();
      } catch { /* Collection is already saved; cosmetic audio cannot undo it. */ }
    },
    get view() { return view(); },
    get busy() { return busy(); },
    handle(events: readonly CombatEvent[]) {
      if (disposed) return;
      const local = events.filter(event => event.context.sessionId === options.sessionId);
      let changed = false;
      for (const event of local) if (event.type === 'monsterDefeated') {
        const key = `${event.context.combatId}:${event.monsterId}`;
        if (!seen.has(key)) {
          seen.add(key); pending = { wordId: event.wordId, monsterId: event.monsterId }; changed = true;
        }
      }
      if (changed) { remaining = SETTLE_MS; settle(); }
      if (local.some(event => event.type === 'monsterDamaged')) impact();
      let damaged = false;
      for (const event of local) if (event.type === 'baseDamaged') {
        const key = `${event.context.combatId}:${event.attackId}`;
        if (!heardAttacks.has(key)) { heardAttacks.add(key); damaged = true; }
      }
      if (damaged) baseImpact();
      mix(); publish(); speak();
    },
    setActive(value: boolean) {
      if (disposed || value === active) return;
      active = value; music.setActive(value);
      if (!value) {
        if (cancelSettle) remaining = Math.max(0, dueAt - now());
        cancelTimer(); revision++; playing = false; voice.stop();
        try { hit?.stop(); baseHit?.stop(); coin?.stop(); } catch {}
      } else { settle(); speak(); }
    },
    setVolume(value: number) { if (!disposed && Number.isFinite(value)) { volume = Math.max(0, Math.min(1, value)); mix(); } },
    retry() { if (!disposed && active && error) { error = false; speak(); } },
    dispose() { if (!disposed) { disposed = true; revision++; voice.dispose(); music.dispose(); cancelTimer(); current = pending = undefined; seen.clear();
      try { hit?.stop(); } catch {} try { hit?.destroy(); } catch {} hit = undefined;
      try { baseHit?.stop(); } catch {} try { baseHit?.destroy(); } catch {} baseHit = undefined; heardAttacks.clear();
      try { coin?.stop(); } catch {} try { coin?.destroy(); } catch {} coin = undefined;
    } },
  };
}
