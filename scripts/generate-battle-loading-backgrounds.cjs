// Static covers match drawBattleBackground's eight Canvas battle palettes.
// Run: node scripts/generate-battle-loading-backgrounds.cjs
const fs = require('node:fs');
const { Resvg } = require('@resvg/resvg-js');

const palettes = [
  ['#a1b777', '#c6c397', '#ded8b3', '#789858'],
  ['#c6badb', '#e4d8e8', '#f5edf4', '#9982bc'],
  ['#769f88', '#b9c7a1', '#d9dfbd', '#4e8067'],
  ['#aec9cc', '#d7d6bd', '#eeead6', '#698e9e'],
  ['#cbb29b', '#e3d1b8', '#f4e7cf', '#a67d66'],
  ['#d6b6a6', '#eedbc3', '#fff0db', '#b47e72'],
  ['#89b6ca', '#c4dce0', '#e4f3ef', '#648fae'],
  ['#b1cbbd', '#dbe5d1', '#f0f4df', '#7b9d98'],
];
const rect = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const circle = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const line = (x1, y1, x2, y2, stroke, width = 2) => `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
function scenery(level, ground, accent) {
  if (level === 1 || level === 3) return rect(-3, 0, 6, 26, accent) + circle(0, -5, 19, accent) + circle(6, -12, 12, ground) + (level === 1 ? circle(-8, -8, 4, '#e9a269') + circle(8, 0, 4, '#e8cf78') : '');
  if (level === 2) return Array.from({length: 5}, (_, petal) => circle(Math.cos(petal * Math.PI * 2 / 5) * 10, Math.sin(petal * Math.PI * 2 / 5) * 10, 7, ['#d999a0','#e7c577','#89bba7','#92b6db','#b69cd4'][petal])).join('') + circle(0, 0, 5, '#fff1bd');
  if (level === 4) return rect(-13, -18, 26, 36, accent) + rect(-9, -14, 18, 28, '#f5edcb') + rect(-1, -14, 2, 28, accent);
  if (level === 5) return rect(-16, -18, 32, 36, accent) + rect(-12, -14, 24, 28, '#ecd8b5') + rect(-1, -14, 2, 28, accent) + rect(-12, -1, 24, 2, accent);
  if (level === 6) return rect(-14, -10, 28, 26, accent) + rect(-17, -15, 34, 9, '#f7dfb7') + rect(-2, -15, 4, 41, '#d29786');
  if (level === 7) return `<ellipse cx="0" cy="0" rx="18" ry="30" fill="${accent}"/>` + line(-10,-5,10,-5,'#cae8ee') + line(-7,6,7,6,'#cae8ee');
  return rect(-14,-3,28,6,accent) + rect(-17,-12,7,24,accent) + rect(10,-12,7,24,accent);
}
const output = 'miniprogram/assets/images/battle-backgrounds';
fs.mkdirSync(output, { recursive: true });
for (let level = 1; level <= palettes.length; level++) {
  const [ground, road, seam, accent] = palettes[level-1];
  let art = rect(0,0,360,560,ground);
  art += `<path d="M48 0 L312 0 L326 480 L30 480 Z" fill="${road}"/>`;
  for (let row = 0; row < 8; row++) {
    const y = row * 64;
    art += line(48,y,312,y,seam);
    for (let col = 0; col < 4; col++) {
      const x = 65 + col * 66 + row % 2 * 12;
      art += line(x,y,x-2,y+64,seam);
    }
  }
  for (let side = 0; side < 2; side++) for (let i = 0; i < 6; i++) {
    const x = side ? 346 : 14;
    const rotate = level === 4 ? ` rotate(${side ? -6.875 : 6.875})` : '';
    art += `<g transform="translate(${x} ${32+i*78})${rotate}">${scenery(level,ground,accent)}</g>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="560" viewBox="0 0 360 560">${art}</svg>`;
  fs.writeFileSync(`${output}/level-${level}.png`, new Resvg(svg, {font:{loadSystemFonts:false}}).render().asPng());
}
