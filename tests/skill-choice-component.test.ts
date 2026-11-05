import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {createUpgradeChoices, validateUpgradeOffer} from '../miniprogram/fortress/upgrade-choice';

test('同一技能面板保留三张卡片，第一次选中标记并禁止重复，第二次后关闭', () => {
  let definition: any;
  const source = readFileSync(new URL('../miniprogram/components/skill-choice/skill-choice.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText, {
    exports: {}, Component(value: any) {definition = value;}, require: () => ({validateUpgradeOffer}),
  });
  const choices = createUpgradeChoices();
  choices.open({id: 'group', level: 2, cards: ['doubleShot', 'fireRate', 'bulletWidth'].map(id => ({id, icon: id as 'doubleShot', label: id, description: id}))}, true);
  choices.answer('group', true);
  const selected: string[] = [];
  const host: any = {data: structuredClone(definition.data), properties: {offer: choices.current, disabled: false}, setData(patch: object) {Object.assign(this.data, patch);}, triggerEvent(_name: string, detail: any) {
    const card = choices.select(detail.offerId, detail.cardId); if (card) selected.push(card.id);
  }};
  const update = () => {host.properties.offer = choices.current; definition.properties.offer.observer.call(host);};
  const tap = (id: string) => definition.methods.choose.call(host, {currentTarget: {dataset: {offerId: host.properties.offer.id, cardId: id}}});
  update(); tap('doubleShot'); update();
  assert.equal(host.data.valid, true); assert.equal(host.data.displayCards.length, 3);
  assert.equal(host.data.displayCards[0].chosen, true); assert.equal(choices.remaining, 1);
  tap('doubleShot'); assert.deepEqual(selected, ['doubleShot']);
  tap('fireRate'); update();
  assert.deepEqual(selected, ['doubleShot', 'fireRate']); assert.equal(host.data.valid, false); assert.equal(choices.current, null);
});
