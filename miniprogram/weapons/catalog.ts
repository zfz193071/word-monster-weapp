export const WEAPONS = Object.freeze([
  { level: 1, name: '白色基础枪', color: '#edf0e6', nextCost: 200 },
  { level: 2, name: '蓝色守卫枪', color: '#68b5ec', nextCost: 400 },
  { level: 3, name: '紫色守卫枪', color: '#b38be0', nextCost: 800 },
  { level: 4, name: '绿色守卫枪', color: '#8bc96b', nextCost: 1200 },
  { level: 5, name: '黄色守卫枪', color: '#f1d667', nextCost: 1800 },
  { level: 6, name: '橙黄守卫枪', color: '#f3a44c', nextCost: 2600 },
  { level: 7, name: '红色守卫枪', color: '#e97571', nextCost: null },
].map(item => Object.freeze({ ...item, damage: 1 + (item.level - 1) * .5, image: `/assets/weapons/weapon-${item.level}.png` })));
export function weaponForLevel(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > WEAPONS.length) throw new Error('武器等级无效');
  return WEAPONS[level - 1];
}
