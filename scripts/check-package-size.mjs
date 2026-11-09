import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = JSON.parse(await readFile(resolve(root, 'project.config.json'), 'utf8'));
const source = resolve(root, project.miniprogramRoot);
const app = JSON.parse(await readFile(resolve(source, 'app.json'), 'utf8'));
const packages = [{ root: '', name: 'main', bytes: 0 }, ...(app.subPackages ?? []).map(p => ({ ...p, bytes: 0 }))];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile()) {
      const name = relative(source, path);
      // Count even ignored files: this is a conservative source budget, not compiler output.
      const pack = packages.find(p => p.root && name.startsWith(`${p.root}/`)) ?? packages[0];
      pack.bytes += (await stat(path)).size;
    }
  }
}
await scan(source);
for (const pack of packages) {
  console.log(`${pack.name}: ${(pack.bytes / 1024).toFixed(1)} KiB / 2048 KiB (source budget)`);
  if (pack.bytes > 2 * 1024 * 1024) process.exitCode = 1;
}
console.log('源码预算包含 TS 与素材；最终包体以微信开发者工具编译结果为准。');
