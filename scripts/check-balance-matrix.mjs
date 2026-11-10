// Durable, sequential natural-battle sampling. Results are not device benchmarks.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, renameSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const difficulties = ['easy', 'normal', 'hard', 'nightmare'];
export function caseNumber(result) {
  const difficulty = difficulties.indexOf(result.difficulty);
  const width = [360, 990].indexOf(result.width);
  if (difficulty < 0 || width < 0 || !Number.isInteger(result.levelId) || result.levelId < 1 || result.levelId > 8) {
    throw new Error('Invalid matrix case coordinates');
  }
  return difficulty * 16 + width * 8 + result.levelId;
}
export function recordResult(report, result) {
  const id = caseNumber(result);
  if (result.seed !== report.seed || !['cleared', 'baseDestroyed'].includes(result.status)) {
    throw new Error('Incomplete result or mismatched seed');
  }
  if (!Number.isFinite(result.combatSeconds) || result.combatSeconds <= 0 || !Number.isFinite(result.hp) ||
      !Number.isFinite(result.maxHp) || result.hp < 0 || result.hp > result.maxHp ||
      (result.status === 'baseDestroyed' && result.hp !== 0)) throw new Error('Invalid battle outcome');
  if (report.results.some(item => caseNumber(item) === id)) throw new Error(`Duplicate case ${id}`);
  if (result.status === 'cleared' && (result.alive !== 0 || result.remaining !== 0)) throw new Error('Premature clear');
  const damage = Object.values(result.soldierContributions).reduce((sum, unit) => sum + unit.damage, 0);
  if (damage !== (result.contributions.soldier ?? 0)) throw new Error('Soldier attribution mismatch');
  const results = [...report.results, result].sort((a, b) => caseNumber(a) - caseNumber(b));
  const completedCases = results.map(caseNumber);
  return {...report, results, completedCases,
    pendingCases: Array.from({length: 64}, (_, index) => index + 1).filter(id => !completedCases.includes(id))};
}
function fingerprint() {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) files.push(path);
    }
  }
  walk(resolve(root, 'miniprogram'));
  files.push(resolve(root, 'scripts/check-balance.ts'), resolve(root, 'package-lock.json'));
  const hash = createHash('sha256');
  for (const path of files.sort()) hash.update(relative(root, path)).update('\0').update(readFileSync(path)).update('\0');
  return hash.digest('hex');
}
export function validateCheckpoint(report, seed, sourceHash) {
  if (report.version !== 1 || report.seed !== seed || report.sourceHash !== sourceHash) {
    throw new Error('Checkpoint seed/source mismatch; use a new output path');
  }
  let checked = {...report, results: [], completedCases: [], pendingCases: Array.from({length:64}, (_, i) => i + 1)};
  for (const result of report.results) checked = recordResult(checked, result);
  if (JSON.stringify(checked.completedCases) !== JSON.stringify(report.completedCases) ||
      JSON.stringify(checked.pendingCases) !== JSON.stringify(report.pendingCases)) throw new Error('Invalid checkpoint case lists');
  return checked;
}
async function main() {
  const [seedArg = '41', outputArg = 'docs/visual-audit/army/natural-matrix-checkpoint-41.json'] = process.argv.slice(2);
  const seed = Number(seedArg);
  if (!Number.isSafeInteger(seed) || process.argv.length > 4) throw new Error('Usage: node scripts/check-balance-matrix.mjs [integer-seed] [output.json]');
  const output = resolve(root, outputArg);
  const sourceHash = fingerprint();
  const lock = `${output}.lock`;
  const descriptor = openSync(lock, 'wx');
  try {
    let report = existsSync(output) ? validateCheckpoint(JSON.parse(readFileSync(output, 'utf8')), seed, sourceHash) : {
      version: 1, seed, sourceHash, scope: 'Headless natural battles; not device tests, player win rates or cross-stage UI.',
      completedCases: [], pendingCases: Array.from({length: 64}, (_, i) => i + 1), results: []
    };
    for (const id of [...report.pendingCases]) {
      console.error(`Running case ${id}/64 (${report.completedCases.length} saved)`);
      const result = await new Promise((accept, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/check-balance.ts', String(seed), '--matrix', `--case=${id}`], {cwd: root, stdio: ['ignore', 'pipe', 'inherit']});
        let stdout = '';
        let interrupted = false;
        const stop = signal => { interrupted = true; child.kill(signal); };
        const interrupt = () => stop('SIGINT');
        const terminate = () => stop('SIGTERM');
        process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
        child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { stdout += chunk; });
        child.once('error', reject);
        child.once('close', (code, signal) => {
          process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
          if (interrupted || code !== 0) { reject(new Error(`Case ${id} stopped (${signal ?? code}); saved cases retained`)); return; }
          try { accept(JSON.parse(stdout)); } catch (error) { reject(error); }
        });
      });
      if (caseNumber(result) !== id) throw new Error('Unexpected case result');
      if (fingerprint() !== sourceHash) throw new Error('Source changed during sampling; result not saved');
      report = recordResult(report, result);
      const temporary = `${output}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n');
      renameSync(temporary, output);
      console.error(`Saved case ${id}: ${result.status}, ${result.combatSeconds}s, HP ${result.hp}/${result.maxHp}`);
    }
    console.error(`Complete: ${report.completedCases.length}/64 saved to ${output}`);
  } finally { closeSync(descriptor); unlinkSync(lock); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
