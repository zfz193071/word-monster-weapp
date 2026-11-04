import { PET_EQUIPMENT } from './catalog';
import type { PetAppearance } from './catalog';
import type { Point } from '../fortress/types';
export interface BattlePet extends PetAppearance { readonly attackRemainingMs: number }
export const PET_ATTACK_INTERVAL_MS = 2000;
export function createBattlePet(pet: PetAppearance, attackRemainingMs = PET_ATTACK_INTERVAL_MS): BattlePet {
  if (!Number.isInteger(pet.level) || pet.level < 1 || pet.level > 10 || !Array.isArray(pet.equipped)
    || pet.equipped.some(id => !PET_EQUIPMENT.some(item => item.id === id))
    || !Number.isInteger(attackRemainingMs) || attackRemainingMs < 0 || attackRemainingMs > PET_ATTACK_INTERVAL_MS) throw new Error('战斗宠物状态无效');
  return Object.freeze({ level: pet.level, equipped: Object.freeze([...pet.equipped]), attackRemainingMs });
}
export function petDamage(level: number): number { return 10 + 2 * (level - 1); }
export function battlePetPosition(player: Point): Point { return { x: Math.min(335, player.x + 70), y: player.y + 4 }; }
