import type { Point } from './types';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
type Image = WechatMiniprogram.Image;
const asset = (name: string) => Object.freeze({ path: `/guardian-assets/${name}.png`,
  source: 'docs/visual-audit/hero/parts-study/rig-manifest.json',
  rights: 'Project-generated approved guardian derivatives; built-in image_gen', approved: true });
export const GUARDIAN_BODY = asset('guardian-body');
// Measurements in the untouched 1774×887 source atlases. Missing levels retain
// their corresponding whole-body variant until their own parts are available.
const measurements = [
  [1, 1634, 103, 1514, 220, 1120, 730],
  [2, 1651, 135, 1521, 243, 1120, 730],
  [3, 1690, 108, 1570, 201, 1040, 745],
  [5, 1663, 135, 1531, 233, 1090, 740],
  [6, 1674, 130, 1538, 235, 1100, 735],
] as const;
export const GUARDIAN_RIGS = Object.freeze(measurements.map(([level, mx, my, rx, ry, ex, ey]) => Object.freeze({
  level, art: asset(`guardian-joints-${level}`),
  source: `docs/visual-audit/hero/parts-study/guardian-joints-0${level}.png`,
  muzzle: { x: mx, y: my }, barrelRear: { x: rx, y: ry }, elbow: { x: ex, y: ey },
})));
export function guardianRig(level: number) { return GUARDIAN_RIGS.find(rig => rig.level === level); }
export function guardianRigForPath(path: string) { return GUARDIAN_RIGS.find(rig => rig.art.path === path); }

/** Cosmetic joint placement only: the existing rotated combat muzzle is invariant. */
export function drawGuardianRig(c: Context, body: Image, arms: Image,
  rig: typeof GUARDIAN_RIGS[number], player: Point, direction: Point): void {
  const angle = Math.atan2(direction.x, -direction.y), flip = direction.x < 0 ? -1 : 1;
  const rotation = angle - Math.atan2(flip * (rig.muzzle.x - rig.barrelRear.x), rig.barrelRear.y - rig.muzzle.y);
  const mx = 16.8 * Math.cos(angle) + 34.4 * Math.sin(angle);
  const my = 16.8 * Math.sin(angle) - 34.4 * Math.cos(angle);
  const ex = flip * (rig.elbow.x - rig.muzzle.x) * .04, ey = (rig.elbow.y - rig.muzzle.y) * .04;
  const elbowX = mx + ex * Math.cos(rotation) - ey * Math.sin(rotation);
  const elbowY = my + ex * Math.sin(rotation) + ey * Math.cos(rotation);
  const shoulderX = flip * 6.75, shoulderY = -3;
  c.save(); c.translate(player.x, player.y);
  c.fillStyle = 'rgba(40,57,42,.2)'; c.beginPath(); c.ellipse(0, 27, 16, 3, 0, 0, Math.PI * 2); c.fill();
  // Feet remain horizontal; facing changes by reflection, never in-plane tilt.
  c.save(); c.scale(flip, 1);
  c.drawImage(body, 0, 0, body.width / 2, body.height, -42, -36.75, 66.525, 66.525);
  c.restore();
  // Join shoulder to the measured forearm root. Only the upper sleeve flexes.
  c.save(); c.translate(shoulderX, shoulderY);
  c.rotate(Math.atan2(elbowY - shoulderY, elbowX - shoulderX));
  c.drawImage(arms, arms.width * 150 / 1774, arms.height * 325 / 887,
    arms.width * 500 / 1774, arms.height * 330 / 887,
    -4, -6, Math.hypot(elbowX - shoulderX, elbowY - shoulderY) + 8, 12);
  c.restore();
  c.save(); c.translate(mx, my); c.rotate(rotation); c.scale(flip, 1);
  c.drawImage(arms, arms.width / 2, 0, arms.width / 2, arms.height,
    (887 - rig.muzzle.x) * .04, -rig.muzzle.y * .04, 887 * .04, 887 * .04);
  c.restore(); c.restore();
}
