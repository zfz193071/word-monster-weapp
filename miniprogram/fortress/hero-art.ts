// Approved steel-blue guardian master and its seven weapon variants.
// Measurements are in the untouched 1536 x 1024 source images.
// Rotate the painted barrel toward local -Y and anchor its tip to the existing
// combat muzzle. Rendering must never move projectiles or change aim rules.
const measurements = [
  [1088, 211, 944, 360],
  [1157, 225, 1038, 306],
  [1287, 186, 1121, 281],
  [1103, 239, 960, 339],
  [1167, 222, 1028, 315],
  [1161, 191, 1010, 310],
  [1136, 244, 1001, 332],
] as const;
export const HERO_VARIANTS = Object.freeze(measurements.map(([x, y, rearX, rearY], index) => {
  const scale = 0.07;
  return Object.freeze({
    level: index + 1,
    art: Object.freeze({
      path: `/character-assets/guardian-weapon-${index + 1}.png`,
      source: 'docs/visual-audit/hero/guardian-manifest.json',
      rights: '本项目内置 image_gen 制作，2026-11-10', approved: true,
    }),
    source: index === 0 ? 'docs/visual-audit/hero/reference-studies/hero-study-02.png'
      : `docs/visual-audit/hero/weapon-variants/hero-back-${index + 1}.png`,
    muzzle: Object.freeze({x, y}),
    barrelRear: Object.freeze({x: rearX, y: rearY}),
    rotation: -Math.atan2(x - rearX, rearY - y),
    frame: Object.freeze({x: -x * scale, y: -y * scale, width: 1536 * scale, height: 1024 * scale}),
  });
}));
export function heroVariant(level: number) {
  return HERO_VARIANTS[Math.max(0, Math.min(6, Math.floor(level) - 1))] ?? HERO_VARIANTS[0];
}
export function heroVariantForPath(path: string) {
  return HERO_VARIANTS.find(variant => variant.art.path === path);
}
