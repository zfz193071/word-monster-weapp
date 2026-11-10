import { SOLDIER_TYPES } from './army';
import type { SoldierType } from './army';

// Style approved by the user on 2026-11-10; generated independently from the concept.
export const soldierSpritePath = (type: SoldierType): string => `/assets/images/army/${type}.png`;
export const SOLDIER_SPRITES = SOLDIER_TYPES.map(type => ({
  path: soldierSpritePath(type), source: 'Built-in image_gen; docs/visual-audit/army/sprites-manifest.json',
  rights: 'AI-generated project asset', approved: true,
}));

// Muzzle pixels measured on the approved 128px sprites (not alpha bounds).
// Keep these anchors with the artwork when replacing a sprite.
export const SOLDIER_MUZZLES: Readonly<Record<SoldierType, readonly [number, number]>> = {
  rifle: [64, 9], shield: [64, 10], flamethrower: [64, 6],
  rocket: [72, 8], jetpack: [64, 6], tank: [64, 5],
};
