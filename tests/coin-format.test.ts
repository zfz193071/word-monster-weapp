import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('金币显示按万、亿、万亿缩写，不向上虚增余额', () => {
  const context = { module: { exports: {} as { format(value: number): string } } };
  runInNewContext(readFileSync('miniprogram/utils/coin-format.wxs', 'utf8'), context);
  for (const [value, expected] of [[0,'0'],[9999,'9999'],[10000,'1万'],[12500,'1.25万'],[400000,'40万'],[99999999,'9999.99万'],[100000000,'1亿'],[125000000,'1.25亿'],[1000000000000,'1万亿']] as const) {
    assert.equal(context.module.exports.format(value), expected);
  }
});
