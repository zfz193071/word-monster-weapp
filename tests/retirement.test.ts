import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRetirement } from '../miniprogram/fortress/retirement';
import { stepCombat } from '../miniprogram/fortress/combat';
import { createPreviewCombat } from '../miniprogram/fortress/preview';
import type { CombatState } from '../miniprogram/fortress/types';

function cleared(word = 'apple'): CombatState {
  let state = createPreviewCombat(word, 'retire-test');
  while (state.status === 'fighting') state = stepCombat(state).state;
  assert.equal(state.status, 'cleared'); return state;
}
class Voice {
  src = ''; autoplay = false; loop = false; destroyed = false;
  handlers = new Map<string, Function>();
  onEnded = (f: Function) => { this.handlers.set('end', f); }; offEnded = () => { this.handlers.delete('end'); };
  onError = (f: Function) => { this.handlers.set('error', f); }; offError = () => { this.handlers.delete('error'); };
  onStop = (f: Function) => { this.handlers.set('stop', f); }; offStop = () => { this.handlers.delete('stop'); };
  onPause = (f: Function) => { this.handlers.set('pause', f); }; offPause = () => { this.handlers.delete('pause'); };
  play() {} stop() { this.handlers.get('stop')?.(); } destroy() { this.destroyed = true; }
  end() { this.handlers.get('end')?.(); }
}
function setup(state = cleared()) {
  const voices: Voice[] = []; const timers = new Set<() => void>(); const changes: unknown[] = []; const results: any[] = [];
  const retirement = createRetirement(state, { onChange: v => changes.push(v), onComplete: r => results.push(r),
    audio: { createContext: () => { const v = new Voice(); voices.push(v); return v; }, schedule: cb => { timers.add(cb); return () => { timers.delete(cb); }; } } });
  return { retirement, voices, timers, changes, results };
}
test('五词从已提交击败事实读词，对照图与完整上下文一致，重复 start 不重播', () => {
  for (const word of ['apple', 'banana', 'orange', 'grape', 'watermelon']) {
    const state = cleared(word); const h = setup(state); h.retirement.start(); h.retirement.start();
    assert.equal(h.voices.length, 1); assert.equal(h.voices[0].src, `/assets/audio/${word}.mp3`);
    assert.equal(h.retirement.view.fruitImagePath, `/assets/images/${word}.png`);
    assert.deepEqual(h.retirement.view.context, { ...state.context, monsterId: state.monsters[0].id, wordId: word });
    h.retirement.dispose();
  }
});
test('早结束词音仍保留 800ms 残影；250ms 淡出后只完成一次', () => {
  const h = setup(); h.retirement.start(); const ended = h.voices[0].handlers.get('end')!;
  ended(); ended(); h.retirement.advance(799); assert.equal(h.retirement.view.phase, 'playing');
  h.retirement.advance(1); assert.equal(h.retirement.view.phase, 'fading');
  h.retirement.advance(125); assert.equal(h.retirement.opacity, 0.175); assert.equal(h.results.length, 0);
  h.retirement.advance(125); h.retirement.advance(999); ended();
  assert.equal(h.retirement.opacity, 0); assert.equal(h.retirement.active, false); assert.equal(h.results.length, 1);
  assert.equal(h.results[0].audio, 'completed'); assert.equal(h.timers.size, 0);
});
test('长词音自然结束前不淡出；超时不自动跳过，继续只允许在失败后', () => {
  const h = setup(); h.retirement.start(); h.retirement.continueAfterFailure(); h.retirement.advance(2000);
  assert.equal(h.retirement.view.phase, 'playing'); assert.equal(h.results.length, 0);
  [...h.timers][0](); assert.equal(h.retirement.view.phase, 'audioError'); h.retirement.advance(9000);
  assert.equal(h.retirement.view.phase, 'audioError'); h.retirement.continueAfterFailure();
  h.retirement.advance(0); h.retirement.advance(250); assert.equal(h.results[0].audio, 'skippedAfterFailure');
});
test('失败重试与旧完成/超时竞态不推进新播放、不产生学习记录', () => {
  const h = setup(); h.retirement.start(); const stale = h.voices[0].handlers.get('end')!; const timeout = [...h.timers][0];
  timeout(); h.retirement.retry(); assert.equal(h.voices.length, 2);
  stale(); timeout(); h.retirement.advance(1000); assert.equal(h.results.length, 0); assert.equal(h.retirement.view.phase, 'playing');
  h.voices[1].end(); h.retirement.advance(0); h.retirement.advance(250); assert.equal(h.results.length, 1);
  assert.deepEqual(Object.keys(h.results[0]).sort(), ['audio', 'context']);
});
test('后台停止声音，恢复重播未结束词音；暂停冻结残影和淡出', () => {
  const h = setup(); h.retirement.start(); const stale = h.voices[0].handlers.get('end')!;
  h.retirement.advance(300); h.retirement.setPaused(true); stale(); h.retirement.advance(60000);
  assert.equal(h.voices[0].destroyed, true); assert.equal(h.timers.size, 0);
  h.retirement.setPaused(false); assert.equal(h.voices.length, 2); h.voices[1].end();
  h.retirement.advance(499); assert.equal(h.retirement.view.phase, 'playing'); h.retirement.advance(1);
  h.retirement.advance(100); const opacity = h.retirement.opacity; h.retirement.setPaused(true); h.retirement.advance(60000);
  assert.equal(h.retirement.opacity, opacity); h.retirement.setPaused(false); h.retirement.advance(150);
  assert.equal(h.results.length, 1); assert.equal(h.voices.length, 2);
});
test('未击败/基地失败不能启动退场，销毁后迟到音频与时钟均无效', () => {
  const state = cleared();
  for (const status of ['fighting', 'baseDestroyed'] as const) assert.throws(() => setup({ ...state, status }), /击败事实/);
  assert.throws(() => setup({ ...state, defeatedMonsterIds: [] }), /击败事实/);
  const h = setup(); h.retirement.start(); const late = h.voices[0].handlers.get('end')!;
  h.retirement.dispose(); late(); h.retirement.advance(9999); h.retirement.retry(); h.retirement.start();
  assert.equal(h.results.length, 0); assert.equal(h.timers.size, 0); assert.equal(h.retirement.active, false);
});
