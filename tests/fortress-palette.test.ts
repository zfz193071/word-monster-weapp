import test from 'node:test';
import assert from 'node:assert/strict';
import { fortressPalette } from '../miniprogram/houses/fortress-palette';
import { drawHouseFortress } from '../miniprogram/houses/battle-art';

test('home and battle use the confirmed five-level fortress material palette', () => {
  const expected = [
    ['#805c40', '#c39b6e', '#bd8253'],
    ['#805c40', '#c39b6e', '#bd8253'],
    ['#9ab1ad', '#c5d1c6', '#d0d7c6'],
    ['#96aaa7', '#b4c6bf', '#ced5c8'],
    ['#617e87', '#78949b', '#d4b15f'],
  ];
  for (let level = 1; level <= 5; level++) {
    const palette = fortressPalette(level);
    assert.deepEqual([palette.base, palette.highlight, palette.trim], expected[level - 1]);
    const fills: string[] = [];
    const context = {
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      fillRect(_x: number, _y: number, _width: number, _height: number) { fills.push(this.fillStyle); },
      fillStyle: '',
    } as unknown as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
    drawHouseFortress(context, level, 390);
    assert.ok(fills.includes(palette.base), `battle level ${level} should draw its shared base material`);
    assert.ok(fills.includes(palette.highlight), `battle level ${level} should draw its shared highlight`);
  }
  assert.throws(() => fortressPalette(6));
});
