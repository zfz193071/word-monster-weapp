import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { caseNumber, recordResult, validateCheckpoint } from '../scripts/check-balance-matrix.mjs';

const empty = () => ({version: 1, seed: 41, sourceHash: 'source', results: [], completedCases: [], pendingCases: Array.from({length: 64}, (_, i) => i + 1)});
const sample = (levelId = 1) => ({seed: 41, difficulty: 'easy', width: 360, levelId, status: 'cleared', combatSeconds: 100, hp: 1000, maxHp: 1000, alive: 0, remaining: 0, contributions: {soldier: 12}, soldierContributions: {one: {damage: 12}}});

test('matrix checkpoint preserves completed cases in order and resumes only missing cases', () => {
  const report = recordResult(recordResult(empty(), sample(3)), sample());
  assert.deepEqual(report.completedCases, [1, 3]);
  assert.equal(report.pendingCases.length, 62);
  assert.equal(report.pendingCases[0], 2);
  assert.deepEqual(validateCheckpoint(JSON.parse(JSON.stringify(report)), 41, 'source'), report);
  assert.equal(caseNumber({...sample(8), difficulty: 'nightmare', width: 990}), 64);
});
test('matrix checkpoint refuses different code, seed, duplicate or corrupted case lists', () => {
  const report = recordResult(empty(), sample());
  assert.throws(() => validateCheckpoint(report, 42, 'source'), /mismatch/);
  assert.throws(() => validateCheckpoint(report, 41, 'changed'), /mismatch/);
  assert.throws(() => recordResult(report, sample()), /Duplicate/);
  assert.throws(() => validateCheckpoint({...report, pendingCases: []}, 41, 'source'), /case lists/);
  assert.throws(() => recordResult(empty(), {...sample(), levelId: 9}), /coordinates/);
});
test('matrix checkpoint rejects timeout, premature clear and inconsistent contribution results', () => {
  assert.throws(() => recordResult(empty(), {...sample(), status: 'fighting'}), /Incomplete/);
  assert.throws(() => recordResult(empty(), {...sample(), remaining: 1}), /Premature/);
  assert.throws(() => recordResult(empty(), {...sample(), alive: 1}), /Premature/);
  assert.throws(() => recordResult(empty(), {...sample(), contributions: {soldier: 13}}), /attribution/);
  assert.throws(() => recordResult(empty(), {...sample(), seed: 42}), /seed/);
});
test('matrix checkpoint records a measured loss without calling it a clear or a harness error', () => {
  const result = {...sample(), status: 'baseDestroyed', hp: 0, alive: 8, remaining: 20};
  assert.equal(recordResult(empty(), result).results[0].status, 'baseDestroyed');
  assert.throws(() => recordResult(empty(), {...result, hp: 1}), /outcome/);
});
