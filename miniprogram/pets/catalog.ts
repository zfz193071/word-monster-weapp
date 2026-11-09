export const PET_MAX_LEVEL = 40;
export const PET_EQUIPMENT = [
  { id: 'collar', name: '星光项圈', symbol: '✦' },
  { id: 'hat', name: '探险帽', symbol: '▲' },
  { id: 'charm', name: '闪电挂饰', symbol: 'ϟ' },
] as const;
export type PetEquipment = typeof PET_EQUIPMENT[number]['id'];
export interface PetAppearance { level: number; equipped: readonly PetEquipment[] }
export function petStage(level: number): string { return level >= 7 ? '成年' : level >= 4 ? '少年' : '幼年'; }
