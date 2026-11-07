const { performance } = require('node:perf_hooks');

// UI observations are not the simulation clock: brief pauses between polls may
// be invisible. Report these as observed windows, never exact active time.
function unobstructed(state) {
  return state.ready && !state.paused && !state.skillQuiz && !state.upgradeOffer
    && !state.failed && !state.completed && !state.error && !state.voiceError
    && !state.waveRequest && !state.retirement && !state.reviveOpen;
}

async function sampleWindows({ read, resolvePrompts, wait, durationMs = 8000,
  timeoutMs = 120000, now = () => performance.now() }) {
  const start = now();
  let state = await resolvePrompts();
  const before = state;
  let observedWindowMs = 0;
  let excludedWindows = 0;
  while (observedWindowMs < durationMs) {
    if (state.failed || state.completed) break;
    if (now() - start >= timeoutMs) throw Error('Speed sample exceeded wall-clock limit');
    const beforeWait = state;
    const waitStart = now();
    await wait(500);
    const waited = now() - waitStart;
    state = await read();
    if (unobstructed(beforeWait) && unobstructed(state)) observedWindowMs += waited;
    else excludedWindows++;
    if (state.skillQuiz || state.upgradeOffer) state = await resolvePrompts();
  }
  return { before, after: state, wallMs: now() - start, observedWindowMs,
    excludedWindows, complete: observedWindowMs >= durationMs };
}

module.exports = { sampleWindows };
