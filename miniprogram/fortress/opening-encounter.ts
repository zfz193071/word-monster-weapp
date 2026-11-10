import { drawEnemyType } from './enemy-types';
import type { SkillCollection } from './skill-quality';
import { difficultyFor } from './difficulty';
import type { DifficultyId } from './difficulty';
import { weaponForLevel } from '../weapons/catalog';
import { bossSoldierDropCount, bossWaveIndex, fortressMaxHp, monsterDropCoins } from './battle-progression';
import { createSeededRandom } from './plans';
import { logicalHitbox } from './viewport';
import { createEncounterCombat } from './combat';
import { ALL_BATTLE_WORDS as BATTLE_WORDS, ANIMAL_IDS, getLevel } from './levels';
import type { SpriteAsset, SceneArt } from './canvas-scene';
import type { SkillLevels, SupportSoldierState } from './types';
import { FORTRESS_RULES } from './rules';
import type { ExperienceRules } from './experience';
import type { UpgradeCard, UpgradeOffer } from './upgrade-choice';
import { FORTRESS_SKILLS } from './rules';

export const SPAWN_INTERVALS: Readonly<Record<DifficultyId, readonly [number, number]>> = Object.freeze({
  easy: [1800, 1000], normal: [1500, 800], hard: [1200, 650], nightmare: [1000, 500],
});
export const MAX_HERO_LEVEL = 20;
export const OPENING_WAVE_COUNT = MAX_HERO_LEVEL - 1;
export const OPENING_EXPERIENCE_PER_KILL = 8;
export const OPENING_MONSTER_COUNTS: readonly number[] = Object.freeze(Array.from({ length: OPENING_WAVE_COUNT }, (_, waveIndex) => 8 + waveIndex * 5));
export function openingMonsterCount(waveIndex: number, levelId = 1): number {
  if (!Number.isInteger(waveIndex) || waveIndex < 0 || waveIndex >= OPENING_WAVE_COUNT) throw new Error('无效波次');
  getLevel(levelId);
  return levelId > 1 ? Math.ceil(OPENING_MONSTER_COUNTS[waveIndex] * 1.25) : OPENING_MONSTER_COUNTS[waveIndex];
}
export const OPENING_EXPERIENCE: ExperienceRules = Object.freeze({
  experiencePerKill: OPENING_EXPERIENCE_PER_KILL,
  // Cumulative XP: each level costs currentLevel * 40, independent of waves.
  levelThresholds: Object.freeze(Array.from({ length: MAX_HERO_LEVEL - 1 }, (_, index) => 20 * (index + 1) * (index + 2))),
});
export const ZERO_SKILLS: SkillLevels = Object.freeze({ doubleShot: 0, fireRate: 0, bulletWidth: 0, firepower: 0, homing: 0 });
export const HERO_PATH = '/assets/images/fortress/hero.png';
const original = (name: string): SpriteAsset => ({ path: `/assets/images/fortress/${name}.png`,
  source: `docs/assets/original/${name}.svg`, rights: '本项目原创矢量美术，2026-11-01', approved: true });
const OUTFIT_COLORS: Readonly<Record<string, string>> = Object.freeze({
  apple: '#c44c4d', banana: '#d5b43b', orange: '#da8136', pear: '#a4ae42', peach: '#db8f81',
  grape: '#8260a5', kiwi: '#789747', cherry: '#9e3c50', pineapple: '#bb9439', watermelon: '#48865b', strawberry: '#ce4c62',
  black: '#3b4145', blue: '#4b78b8', brown: '#805b3d', green: '#56854b', pink: '#d77fa0',
  red: '#c44c4d', white: '#dedbcf', yellow: '#d5b43b',
});

