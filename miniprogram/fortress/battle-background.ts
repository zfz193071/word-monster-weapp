type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
// First approved scene direction; the remaining themed levels retain their assets.
export const COURTYARD_ASSET = {
  path: '/battlefield-assets/courtyard-v1.jpg',
  source: 'image_gen; battlefield-overhaul/courtyard-source-01.png',
  rights: 'Project-generated artwork', approved: true,
} as const;
export function courtyardAsset(levelId = 1): typeof COURTYARD_ASSET | undefined {
  return levelId === 1 ? COURTYARD_ASSET : undefined;
}
export function drawCourtyard(c: Context, image: WechatMiniprogram.Image, width: number): void {
  // Cover without stretching; center crop varies with viewport, never combat coordinates.
  const scale = Math.max(width / image.width, 560 / image.height);
  const sourceWidth = width / scale, sourceHeight = 560 / scale;
  c.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2,
    sourceWidth, sourceHeight, 0, 0, width, 560);
}
// Original open courtyard; edge decoration does not imply a narrow fighting lane.
const palettes = [
  ['#a1b777', '#c6c397', '#ded8b3', '#789858'], // orchard
  ['#c6badb', '#e4d8e8', '#f5edf4', '#9982bc'], // colour garden
  ['#769f88', '#b9c7a1', '#d9dfbd', '#4e8067'], // woodland
  ['#aec9cc', '#d7d6bd', '#eeead6', '#698e9e'], // school courtyard
  ['#cbb29b', '#e3d1b8', '#f4e7cf', '#a67d66'], // home terrace
  ['#d6b6a6', '#eedbc3', '#fff0db', '#b47e72'], // town square
  ['#89b6ca', '#c4dce0', '#e4f3ef', '#648fae'], // lakeside
  ['#b1cbbd', '#dbe5d1', '#f0f4df', '#7b9d98'], // exercise garden
] as const;
export function battleBackgroundColor(levelId = 1): string {
  return (palettes[levelId - 1] ?? palettes[0])[0];
}
export function battleBackgroundCover(levelId = 1): string {
  const id = Number.isInteger(levelId) && levelId >= 1 && levelId <= palettes.length ? levelId : 1;
  return `/assets/images/battle-backgrounds/level-${id}.png`;
}
export function drawBattleBackground(c: Context, levelId = 1, width = 360): void {
  const [ground, road, line, accent] = palettes[levelId - 1] ?? palettes[0];
  c.fillStyle = road; c.fillRect(0, 0, width, 560);
  // Broad, softly bevelled paving replaces the high-contrast central corridor.
  for (let row = 0; row < 9; row++) for (let col = -1; col < Math.ceil(width / 72); col++) {
    const x = col * 72 + (row % 2) * 36; const y = row * 60;
    c.fillStyle = (row + col) % 3 === 0 ? 'rgba(255,251,226,.12)' : 'rgba(53,76,54,.035)';
    c.fillRect(x + 2, y + 2, 68, 56);
    c.strokeStyle = line; c.lineWidth = .8;
    c.beginPath(); c.moveTo(x + 2, y + 57); c.lineTo(x + 2, y + 2); c.lineTo(x + 69, y + 2); c.stroke();
    c.strokeStyle = 'rgba(56,76,51,.12)';
    c.beginPath(); c.moveTo(x + 3, y + 58); c.lineTo(x + 70, y + 58); c.lineTo(x + 70, y + 3); c.stroke();
  }
  const circle = (x: number, y: number, r: number, color: string) => {
    c.fillStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  };
  for (let side = 0; side < 2; side++) for (let i = 0; i < 6; i++) {
    const x = side ? width : 0; const y = 32 + i * 78;
    c.save(); c.translate(x, y); c.scale(.65, .65);
    c.fillStyle = accent; c.strokeStyle = accent; c.lineWidth = 3;
    if (levelId === 1 || levelId === 3) {
      c.fillRect(-3, 0, 6, 26); circle(0, -5, 19, accent); circle(6, -12, 12, ground);
      if (levelId === 1) { circle(-8, -8, 4, '#e9a269'); circle(8, 0, 4, '#e8cf78'); }
    } else if (levelId === 2) {
      for (let petal = 0; petal < 5; petal++) circle(Math.cos(petal * Math.PI * 2 / 5) * 10, Math.sin(petal * Math.PI * 2 / 5) * 10, 7, ['#d999a0','#e7c577','#89bba7','#92b6db','#b69cd4'][petal]);
      circle(0, 0, 5, '#fff1bd');
    } else if (levelId === 4) {
      c.rotate(side ? -.12 : .12); c.fillRect(-13, -18, 26, 36);
      c.fillStyle = '#f5edcb'; c.fillRect(-9, -14, 18, 28); c.fillStyle = accent; c.fillRect(-1, -14, 2, 28);
    } else if (levelId === 5) {
      c.fillRect(-16, -18, 32, 36); c.fillStyle = '#ecd8b5'; c.fillRect(-12, -14, 24, 28);
      c.fillStyle = accent; c.fillRect(-1, -14, 2, 28); c.fillRect(-12, -1, 24, 2);
    } else if (levelId === 6) {
      c.fillRect(-14, -10, 28, 26); c.fillStyle = '#f7dfb7'; c.fillRect(-17, -15, 34, 9);
      c.fillStyle = '#d29786'; c.fillRect(-2, -15, 4, 41);
    } else if (levelId === 7) {
      c.beginPath(); c.ellipse(0, 0, 18, 30, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#cae8ee'; c.beginPath(); c.moveTo(-10, -5); c.lineTo(10, -5); c.moveTo(-7, 6); c.lineTo(7, 6); c.stroke();
    } else {
      c.fillRect(-14, -3, 28, 6); c.fillRect(-17, -12, 7, 24); c.fillRect(10, -12, 7, 24);
    }
    c.restore();
  }
}
