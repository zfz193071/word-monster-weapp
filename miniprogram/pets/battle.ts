import { PET_MAX_LEVEL } from './catalog';
import { PET_EQUIPMENT } from './catalog';
import type { PetAppearance } from './catalog';
import type { Point } from '../fortress/types';
export interface BattlePet extends PetAppearance {
  readonly attackRemainingMs: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly defeatedPosition?: Point;
}
export const PET_ATTACK_INTERVAL_MS = 2000;
export function petMaxHp(level: number): number { return 100 + 20 * (level - 1); }
// Ranged enemies may damage the platform pet, so vitality persists across steps
// and waves. A defeated pet keeps its fall position until a flag revives it.
export function createBattlePet(pet: PetAppearance, attackRemainingMs = PET_ATTACK_INTERVAL_MS, vitality?: Pick<BattlePet, 'hp' | 'defeatedPosition'>): BattlePet {
  const maxHp = petMaxHp(pet.level), hp = vitality?.hp ?? maxHp;
  const position = vitality?.defeatedPosition;
  if (!Number.isInteger(pet.level) || pet.level < 1 || pet.level > PET_MAX_LEVEL || !Array.isArray(pet.equipped)
    || pet.equipped.some(id => !PET_EQUIPMENT.some(item => item.id === id))
    || !Number.isInteger(attackRemainingMs) || attackRemainingMs < 0 || attackRemainingMs > PET_ATTACK_INTERVAL_MS
    || !Number.isInteger(hp) || hp < 0 || hp > maxHp
    || (position && (hp !== 0 || !Number.isFinite(position.x) || !Number.isFinite(position.y)))) throw new Error('战斗宠物状态无效');
  return Object.freeze({ level: pet.level, equipped: Object.freeze([...pet.equipped]), attackRemainingMs, hp, maxHp,
    ...(hp === 0 && position ? { defeatedPosition: Object.freeze({ ...position }) } : {}) });
}
export function petDamage(level: number): number { return 10 + 2 * (level - 1); }
export function battlePetPosition(_player: Point, arenaWidth = 360): Point { return { x: arenaWidth * .75, y: 480 }; }
