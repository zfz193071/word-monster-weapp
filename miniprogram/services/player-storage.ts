// A write-ahead journal keeps pet upgrades and coin payments recoverable together.
export interface PlayerStorage { getStorageSync(key: string): unknown; setStorageSync(key: string, value: unknown): void }
export const PLAYER_TRANSACTION_KEY = 'word-monster:player-transaction:v1';
const keys = ['word-monster:coin-wallet:v1', 'word-monster:pets:v1'];
export function createPlayerStorage(raw: PlayerStorage) {
  let staged: Map<string, unknown> | undefined;
  function recover() {
    const pending = raw.getStorageSync(PLAYER_TRANSACTION_KEY);
    if (pending === '' || pending === undefined || pending === null) return;
    if (!Array.isArray(pending) || pending.length !== 2 || pending.some((entry, i) => !entry || entry.key !== keys[i] || !entry.value || entry.value.version !== 1)) throw new Error('宠物升级记录暂时无法读取');
    for (const entry of pending) raw.setStorageSync(entry.key, entry.value);
    raw.setStorageSync(PLAYER_TRANSACTION_KEY, null);
  }
  return {
    getStorageSync(key: string): unknown { if (!staged) recover(); return staged?.has(key) ? staged.get(key) : raw.getStorageSync(key); },
    setStorageSync(key: string, value: unknown) {
      if (staged) { if (!keys.includes(key)) throw new Error('升级存档类型无效'); staged.set(key, value); }
      else { recover(); raw.setStorageSync(key, value); }
    },
    transaction<T>(action: () => T): T {
      if (staged) throw new Error('升级正在保存');
      recover(); staged = new Map();
      let result: T; let writes: Map<string, unknown>;
      try { result = action(); writes = staged; } finally { staged = undefined; }
      if (writes.size) {
        if (writes.size !== 2) throw new Error('升级存档不完整');
        raw.setStorageSync(PLAYER_TRANSACTION_KEY, keys.map(key => ({key, value:writes.get(key)})));
        recover();
      }
      return result;
    },
  };
}
export const playerStorage = createPlayerStorage({getStorageSync:key=>wx.getStorageSync(key),setStorageSync:(key,value)=>wx.setStorageSync(key,value)});
