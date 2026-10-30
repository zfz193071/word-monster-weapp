import { CONTENT_ASSETS } from '../miniprogram/content/assets';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FORTRESS_ASSETS, FORTRESS_MONSTERS, FORTRESS_WORDS } from '../miniprogram/fortress/content';
import { createSeededRandom, createSessionPlan, createSkillOffer } from '../miniprogram/fortress/plans';
import { FORTRESS_PROGRESS_KEY, FORTRESS_RULES } from '../miniprogram/fortress/rules';
import type { MonsterVisual, SessionResultV2, SkillLevels, VisualAsset } from '../miniprogram/fortress/types';
import { validateFortressContent, validateFortressRules, validateSessionPlan } from '../miniprogram/fortress/validation';

// These are explicitly test-only metadata; they are never shipped as approved art.
const monsters: readonly MonsterVisual[] = FORTRESS_WORDS.map(word => ({
  wordId: word.id, portraitPath: `/assets/images/monsters/${word.id}.png`, spritePath: `/assets/images/monsters/${word.id}.png`,
  sourceSize: { width: 256, height: 256 }, anchor: { x: 128, y: 128 }, hitbox: { x: 32, y: 32, width: 192, height: 192 },
}));
const assets: readonly VisualAsset[] = [...CONTENT_ASSETS, ...monsters.map(monster => ({
  path: monster.spritePath, wordId: monster.wordId, kind: 'image' as const,
  source: 'https://example.invalid/test-fixture', rights: 'test fixture, not production artwork', reviewStatus: 'pending' as const,
}))];
const plan = (seed = 7) => createSessionPlan('session-test', createSeededRandom(seed));
const noSkills: SkillLevels = { doubleShot: 0, fireRate: 0, bulletWidth: 0 };

test('冻结规则允许且仅允许已确认的版本、技能池、数值和边界', () => {
  assert.deepEqual(validateFortressRules(FORTRESS_RULES), []);
  for (const [section, field, value] of [
    ['base', 'maxHp', 0], ['monster', 'maxHp', -1], ['monster', 'attackIntervalMs', NaN],
    ['projectile', 'intervalMs', Infinity], ['projectile', 'damage', 2], ['arena', 'playerMaxX', 1000],
  ] as const) {
    const changed = { ...FORTRESS_RULES, [section]: { ...FORTRESS_RULES[section], [field]: value } };
    assert.ok(validateFortressRules(changed).some(issue => issue.path === `rules.${section}.${field}`));
  }
  assert.ok(validateFortressRules({ ...FORTRESS_RULES, schemaVersion: 1 }).some(issue => issue.path === 'rules.schemaVersion'));
  assert.ok(validateFortressRules({ ...FORTRESS_RULES, coinBalance: 0 }).some(issue => issue.path === 'rules.coinBalance'));
  const skills = FORTRESS_RULES.skills.map((skill, i) => i ? skill : { ...skill, values: [1, 2, 3, 99] });
  assert.ok(validateFortressRules({ ...FORTRESS_RULES, skills }).some(issue => issue.path === 'rules.skills[0].values[3]'));
  for (const value of [null, [], {}, { ...FORTRESS_RULES, skills: [] }]) assert.ok(validateFortressRules(value).length > 0);
});

test('100 个固定种子覆盖五词、正确与干扰选项、出生位置，且可重放', () => {
  const orders = new Set<string>(); const answerPositions = new Set<number>();
  for (let seed = 0; seed < 100; seed++) {
    const generated = plan(seed);
    assert.deepEqual(generated, plan(seed));
    assert.deepEqual(validateSessionPlan(generated), []);
    assert.deepEqual(generated.waves.map(w => w.targetWordId).sort(), [...FORTRESS_RULES.wordIds].sort());
    assert.equal(generated.waves.length, 5);
    orders.add(generated.waves.map(w => w.targetWordId).join(','));
    for (const wave of generated.waves) {
      answerPositions.add(wave.optionWordIds.indexOf(wave.targetWordId));
      assert.equal(wave.spawnPlan.length, 1);
      assert.equal(wave.spawnPlan[0].wordId, wave.targetWordId);
      assert.ok(wave.spawnPlan[0].position.x >= 48 && wave.spawnPlan[0].position.x <= 312);
    }
  }
  assert.ok(orders.size > 1);
  assert.deepEqual([...answerPositions].sort(), [0, 1]);
});

