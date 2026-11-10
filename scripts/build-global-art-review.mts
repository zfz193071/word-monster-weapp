import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Evidence index only: no screenshot or runtime/device acceptance is inferred.
const root = fileURLToPath(new URL('../', import.meta.url));
const base = resolve(root, 'docs/visual-audit');
const source = JSON.parse(await readFile(resolve(base, 'acceptance.json'), 'utf8'));
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const ids = new Set<string>();
const evidence = [];
for (const item of source.assets) {
  if (ids.has(item.id)) throw Error(`Duplicate asset group: ${item.id}`);
  ids.add(item.id);
  if (!item.remaining || !item.status || !item.links.length) throw Error(`Incomplete status: ${item.id}`);
  for (const link of item.links) {
    const path = resolve(base, link.path);
    if (!path.startsWith(`${resolve(root, 'docs')}/`)) throw Error(`Evidence outside docs: ${link.path}`);
    const bytes = await readFile(path);
    evidence.push({ asset: item.id, path: link.path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
}
const inventory = await readFile(resolve(base, 'README.md'), 'utf8');
const groups = inventory.split('\n').filter(line => /^\| .+ \| P[012] \/ #\d+ \|/.test(line)).length;
if (groups !== source.assets.length) throw Error(`Inventory groups ${groups} != acceptance groups ${source.assets.length}`);
const rows = source.assets.map((a: any) => `<tr><th scope="row">${escape(a.name)}<br><a href="https://github.com/zfz193071/word-monster-weapp/issues/${a.owner}">#${a.owner}</a></th><td>${escape(a.status)}</td><td>${a.links.map((l: any) => `<a href="${escape(l.path)}">${escape(l.label)}</a>`).join('<br>')}</td><td>${escape(a.remaining)}</td></tr>`).join('\n');
const stages = source.journey.map((s: any) => `<tr><th scope="row">${escape(s.stage)}</th><td>${escape(s.evidence)}</td><td>${escape(s.remaining)}</td></tr>`).join('\n');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>#96 全局美术验收索引</title><style>body{font:16px/1.65 system-ui,sans-serif;margin:0;background:#f4f6fa;color:#172337}main{max-width:1400px;margin:auto;padding:24px}h1{font-size:28px}a{color:#175ac4}aside{padding:16px;background:#fff0cf;border-left:4px solid #b37913}table{border-collapse:collapse;width:100%;background:white}th,td{padding:14px;border:1px solid #d8dfeb;text-align:left;vertical-align:top}thead{background:#e8eef6}tbody th{min-width:140px}td{min-width:190px}.scroll{overflow-x:auto}li{margin:8px 0}</style><main><h1>#96 全局美术验收索引</h1><p>审计日期：${escape(source.date)} · ${source.assets.length}类盘点资产 · <a href="README.md">原始盘点</a> · <a href="acceptance.json">结构化状态</a> · <a href="acceptance-evidence.json">证据哈希</a></p><aside>${escape(source.boundary)}</aside><h2>交付与待验状态</h2><p>“候选”“局部实施”“静态基线”均不等于专项完成；链接指向各自产物与限制记录。</p><div class="scroll"><table><thead><tr><th>资产 / 责任工单</th><th>当前状态</th><th>证据</th><th>未完成项</th></tr></thead><tbody>${rows}</tbody></table></div><h2>完整流程覆盖</h2><div class="scroll"><table><thead><tr><th>流程</th><th>现有证据</th><th>缺口</th></tr></thead><tbody>${stages}</tbody></table></div><h2>设备与动态验收</h2><ul>${source.deviceGaps.map((s: string) => `<li>${escape(s)}</li>`).join('')}</ul><p>各专项整改后更新状态和证据，再重建本页。所有未完成项继续保留，#96 不关闭。</p></main></html>`;
await writeFile(resolve(base, 'acceptance-evidence.json'), JSON.stringify({ date: source.date, evidenceType: 'Local file existence and SHA256 only', evidence }, null, 2) + '\n');
await writeFile(resolve(base, 'acceptance.html'), html);
console.log(`Indexed ${ids.size} asset groups and ${evidence.length} evidence links; no device acceptance inferred.`);
