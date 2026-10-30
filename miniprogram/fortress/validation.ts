import { FORTRESS_RULES, FORTRESS_WORD_IDS } from './rules';
import type { FortressWord, MonsterVisual, SessionPlan, VisualAsset } from './types';

export interface FortressIssue { readonly path: string; readonly message: string }
export class FortressValidationError extends Error {
  constructor(readonly issues: readonly FortressIssue[]) {
    super(issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'FortressValidationError';
  }
}
export function assertNoFortressIssues(issues: readonly FortressIssue[]): void {
  if (issues.length) throw new FortressValidationError(issues);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
// A fixed MVP rule revision accepts exactly the approved configuration, including
// ranges/caps/versions. Balance changes require a new confirmed revision, not silent defaults.
export function validateFortressRules(value: unknown): FortressIssue[] {
  const issues: FortressIssue[] = [];
  function compare(actual: unknown, expected: unknown, path: string): void {
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) { issues.push({ path, message: '必须为数组' }); return; }
      if (actual.length !== expected.length) issues.push({ path, message: `必须包含 ${expected.length} 项` });
      expected.forEach((item, index) => compare(actual[index], item, `${path}[${index}]`));
    } else if (record(expected)) {
      if (!record(actual)) { issues.push({ path, message: '必须为配置对象' }); return; }
      for (const key of Object.keys(expected)) compare(actual[key], expected[key], `${path}.${key}`);
      for (const key of Object.keys(actual)) {
        if (!Object.prototype.hasOwnProperty.call(expected, key)) issues.push({ path: `${path}.${key}`, message: '未确认的配置字段' });
      }
    } else if (actual !== expected) {
      issues.push({ path, message: `不符合已确认规则，应为 ${String(expected)}` });
    }
  }
  compare(value, FORTRESS_RULES, 'rules');
  return issues;
}
const IMAGE = /^\/assets\/images\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(png|jpg|webp)$/;
const AUDIO = /^\/assets\/audio\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(mp3|wav)$/;
const positive = (n: number): boolean => Number.isFinite(n) && n > 0;
const within = (n: number, min: number, max: number): boolean => Number.isFinite(n) && n >= min && n <= max;

// Typed configuration semantics. This is not an unknown local-storage decoder (#12).
export function validateFortressContent(
  words: readonly FortressWord[], monsters: readonly MonsterVisual[], assets: readonly VisualAsset[],
  requireApproved = false,
): FortressIssue[] {
  const issues: FortressIssue[] = [];
  const add = (path: string, message: string) => { issues.push({ path, message }); };
  const ids = new Set<string>();
  const references = (value: string, kind: 'image' | 'audio', wordId: string, path: string) => {
    if (!(kind === 'image' ? IMAGE : AUDIO).test(value)) add(path, '必须引用对应类型的本地 assets 文件');
    const matches = assets.filter(asset => asset.path === value);
    if (matches.length !== 1) add(path, '资源清单必须且仅登记一次');
    else if (matches[0].wordId !== wordId || matches[0].kind !== kind) add(path, '资源类型或所属词条不匹配');
  };
  if (words.length !== 5) add('words', '必须包含已确认的五个水果词');
  words.forEach((word, index) => {
    const path = `words[${index}]`;
    if (!FORTRESS_WORD_IDS.includes(word.id) || ids.has(word.id)) add(`${path}.id`, '词条未知或重复');
    ids.add(word.id);
    if (word.text !== word.id) add(`${path}.text`, '英文必须对应已确认水果词');
    if (!word.meaningZh.trim()) add(`${path}.meaningZh`, '中文释义不能为空');
    references(word.fruitImagePath, 'image', word.id, `${path}.fruitImagePath`);
    references(word.audioPath, 'audio', word.id, `${path}.audioPath`);
  });
  for (const id of FORTRESS_WORD_IDS) {
    if (monsters.filter(monster => monster.wordId === id).length !== 1) add(`monsters.${id}`, '必须配置一个独立的水果怪物形象');
  }
  monsters.forEach((monster, index) => {
    const path = `monsters[${index}]`;
    if (!ids.has(monster.wordId)) add(`${path}.wordId`, '怪物必须引用已登记词条');
    for (const field of ['portraitPath', 'spritePath'] as const) {
      references(monster[field], 'image', monster.wordId, `${path}.${field}`);
      if (words.some(word => word.fruitImagePath === monster[field])) add(`${path}.${field}`, '普通水果教学图不能代替怪物形象');
    }
    const { width, height } = monster.sourceSize;
    if (!positive(width) || !Number.isInteger(width)) add(`${path}.sourceSize.width`, '原图宽度须为正整数');
    if (!positive(height) || !Number.isInteger(height)) add(`${path}.sourceSize.height`, '原图高度须为正整数');
    if (!within(monster.anchor.x, 0, width)) add(`${path}.anchor.x`, '锚点须位于原图范围内');
    if (!within(monster.anchor.y, 0, height)) add(`${path}.anchor.y`, '锚点须位于原图范围内');
    const box = monster.hitbox;
    if (!within(box.x, 0, width) || !within(box.y, 0, height) || !positive(box.width) || !positive(box.height)
      || box.x + box.width > width || box.y + box.height > height) add(`${path}.hitbox`, '碰撞矩形必须为正面积且完整位于原图内');
  });
  const paths = new Set<string>();
  assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    if (paths.has(asset.path)) add(`${path}.path`, '资源路径重复');
    paths.add(asset.path);
    if (!ids.has(asset.wordId)) add(`${path}.wordId`, '资源引用未知词条');
    if (!(asset.kind === 'image' ? IMAGE : AUDIO).test(asset.path)) add(`${path}.path`, '资源路径或类型无效');
    if (!/^https:\/\//.test(asset.source) || !asset.rights.trim()) add(`${path}.source`, '必须登记来源 URL 与许可');
    if (requireApproved && asset.reviewStatus !== 'approved') add(`${path}.reviewStatus`, '资源尚未通过审校');
  });
  return issues;
}

