export const HOUSE_MAX_LEVEL = 5;
const NAMES = ['木屋', '加固木屋', '石屋', '城堡', '重甲城堡'] as const;
const COSTS = [300, 600, 1200, 2400, null] as const;
export function houseForLevel(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > HOUSE_MAX_LEVEL) throw new Error('房屋等级无效');
  return {level, name: NAMES[level - 1], nextCost: COSTS[level - 1], hpBonus: (level - 1) * 25, hpMultiplier: 1 + (level - 1) * .25};
}
