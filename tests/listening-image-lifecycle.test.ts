import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createListening } from '../miniprogram/fortress/listening';
import { createSessionPlan, createSeededRandom } from '../miniprogram/fortress/plans';

function mountHost() {
  let definition: any;
  const voices: { end(): void }[] = [];
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
            let ended = () => {};
            const voice = { src: '', autoplay: false, loop: false, playbackRate: 1,
              play() {}, stop() {}, destroy() {}, onEnded(fn: () => void) { ended = fn; }, offEnded() {},
              onError() {}, offError() {}, onStop() {}, offStop() {}, onPause() {}, offPause() {},
              end() { ended(); },
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
  const choose = () => host.choose({ currentTarget: { dataset: { token: host.data.view.token, wordId: plan.waves[0].targetWordId } } });
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
  h.host.retryImages({ currentTarget: { dataset: { token: h.host.data.view.imageToken } } });
  for (const event of old) h.host.imageLoaded(event);
  assert.equal(h.host.data.view.canChoose, false);
  for (const event of h.events()) h.host.imageLoaded(event);
  assert.equal(h.host.data.view.canChoose, true);
  h.choose(); assert.equal(h.results.length, 1);
  h.definition.lifetimes.detached.call(h.host);
});
