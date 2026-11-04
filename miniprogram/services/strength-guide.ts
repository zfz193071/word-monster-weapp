export type StrengthTarget = '' | 'weapon' | 'pet';
export function strengthTarget(weaponLevel: number, pet: { owned: boolean; level: number } | null): StrengthTarget {
  if (weaponLevel < 7) return 'weapon';
  return pet?.owned && pet.level < 10 ? 'pet' : '';
}
// One-shot navigation intent, independent of rewards or persistent progress.
export function createStrengthGuide() {
  let pending = false;
  return { request() { pending = true; }, consume() { const value = pending; pending = false; return value; } };
}
export const strengthGuide = createStrengthGuide();
