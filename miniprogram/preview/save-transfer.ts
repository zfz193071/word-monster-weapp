export const SAVE_KEYS = [
  'word-monster:coin-wallet:v1', 'word-monster:pets:v1',
  'word-monster:daily-checkin:v1', 'word-monster:difficulty:v1',
  'word-monster:victory-rewards:v1', 'word-monster:player-transaction:v1',
] as const;
export const IMPORT_KEY = 'word-monster:preview-import:v1';
export const BACKUP_KEY = 'word-monster:preview-backup:v1';
export interface PreviewSave { id: string; entries: { key: string; value: unknown }[] }
interface Storage {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
}
export function importPreviewSave(storage: Storage, seed: PreviewSave | null, platform: string, envVersion: string) {
  if (!seed || platform === 'devtools' || envVersion !== 'develop') return false;
  if (storage.getStorageSync(IMPORT_KEY) === seed.id) return false;
  if (!seed.id || seed.entries.length !== SAVE_KEYS.length || seed.entries.some((e, i) => e.key !== SAVE_KEYS[i])) {
    throw new Error('预览存档不完整');
  }
  const original = SAVE_KEYS.map(key => ({ key, value: storage.getStorageSync(key) }));
  storage.setStorageSync(BACKUP_KEY, { id: seed.id, entries: original });
  const write = (entries: PreviewSave['entries']) => {
    for (const { key, value } of entries) {
      if (value === '' || value === null || value === undefined) storage.removeStorageSync(key);
      else storage.setStorageSync(key, value);
    }
  };
  try {
    write(seed.entries);
    storage.setStorageSync(IMPORT_KEY, seed.id);
  } catch (error) {
    write(original);
    throw error;
  }
  return true;
}
