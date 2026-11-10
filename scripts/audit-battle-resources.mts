import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sceneImageAssets } from '../miniprogram/fortress/canvas-scene';
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
function dimensions(data: Buffer): { width: number; height: number } | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data[0] !== 0xff || data[1] !== 0xd8) return undefined;
  for (let offset = 2; offset + 4 <= data.length;) {
    if (data[offset++] !== 0xff) throw Error('Invalid JPEG marker');
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) throw Error('Invalid JPEG segment');
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) throw Error('Invalid JPEG frame');
      return { width: data.readUInt16BE(offset + 5), height: data.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw Error('JPEG dimensions not found');
}
async function describe(path: string) {
  const data = await readFile(resolve(root, 'miniprogram', path.replace(/^\//, '')));
  const pack = app.subPackages.find((p: {root: string}) => path.startsWith(`/${p.root}/`));
  const size = dimensions(data);
  if (/\.(png|jpg|jpeg)$/.test(path) && !size) throw Error(`Unsupported image: ${path}`);
  return { path, package: pack?.name ?? 'main', bytes: data.length,
    ...(size ? { ...size, rgbaBytes: size.width * size.height * 4 } : {}) };
}
// Match check-package-size.mjs: include all source files, even ignored files.
// These are conservative source budgets, never wire/compiled download sizes.
const sourcePackages = [{ name: 'main', root: '', sourceBytes: 0, fileCount: 0 },
  ...app.subPackages.map((pack: { name: string; root: string }) => ({
    name: pack.name, root: pack.root, sourceBytes: 0, fileCount: 0,
  }))];
async function scanPackages(relativeDirectory = ''): Promise<void> {
  for (const entry of await readdir(resolve(root, 'miniprogram', relativeDirectory), { withFileTypes: true })) {
    const relativePath = [relativeDirectory, entry.name].filter(Boolean).join('/');
    if (entry.isDirectory()) await scanPackages(relativePath);
    else if (entry.isFile()) {
      const pack = sourcePackages.find(pack => pack.root && relativePath.startsWith(`${pack.root}/`)) ?? sourcePackages[0];
      pack.sourceBytes += (await stat(resolve(root, 'miniprogram', relativePath))).size;
      pack.fileCount++;
    }
  }
}
await scanPackages();
const levels = [];
for (const level of LEVELS) {
  // Conservative complete category union, independent of sampled spawn ordering.
  const current = level.words.map(w => w.id);
  const previous = level.id > 1 ? getLevel(level.id - 1).words.map(w => w.id) : [];
  const wordIds = unique([...current, ...previous]);
  const art = openingArt(current[0], wordIds, 1);
  const images = unique(sceneImageAssets(art, level.id, 1).map(asset => asset.path).concat(battleBackgroundCover(level.id)));
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
  const requiredPackageNames = unique([...imageFiles, ...audioFiles].map(file => file.package));
  const requiredPackages = requiredPackageNames.map(name => {
    const pack = sourcePackages.find(pack => pack.name === name);
    if (!pack) throw Error(`Unknown package: ${name}`);
    return pack;
  });
  const referencedFileBytes = [...imageFiles, ...audioFiles].reduce((total, file) => total + file.bytes, 0);
  levels.push({ packageBudget: {
    requiredPackageNames,
    // Main is already installed on entry; list it separately from subpackages.
    mainSourceBytes: sourcePackages[0].sourceBytes,
    subpackageSourceBytes: requiredPackages.filter(pack => pack.name !== 'main').reduce((total, pack) => total + pack.sourceBytes, 0),
    referencedFileBytes,
  }, levelId: level.id, category: level.category, currentWordIds: current, previousWordIds: previous,
    checkedPlans, images: imageFiles, audio: audioFiles,
    imageBytes: imageFiles.reduce((n, f) => n + f.bytes, 0),
    estimatedImageRgbaBytes: imageFiles.reduce((n, f) => n + (f.rgbaBytes ?? 0), 0),
    audioBytes: audioFiles.reduce((n, f) => n + f.bytes, 0) });
}
const heroVariants = await Promise.all(Array.from({length: 7}, (_, i) => describe(openingArt('apple', ['apple'], i + 1).hero.path)));
await writeFile(resolve(root, 'docs/visual-audit/battle-resources.json'), JSON.stringify({
  schemaVersion: 3,
  evidence: 'Source dependency audit; complete current+previous category union. Not compiled package sizes, runtime residency, timing or device verification.',
  limits: 'Per-level totals use weapon 1 and fortress 1, share the runtime preload list (including all soldier sprites, textured bodies, both first-level courtyard orientations and fortress states), and include the loading cover, exclude other UI/home assets, audio decode memory, Canvas buffers and texture copies. Only the equipped hero variant is needed.',
  packageBudgetBasis: 'All source files including ignored files and package entrypoints, matching check:package. Required package union derives from the complete image/audio preload dependency set. Subpackage totals assume none are installed; homepage/cache may already supply them. Not compiled bytes or measured network transfer. Main is separate; no incremental cache or download-time claim.',
  sourcePackages, heroVariants, levels,
}, null, 2) + '\n');
console.log(`Verified ${levels.length} levels, ${levels.reduce((n,l) => n+l.checkedPlans, 0)} plans, all referenced files and 7 hero variants.`);
for (const l of levels) console.log(`Level ${l.levelId}: ${l.images.length} images, ${(l.imageBytes/1024).toFixed(1)} KiB, ${(l.estimatedImageRgbaBytes/1048576).toFixed(2)} MiB RGBA; ${l.audio.length} audio files`);
