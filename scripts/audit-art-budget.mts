import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { LEVELS, getLevel } from '../miniprogram/fortress/levels';

// Offline scenarios only; never selects production quality or changes resources.
const root = fileURLToPath(new URL('../', import.meta.url));
const budget = 2048 * 1024;
const app = JSON.parse(await readFile(resolve(root, 'miniprogram/app.json'), 'utf8'));
const packs = [{ name: 'main', root: '', bytes: 0 }, ...app.subPackages.map((p: any) => ({ name: p.name, root: p.root, bytes: 0 }))];
const owner = (path: string) => packs.find(p => p.root && path.startsWith(`${p.root}/`)) ?? packs[0];
async function scan(dir = '') {
  for (const entry of await readdir(resolve(root, 'miniprogram', dir), { withFileTypes: true })) {
    const path = `${dir ? `${dir}/` : ''}${entry.name}`;
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile()) owner(path).bytes += (await readFile(resolve(root, 'miniprogram', path))).length;
  }
}
await scan();
const candidates = new Map<string, { path: string; bytes: number; rgbaBytes: number; size: number }[]>();
const missing: string[] = [];
for (const [folder, levelId] of [['fruits', 1], ['animals', 3]] as const) {
  const base = `docs/visual-audit/${folder}`;
  const manifest = JSON.parse(await readFile(resolve(root, base, 'manifest.json'), 'utf8'));
  const expected = getLevel(levelId).words.map(w => w.id);
  for (const entry of manifest.entries) {
    if (!expected.includes(entry.wordId) || candidates.has(entry.wordId)) throw Error(`Unexpected/duplicate word: ${entry.wordId}`);
    const variants = [];
    for (const size of [64, 128, 256, 512]) {
      const matches = entry.variants.filter((v: any) => v.size === size);
      if (matches.length !== 1) throw Error(`Missing/duplicate size: ${entry.wordId}/${size}`);
      const variant = matches[0], path = `${base}/${variant.file}`;
      const bytes = await readFile(resolve(root, path));
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size || bytes.length !== variant.bytes ||
          createHash('sha256').update(bytes).digest('hex') !== variant.sha256 || variant.rgbaBytes !== size * size * 4) {
        throw Error(`Candidate differs from manifest: ${path}`);
      }
      variants.push({ path, bytes: bytes.length, rgbaBytes: size * size * 4, size });
    }
    candidates.set(entry.wordId, variants);
  }
  const absent = expected.filter(id => !candidates.has(id));
  if (JSON.stringify([...absent].sort()) !== JSON.stringify([...manifest.missing].sort())) throw Error(`${folder}: stale missing list`);
  missing.push(...absent);
}
const words = [...getLevel(1).words, ...getLevel(3).words];
const oldFiles = new Map<string, number>();
for (const word of words) oldFiles.set(word.id, (await readFile(resolve(root, 'miniprogram', word.fruitImagePath.replace(/^\//, '')))).length);
const scenarios = [64, 128, 256, 512].map(size => {
  const select = (id: string) => candidates.get(id)?.find(v => v.size === size);
  const projected = packs.map(p => ({ ...p, baselineBytes: p.bytes }));
  for (const word of words) {
    const candidate = select(word.id);
    if (candidate) projected.find(p => p.name === owner(word.fruitImagePath.replace(/^\//, '')).name)!.bytes += candidate.bytes - oldFiles.get(word.id)!;
  }
  return {
    size, complete: missing.length === 0,
    inPlacePackages: projected.map(p => ({ ...p, remainingBytes: budget - p.bytes, fitsSourceBudget: p.bytes <= budget })),
    candidateOnlyCategories: [1, 3].map(levelId => {
      const ids = getLevel(levelId).words.map(w => w.id), available = ids.flatMap(id => select(id) ?? []);
      const bytes = available.reduce((n, v) => n + v.bytes, 0);
      return { levelId, available: available.length, expected: ids.length, missing: ids.filter(id => !select(id)), bytes, remainingBytes: budget - bytes, files: available };
    }),
    levelCandidateResidency: LEVELS.map(level => {
      const ids = [...new Set([...level.words, ...(level.id > 1 ? getLevel(level.id - 1).words : [])].map(w => w.id))];
      const files = ids.flatMap(id => select(id) ?? []);
      return { levelId: level.id, wordIds: ids.filter(id => candidates.has(id)), missing: ids.filter(id => missing.includes(id)),
        bytes: files.reduce((n, v) => n + v.bytes, 0), rgbaBytes: files.reduce((n, v) => n + v.rgbaBytes, 0) };
    }),
  };
});
await writeFile(resolve(root, 'docs/visual-audit/art-budget.json'), JSON.stringify({
  schemaVersion: 1, sourceBudgetBytes: budget, missing,
  evidence: 'Verified candidate PNG dimensions, bytes and SHA256. Source-only scenarios; no runtime changes or quality approval.',
  limits: 'In-place estimates replace available display images once, retain old missing images, and exclude new battle parts. Candidate-only categories omit package wrappers, audio and shared art. Residency covers only candidate display images in current+previous categories, not runtime cache eviction, texture copies, Canvas, audio or device peak memory. No compiled package or timing measurements.',
  baselinePackages: packs, scenarios,
}, null, 2) + '\n');
console.log(`Verified ${candidates.size * 4} candidates; missing: ${missing.join(', ') || 'none'}`);
for (const s of scenarios) console.log(`${s.size}px: ${s.inPlacePackages.map(p => `${p.name} ${(p.bytes / 1024).toFixed(1)}KiB${p.fitsSourceBudget ? '' : ' OVER'}`).join('; ')}`);