test('计划及嵌套实体冻结，不修改共享规则；不同新局拥有不同实体 ID', () => {
  const before = JSON.stringify(FORTRESS_RULES);
  const generated = plan();
  assert.ok(Object.isFrozen(generated)); assert.ok(Object.isFrozen(generated.waves));
  for (const wave of generated.waves) {
    assert.ok(Object.isFrozen(wave)); assert.ok(Object.isFrozen(wave.optionWordIds));
    assert.ok(Object.isFrozen(wave.spawnPlan)); assert.ok(Object.isFrozen(wave.spawnPlan[0]));
    assert.ok(Object.isFrozen(wave.spawnPlan[0].position));
  }
  const originalOption = generated.waves[0].optionWordIds[0];
  assert.equal(Reflect.set(generated.waves[0].optionWordIds, '0', 'pear'), false);
  assert.equal(generated.waves[0].optionWordIds[0], originalOption);
  assert.equal(JSON.stringify(FORTRESS_RULES), before);
  const next = createSessionPlan('another-session', createSeededRandom(7));
  assert.notEqual(generated.waves[0].spawnPlan[0].monsterId, next.waves[0].spawnPlan[0].monsterId);
});

test('拒绝错误随机数、种子、空会话和未批准规则', () => {
  for (const n of [-1, 1, NaN, Infinity]) assert.throws(() => createSessionPlan('s', () => n), RangeError);
  for (const n of [-1, 1.5, 2 ** 32, NaN]) assert.throws(() => createSeededRandom(n), RangeError);
  assert.throws(() => createSessionPlan(' ', createSeededRandom(7)), RangeError);
  assert.throws(() => createSessionPlan('s', createSeededRandom(7), { ...FORTRESS_RULES, base: { maxHp: 6, repairPerWave: 0 } }), /rules.base.maxHp/);
});

test('技能候选固定种子可重放且不可变，每次恰好两个不同技能', () => {
  const generated = plan();
  const offer = createSkillOffer(generated, 0, noSkills, createSeededRandom(55));
  assert.deepEqual(offer, createSkillOffer(generated, 0, noSkills, createSeededRandom(55)));
  assert.equal(new Set(offer.candidateIds).size, 2);
  assert.equal(offer.afterWaveId, generated.waves[0].waveId);
  assert.ok(Object.isFrozen(offer)); assert.ok(Object.isFrozen(offer.candidateIds));
  assert.throws(() => createSkillOffer(generated, 0, noSkills, () => 1), RangeError);
});

test('穷举前四次选择的所有技能等级组合：候选不会不足且排除满级技能', () => {
  const generated = plan();
  for (let wave = 0; wave < 4; wave++) {
    for (let doubleShot = 0; doubleShot <= wave; doubleShot++) {
      for (let fireRate = 0; fireRate <= wave - doubleShot; fireRate++) {
        const levels = { doubleShot, fireRate, bulletWidth: wave - doubleShot - fireRate };
        const offer = createSkillOffer(generated, wave, levels, createSeededRandom(7));
        assert.equal(offer.candidateIds.length, 2);
        assert.equal(new Set(offer.candidateIds).size, 2);
        for (const id of offer.candidateIds) assert.ok(levels[id] < 3);
      }
    }
  }
  const maxed = createSkillOffer(generated, 3, { doubleShot: 3, fireRate: 0, bulletWidth: 0 }, createSeededRandom(7));
  assert.deepEqual([...maxed.candidateIds].sort(), ['bulletWidth', 'fireRate']);
});

test('末波不提供技能，非法等级和与波次不符的已选次数被拒绝', () => {
  for (const index of [-1, 4, 1.5, NaN]) assert.throws(() => createSkillOffer(plan(), index, noSkills, createSeededRandom(7)), RangeError);
  for (const n of [-1, 4, 0.5, NaN]) assert.throws(() => createSkillOffer(plan(), 0, { ...noSkills, doubleShot: n }, createSeededRandom(7)), /skills.doubleShot/);
  assert.throws(() => createSkillOffer(plan(), 2, noSkills, createSeededRandom(7)), /已选次数/);
});