export function openingArt(wordId: string, wordIds: readonly string[] = [wordId], weaponLevel = 1): SceneArt {
  weaponForLevel(weaponLevel);
  const word = BATTLE_WORDS.find(item => item.id === wordId);
  if (!word) throw new Error('未知单词');
  return { animalIds: wordIds.filter(id => ANIMAL_IDS.includes(id)), monster: original('zombie'), monsterWidth: 40,
    outfitBodies: Object.fromEntries([...new Set(wordIds)].map(id => { if (!BATTLE_WORDS.some(word => word.id === id)) throw new Error('未知单词'); return [id, original(getLevel(1).words.some(word => word.id === id) ? `zombie-body-${id}` : getLevel(2).words.some(word => word.id === id) ? `zombie-body-${id}` : 'zombie-body')]; })),
    outfitColors: Object.fromEntries([...new Set(wordIds)].map(id => { if (!BATTLE_WORDS.some(word => word.id === id)) throw new Error('未知单词'); return [id, OUTFIT_COLORS[id] ?? '#a28a6e']; })),
    walkParts: { body: original('zombie-body'), left: original('zombie-leg-left'), right: original('zombie-leg-right') },
    monsterVisual: { wordId, portraitPath: '/assets/images/fortress/zombie.png', spritePath: '/assets/images/fortress/zombie.png',
      sourceSize: { width: 128, height: 160 }, anchor: { x: 64, y: 80 }, hitbox: ANIMAL_IDS.includes(wordId) ? { x: 10, y: 25, width: 108, height: 110 } : { x: 25, y: 16, width: 78, height: 135 } },
    fruitHats: Object.fromEntries([...new Set(wordIds)].map(id => { const fruit = BATTLE_WORDS.find(word => word.id === id); if (!fruit) throw new Error('未知单词'); return [id, { path: fruit.fruitImagePath, source: 'docs/content-assets.md', rights: '沿用已登记选词图授权', approved: true }]; })),
    fruitHat: { path: word.fruitImagePath, source: 'docs/content-assets.md', rights: '沿用已登记选词图授权', approved: true },
    hero: original(`hero-back-weapon-${weaponLevel}`), weapon: original('weapon'), bullet: original('bullet'), base: original('base'), destroyedBase: original('destroyed-base') };
}
export function createOpeningEncounter(sessionId: string, wordId: string, generation: number, waveIndex = 0, skills: SkillLevels = ZERO_SKILLS, baseHp: number | undefined = undefined, previousWordIds: readonly string[] = [], levelId = 1, weaponLevel = 1, supportSoldiers: readonly SupportSoldierState[] = [], difficulty: DifficultyId = 'normal', skillCollection?: SkillCollection, houseLevel = 1) {
  const multipliers = difficultyFor(difficulty);
  if (!Number.isInteger(waveIndex) || waveIndex < 0 || waveIndex >= OPENING_WAVE_COUNT) throw new Error('无效波次');
  const words = getLevel(levelId).words;
  if (!words.some(word => word.id === wordId) || previousWordIds.some(id => !words.some(word => word.id === id))) throw new Error('词汇不属于本关');
  const count = openingMonsterCount(waveIndex, levelId);
  let seed = 2166136261;
  for (const char of `${sessionId}:${waveIndex}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const random = createSeededRandom(seed >>> 0);
  const history = [...new Set(previousWordIds)].filter(id => id !== wordId && BATTLE_WORDS.some(word => word.id === id));
  const previousLevelIds = levelId > 1 ? getLevel(levelId - 1).words.map(word => word.id) : [];
  const previousCount = previousLevelIds.length ? Math.round(count * .3) : 0;
  const currentCount = count - previousCount;
  const fruitIds = Array.from({ length: currentCount }, (_, index) => !history.length || index < Math.ceil(currentCount / 2) ? wordId : history[(index - Math.ceil(currentCount / 2)) % history.length]);
  const offset = previousLevelIds.length ? Math.floor(random() * previousLevelIds.length) : 0;
  for (let index = 0; index < previousCount; index++) fruitIds.push(previousLevelIds[(offset + index) % previousLevelIds.length]);
  for (let i = fruitIds.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [fruitIds[i], fruitIds[j]] = [fruitIds[j], fruitIds[i]]; }
  const batchSizes: number[] = [];
  for (let scheduled = 0; scheduled < count;) {
    const size = Math.min(count - scheduled, scheduled / count < 1 / 3 ? 3 : scheduled / count < 2 / 3 ? 4 : 5);
    batchSizes.push(size); scheduled += size;
  }
  const spawns: { monsterId: string; wordId: string; spawnAtMs: number; position: { x: number; y: number } }[] = []; let spawnAtMs = 0;
  for (const [batchIndex, size] of batchSizes.entries()) {
    const lanes = [56, 118, 180, 242, 304];
    for (let i = lanes.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [lanes[i], lanes[j]] = [lanes[j], lanes[i]]; }
    for (let member = 0; member < size; member++) spawns.push({ monsterId: `${sessionId}:wave:${waveIndex + 1}:zombie:${spawns.length + 1}`, wordId: fruitIds[spawns.length], spawnAtMs,
      position: { x: lanes[member] + random() * 12 - 6, y: FORTRESS_RULES.monster.startY } });
    // Timed arrivals continue while earlier enemies are still alive.
    const [start, end] = SPAWN_INTERVALS[difficulty];
    spawnAtMs += start - Math.round((start - end) * Math.min(1, batchIndex / Math.max(1, batchSizes.length - 2)));
  }
  // Keep category counts unchanged even when the last slot was a previous-stage monster.
  if (waveIndex === OPENING_WAVE_COUNT - 1 && !words.some(word => word.id === spawns[spawns.length - 1].wordId)) {
    const current = spawns.findIndex(spawn => words.some(word => word.id === spawn.wordId));
    [spawns[current].wordId, spawns[spawns.length - 1].wordId] = [spawns[spawns.length - 1].wordId, spawns[current].wordId];
  }
  const bossWave = bossWaveIndex(sessionId);
  const typeRandom = createSeededRandom((seed ^ 0x73a9c251) >>> 0);
  const plannedSpawns = spawns.map((spawn, index) => {
    if (waveIndex === OPENING_WAVE_COUNT - 1 && index === spawns.length - 1) return { ...spawn, boss: true, bossKind: 'grand' as const, dropCoins: 0 };
    const boss = waveIndex === bossWave && index === spawns.length - 1;
    return { ...spawn, ...(!boss ? {enemyType: drawEnemyType(waveIndex + 1, index === 0, typeRandom)} : {}), ...(boss ? { boss: true, bossKind: 'iron' as const, soldierDropCount: bossSoldierDropCount(spawn.monsterId) } : {}), dropCoins: monsterDropCoins(spawn.monsterId, boss, difficulty) };
  });
  return createEncounterCombat({ houseLevel, difficulty: { levelId, heroLevel: waveIndex + 1, mode: difficulty }, weaponLevel, automatic: true, monsterSpeed: (levelId === 3 ? 28 : 20) * multipliers.speed, monsterAttackIntervalMs: levelId === 3 ? 1500 : 2000, sessionId, targetWordId: wordId, combatId: `${sessionId}:wave:${waveIndex + 1}`, generation, baseHp: baseHp ?? fortressMaxHp(levelId, houseLevel),
    playerX: 180, skills, skillCollection, supportSoldiers, monsterHitbox: logicalHitbox(openingArt(wordId).monsterVisual, openingArt(wordId).monsterWidth),
    monsterHitboxes: Object.fromEntries([...new Set(fruitIds)].map(id => {
      const art = openingArt(id); return [id, logicalHitbox(art.monsterVisual, art.monsterWidth)];
    })),
    allowedWordIds: [wordId, ...history, ...previousLevelIds], spawns: plannedSpawns });
}
export function openingSkillOffer(sessionId: string, level = 2, levels: SkillLevels = ZERO_SKILLS, base = { hp: FORTRESS_RULES.base.maxHp, maxHp: FORTRESS_RULES.base.maxHp }): UpgradeOffer {
  const cards: UpgradeCard[] = FORTRESS_SKILLS.filter(skill => levels[skill.id] < skill.maxLevel).map(skill => ({ id: skill.id, label: skill.label, icon: skill.id,
    description: `${skill.id === 'doubleShot' ? '齐射数量' : skill.id === 'fireRate' ? '射击间隔（毫秒）' : '子弹宽度'} ${skill.values[levels[skill.id]]} → ${skill.values[levels[skill.id] + 1]}` }));
  for (const id of ['flame', 'frost', 'lightning'] as const) {
    const next = (levels[id] ?? 0) + 1;
    cards.push({ id, icon: id, label: `${id === 'flame' ? '火花绽放' : id === 'frost' ? '冰晶缓行' : '跃动电弧'} Lv.${next}`,
    description: id === 'flame' ? `每5秒附加火焰，半径45内额外造成${10 + 5 * next}伤害` : id === 'frost' ? `每5秒附加冰霜，减速${Math.min(20 + 5 * next, 70)}%，持续2秒` : `每5秒附加雷电，连锁90范围内另一目标，造成${10 + 5 * next}伤害` });
  }
  if (!levels.firepower) cards.push({ id: 'firepower', icon: 'firepower', label: '火力激发', description: '子弹伤害提高50%，持续5秒；每20秒自动触发一次' });
  if (!levels.homing) cards.push({ id: 'homing', icon: 'homing', label: '追踪弹', description: '子弹自动追踪存活僵尸，目标死亡后重新锁定' });
  if (base.hp > 0 && base.hp < base.maxHp * .5) cards.push({ id: 'repair', icon: 'repair', label: '堡垒修复', description: '立即恢复堡垒全部生命值' });
  const seed = [...`${sessionId}:${level}`].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 17);
  const random = createSeededRandom(seed >>> 0);
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return { id: `${sessionId}:level:${level}`, level, cards: cards.slice(0, 3) };
}
