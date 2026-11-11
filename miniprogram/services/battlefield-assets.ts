import type { SceneArt } from '../fortress/canvas-scene';

export interface PackageLoadMeasurement {
  readonly name: string;
  status: 'idle' | 'loading' | 'ready' | 'failed' | 'timed-out';
  attempts: number;
  sharedRequests: number;
  cacheHits: number;
  failures: number;
  timeouts: number;
  lastDurationMs: number | null;
}
const measurements: PackageLoadMeasurement[] = [];

// Session-local diagnostics only: no player data, storage, network or unbounded log.
// Duration covers require.async readiness, not pure download or image decoding.
export function battlefieldAssetMeasurements(): ReadonlyArray<Readonly<PackageLoadMeasurement>> {
  return measurements.map(measurement => ({ ...measurement }));
}

// Cache each ordinary subpackage independently so a partial failure only retries
// the missing package. Static import paths are required by the WeChat compiler.
function cachedPackage(name: string, importReady: () => Promise<unknown>): () => Promise<void> {
  const measurement: PackageLoadMeasurement = { name, status: 'idle', attempts: 0,
    sharedRequests: 0, cacheHits: 0, failures: 0, timeouts: 0, lastDurationMs: null };
  measurements.push(measurement);
  let pending: Promise<void> | undefined;
  return () => {
    if (pending) {
      if (measurement.status === 'ready') measurement.cacheHits++;
      else measurement.sharedRequests++;
      return pending;
    }
    measurement.status = 'loading';
    measurement.attempts++;
    measurement.lastDurationMs = null;
    const startedAt = Date.now();
    let settled = false;
    const finish = (status: 'ready' | 'failed' | 'timed-out') => {
      // A timed-out import may settle after a retry. It must not change the new sample.
      if (settled) return;
      settled = true;
      measurement.status = status;
      measurement.lastDurationMs = Math.max(0, Date.now() - startedAt);
      if (status === 'failed') measurement.failures++;
      if (status === 'timed-out') measurement.timeouts++;
    };
    const attempt = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        finish('timed-out'); reject(new Error('战场资源加载超时'));
      }, 15000);
      try {
        importReady().then(() => {
          clearTimeout(timeout); finish('ready'); resolve();
        }, (error: unknown) => { clearTimeout(timeout); finish('failed'); reject(error); });
      } catch (error) { clearTimeout(timeout); finish('failed'); reject(error); }
    });
    const shared = attempt.catch((error: unknown) => {
      if (pending === shared) pending = undefined;
      throw error;
    });
    pending = shared;
    return shared;
  };
}
const loadCourtyard = cachedPackage('battlefield-assets', () => require.async('../battlefield-assets/ready'));
const loadFortress = cachedPackage('fortress-assets', () => require.async('../fortress-assets/ready'));
const loadReinforcedFortress = cachedPackage('reinforced-fortress-assets', () => require.async('../reinforced-fortress-assets/ready'));
const loadStoneFortress = cachedPackage('stone-fortress-assets', () => require.async('../stone-fortress-assets/ready'));
const loadCastleFortress = cachedPackage('castle-fortress-assets', () => require.async('../castle-fortress-assets/ready'));
const loadArmoredFortress = cachedPackage('armored-fortress-assets', () => require.async('../armored-fortress-assets/ready'));
const loadCharacters = cachedPackage('character-assets', () => require.async('../character-assets/ready'));
export const loadAnimalAssets = cachedPackage('animal-assets', () => require.async('../animal-assets/ready'));
export const loadFruitAssets = cachedPackage('fruit-assets', () => require.async('../fruit-assets/ready'));

export function loadBattlefieldAssets(levelId: number, houseLevel = 1, art?: SceneArt, preloadPet = false): Promise<void> {
  const required: Promise<void>[] = [];
  if (levelId === 1) required.push(loadCourtyard());
  if (houseLevel === 1) required.push(loadFortress());
  if (houseLevel === 2) required.push(loadReinforcedFortress());
  if (houseLevel === 3) required.push(loadStoneFortress());
  if (houseLevel === 4) required.push(loadCastleFortress());
  if (houseLevel === 5) required.push(loadArmoredFortress());
  // Pet art is preloaded even before a pet joins, so in-battle unlocks render immediately.
  if (preloadPet || (art && [art.hero, ...Object.values(art.texturedBodies ?? {})].some(asset => asset.path.startsWith('/character-assets/')))) required.push(loadCharacters());
  if (art && [art.fruitHat, ...Object.values(art.fruitHats ?? {})].some(asset => asset?.path.startsWith('/fruit-assets/'))) required.push(loadFruitAssets());
  if (art && [art.fruitHat, ...Object.values(art.fruitHats ?? {})].some(asset => asset?.path.startsWith('/animal-assets/'))) required.push(loadAnimalAssets());
  return Promise.all(required).then(() => {});
}
