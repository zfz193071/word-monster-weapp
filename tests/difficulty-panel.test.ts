import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('难度选择面板使用兼容 WXSS 的双列 Flex 布局', () => {
  const css = readFileSync(new URL('../miniprogram/components/difficulty-panel/difficulty-panel.wxss', import.meta.url), 'utf8');
  assert.match(css, /\.choices\s*\{[^}]*display:flex[^}]*flex-wrap:wrap[^}]*justify-content:space-between[^}]*gap:20rpx 0/);
  assert.match(css, /\.choice\s*\{[^}]*flex:0 0 calc\(50% - 10rpx\)[^}]*width:calc\(50% - 10rpx\)/);
  assert.doesNotMatch(css, /\.choices\s*\{[^}]*display:grid/);
});
