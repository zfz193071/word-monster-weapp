export type DifficultyId = 'easy' | 'normal' | 'hard' | 'nightmare';
export const DIFFICULTIES = Object.freeze({
  easy: { label: '简单', hp: .4, damage: .35, speed: .8, bossHp: 10 },
  normal: { label: '普通', hp: 1, damage: 1, speed: 1, bossHp: 20 },
  hard: { label: '困难', hp: 1.5, damage: 1.3, speed: 1.1, bossHp: 20 },
  nightmare: { label: '噩梦', hp: 1.7, damage: 1.4, speed: 1.2, bossHp: 15 },
});
export function difficultyFor(id: DifficultyId = 'normal') {
  if (!Object.prototype.hasOwnProperty.call(DIFFICULTIES, id)) throw new Error('无效难度');
  return DIFFICULTIES[id];
}

const COIN_RULES = Object.freeze({
  easy: { chance: .05, normal: 1, bossMin: 3, bossMax: 10, limit: 25 },
  normal: { chance: .1, normal: 1, bossMin: 5, bossMax: 20, limit: 50 },
  hard: { chance: .1, normal: 2, bossMin: 10, bossMax: 40, limit: 100 },
  nightmare: { chance: .1, normal: 3, bossMin: 15, bossMax: 60, limit: 150 },
});
export function coinRulesFor(id: DifficultyId = 'normal') {
  difficultyFor(id);
  return COIN_RULES[id];
}
