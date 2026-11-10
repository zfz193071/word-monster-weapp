import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createListening } from '../miniprogram/fortress/listening';
import { createSessionPlan, createSeededRandom } from '../miniprogram/fortress/plans';

function mountHost() {
  let definition: any;
  const voices: { end(): void; fail(): void }[] = [];
  const source = readFileSync(new URL('../miniprogram/components/fortress-choice/fortress-choice.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports: {}, Component(value: any) { definition = value; },
    require(name: string) {
      if (name === '../../services/quiz-feedback') return { createQuizFeedback() { throw Error('Not a skill quiz'); } };
      if (name !== '../../fortress/listening') throw Error(name);
      return { createListening(options: Parameters<typeof createListening>[0]) {
        return createListening({ ...options, random: createSeededRandom(7), audio: {
          schedule: () => () => {},
          createContext: () => {
            let ended = () => {}; let failed = (_error: { errCode: number }) => {};
            const voice = { src: '', autoplay: false, loop: false, playbackRate: 1,
              play() {}, stop() {}, destroy() {}, onEnded(fn: () => void) { ended = fn; }, offEnded() {},
              onError(fn: (error: { errCode: number }) => void) { failed = fn; }, offError() {}, onStop() {}, offStop() {}, onPause() {}, offPause() {},
              end() { ended(); }, fail() { failed({ errCode: 10003 }); },
            };
            voices.push(voice); return voice;
          },
        } });
      } };
    },
  });
  const plan = createSessionPlan('same-question', createSeededRandom(42));
  const results: unknown[] = [];
  const host: any = {
    properties: { request: { plan, waveIndex: 0, generation: 0, variant: 'fruit' }, paused: false, musicVolume: 22 },
    data: {}, setData(value: object) { Object.assign(this.data, value); },
    triggerEvent(name: string, result: unknown) { assert.equal(name, 'startcombat'); results.push(result); },
  };
  for (const [name, fn] of Object.entries(definition.methods)) host[name] = (fn as Function).bind(host);
  definition.lifetimes.attached.call(host); definition.lifetimes.ready.call(host);
  const events = () => host.data.view.cards.map((card: { id: string }) => ({ currentTarget: { dataset: {
    mountEpoch: host.data.mountEpoch, token: host.data.view.imageToken, wordId: card.id,
  } } }));
  const choose = () => host.choose({ currentTarget: { dataset: { mountEpoch: host.data.mountEpoch, token: host.data.view.token, wordId: plan.waves[0].targetWordId } } });
  return { host, definition, voices, results, events, choose };
}

for (const lateHandler of ['imageLoaded', 'imageFailed']) test(`same-question remount ignores old ${lateHandler} events even when image tokens repeat`, () => {
  const h = mountHost();
  const old = h.events();
  const oldKeys = h.host.data.view.cards.map((card: { key: string }) => card.key);
  h.definition.properties.request.observer.call(h.host);
  const current = h.events();
  assert.equal(old[0].currentTarget.dataset.token, current[0].currentTarget.dataset.token);
  assert.notEqual(old[0].currentTarget.dataset.mountEpoch, current[0].currentTarget.dataset.mountEpoch);
  assert.ok(h.host.data.view.cards.every((card: { key: string }) => !oldKeys.includes(card.key)));
  h.voices.at(-1)!.end();
  for (const event of old) h.host[lateHandler](event);
  assert.equal(h.host.data.view.canChoose, false);
  assert.equal(h.host.data.view.imageFailed, false);
  h.choose(); assert.equal(h.results.length, 0);
  for (const event of current) h.host.imageLoaded(event);
  assert.equal(h.host.data.view.canChoose, true);
  h.choose(); h.choose(); assert.equal(h.results.length, 1);
  h.definition.lifetimes.detached.call(h.host);
  for (const event of current) { h.host.imageFailed(event); h.host.imageLoaded(event); }
  assert.equal(h.results.length, 1);
});

test('current mount failures still require retry and old retry callbacks cannot unlock the question', () => {
  const h = mountHost(); h.voices[0].end();
  const old = h.events();
  h.host.imageFailed(old[0]);
  assert.equal(h.host.data.view.imageFailed, true);
  h.host.retryImages({ currentTarget: { dataset: { mountEpoch: h.host.data.mountEpoch, token: h.host.data.view.imageToken } } });
  for (const event of old) h.host.imageLoaded(event);
  assert.equal(h.host.data.view.canChoose, false);
  for (const event of h.events()) h.host.imageLoaded(event);
  assert.equal(h.host.data.view.canChoose, true);
  h.choose(); assert.equal(h.results.length, 1);
  h.definition.lifetimes.detached.call(h.host);
});

for (const handler of ['choose', 'replay', 'changeSpeed', 'retryImages', 'retryAudio']) test(`same-question remount ignores old ${handler} taps`, () => {
  const h = mountHost();
  if (handler === 'retryAudio') h.voices.at(-1)!.fail(); else h.voices.at(-1)!.end();
  for (const event of h.events()) h.host.imageLoaded(event);
  const old = { currentTarget: { dataset: {
    mountEpoch: h.host.data.mountEpoch,
    token: handler === 'retryImages' ? h.host.data.view.imageToken : h.host.data.view.token,
    wordId: h.host.properties.request.plan.waves[0].targetWordId,
  } } };
  h.definition.properties.request.observer.call(h.host);
  if (handler === 'retryAudio') h.voices.at(-1)!.fail(); else h.voices.at(-1)!.end();
  if (handler === 'retryImages') h.host.imageFailed(h.events()[0]);
  else for (const event of h.events()) h.host.imageLoaded(event);
  const before = JSON.stringify(h.host.data.view);
  const voiceCount = h.voices.length;
  h.host[handler](old);
  assert.equal(h.results.length, 0, '旧答题事件不能启动新实例的战斗');
  assert.equal(JSON.stringify(h.host.data.view), before, '旧按钮不能改变新题状态');
  assert.equal(h.voices.length, voiceCount, '旧按钮不能打断或重播新题声音');
  const current = { currentTarget: { dataset: { ...old.currentTarget.dataset, mountEpoch: h.host.data.mountEpoch } } };
  h.host[handler](current);
  if (handler === 'choose') assert.equal(h.results.length, 1);
  if (handler === 'replay' || handler === 'retryAudio') assert.equal(h.voices.length, voiceCount + 1);
  if (handler === 'changeSpeed') assert.equal(h.host.data.view.playbackRate, 1);
  if (handler === 'retryImages') assert.equal(h.host.data.view.imageFailed, false);
  h.definition.lifetimes.detached.call(h.host);
  h.host[handler](current);
});

test('听词交互节点均携带当前挂载代次', () => {
  const markup = readFileSync(new URL('../miniprogram/components/fortress-choice/fortress-choice.wxml', import.meta.url), 'utf8');
  const buttons = markup.match(/<button\b[^>]*>/g)!;
  assert.equal(buttons.length, 5);
  for (const button of buttons) assert.match(button, /data-mount-epoch="\{\{mountEpoch\}\}"/);
});
