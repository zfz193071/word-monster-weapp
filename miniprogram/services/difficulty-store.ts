import { difficultyFor } from '../fortress/difficulty';
import type { DifficultyId } from '../fortress/difficulty';
export const DIFFICULTY_KEY = 'word-monster:difficulty:v1';
interface Storage { getStorageSync(key: string): unknown; setStorageSync(key: string, value: unknown): void }
export function createDifficultyStore(storage: Storage) {
  return {
    read(): DifficultyId {
      const raw = storage.getStorageSync(DIFFICULTY_KEY);
      if (raw === '' || raw === undefined || raw === null) return 'normal';
      difficultyFor(raw as DifficultyId);
      return raw as DifficultyId;
    },
    save(id: DifficultyId) { difficultyFor(id); storage.setStorageSync(DIFFICULTY_KEY, id); },
  };
}
export const difficultyStore = createDifficultyStore({
  getStorageSync: key => wx.getStorageSync(key),
  setStorageSync: (key, value) => wx.setStorageSync(key, value),
});
