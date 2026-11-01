import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFortressEntryStore } from '../miniprogram/services/fortress-entry';
import { createFruitOptions } from '../miniprogram/fortress/fruit-options';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import { FORTRESS_WORD_IDS } from '../miniprogram/fortress/rules';
import type { ListeningResult } from '../miniprogram/fortress/listening';

test('五词多种子连续换图：三选一、保留目标且两个干扰项均更换', () => {
  for (const target of FORTRESS_WORD_IDS) for (let seed = 0; seed < 50; seed++) {
    const random = createSeededRandom(seed); let previous: readonly string[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const next = createFruitOptions(target, previous, random);
      assert.equal(next.length, 3); assert.equal(new Set(next).size, 3); assert.ok(next.includes(target));
      if (previous.length) assert.deepEqual(next.filter(id => previous.includes(id)), [target]);
      previous = next;
    }
  }
});

test('只有当前听词的正确结果能交接，跨局/错误/重复领取均拒绝', () => {
  const store = createFortressEntryStore(); const request = store.start(10); const wave = request.plan.waves[0];
  const result: ListeningResult = { context: { sessionId: request.plan.sessionId, waveId: wave.waveId, generation: request.generation },
    attempts: [{ sessionId: request.plan.sessionId, waveId: wave.waveId, targetWordId: wave.targetWordId, selectedWordId: wave.targetWordId,
      correct: true, taskKind: 'listeningChoice', attemptIndex: 1, replayCount: 0, hintUsed: false }] };
  assert.equal(store.claim(request.plan.sessionId), undefined);
  assert.equal(store.complete({ ...result, attempts: [] }), false);
  assert.equal(store.complete({ ...result, context: { ...result.context, generation: 99 } }), false);
  assert.equal(store.complete({ ...result, attempts: [{ ...result.attempts[0], correct: false }] }), false);
  assert.equal(store.complete(result), true); assert.equal(store.complete(result), false);
  assert.equal(store.claim('foreign'), undefined); assert.equal(store.claim(request.plan.sessionId)?.request, request);
  assert.equal(store.claim(request.plan.sessionId), undefined);
  const next = store.start(10); assert.notEqual(next.plan.sessionId, request.plan.sessionId);
  store.release(request.plan.sessionId); assert.equal(store.complete(result), false);
});
