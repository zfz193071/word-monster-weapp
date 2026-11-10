/** Locomotion is presentation only. Phase follows world travel, not wall time. */
export type AnimalLocomotion = 'quadruped' | 'biped' | 'flying' | 'swimming';
export const ANIMAL_LOCOMOTION: Readonly<Record<string, AnimalLocomotion>> = Object.freeze({
  bear: 'quadruped', cat: 'quadruped', cow: 'quadruped', dog: 'quadruped',
  elephant: 'quadruped', horse: 'quadruped', lion: 'quadruped', panda: 'quadruped',
  rabbit: 'quadruped', sheep: 'quadruped', tiger: 'quadruped',
  chicken: 'biped', duck: 'biped', bee: 'flying', bird: 'flying', fish: 'swimming',
});
export interface FootPose { readonly travel: number; readonly lift: number }
export interface GaitPose {
  readonly feet: readonly FootPose[];
  readonly bob: number;
  readonly sway: number;
}
/** Stance moves the foot backwards relative to the body; recovery lifts it forward. */
export function footCycle(phase: number, stance: number): FootPose {
  const p = ((phase % 1) + 1) % 1;
  if (p < stance) return { travel: 1 - 2 * p / stance, lift: 0 };
  const swing = (p - stance) / (1 - stance);
  return { travel: -Math.cos(Math.PI * swing), lift: Math.sin(Math.PI * swing) };
}
export function monsterGait(y: number, seed: number): GaitPose {
  const phase = y / 18 + seed / 97;
  // Alternating support and recovery for two-footed walkers.
  const offsets = [0, .5];
  const feet = offsets.map(offset => footCycle(phase + offset, .62));
  return {
    feet,
    bob: -Math.max(...feet.map(foot => foot.lift)) * .6,
    sway: Math.sin(phase * Math.PI * 2) * .6,
  };
}