export function validateSessionPlan(plan: SessionPlan): FortressIssue[] {
  const issues: FortressIssue[] = [];
  const add = (path: string, message: string) => { issues.push({ path, message }); };
  for (const field of ['mode', 'schemaVersion', 'contentVersion'] as const) {
    if (plan[field] !== FORTRESS_RULES[field]) add(`plan.${field}`, '不兼容的模式或版本');
  }
  if (!plan.sessionId.trim()) add('plan.sessionId', '会话 ID 不能为空');
  if (plan.waves.length !== 5) add('plan.waves', '必须恰好五波');
  const targets = new Set<string>(); const waves = new Set<string>(); const monsters = new Set<string>();
  plan.waves.forEach((wave, index) => {
    const path = `plan.waves[${index}]`;
    if (!wave.waveId || waves.has(wave.waveId)) add(`${path}.waveId`, '波次 ID 为空或重复');
    waves.add(wave.waveId);
    if (wave.index !== index) add(`${path}.index`, '波次索引不连续');
    if (!FORTRESS_WORD_IDS.includes(wave.targetWordId) || targets.has(wave.targetWordId)) add(`${path}.targetWordId`, '五词必须各出现一次');
    targets.add(wave.targetWordId);
    if (wave.optionWordIds.length !== 2 || new Set(wave.optionWordIds).size !== 2
      || wave.optionWordIds.filter(id => id === wave.targetWordId).length !== 1
      || wave.optionWordIds.some(id => !FORTRESS_WORD_IDS.includes(id))) add(`${path}.optionWordIds`, '需两个不同的已知词且正确目标恰好一次');
    if (wave.spawnPlan.length !== 1) add(`${path}.spawnPlan`, '每波只能生成一只对应怪物');
    wave.spawnPlan.forEach((spawn, spawnIndex) => {
      const at = `${path}.spawnPlan[${spawnIndex}]`;
      if (!spawn.monsterId || monsters.has(spawn.monsterId)) add(`${at}.monsterId`, '怪物 ID 为空或重复');
      monsters.add(spawn.monsterId);
      if (spawn.wordId !== wave.targetWordId) add(`${at}.wordId`, '怪物词必须对应听词目标');
      if (!within(spawn.position.x, FORTRESS_RULES.monster.spawnMinX, FORTRESS_RULES.monster.spawnMaxX)
        || spawn.position.y !== FORTRESS_RULES.monster.startY) add(`${at}.position`, '出生位置越界');
    });
  });
  return issues;
}
