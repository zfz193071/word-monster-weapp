import { SOLDIER_TYPES } from './army';
import type { SoldierType } from './army';

// Style approved by the user on 2026-11-10; generated independently from the concept.
export const soldierSpritePath = (type: SoldierType): string => `/assets/images/army/${type}.png`;
export const SOLDIER_SPRITES = SOLDIER_TYPES.map(type => ({
  path: soldierSpritePath(type), source: 'Built-in image_gen; docs/visual-audit/army/sprites-manifest.json',
  rights: 'AI-generated project asset', approved: true,
}));
