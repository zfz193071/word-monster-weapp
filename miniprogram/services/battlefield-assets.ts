import type { SceneArt } from '../fortress/canvas-scene';

// Cache each ordinary subpackage independently so a partial failure only retries
// the missing package. Static import paths are required by the WeChat compiler.
function cachedPackage(importReady: () => Promise<unknown>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => {
    if (pending) return pending;
    const attempt = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('战场资源加载超时')), 15000);
      try {
        importReady().then(() => {
          clearTimeout(timeout); resolve();
        }, (error: unknown) => { clearTimeout(timeout); reject(error); });
      } catch (error) { clearTimeout(timeout); reject(error); }
    });
    const shared = attempt.catch((error: unknown) => {
      if (pending === shared) pending = undefined;
      throw error;
    });
    pending = shared;
    return shared;
  };
}
const loadCourtyard = cachedPackage(() => require.async('../battlefield-assets/ready'));
const loadFortress = cachedPackage(() => require.async('../fortress-assets/ready'));

const loadCharacters = cachedPackage(() => require.async('../character-assets/ready'));

export const loadFruitAssets = cachedPackage(() => require.async('../fruit-assets/ready'));

export function loadBattlefieldAssets(levelId: number, houseLevel = 1, art?: SceneArt): Promise<void> {
  const required: Promise<void>[] = [];
  if (levelId === 1) required.push(loadCourtyard());
  if (houseLevel === 1) required.push(loadFortress());
  if (art && [art.hero, ...Object.values(art.texturedBodies ?? {})].some(asset => asset.path.startsWith('/character-assets/'))) required.push(loadCharacters());
  if (art && [art.fruitHat, ...Object.values(art.fruitHats ?? {})].some(asset => asset?.path.startsWith('/fruit-assets/'))) required.push(loadFruitAssets());
  return Promise.all(required).then(() => {});
}