test('配置校验拒绝缺少怪物，不拿旧水果图片冒充已完成怪物素材', () => {
  const missing = validateFortressContent(FORTRESS_WORDS, [], FORTRESS_ASSETS);
  assert.equal(missing.length, 5);
  assert.deepEqual(validateFortressContent(FORTRESS_WORDS, FORTRESS_MONSTERS, FORTRESS_ASSETS), []);
  assert.ok(missing.every(issue => issue.path.startsWith('monsters.')));
  assert.deepEqual(validateFortressContent(FORTRESS_WORDS, monsters, assets), []);
  const ordinary = monsters.map((monster, i) => i ? monster : { ...monster, spritePath: FORTRESS_WORDS[0].fruitImagePath });
  assert.ok(validateFortressContent(FORTRESS_WORDS, ordinary, assets).some(issue => issue.path === 'monsters[0].spritePath'));
  assert.ok(validateFortressContent(FORTRESS_WORDS, monsters, assets, true).some(issue => issue.path.endsWith('.reviewStatus')));
});

test('词/怪物/图音引用不能重复、未知、错配或指向远端', () => {
  const duplicate = [FORTRESS_WORDS[0], FORTRESS_WORDS[0], ...FORTRESS_WORDS.slice(2)];
  assert.ok(validateFortressContent(duplicate, monsters, assets).some(issue => issue.path === 'words[1].id'));
  assert.ok(validateFortressContent(FORTRESS_WORDS, [...monsters, monsters[0]], assets).some(issue => issue.path === 'monsters.apple'));
  assert.ok(validateFortressContent(FORTRESS_WORDS, monsters, assets.slice(1)).some(issue => issue.path === 'words[0].fruitImagePath'));
  const wrong = assets.map((asset, i) => i ? asset : { ...asset, wordId: 'banana' });
  assert.ok(validateFortressContent(FORTRESS_WORDS, monsters, wrong).some(issue => issue.path === 'words[0].fruitImagePath'));
  const remote = monsters.map((monster, i) => i ? monster : { ...monster, portraitPath: 'https://example.com/apple.png' });
  assert.ok(validateFortressContent(FORTRESS_WORDS, remote, assets).some(issue => issue.path === 'monsters[0].portraitPath'));
});

test('源图尺寸、锚点、碰撞矩形拒绝无穷、越界和零面积', () => {
  for (const patch of [
    { sourceSize: { width: 0, height: 256 } }, { anchor: { x: NaN, y: 128 } },
    { hitbox: { x: 250, y: 0, width: 20, height: 20 } }, { hitbox: { x: 0, y: 0, width: 0, height: 1 } },
    { hitbox: { x: -1, y: 0, width: 20, height: Infinity } },
  ]) {
    assert.ok(validateFortressContent(FORTRESS_WORDS, [{ ...monsters[0], ...patch }, ...monsters.slice(1)], assets).some(issue => issue.path.startsWith('monsters[0].')));
  }
});

test('波次完整性校验定位重复目标、重复选项、词物错配、越界和重复实体', () => {
  const generated = plan(); const first = generated.waves[0];
  for (const wave of [
    { ...first, optionWordIds: [first.targetWordId, first.targetWordId] },
    { ...first, targetWordId: 'pear' },
    { ...first, spawnPlan: [{ ...first.spawnPlan[0], wordId: 'pear' }] },
    { ...first, spawnPlan: [{ ...first.spawnPlan[0], position: { x: 999, y: -32 } }] },
  ]) assert.ok(validateSessionPlan({ ...generated, waves: [wave, ...generated.waves.slice(1)] }).some(issue => issue.path.startsWith('plan.waves[0]')));
  assert.ok(validateSessionPlan({ ...generated, waves: [first, first, ...generated.waves.slice(2)] }).length > 0);
});

test('结果契约分别表达听词选对、未击败而失败和退场音频状态', () => {
  const generated = plan(); const wave = generated.waves[0];
  const result: SessionResultV2 = {
    mode: 'fortress', schemaVersion: 2, contentVersion: 2, sessionId: generated.sessionId, endedAt: 1000,
    outcome: 'baseDestroyed', completed: false, baseHp: 0,
    attempts: [{ sessionId: generated.sessionId, waveId: wave.waveId, taskKind: 'listeningChoice', targetWordId: wave.targetWordId,
      selectedWordId: wave.targetWordId, correct: true, hintUsed: true, attemptIndex: 3, replayCount: 2 }],
    waves: [{ waveId: wave.waveId, wordId: wave.targetWordId, choiceCompleted: true, defeatedMonsterIds: [], outcome: 'baseDestroyed', retirementAudio: 'notStarted' }],
    skillChoices: [],
  };
  assert.equal(result.attempts[0].correct, true);
  assert.equal(result.waves[0].defeatedMonsterIds.length, 0);
  assert.equal(result.completed, false);
  assert.match(FORTRESS_PROGRESS_KEY, /fortress.*v2/);
  assert.equal('energy' in result, false);
});
