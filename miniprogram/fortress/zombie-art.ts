import type { GaitPose } from './monster-gait';
import type { SpriteAsset } from './canvas-scene';
import type { BossPose } from './boss-pose';

export const APPLE_ZOMBIE_PARTS: SpriteAsset = {
  path: '/character-assets/zombie-apple-torso-rig-v1.png',
  source: 'docs/visual-audit/enemies/approved-parts/apple-torso-rig-study-01.png',
  rights: '项目内置 image_gen，已批准苹果僵尸母版派生的无臂躯干；运行视觉及设备验收待完成',
  approved: true,
};

/** A separate atlas lets the walk use a shoulder pivot instead of baking two
 * static arms into the torso. It deliberately remains in character-assets
 * with the torso, so category loading and retry stay atomic. */
export const APPLE_ZOMBIE_ARMS: SpriteAsset = {
  path: '/character-assets/zombie-apple-arms-rig-v1.png',
  source: 'docs/visual-audit/enemies/approved-parts/apple-arms-rig-study-02.png',
  rights: '项目内置 image_gen，已批准苹果僵尸母版派生的双臂；运行视觉及设备验收待完成',
  approved: true,
};

export const BOSS_ZOMBIE_PARTS: Readonly<Record<'iron' | 'grand', SpriteAsset>> = {
  iron: { path: '/character-assets/zombie-iron-parts.png',
    source: 'docs/visual-audit/enemies/approved-parts/iron-parts-01.png',
    rights: '项目内置 image_gen；已批准铁桶队长母版，运行视觉待验收', approved: true },
  grand: { path: '/character-assets/zombie-grand-parts.png',
    source: 'docs/visual-audit/enemies/approved-parts/grand-parts-02.png',
    rights: '项目内置 image_gen；2026-11-11 已批准王冠盾甲母版，运行视觉待验收', approved: true },
};

export function drawBossZombieParts(
  c: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  image: WechatMiniprogram.Image, gait: GaitPose, kind: 'iron' | 'grand',
  pose: BossPose = {torsoY: 0, torsoScaleY: 1},
): void {
  const grand = kind === 'grand';
  const sx = image.width / (grand ? 1774 : 2048), sy = image.height / (grand ? 887 : 683);
  c.fillStyle = 'rgba(37,62,56,.16)';
  c.beginPath(); c.ellipse(0, 69, 46, 8, 0, 0, Math.PI * 2); c.fill();
  for (const [index, side] of [-1, 1].entries()) {
    const foot = gait.feet[index];
    const x = grand ? (index === 0 ? 925 : 1340) : (index === 0 ? 960 : 1600);
    c.save(); c.translate(side * 22, grand ? 30 : 28); c.rotate(side * foot.lift * .035);
    c.drawImage(image, x * sx, (grand ? 600 : 370) * sy, (grand ? 290 : 240) * sx, (grand ? 205 : 260) * sy,
      -22, 0, 44, (grand ? 42 : 46) + foot.travel * 4 - foot.lift * 7);
    c.restore();
  }
  c.drawImage(image, (grand ? 100 : 10) * sx, (grand ? 50 : 0) * sy,
    (grand ? 790 : 740) * sx, (grand ? 760 : 635) * sy,
    -64 + gait.sway, (grand ? -88 : -70) + gait.bob + pose.torsoY, 128,
    (grand ? 123 : 110) * pose.torsoScaleY);
}

/** Three separate atlas parts, calibrated in normalized 2048 × 683 atlas coordinates.
 * Legs overlap the shorts behind the torso; all offsets are presentation only.
 */
export function drawAppleZombieParts(
  c: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  image: WechatMiniprogram.Image, arms: WechatMiniprogram.Image, gait: GaitPose,
): void {
  const sx = image.width / 2048, sy = image.height / 683;
  c.fillStyle = 'rgba(37,62,56,.16)';
  c.beginPath(); c.ellipse(0, 69, 40, 7, 0, 0, Math.PI * 2); c.fill();
  for (const [index, side] of [-1, 1].entries()) {
    const foot = gait.feet[index];
    c.save(); c.translate(side * 18, 27); c.rotate(side * foot.lift * .045);
    c.drawImage(image, (index === 0 ? 920 : 1610) * sx, 355 * sy, 195 * sx, 235 * sy,
      -20, 0, 40, 48 + foot.travel * 4 - foot.lift * 8);
    c.restore();
  }
  c.drawImage(image, 90 * sx, 0, 530 * sx, 645 * sy,
    -53 + gait.sway, -80 + gait.bob, 106, 129);
  const armSx = arms.width / 2048, armSy = arms.height / 683;
  for (const [index, side] of [-1, 1].entries()) {
    const foot = gait.feet[index];
    // The source arm runs sleeve → hand from left to right. Mirroring it on
    // the left keeps each sleeve rooted at the shoulder while the free hand
    // swings in opposition to that side's planted foot.
    // Overlap the shirt edge slightly. The alpha edge of the generated sleeve
    // begins a few pixels into its crop, so a nominal ±42 shoulder placement
    // left a visible seam at actual battle size.
    c.save(); c.translate(side * 33, -5 + gait.bob); c.scale(side, 1);
    c.rotate((foot.travel * .11 - foot.lift * .05) * side);
    c.drawImage(arms, 320 * armSx, 270 * armSy, 650 * armSx, 300 * armSy,
      0, -8, 62, 39);
    c.restore();
  }
}

export const TEXTURED_APPLE_ZOMBIE: SpriteAsset = {
  path: '/character-assets/zombie-apple-textured.png',
  source: 'docs/visual-audit/enemies/textured/apple-zombie-source.png',
  rights: '项目内置 image_gen 生成，2026-11-10；整体视觉及设备验收待完成',
  approved: true,
};

/** Split below the shorts; the torso overlaps the moving leg roots. */
export function drawTexturedZombie(
  c: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  image: WechatMiniprogram.Image, gait: GaitPose,
): void {
  c.fillStyle = 'rgba(37,62,56,.16)';
  c.beginPath(); c.ellipse(0, 69, 40, 7, 0, 0, Math.PI * 2); c.fill();
  for (const side of [-1, 1]) {
    const x = side < 0 ? 0 : 128;
    const foot = gait.feet[side < 0 ? 0 : 1];
    c.save(); c.translate(side * 20, 36);
    // Keep the hip attached; flex/compress the leg during swing and extend in stance.
    c.rotate(side * foot.lift * .045);
    c.drawImage(image, x, 232, 128, 88, -64 + x / 2 - side * 20, 0, 64, 44 + foot.travel * 5 - foot.lift * 9);
    c.restore();
  }
  c.drawImage(image, 0, 0, 256, 236, -64 + gait.sway, -80 + gait.bob, 128, 118);
}
