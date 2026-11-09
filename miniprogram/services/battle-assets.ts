import type { SceneArt } from '../fortress/canvas-scene';
import { ALL_BATTLE_WORDS, defeatAudioPath } from '../fortress/levels';

interface LoadCallbacks {
  onProgress(percent: number): void;
  onReady(): void;
  onError(): void;
}
interface LoadOptions { readonly sceneDecodesImages?: boolean; readonly audioPaths?: readonly string[]; readonly imagePaths?: readonly string[] }

const BATTLE_AUDIO = [
  '/assets/audio/battle-loop.mp3', '/assets/audio/battle-hit.mp3', '/assets/audio/base-hit.mp3',
  '/assets/audio/coin-collect.mp3', '/assets/audio/quiz-encouragement.mp3',
  '/assets/audio/quiz-praise-bilingual.mp3', '/assets/audio/victory-applause.mp3',
  '/assets/audio/victory-cheer.mp3', '/assets/audio/victory-praise.mp3', '/assets/audio/defeat-sad.mp3',
] as const;
export function battleAudioPaths(wordIds: readonly string[]): string[] {
  const words = new Map(ALL_BATTLE_WORDS.map(word => [word.id, word]));
  return [...new Set([...BATTLE_AUDIO, ...wordIds.flatMap(id => {
    const word = words.get(id);
    if (!word) throw new Error(`未知战斗词条：${id}`);
    return [word.audioPath, defeatAudioPath(id)];
  })])];
}

// Gate scene creation on actual image decoding and audio canplay, never a guessed timer.
export function loadBattleAssets(art: SceneArt, callbacks: LoadCallbacks, options: LoadOptions = {}): () => void {
  const assets = [art.monster, art.base, art.destroyedBase, art.hero, art.weapon, art.bullet,
    ...(art.fruitHat ? [art.fruitHat] : []), ...(art.walkParts ? Object.values(art.walkParts) : []),
    ...Object.values(art.outfitBodies ?? {}), ...Object.values(art.fruitHats ?? {})];
  const paths = [...new Set([...(options.sceneDecodesImages ? [] : assets.map(asset => asset.path)), ...(options.imagePaths ?? [])])];
  const audioPaths = [...new Set(options.audioPaths ?? [])];
  const total = paths.length + audioPaths.length;
  const completed = new Set<string>();
  let active = true;
  const audioLoads = new Map<WechatMiniprogram.InnerAudioContext, () => void>();
  const stop = () => {
    active = false;
    clearTimeout(timeout);
    for (const dispose of [...audioLoads.values()]) dispose();
  };
  const fail = () => { if (active) { stop(); callbacks.onError(); } };
  const timeout = setTimeout(fail, 30000);
  callbacks.onProgress(0);
  if (!total) { stop(); callbacks.onProgress(100); callbacks.onReady(); return stop; }
  const mark = (key: string) => {
    if (!active || completed.has(key)) return;
    completed.add(key);
    callbacks.onProgress(Math.floor(completed.size / total * 100));
    if (completed.size === total) { stop(); callbacks.onReady(); }
  };
  for (const src of paths) {
    if (!active) break;
    try {
      wx.getImageInfo({ src, success: () => {
        mark(`image:${src}`);
      }, fail });
    } catch { fail(); }
  }
  let audioIndex = 0, pumping = false;
  // Bound decoder/context pressure while avoiding one canplay round-trip per file.
  const fillAudioSlots = () => {
    if (pumping) return;
    pumping = true;
    try {
      while (active && audioLoads.size < 4 && audioIndex < audioPaths.length) {
        const src = audioPaths[audioIndex++];
        try {
          const channel = wx.createInnerAudioContext();
          const dispose = () => {
            if (!audioLoads.delete(channel)) return;
            try { channel.offCanplay(onReady); } catch {}
            try { channel.offError(onError); } catch {}
            try { channel.destroy(); } catch {}
          };
          const onReady = () => {
            if (!active || !audioLoads.has(channel)) return;
            dispose(); mark(`audio:${src}`); fillAudioSlots();
          };
          const onError = () => { if (active && audioLoads.has(channel)) fail(); };
          audioLoads.set(channel, dispose);
          channel.autoplay = false; channel.loop = false; channel.obeyMuteSwitch = true;
          channel.onCanplay(onReady); channel.onError(onError); channel.src = src;
        } catch { fail(); }
      }
    } finally { pumping = false; }
  };
  fillAudioSlots();
  return stop;
}
