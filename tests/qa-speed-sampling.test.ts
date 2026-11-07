import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { sampleWindows } = createRequire(import.meta.url)('../scripts/qa-speed-sampling.cjs');

test('慢速读取不重复扣除观察窗口，耗时不会变负或阻止采样完成', async () => {
  let clock = 0;
  const state = { ready: true };
  const sample = await sampleWindows({
    now: () => clock, durationMs: 1000,
    wait: async (ms: number) => { clock += ms; },
    read: async () => { clock += 2000; return state; },
    resolvePrompts: async () => state,
  });
  assert.equal(sample.observedWindowMs, 1000);
  assert.equal(sample.wallMs, 5000);
  assert.equal(sample.complete, true);
});

test('跨入答题的窗口和答题耗时均不计入观察时长', async () => {
  let clock = 0;
  let reads = 0;
  let resolutions = 0;
  const sample = await sampleWindows({
    now: () => clock, durationMs: 1000,
    wait: async (ms: number) => { clock += ms; },
    read: async () => ({ ready: true, skillQuiz: ++reads === 1 ? {} : null }),
    resolvePrompts: async () => {
      if (++resolutions > 1) clock += 10000;
      return { ready: true };
    },
  });
  assert.equal(sample.observedWindowMs, 1000);
  assert.equal(sample.wallMs, 11500);
  assert.equal(sample.excludedWindows, 1);
});

test('战败产生不完整结果，持续未就绪会超时而非无限循环', async () => {
  let clock = 0;
  const base = { now: () => clock, wait: async (ms: number) => { clock += ms; } };
  const sample = await sampleWindows({ ...base,
    resolvePrompts: async () => ({ ready: true }),
    read: async () => ({ ready: true, failed: true }),
  });
  assert.equal(sample.complete, false);
  assert.equal(sample.observedWindowMs, 0);
  await assert.rejects(sampleWindows({ ...base, timeoutMs: 1000,
    resolvePrompts: async () => ({ ready: false }), read: async () => ({ ready: false }),
  }), /wall-clock limit/);
});
