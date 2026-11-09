import test from 'node:test';
import assert from 'node:assert/strict';
import { importPreviewSave, SAVE_KEYS, IMPORT_KEY, BACKUP_KEY } from '../miniprogram/preview/save-transfer';
function fixture() {
  const data = new Map<string, unknown>([[SAVE_KEYS[0], {balance: 20}], [SAVE_KEYS[1], {old: true}]]);
  const storage = { getStorageSync: (k: string) => data.get(k) ?? '', setStorageSync: (k: string, v: unknown) => {data.set(k,v);}, removeStorageSync: (k: string) => {data.delete(k);} };
  const seed = {id:'test-save',entries:SAVE_KEYS.map((key,i)=>({key,value:i===0?{balance:325696,weaponLevel:7,completedLevels:[1,2]}:''}))};
  return {data,storage,seed};
}
test('手机覆盖完整存档、清除源端不存在的数据，保存旧档且只导入一次',()=>{
  const {data,storage,seed}=fixture();
  assert.equal(importPreviewSave(storage,seed,'ios','develop'),true);
  assert.deepEqual(data.get(SAVE_KEYS[0]),seed.entries[0].value);
  assert.equal(data.has(SAVE_KEYS[1]),false);
  assert.ok(data.get(BACKUP_KEY));
  data.set(SAVE_KEYS[0],{balance:123});
  assert.equal(importPreviewSave(storage,seed,'ios','develop'),false);
  assert.deepEqual(data.get(SAVE_KEYS[0]),{balance:123});
  assert.equal(importPreviewSave(storage,{...seed,id:'new-save'},'ios','develop'),true);
});
test('模拟器、体验版和正式版不导入',()=>{
  for (const [platform,env] of [['devtools','develop'],['ios','trial'],['android','release']]) {
    const {storage,seed,data}=fixture();
    assert.equal(importPreviewSave(storage,seed,platform,env),false);
    assert.deepEqual(data.get(SAVE_KEYS[0]),{balance:20});
  }
});
test('写入失败恢复旧存档，不标记成功，允许重试',()=>{
  const {storage,seed,data}=fixture(); const write=storage.setStorageSync; let failed=false;
  storage.setStorageSync=(k,v)=>{if(k===IMPORT_KEY&&!failed){failed=true;throw Error('disk');}write(k,v);};
  assert.throws(()=>importPreviewSave(storage,seed,'android','develop'),/disk/);
  assert.deepEqual(data.get(SAVE_KEYS[0]),{balance:20});
  assert.deepEqual(data.get(SAVE_KEYS[1]),{old:true});
  assert.equal(data.has(IMPORT_KEY),false);
  assert.equal(importPreviewSave(storage,seed,'android','develop'),true);
});
test('缺失存档条目时拒绝覆盖',()=>{
  const {storage,seed,data}=fixture(); seed.entries.pop();
  assert.throws(()=>importPreviewSave(storage,seed,'ios','develop'),/不完整/);
  assert.deepEqual(data.get(SAVE_KEYS[0]),{balance:20});
});
