import { stableBattleRandom } from '../fortress/battle-progression';
import { PET_EQUIPMENT, petStage } from '../pets/catalog';
import type { PetEquipment } from '../pets/catalog';
export const PET_STORE_KEY = 'word-monster:pets:v1';
interface PetSave { version: 1; revision: number; owned: boolean; level: number; experience: number; food: number; eggs: number; equipment: PetEquipment[]; equipped: PetEquipment[]; receipts: string[] }
interface Storage { getStorageSync(key: string): unknown; setStorageSync(key: string, value: unknown): void }
const empty = (): PetSave => ({ version: 1, revision: 0, owned: false, level: 1, experience: 0, food: 0, eggs: 0, equipment: [], equipped: [], receipts: [] });
const validCount = (value: number) => Number.isSafeInteger(value) && value >= 0;
const validGear = (value: unknown): value is PetEquipment[] => Array.isArray(value) && new Set(value).size === value.length && value.every(id => PET_EQUIPMENT.some(item => item.id === id));
export function petBossReward(monsterId: string): 'food' | 'egg' | PetEquipment {
  const roll = stableBattleRandom(`${monsterId}:pet-reward`);
  if (roll < .7) return 'food';
  if (roll >= .9) return 'egg';
  return PET_EQUIPMENT[Math.floor(stableBattleRandom(`${monsterId}:pet-equipment`) * PET_EQUIPMENT.length)].id;
}
export function createPetStore(storage: Storage) {
  function read(): PetSave {
    const raw = storage.getStorageSync(PET_STORE_KEY);
    if (raw === '' || raw === null || raw === undefined) return empty();
    const p = raw as PetSave;
    if (!p || p.version !== 1 || typeof p.owned !== 'boolean' || !validCount(p.revision) || !validCount(p.food) || !validCount(p.eggs)
      || !Number.isInteger(p.level) || p.level < 1 || p.level > 10 || !validCount(p.experience) || p.experience >= p.level * 20 || (p.level === 10 && p.experience !== 0)
      || !validGear(p.equipment) || !validGear(p.equipped) || p.equipped.some(id => !p.equipment.includes(id))
      || !Array.isArray(p.receipts) || p.receipts.some(id => typeof id !== 'string' || !id.trim()) || new Set(p.receipts).size !== p.receipts.length
      || (!p.owned && (p.level !== 1 || p.experience !== 0 || p.equipped.length > 0))) throw new Error('宠物记录暂时无法读取，请重试');
    return { ...p, equipment: [...p.equipment], equipped: [...p.equipped], receipts: [...p.receipts] };
  }
  function save(p: PetSave) {
    if (![p.food, p.eggs, p.revision + 1].every(validCount)) throw new Error('宠物物品数量超出范围');
    storage.setStorageSync(PET_STORE_KEY, { ...p, revision: p.revision + 1 });
  }
  function view() {
    const p = read();
    return { ...p, stage: petStage(p.level), required: p.level === 10 ? 0 : p.level * 20,
      equipmentItems: PET_EQUIPMENT.map(item => ({ ...item, owned: p.equipment.includes(item.id), equipped: p.equipped.includes(item.id) })) };
  }
  return {
    view,
    rewardCheckin(receipt: string) {
      if (!/^checkin:\d{4}-\d{2}-\d{2}$/.test(receipt)) throw new Error('签到标识无效');
      const p = read();
      if (p.receipts.includes(receipt)) return;
      p.food += 3; p.receipts.push(receipt); save(p);
    },
    rewardBoss(sessionId: string, monsterId: string): string {
      if (!sessionId.trim() || !monsterId.startsWith(`${sessionId}:wave:`)) throw new Error('宠物掉落标识无效');
      const p = read();
      if (p.receipts.includes(monsterId)) return '';
      let message: string;
      if (!p.owned) { p.owned = true; message = '小雷狐加入小屋！'; }
      else {
        const reward = petBossReward(monsterId);
        if (reward === 'food') { p.food += 3; message = '宠物粮 ×3'; }
        else if (reward === 'egg') { p.eggs++; message = '宠物蛋 ×1'; }
        else if (p.equipment.includes(reward)) { p.food += 3; message = '重复装备转为宠物粮 ×3'; }
        else { p.equipment.push(reward); message = `获得${PET_EQUIPMENT.find(item => item.id === reward)!.name}`; }
      }
      p.receipts.push(monsterId); save(p); return message;
    },
    feed(revision: number) {
      const p = read();
      if (p.revision !== revision || !p.owned || p.food === 0 || p.level === 10) return false;
      p.food--; p.experience += 10;
      if (p.experience >= p.level * 20) { p.experience -= p.level * 20; p.level++; }
      if (p.level === 10) p.experience = 0;
      save(p); return true;
    },
    hatch(revision: number) {
      const p = read(); if (p.revision !== revision || p.eggs === 0) return '';
      p.eggs--; const duplicate = p.owned;
      if (duplicate) p.food += 10; else p.owned = true;
      save(p); return duplicate ? '小雷狐已拥有，转为宠物粮 ×10' : '小雷狐加入小屋！';
    },
    toggleEquipment(id: string, revision: number) {
      const p = read(); const gear = p.equipment.find(item => item === id);
      if (p.revision !== revision || !p.owned || !gear) return false;
      p.equipped = p.equipped.includes(gear) ? p.equipped.filter(item => item !== gear) : [...p.equipped, gear];
      save(p); return true;
    },
  };
}
export const petStore = createPetStore({ getStorageSync: key => wx.getStorageSync(key), setStorageSync: (key, value) => wx.setStorageSync(key, value) });
export type PetView = ReturnType<ReturnType<typeof createPetStore>['view']>;
