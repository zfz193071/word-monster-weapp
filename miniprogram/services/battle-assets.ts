import type { SceneArt } from '../fortress/canvas-scene';

interface LoadCallbacks {
  onProgress(percent: number): void;
  onReady(): void;
  onError(): void;
}

// Measure actual image readiness, not elapsed time or a guessed download speed.
export function loadBattleAssets(art: SceneArt, callbacks: LoadCallbacks): () => void {
  const assets = [art.monster, art.base, art.destroyedBase, art.hero, art.weapon, art.bullet,
    ...(art.fruitHat ? [art.fruitHat] : []), ...(art.walkParts ? Object.values(art.walkParts) : []),
    ...Object.values(art.outfitBodies ?? {}), ...Object.values(art.fruitHats ?? {})];
  const paths = [...new Set(assets.map(asset => asset.path))];
  const completed = new Set<string>();
  let active = true;
  const stop = () => { active = false; clearTimeout(timeout); };
  const fail = () => { if (active) { stop(); callbacks.onError(); } };
  const timeout = setTimeout(fail, 15000);
  callbacks.onProgress(0);
  for (const src of paths) {
    if (!active) break;
    try {
      wx.getImageInfo({ src, success: () => {
        if (!active || completed.has(src)) return;
        completed.add(src);
        callbacks.onProgress(Math.floor(completed.size / paths.length * 100));
        if (completed.size === paths.length) { stop(); callbacks.onReady(); }
      }, fail });
    } catch { fail(); }
  }
  return stop;
}
