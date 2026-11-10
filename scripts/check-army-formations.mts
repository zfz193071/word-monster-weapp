// Deliberate close-contact fixtures, not natural progression or device performance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { CombatRunner } from '../miniprogram/fortress/combat-runner';
import { resizeCombatArena } from '../miniprogram/fortress/combat';
import { createOpeningPlan } from '../miniprogram/fortress/opening-plan';
import { createStageInvasion } from '../miniprogram/fortress/stage-invasion';
import { createSeededRandom } from '../miniprogram/fortress/plans';
import type { CombatState } from '../miniprogram/fortress/types';
import type { SkillCollection } from '../miniprogram/fortress/skill-quality';
import type { SummonSkillId } from '../miniprogram/fortress/summon-skills';
import type { EnemyType } from '../miniprogram/fortress/army';

const formations: Record<string, SummonSkillId[]> = {
  defense: ['rifleSupport', 'shieldLine', 'flameSquad'],
  air: ['rifleSupport', 'rocketSupport', 'airFormation'],
  heavy: ['shieldLine', 'rocketSupport', 'armorSupport'],
  groundOnly: ['shieldLine', 'flameSquad', 'armorSupport'],
};
const groups: Record<string, EnemyType[]> = {
  ground: ['normal', 'runner', 'armored', 'giant', 'exploder', 'normal'],
  air: Array<EnemyType>(6).fill('flying'),
  mixed: ['normal', 'runner', 'armored', 'flying', 'exploder', 'giant'],
};
function replay(initial: CombatState, speed: number) {
  const runner = new CombatRunner(initial), digest = createHash('sha256');
  const damage: Record<string, number> = {}, events: Record<string, number> = {};
  let now = 0, peakAlive = initial.monsters.length;
  runner.setSpeed(speed); runner.frame(now);
  for (let checkpoint = 0; checkpoint < 40; checkpoint++) {
    for (let frame = 0; frame < 150 / speed; frame++) {
      const result = runner.frame(now += 20);
      assert.equal(result.droppedMs, 0);
      for (const event of result.events) {
        digest.update(JSON.stringify(event) + '\n');
        events[event.type] = (events[event.type] ?? 0) + 1;
        if (event.type === 'monsterDamaged') damage[event.kind] = (damage[event.kind] ?? 0) + event.damage;
      }
      peakAlive = Math.max(peakAlive, runner.snapshot!.monsters.filter(m => m.hp > 0).length);
    }
    digest.update(JSON.stringify(runner.snapshot) + '\n');
    if (checkpoint === 4) {
      const frozen = runner.snapshot;
      runner.pause();
      assert.equal(runner.frame(now += 60000).steps, 0);
      assert.equal(runner.snapshot, frozen);
      runner.resume(now, 2);
    }
  }
  const state = runner.snapshot!;
  runner.dispose();
  assert.equal(runner.frame(now + 1000).state, null);
  return { status: state.status, seconds: state.tick / 100, baseHp: state.base.hp,
    maxHp: state.base.maxHp, peakAlive, damage, events,
    remaining: state.monsters.filter(m => m.hp > 0).map(m => m.enemyType),
    resolved: state.defeatedMonsterIds.length, digest: digest.digest('hex') };
}
const results = [];
for (const difficulty of ['easy', 'nightmare'] as const) for (const width of [360, 990]) {
  for (const [formation, skills] of Object.entries(formations)) for (const [group, types] of Object.entries(groups)) {
    const collection: SkillCollection = Object.fromEntries(skills.map(id => [id,
      { level: difficulty === 'easy' ? 1 : 5, quality: difficulty === 'easy' ? 'crude' : 'legendary' }]));
    const initial = resizeCombatArena(createStageInvasion(createOpeningPlan('formation-41', createSeededRandom(41),
      difficulty === 'easy' ? 1 : 8, difficulty === 'easy' ? 1 : 7, difficulty), 1, collection), width);
    const candidates = [...initial.monsters, ...initial.incomingMonsters!];
    const fixture: CombatState = { ...initial, incomingMonsters: [], monsters: types.map((type, i) => {
      const source = candidates.find(m => !m.boss && m.enemyType === type);
      assert.ok(source, `missing real generated type: ${type}`);
      return { ...source, id: `contact-${i}`, status: 'alive', spawnAtMs: 0,
        position: { x: width / 2 + (i % 3 - 1) * 35, y: 380 + Math.floor(i / 3) * 35 } };
    }) };
    const baseline = replay(fixture, 1);
    for (const speed of [1.5, 2, 2.5]) assert.deepEqual(replay(fixture, speed), baseline);
    if (group !== 'air' || formation !== 'groundOnly') assert.ok(baseline.damage.soldier > 0, 'fixture must exercise allies');
    if (group === 'air' && formation === 'groundOnly') {
      assert.equal(baseline.damage.soldier ?? 0, 0, 'ground-only allies cannot hit air');
      assert.ok(baseline.damage.projectile > 0, 'hero must retain an air-target solution');
    }
    results.push({ difficulty, width, formation, group, skills, ...baseline });
  }
}
await writeFile('docs/visual-audit/army/formations.json', JSON.stringify({ seed: 41,
  scope: '48 close-contact fixtures; real generated stats, six selected enemies repositioned near defense; no incoming waves, pets, consumables, upgrades or reward UI. 120 simulation seconds maximum. Not natural victory, device performance or player win rate.',
  damage: 'Reported event damage includes overkill. Soldier damage is aggregated by formation; events do not identify individual attackers.',
  speeds: [1, 1.5, 2, 2.5], checks: 'All event streams and 3-second snapshots match; pause and dispose checked.', results }, null, 2) + '\n');
console.log(`${results.length} fixtures × four speeds passed`);
