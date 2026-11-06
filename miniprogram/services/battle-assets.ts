import type { SceneArt } from '../fortress/canvas-scene';
import { ALL_BATTLE_WORDS, defeatAudioPath } from '../fortress/levels';

interface LoadCallbacks {
  onProgress(percent: number): void;
  onReady(): void;
  onError(): void;
}
interface LoadOptions { readonly audioPaths?: readonly string[]; readonly imagePaths?: readonly string[] }

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

// Gate navigation on actual image decoding and audio canplay, never a guessed timer.
export function loadBattleAssets(art: SceneArt, callbacks: LoadCallbacks, options: LoadOptions = {}): () => void {
  const assets = [art.monster, art.base, art.destroyedBase, art.hero, art.weapon, art.bullet,
    ...(art.fruitHat ? [art.fruitHat] : []), ...(art.walkParts ? Object.values(art.walkParts) : []),
    ...Object.values(art.outfitBodies ?? {}), ...Object.values(art.fruitHats ?? {})];
  const paths = [...new Set([...assets.map(asset => asset.path), ...(options.imagePaths ?? [])])];
  const audioPaths = [...new Set(options.audioPaths ?? [])];
  const total = paths.length + audioPaths.length;
  const completed = new Set<string>();
  let active = true;
  let currentAudio: Pick<WechatMiniprogram.InnerAudioContext, 'offCanplay' | 'offError' | 'destroy'> | undefined;
  let currentReady: (() => void) | undefined, currentError: (() => void) | undefined;
  const clearAudio = () => {
    const channel = currentAudio; currentAudio = undefined;
    if (!channel) return;
    try { channel.offCanplay(currentReady); } catch {}
    try { channel.offError(currentError); } catch {}
    try { channel.destroy(); } catch {}
    currentReady = currentError = undefined;
  };
  const stop = () => { active = false; clearTimeout(timeout); clearAudio(); };
  const fail = () => { if (active) { stop(); callbacks.onError(); } };
  const timeout = setTimeout(fail, 30000);
  callbacks.onProgress(0);
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
  let audioIndex = 0;
  const nextAudio = () => {
    if (!active || audioIndex >= audioPaths.length) return;
    const src = audioPaths[audioIndex++];
    try {
      const channel = wx.createInnerAudioContext();
      currentAudio = channel;
      currentReady = () => { if (!active || currentAudio !== channel) return; clearAudio(); mark(`audio:${src}`); nextAudio(); };
      currentError = () => { if (active && currentAudio === channel) fail(); };
      channel.autoplay = false; channel.loop = false; channel.obeyMuteSwitch = true;
      channel.onCanplay(currentReady); channel.onError(currentError); channel.src = src;
    } catch { fail(); }
  };
  nextAudio();
  return stop;
}
