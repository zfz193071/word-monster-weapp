import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createListening } from '../miniprogram/fortress/listening';
import { createSeededRandom, createSessionPlan } from '../miniprogram/fortress/plans';
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
function setup(id = 'listening', generation = 0) {
  const plan = createSessionPlan(id, createSeededRandom(42));
  const voices: Voice[] = []; const timers = new Set<() => void>(); const results: any[] = [];
  const controller = createListening({ plan, waveIndex: 0, generation, onChange() {}, onStartCombat: r => results.push(r),
    audio: { createContext: () => { const v = new Voice(); voices.push(v); return v; }, schedule: cb => { timers.add(cb); return () => { timers.delete(cb); }; } } });
  const target = plan.waves[0].targetWordId;
  const wrong = plan.waves[0].optionWordIds.find(id => id !== target)!;
  const load = () => { for (const card of controller.view.cards) controller.imageResult(controller.view.imageToken, card.id, true); };
  return { controller, voices, timers, results, target, wrong, load, plan };
}
test('自然听完且全部头像成功才可选，正确仅一次发出开战与 Attempt', () => {
  const h = setup(); const c = h.controller;
  c.start(); c.start(); assert.equal(h.voices.length, 1);
  assert.equal(h.voices[0].src, `/assets/audio/${h.target}.mp3`);
  c.choose(c.view.token, h.target); assert.equal(c.attempts.length, 0);
  h.voices[0].end(); assert.equal(c.view.canChoose, false);
  c.imageResult(c.view.imageToken, h.target, true); assert.equal(c.view.canChoose, false);
  h.load(); assert.equal(c.view.canChoose, true);
  assert.deepEqual(c.view.cards.map(card => card.label), ['选项 1', '选项 2']);
  assert.ok(c.view.cards.every(card => card.portraitPath.includes('/monsters/') && !card.hinted));
  const token = c.view.token;
  c.choose(token, 'unknown'); c.choose(token, h.target); c.choose(token, h.target); c.choose(c.view.token, h.wrong);
  assert.equal(h.results.length, 1); assert.equal(c.attempts.length, 1);
  assert.deepEqual(c.attempts[0], { sessionId: h.plan.sessionId, waveId: h.plan.waves[0].waveId, taskKind: 'listeningChoice', targetWordId: h.target, selectedWordId: h.target, correct: true, hintUsed: false, attemptIndex: 1, replayCount: 0 });
  assert.deepEqual(Object.keys(h.results[0]).sort(), ['attempts', 'context']);
  c.replay(c.view.token); assert.equal(h.voices.length, 1); assert.equal(h.timers.size, 0);
});
test('第一次错重播不换位，第二次错高亮，提示后正确和重播序号准确', () => {
  const h = setup(); const c = h.controller; c.start(); h.load(); h.voices[0].end();
  const order = c.view.cards.map(card => card.id); const old = c.view.token;
  c.choose(old, h.wrong); c.choose(old, h.wrong);
  assert.equal(c.attempts.length, 1); assert.equal(h.results.length, 0); assert.equal(c.view.canChoose, false);
  h.voices[1].end(); c.choose(c.view.token, h.wrong);
  assert.equal(c.view.cards.filter(card => card.hinted).length, 1);
  assert.equal(c.view.cards.find(card => card.hinted)?.id, h.target);
  h.voices[2].end(); c.replay(c.view.token); h.voices[3].end(); c.choose(c.view.token, h.target);
  assert.deepEqual(c.view.cards.map(card => card.id), order);
  assert.deepEqual(c.attempts.map(a => [a.attemptIndex, a.replayCount, a.hintUsed]), [[1,0,false],[2,1,false],[3,3,true]]);
  assert.equal(h.results.length, 1);
});
test('音频失败和超时只能重试，不计答错；旧播放回调不能解锁', () => {
  const h = setup(); const c = h.controller; c.start(); h.load();
  const stale = h.voices[0].handlers.get('end')!; const timeout = [...h.timers][0]; timeout();
  assert.equal(c.view.phase, 'audioError'); c.choose(c.view.token, h.target); c.replay(c.view.token);
  assert.equal(c.attempts.length, 0); assert.equal(h.voices.length, 1);
  c.retryAudio(c.view.token); stale(); timeout(); assert.equal(c.view.canChoose, false);
  h.voices[1].handlers.get('error')!({errCode:1,errMsg:'failed'});
  c.retryAudio(c.view.token); h.voices[2].end(); c.choose(c.view.token,h.target);
  assert.equal(h.results.length,1); assert.equal(c.attempts[0].replayCount,0);
});
test('图片失败阻止选择，重试换资源代次，旧图片事件不能解除阻塞', () => {
  const h = setup(); const c = h.controller; c.start(); h.voices[0].end();
  const old = c.view.imageToken;
  c.imageResult(old,h.target,false); c.imageResult(old,h.wrong,true);
  assert.equal(c.view.imageFailed,true); assert.equal(c.view.canChoose,false);
  c.choose(c.view.token,h.target); assert.equal(c.attempts.length,0);
  c.retryImages(old); c.imageResult(old,h.target,true); assert.equal(c.view.canChoose,false);
  h.load(); assert.equal(c.view.canChoose,true); assert.equal(c.view.imageFailed,false);
});
test('后台停止声音并冻结选择，恢复重播未结束词音，旧代次/跨局/销毁回调无效', () => {
  const h = setup(); const c = h.controller; c.start(); h.load();
  const stale = h.voices[0].handlers.get('end')!; const token = c.view.token;
  c.setPaused(true); stale(); assert.equal(h.voices[0].destroyed,true);
  c.choose(token,h.target); c.setPaused(false); assert.equal(h.voices.length,2);
  stale(); assert.equal(c.view.canChoose,false); h.voices[1].end();
  c.choose(token,h.target); assert.equal(c.attempts.length,0);
  const ready = c.view.token; c.setPaused(true); c.setPaused(false);
  assert.equal(h.voices.length,2); c.choose(ready,h.target); assert.equal(c.attempts.length,0);
  const other = setup('another'); other.controller.start(); other.load(); other.voices[0].end();
  other.controller.choose(c.view.token,other.target); assert.equal(other.results.length,0);
  const next = setup('listening',1); next.controller.start(); next.load(); next.voices[0].end();
  next.controller.choose(c.view.token,next.target); assert.equal(next.results.length,0);
  const callback = h.voices[1].handlers.get('end'); c.dispose(); callback?.();
  c.choose(c.view.token,h.target); c.start(); assert.equal(h.results.length,0); assert.equal(h.timers.size,0);
  other.controller.dispose(); next.controller.dispose();
});
