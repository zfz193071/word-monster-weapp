import { CONTENT_VERSION, MVP_RULES } from '../game/rules';
import type { ContentAsset, LevelConfig, Phase, Round, Word } from '../game/types';

export interface ValidationIssue { readonly path: string; readonly message: string }

export class ContentValidationError extends Error {
  constructor(readonly issues: readonly ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'ContentValidationError';
  }
}

const PHASES: readonly Phase[] = ['intro', 'practice', 'boss'];
const ID = /^[a-z][a-z0-9-]*$/;
const ASSET_PATH = /^\/assets\/(images|audio)\/[a-z0-9-]+\.(png|jpg|webp|mp3|wav)$/;

// 对编译期类型约束下的配置做语义校验；本地存储的 unknown 解码由进度适配器负责。
export function validateContent(
  words: readonly Word[], level: LevelConfig, assets: readonly ContentAsset[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => { issues.push({ path, message }); };
  const ids = new Set<string>();
  if (words.length !== MVP_RULES.wordCount) add('words', '首关必须包含 5 个词');
  words.forEach((word, index) => {
    const path = `words[${index}]`;
    if (!ID.test(word.id)) add(`${path}.id`, '词条 ID 格式无效');
    if (ids.has(word.id)) add(`${path}.id`, `重复词条 ${word.id}`);
    ids.add(word.id);
    if (!word.text.trim()) add(`${path}.text`, '英文不能为空');
    if (!word.meaningZh.trim()) add(`${path}.meaningZh`, '中文释义不能为空');
    for (const kind of ['image', 'audio'] as const) {
      const field = kind === 'image' ? 'imagePath' : 'audioPath';
      const value = word[field];
      if (!ASSET_PATH.test(value)) add(`${path}.${field}`, '必须引用 assets 内的本地资源');
      const entries = assets.filter((asset) => asset.path === value);
      if (entries.length !== 1) add(`${path}.${field}`, '资源清单必须且仅登记一次此路径');
      else if (entries[0].kind !== kind || entries[0].wordId !== word.id) {
        add(`${path}.${field}`, '资源类型或所属词条不匹配');
      }
    }
  });
  const seenPaths = new Set<string>();
  assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    if (seenPaths.has(asset.path)) add(`${path}.path`, '资源路径重复');
    seenPaths.add(asset.path);
    const word = words.find((candidate) => candidate.id === asset.wordId);
    const isImage = asset.kind === 'image';
    const pattern = isImage ? /^\/assets\/images\/[a-z0-9-]+\.(png|jpg|webp)$/ : /^\/assets\/audio\/[a-z0-9-]+\.(mp3|wav)$/;
    if (!pattern.test(asset.path)) add(`${path}.path`, '资源目录或后缀与类型不符');
    if (!word || (isImage ? word.imagePath : word.audioPath) !== asset.path) {
      add(`${path}.wordId`, '资源没有对应的词条引用');
    }
  });
  if (!ID.test(level.id)) add('level.id', '关卡 ID 格式无效');
  if (level.contentVersion !== CONTENT_VERSION) add('level.contentVersion', '内容版本与当前配置不一致');
  if (level.wordIds.length !== MVP_RULES.wordCount || new Set(level.wordIds).size !== level.wordIds.length) {
    add('level.wordIds', '必须恰好引用 5 个不重复词条');
  }
  level.wordIds.forEach((id, index) => {
    if (!ids.has(id)) add(`level.wordIds[${index}]`, `不存在的词条 ${id}`);
  });
  if (level.phases.length !== PHASES.length) add('level.phases', '必须包含初遇、辨词、守关三个阶段');
  level.phases.forEach((config, index) => {
    const path = `level.phases[${index}]`;
    if (config.phase !== PHASES[index]) add(`${path}.phase`, '阶段顺序必须为 intro、practice、boss');
    if (config.optionCount !== MVP_RULES.optionCounts[config.phase]) {
      add(`${path}.optionCount`, '选项数必须符合首关规则：1、2、3');
    }
    if (config.shuffleWords !== (config.phase !== 'intro')) {
      add(`${path}.shuffleWords`, '初遇固定词序，辨词和守关分别打乱');
    }
  });
  return issues;
}

export function assertValidContent(words: readonly Word[], level: LevelConfig, assets: readonly ContentAsset[]): void {
  const issues = validateContent(words, level, assets);
  if (issues.length) throw new ContentValidationError(issues);
}

export function validateRounds(rounds: readonly Round[], level: LevelConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => { issues.push({ path, message }); };
  const ids = new Set<string>();
  const size = level.wordIds.length;
  if (rounds.length !== size * level.phases.length) add('rounds', '题目总数与关卡配置不符');
  rounds.forEach((round, index) => {
    const path = `rounds[${index}]`;
    const config = level.phases[Math.floor(index / size)];
    if (ids.has(round.id)) add(`${path}.id`, '题目 ID 重复');
    ids.add(round.id);
    if (round.id !== `${round.phase}-${round.targetWordId}`) add(`${path}.id`, '题目 ID 与阶段和目标不符');
    if (!config || round.phase !== config.phase) add(`${path}.phase`, '题目阶段或顺序不符');
    if (!level.wordIds.includes(round.targetWordId)) add(`${path}.targetWordId`, '目标词不存在于关卡');
    if (config && round.optionWordIds.length !== config.optionCount) add(`${path}.optionWordIds`, '选项数量不符');
    if (new Set(round.optionWordIds).size !== round.optionWordIds.length) add(`${path}.optionWordIds`, '选项不得重复');
    if (round.optionWordIds.filter((id) => id === round.targetWordId).length !== 1) {
      add(`${path}.optionWordIds`, '必须且仅包含一次正确目标');
    }
    round.optionWordIds.forEach((id, optionIndex) => {
      if (!level.wordIds.includes(id)) add(`${path}.optionWordIds[${optionIndex}]`, `不存在的选项 ${id}`);
    });
  });
  level.phases.forEach((config, index) => {
    const block = rounds.slice(index * size, (index + 1) * size);
    const targets = block.map((round) => round.targetWordId);
    if (new Set(targets).size !== size || level.wordIds.some((id) => !targets.includes(id))) {
      add(`rounds.${config.phase}`, '每阶段必须完整且不重复地遍历词表');
    }
    if (!config.shuffleWords && targets.some((id, i) => id !== level.wordIds[i])) {
      add(`rounds.${config.phase}`, '初遇词序必须固定');
    }
  });
  return issues;
}
