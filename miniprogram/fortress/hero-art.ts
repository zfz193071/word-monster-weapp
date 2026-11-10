// Source muzzle measured in the original 1122 x 1402 aiming sprite.
// Map artwork to the existing combat muzzle; never move projectiles to fit art.
export const LEVEL_ONE_HERO_ART = Object.freeze({
  path: '/character-assets/hero-back-weapon-1-textured.png',
  source: 'docs/visual-audit/hero/aiming-manifest.json',
  rights: '本项目内置 image_gen 制作，2026-11-10',
  approved: true,
});
export const LEVEL_ONE_HERO_FRAME = Object.freeze({
  x: 16.8 - 770 * 0.06,
  y: -34.4 - 330 * 0.06,
  width: 1122 * 0.06,
  height: 1402 * 0.06,
});
