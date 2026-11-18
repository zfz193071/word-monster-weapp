import type { Point } from './types';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
type Image = WechatMiniprogram.Image;
const asset = (name: string) => Object.freeze({ path: `/guardian-assets/${name}.png`,
  source: 'docs/visual-audit/hero/parts-study/rig-manifest.json',
  rights: 'Project-generated approved guardian derivatives; built-in image_gen', approved: true });
export const GUARDIAN_BODY = asset('guardian-body');
// Measurements in the untouched 1774×887 source atlases.
const measurements = [
  [1, 1634, 103, 1514, 220, 1120, 730],
  [2, 1651, 135, 1521, 243, 1120, 730],
  [3, 1690, 108, 1570, 201, 1040, 745],
  [4, 1660, 105, 1510, 230, 1090, 740],
  [5, 1663, 135, 1531, 233, 1090, 740],
  [6, 1674, 130, 1538, 235, 1100, 735],
  [7, 1660, 105, 1510, 230, 1090, 740],
] as const;
export const GUARDIAN_RIGS = Object.freeze(measurements.map(([level, mx, my, rx, ry, ex, ey]) => Object.freeze({
  level, art: asset(`guardian-joints-${level}`),
  source: `docs/visual-audit/hero/parts-study/guardian-joints-0${level}.png`,
  muzzle: { x: mx, y: my }, barrelRear: { x: rx, y: ry }, elbow: { x: ex, y: ey },
})));
export function guardianRig(level: number) { return GUARDIAN_RIGS.find(rig => rig.level === level); }
export function guardianRigForPath(path: string) { return GUARDIAN_RIGS.find(rig => rig.art.path === path); }

const RECOIL_HOLD_MS = 10, RECOIL_PEAK_MS = 30, RECOIL_END_MS = 120, RECOIL_DISTANCE = 2.4;
/** Cosmetic recoil derived only from the existing logical shot timer. */
export function guardianRecoil(shotRemainingMs: number, intervalMs: number, hasFired: boolean): number {
  if (!hasFired || !Number.isFinite(shotRemainingMs) || !Number.isFinite(intervalMs) || intervalMs <= 0) return 0;
  const age = intervalMs - shotRemainingMs;
  if (age <= RECOIL_HOLD_MS || age >= RECOIL_END_MS) return 0;
  if (age < RECOIL_PEAK_MS) return RECOIL_DISTANCE * (age - RECOIL_HOLD_MS) / (RECOIL_PEAK_MS - RECOIL_HOLD_MS);
  const settle = (RECOIL_END_MS - age) / (RECOIL_END_MS - RECOIL_PEAK_MS);
  return RECOIL_DISTANCE * settle * settle;
}

/** Short muzzle flash for every approved hero variant; no particle state. */
export function guardianMuzzleFlash(shotRemainingMs: number, intervalMs: number, hasFired: boolean): number {
  if (!hasFired || !Number.isFinite(shotRemainingMs) || !Number.isFinite(intervalMs) || intervalMs <= 0) return 0;
  const age = intervalMs - shotRemainingMs;
  return age >= 0 && age < 50 ? Math.min(1, (50 - age) / 40) : 0;
}

export function guardianMuzzle(player: Point, direction: Point, facing = direction.x < 0 ? -1 : 1, recoil = 0): Point {
  return {x: player.x - direction.y * 8 * facing + direction.x * (30 - recoil),
    y: player.y + direction.x * 8 * facing + direction.y * (30 - recoil)};
}

/** Compact arms matched to the rear body; muzzle matches the combat origin. */
export function drawGuardianRig(c: Context, body: Image, arms: Image,
  rig: typeof GUARDIAN_RIGS[number], player: Point, direction: Point, recoil = 0, facing = direction.x < 0 ? -1 : 1): void {
  const angle = Math.atan2(direction.x, -direction.y), flip = facing;
  const rotation = angle - Math.atan2(flip * (rig.muzzle.x - rig.barrelRear.x), rig.barrelRear.y - rig.muzzle.y);
  // Pull the complete forearm assembly back along the barrel. The first 10ms
  // frame remains on the logical muzzle; later frames show the visible kick.
  const {x: mx, y: my} = guardianMuzzle({x:0,y:0}, direction, flip, recoil);
  const ex = flip * (rig.elbow.x - rig.muzzle.x) * .028, ey = (rig.elbow.y - rig.muzzle.y) * .028;
  const elbowX = mx + ex * Math.cos(rotation) - ey * Math.sin(rotation);
  const elbowY = my + ex * Math.sin(rotation) + ey * Math.cos(rotation);
  const shoulderX = flip * 6, shoulderY = -3;
  c.save(); c.translate(player.x, player.y);
  c.fillStyle = 'rgba(40,57,42,.2)'; c.beginPath(); c.ellipse(0, 27, 16, 3, 0, 0, Math.PI * 2); c.fill();
  // Feet remain horizontal; facing changes by reflection, never in-plane tilt.
  c.save(); c.scale(flip, 1);
  // The rear three-quarter body is a full figure layer, not the left half of
  // the previous two-part atlas. Keep the planted boots at the same baseline;
  // the articulated seven-level arms and rifle remain drawn above it.
  c.drawImage(body, -29, -36, 58, 68);
  c.restore();
  // Join shoulder to the measured forearm root. Only the upper sleeve flexes.
  c.save(); c.translate(shoulderX, shoulderY);
  // Map the measured sleeve shoulder (230,420) and cuff (600,500)
  // to the body socket and forearm elbow, including the sleeve's own tilt.
  const sleeveLength = Math.hypot(elbowX - shoulderX, elbowY - shoulderY);
  c.rotate(Math.atan2(elbowY - shoulderY, elbowX - shoulderX));
  c.scale(sleeveLength / Math.hypot(370,80), .028 * flip);
  c.rotate(-Math.atan2(80, 370));
  c.drawImage(arms, arms.width * 150 / 1774, arms.height * 325 / 887,
    arms.width * 500 / 1774, arms.height * 330 / 887,
    -80, -95, 500, 330);
  c.restore();
  c.save(); c.translate(mx, my); c.rotate(rotation); c.scale(flip, 1);
  c.drawImage(arms, arms.width / 2, 0, arms.width / 2, arms.height,
    (887 - rig.muzzle.x) * .028, -rig.muzzle.y * .028, 887 * .028, 887 * .028);
  c.restore(); c.restore();
}
