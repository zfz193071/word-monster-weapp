import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { LEVELS, getLevel } from '../miniprogram/fortress/levels';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { openingArt } from '../miniprogram/fortress/opening-encounter';
import { battleBackgroundCover } from '../miniprogram/fortress/battle-background';
import { battleAudioPaths } from '../miniprogram/services/battle-assets';

// Audit only: never changes runtime paths, packages or player saves.
const root = fileURLToPath(new URL('../', import.meta.url));
const app = JSON.parse(await readFile(resolve(root, 'miniprogram/app.json'), 'utf8'));
const unique = (values: string[]) => [...new Set(values)].sort();
async function describe(path: string) {
  const data = await readFile(resolve(root, 'miniprogram', path.replace(/^\//, '')));
  const pack = app.subPackages.find((p: {root: string}) => path.startsWith(`/${p.root}/`));
  const png = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return { path, package: pack?.name ?? 'main', bytes: data.length,
    ...(png ? { width: data.readUInt32BE(16), height: data.readUInt32BE(20), rgbaBytes: data.readUInt32BE(16) * data.readUInt32BE(20) * 4 } : {}) };
}
const levels = [];
for (const level of LEVELS) {
  // Conservative complete category union, independent of sampled spawn ordering.
  const current = level.words.map(w => w.id);
  const previous = level.id > 1 ? getLevel(level.id - 1).words.map(w => w.id) : [];
  const wordIds = unique([...current, ...previous]);
  const art = openingArt(current[0], wordIds, 1);
  const images = unique([art.monster, art.base, art.destroyedBase, art.hero, art.weapon, art.bullet,
    ...Object.values(art.walkParts ?? {}), ...Object.values(art.outfitBodies ?? {}), ...Object.values(art.fruitHats ?? {})]
    .map(asset => asset.path).concat(battleBackgroundCover(level.id)));
  // Check every target, option and spawn, including both Boss types, in actual plans.
  let checkedPlans = 0;
  for (const difficulty of ['easy', 'normal', 'hard', 'nightmare'] as const) {
    for (const seed of [1, 41, 20261109]) {
      const plan = createOpeningPlan(`resource-audit-${level.id}-${seed}`, createSeededRandom(seed), level.id, 1, difficulty);
      for (const wave of plan.waves) for (const id of [wave.targetWordId, ...wave.optionWordIds, ...wave.spawnPlan.map(s => s.wordId)]) {
        if (!wordIds.includes(id)) throw new Error(`Level ${level.id}: uncovered word ${id}`);
      }
      checkedPlans++;
    }
  }
  const imageFiles = await Promise.all(images.map(describe));
  const audioFiles = await Promise.all(battleAudioPaths(wordIds).sort().map(describe));
  levels.push({ levelId: level.id, category: level.category, currentWordIds: current, previousWordIds: previous,
    checkedPlans, images: imageFiles, audio: audioFiles,
    imageBytes: imageFiles.reduce((n, f) => n + f.bytes, 0),
    estimatedImageRgbaBytes: imageFiles.reduce((n, f) => n + (f.rgbaBytes ?? 0), 0),
    audioBytes: audioFiles.reduce((n, f) => n + f.bytes, 0) });
}
const heroVariants = await Promise.all(Array.from({length: 7}, (_, i) => describe(openingArt('apple', ['apple'], i + 1).hero.path)));
await writeFile(resolve(root, 'docs/visual-audit/battle-resources.json'), JSON.stringify({
  schemaVersion: 1,
  evidence: 'Source dependency audit; complete current+previous category union. Not compiled package sizes, runtime residency, timing or device verification.',
  limits: 'Per-level totals use weapon 1, include loading cover and shared art, exclude UI/home assets, audio decode memory, Canvas buffers and texture copies. Only the equipped hero variant is needed.',
  heroVariants, levels,
}, null, 2) + '\n');
console.log(`Verified ${levels.length} levels, ${levels.reduce((n,l) => n+l.checkedPlans, 0)} plans, all referenced files and 7 hero variants.`);
for (const l of levels) console.log(`Level ${l.levelId}: ${l.images.length} images, ${(l.imageBytes/1024).toFixed(1)} KiB, ${(l.estimatedImageRgbaBytes/1048576).toFixed(2)} MiB RGBA; ${l.audio.length} audio files`);
