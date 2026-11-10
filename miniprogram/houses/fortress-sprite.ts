type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;

export const WOOD_FORTRESS_ASSET = {
  path: '/battlefield-assets/fortress-level-1-v1.png',
  source: 'image_gen; battlefield-overhaul/fortress/level-1-source.png',
  rights: 'Project-generated artwork', approved: true,
} as const;

/** Keep one centered gate and extend with banner bays, at the same physical scale. */
export function drawWoodFortress(c: Context, image: WechatMiniprogram.Image, width: number): void {
  const scale = 80 / image.height;
  const wallWidth = image.width * scale;
  const left = (width - wallWidth) / 2;
  const bayWidth = image.width * .32;
  const step = bayWidth * scale;
  c.save(); c.beginPath(); c.rect(0, 480, width, 80); c.clip();
  // Slight overlap joins stone piers without transparent seams; never stretch the art.
  for (let x = left - step; x + step > 0; x -= step) {
    c.drawImage(image, 0, 0, bayWidth, image.height, x, 480, step + 1, 80);
  }
  for (let x = left + wallWidth - 1; x < width; x += step) {
    c.drawImage(image, image.width - bayWidth, 0, bayWidth, image.height, x, 480, step + 1, 80);
  }
  c.drawImage(image, left, 480, wallWidth, 80);
  c.restore();
}
