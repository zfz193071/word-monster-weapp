import type { SpriteAsset } from './canvas-scene';

export const TEXTURED_APPLE_ZOMBIE: SpriteAsset = {
  path: '/assets/images/fortress/zombie-apple-textured.png',
  source: 'docs/visual-audit/enemies/textured/apple-zombie-source.png',
  rights: '项目内置 image_gen 生成，2026-11-10；整体视觉及设备验收待完成',
  approved: true,
};

/** Split below the shorts; the torso overlaps the moving leg roots. */
export function drawTexturedZombie(
  c: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  image: WechatMiniprogram.Image, stride: number,
): void {
  c.fillStyle = 'rgba(37,62,56,.16)';
  c.beginPath(); c.ellipse(0, 69, 40, 7, 0, 0, Math.PI * 2); c.fill();
  for (const side of [-1, 1]) {
    const x = side < 0 ? 0 : 128;
    c.save(); c.translate(side * 20, 38); c.rotate(side * stride * .08);
    c.drawImage(image, x, 232, 128, 88, -64 + x / 2 - side * 20, -2, 64, 44);
    c.restore();
  }
  c.drawImage(image, 0, 0, 256, 236, -64, -80 - Math.abs(stride), 128, 118);
}
