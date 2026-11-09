import { houseForLevel } from './catalog';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;

/** Front elevation of the home's materials, within the existing battle defense strip. */
export function drawHouseFortress(c: Context, level: number, width: number): void {
  houseForLevel(level);
  c.save();
  c.beginPath(); c.rect(0, 480, width, 80); c.clip();
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color; c.fillRect(x, y, w, h);
  };
  rect(0, 480, width, 80, '#526867');
  rect(0, 488, width, 72, level < 3 ? '#805c40' : '#718c8c');
  if (level <= 2) {
    for (let y = 496; y < 560; y += 14) {
      rect(0, y, width, 12, '#c39b6e');
      rect(0, y, width, 2, '#e2c599');
      for (let x = (y % 28 ? 0 : 42); x < width; x += 84) rect(x, y, 2, 12, '#ad8157');
    }
    rect(0, 480, width, 8, '#bd8253');
    rect(0, 488, width, 6, '#9b6949');
    if (level === 2) {
      for (let x = 10; x < width; x += 72) {
        rect(x, 492, 10, 68, '#805c40');
        rect(x, 492, 2, 68, '#ad8157');
        for (const y of [501, 547]) rect(x + 4, y, 3, 3, '#e1bc69');
      }
      rect(0, 550, width, 7, '#805c40');
    }
  } else {
    for (let row = 0; row < 4; row++) {
      for (let x = row % 2 ? -24 : 0; x < width; x += 48) {
        rect(x + 1, 498 + row * 16, 46, 14, row % 2 ? '#b0c2bb' : '#9ab1ad');
        rect(x + 2, 498 + row * 16, 44, 2, '#c5d1c6');
      }
    }
    rect(0, 490, width, 7, '#d0d7c6');
    if (level >= 4) {
      for (let x = 0; x < width; x += 36) {
        rect(x, 480, 22, 13, '#9caaa5');
        rect(x, 480, 22, 3, '#ced5c8');
      }
      // Repeat native-size towers rather than stretching on tablet battlefields.
      for (let x = 12; x < width; x += 144) {
        rect(x, 490, 30, 70, level === 5 ? '#617e87' : '#96aaa7');
        rect(x + 3, 494, 3, 66, '#b4c6bf');
        rect(x - 3, 487, 36, 7, '#ced5c8');
        for (const offset of [-3, 23]) rect(x + offset, 480, 10, 8, level === 5 ? '#d0ad61' : '#a4b7af');
        rect(x + 12, 507, 6, 17, '#435d60');
      }
    }
    if (level === 5) {
      for (let x = 52; x < width; x += 72) {
        rect(x, 500, 25, 55, '#597582');
        rect(x + 2, 502, 3, 51, '#78949b');
        for (const y of [505, 526, 547]) rect(x + 10, y, 5, 4, '#e1bc69');
      }
      rect(0, 494, width, 3, '#d4b15f');
      rect(0, 556, width, 4, '#d4b15f');
    }
  }
  c.restore();
}
