import { createAudioAdapter } from './audio';
import type { AudioOptions } from './audio';
import { createLoopMusic } from './home-music';
import type { HomeMusicChannel } from './home-music';
import { ALL_BATTLE_WORDS as BATTLE_WORDS, defeatAudioPath } from '../fortress/levels';
import type { CombatEvent } from '../fortress/types';

type HitChannel = Pick<WechatMiniprogram.InnerAudioContext, 'src' | 'autoplay' | 'loop' | 'obeyMuteSwitch' | 'volume' | 'onError' | 'stop' | 'play' | 'destroy'>;
type DefeatGroup = { combatId: string; tick: number; wordId: string; monsterIds: string[] };
export interface BattleAudioView { readonly retiringIds: readonly string[]; readonly speakingWord: string; readonly error: boolean }
export function createBattleAudio(options: {
  sessionId: string;
  onChange: (view: BattleAudioView) => void;
  onDrained: () => void;
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
  const queue: DefeatGroup[] = []; const seen = new Set<string>();
  const music = createLoopMusic({ src: '/assets/audio/battle-loop.mp3', volume, createContext: options.createMusicContext, onChange() {} });
  const voice = createAudioAdapter({ ...options.audio, sessionId: options.sessionId, emit() {} });
  const view = (): BattleAudioView => ({ retiringIds: queue.flatMap(group => group.monsterIds),
    speakingWord: BATTLE_WORDS.find(word => word.id === queue[0]?.wordId)?.text ?? '', error });
  const publish = () => { if (!disposed) options.onChange(view()); };
  function mix() { music.setVolume(queue.length ? volume * .2 : volume); }
  function speak() {
    if (disposed || !active || playing || error || !queue.length) return;
    const entry = queue[0]; const word = BATTLE_WORDS.find(word => word.id === entry.wordId);
    if (!word) { error = true; publish(); return; }
    playing = true; const token = ++revision; mix(); publish();
    voice.playReveal(defeatAudioPath(word.id), { sessionId: options.sessionId, roundId: entry.monsterIds[0], revision: token }, success => {
      if (disposed || !active || token !== revision) return;
      playing = false;
      if (!success) { error = true; publish(); return; }
      queue.shift(); mix(); publish();
      if (queue.length) speak(); else options.onDrained();
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
      hit.volume = queue.length ? .10 : .35;
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
      baseHit.volume = queue.length ? .12 : .4;
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
        coin.volume = queue.length ? .08 : .25;
        coin.stop(); coin.play();
      } catch { /* Collection is already saved; cosmetic audio cannot undo it. */ }
    },
    get view() { return view(); },
    get busy() { return queue.length > 0; },
    handle(events: readonly CombatEvent[]) {
      if (disposed) return;
      const local = events.filter(event => event.context.sessionId === options.sessionId);
      for (const event of local) if (event.type === 'monsterDefeated') {
        const key = `${event.context.combatId}:${event.monsterId}`;
        if (!seen.has(key)) {
          seen.add(key);
          const group = queue.find(group => group.combatId === event.context.combatId && group.tick === event.tick && group.wordId === event.wordId);
          if (group) group.monsterIds.push(event.monsterId);
          else queue.push({ combatId: event.context.combatId, tick: event.tick, wordId: event.wordId, monsterIds: [event.monsterId] });
        }
      }
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
      if (!value) { revision++; playing = false; voice.stop(); try { hit?.stop(); baseHit?.stop(); coin?.stop(); } catch {} }
      else speak();
    },
    setVolume(value: number) { if (!disposed && Number.isFinite(value)) { volume = Math.max(0, Math.min(1, value)); mix(); } },
    retry() { if (!disposed && active && error) { error = false; speak(); } },
    dispose() { if (!disposed) { disposed = true; revision++; voice.dispose(); music.dispose(); queue.length = 0;
      try { hit?.stop(); } catch {} try { hit?.destroy(); } catch {} hit = undefined;
      try { baseHit?.stop(); } catch {} try { baseHit?.destroy(); } catch {} baseHit = undefined; heardAttacks.clear();
      try { coin?.stop(); } catch {} try { coin?.destroy(); } catch {} coin = undefined;
    } },
  };
}
