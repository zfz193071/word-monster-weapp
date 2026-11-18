import { houseForLevel } from './catalog';
import { fortressPalette } from './fortress-palette';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;

/** Front elevation of the home's materials, within the existing battle defense strip. */
export function drawHouseFortress(c: Context, level: number, width: number): void {
  houseForLevel(level);
  const palette = fortressPalette(level);
  c.save();
  c.beginPath(); c.rect(0, 480, width, 80); c.clip();
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color; c.fillRect(x, y, w, h);
  };
  rect(0, 480, width, 80, palette.shadow);
  rect(0, 488, width, 72, palette.base);
  if (level <= 2) {
    for (let y = 496; y < 560; y += 14) {
      rect(0, y, width, 12, palette.highlight);
      rect(0, y, width, 2, '#e2c599');
      for (let x = (y % 28 ? 0 : 42); x < width; x += 84) rect(x, y, 2, 12, palette.reinforcement);
    }
    rect(0, 480, width, 8, palette.trim);
    rect(0, 488, width, 6, '#9b6949');
    if (level === 2) {
      for (let x = 10; x < width; x += 72) {
        rect(x, 492, 10, 68, palette.shadow);
        rect(x, 492, 2, 68, palette.reinforcement);
        for (const y of [501, 547]) rect(x + 4, y, 3, 3, '#e1bc69');
      }
      rect(0, 550, width, 7, palette.shadow);
    }
  } else {
    for (let row = 0; row < 4; row++) {
      for (let x = row % 2 ? -24 : 0; x < width; x += 48) {
        rect(x + 1, 498 + row * 16, 46, 14, row % 2 ? palette.reinforcement : palette.base);
        rect(x + 2, 498 + row * 16, 44, 2, palette.highlight);
      }
    }
    rect(0, 490, width, 7, palette.trim);
    if (level >= 4) {
      for (let x = 0; x < width; x += 36) {
        rect(x, 480, 22, 13, palette.reinforcement);
        rect(x, 480, 22, 3, palette.trim);
      }
      // Repeat native-size towers rather than stretching on tablet battlefields.
      for (let x = 12; x < width; x += 144) {
        rect(x, 490, 30, 70, palette.base);
        rect(x + 3, 494, 3, 66, palette.highlight);
        rect(x - 3, 487, 36, 7, palette.trim);
        for (const offset of [-3, 23]) rect(x + offset, 480, 10, 8, palette.accent);
        rect(x + 12, 507, 6, 17, palette.shadow);
      }
    }
    if (level === 5) {
      for (let x = 52; x < width; x += 72) {
        rect(x, 500, 25, 55, palette.reinforcement);
        rect(x + 2, 502, 3, 51, palette.highlight);
        for (const y of [505, 526, 547]) rect(x + 10, y, 5, 4, '#e1bc69');
      }
      rect(0, 494, width, 3, palette.trim);
      rect(0, 556, width, 4, palette.trim);
    }
  }
  c.restore();
}
