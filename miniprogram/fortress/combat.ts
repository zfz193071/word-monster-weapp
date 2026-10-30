import { validateSkillLevels } from './plans';
import { FORTRESS_RULES as RULES, FORTRESS_SKILLS } from './rules';
import type { CombatEvent, CombatState, MonsterState, Point, ProjectileState, Rect, SessionPlan, SkillLevels } from './types';
import { assertNoFortressIssues, validateSessionPlan } from './validation';

// Technical simulation cadence, not a configurable gameplay/balance value.
export const COMBAT_STEP_MS = 10;
const EPSILON = 1e-8;
const MIN_INTERVAL = Math.min(...FORTRESS_SKILLS[1].values);
const MAX_SHOTS = Math.max(...FORTRESS_SKILLS[0].values);
export const MAX_PROJECTILES = (Math.ceil(
  (RULES.arena.playerY + RULES.projectile.height / 2) / RULES.projectile.speed * 1000 / MIN_INTERVAL,
) + 1) * MAX_SHOTS;
export interface CombatInput { readonly playerX?: number }
export interface WeaponParameters { readonly count: number; readonly intervalMs: number; readonly width: number }
export interface CombatStep { readonly state: CombatState; readonly events: readonly CombatEvent[] }
export interface CreateCombatOptions {
  readonly plan: SessionPlan;
  readonly waveIndex: number;
  readonly combatId: string;
  readonly generation: number;
  readonly baseHp: number; // carried across waves, not automatically repaired
  readonly playerX: number;
  readonly skills: SkillLevels;
  readonly monsterHitbox: Rect; // required; no fake/default monster art geometry
}

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} 必须是有限数值`);
}
function playerX(value: number): number {
  finite(value, 'playerX');
  return Math.max(RULES.arena.playerMinX, Math.min(RULES.arena.playerMaxX, value));
}
export function getWeaponParameters(levels: SkillLevels): WeaponParameters {
  validateSkillLevels(levels);
  const value = (id: keyof SkillLevels): number => {
    const definition = FORTRESS_SKILLS.find(skill => skill.id === id)!;
    return definition.values[levels[id]];
  };
  return Object.freeze({ count: value('doubleShot'), intervalMs: value('fireRate'), width: value('bulletWidth') });
}
function freezeState(state: CombatState): CombatState {
  return Object.freeze({ ...state,
    context: Object.freeze({ ...state.context }), player: Object.freeze({ ...state.player }),
    base: Object.freeze({ ...state.base }), skills: Object.freeze({ ...state.skills }),
    monsters: Object.freeze(state.monsters.map(monster => Object.freeze({ ...monster,
      position: Object.freeze({ ...monster.position }), hitbox: Object.freeze({ ...monster.hitbox }),
    }))),
    projectiles: Object.freeze(state.projectiles.map(projectile => Object.freeze({ ...projectile,
      position: Object.freeze({ ...projectile.position }), previousPosition: Object.freeze({ ...projectile.previousPosition }),
    }))),
    defeatedMonsterIds: Object.freeze([...state.defeatedMonsterIds]),
    processedBaseAttackIds: Object.freeze([...state.processedBaseAttackIds]),
  });
}
function volley(state: CombatState, weapon: WeaponParameters): readonly ProjectileState[] {
  return Array.from({ length: weapon.count }, (_, index) => {
    const position = { x: state.player.x + (index - (weapon.count - 1) / 2) * RULES.projectile.spread, y: state.player.y };
    return { id: `${state.context.sessionId}:${state.context.combatId}:bullet:${state.nextProjectileSequence + index}`,
      position, previousPosition: position, width: weapon.width, height: RULES.projectile.height, damage: RULES.projectile.damage };
  });
}
export function createCombat(options: CreateCombatOptions): CombatState {
  assertNoFortressIssues(validateSessionPlan(options.plan));
  if (!Number.isInteger(options.waveIndex) || options.waveIndex < 0 || options.waveIndex >= options.plan.waves.length) throw new RangeError('waveIndex 越界');
  if (!options.combatId.trim()) throw new RangeError('combatId 不能为空');
  if (!Number.isSafeInteger(options.generation) || options.generation < 0) throw new RangeError('generation 必须为非负安全整数');
  if (!Number.isInteger(options.baseHp) || options.baseHp <= 0 || options.baseHp > RULES.base.maxHp) throw new RangeError('baseHp 必须在 1—5；失败局不能进入下一波');
  const weapon = getWeaponParameters(options.skills);
  if (Object.values(options.skills).reduce((sum, level) => sum + level, 0) !== options.waveIndex) throw new RangeError('技能已选次数与波次不符');
  const box = options.monsterHitbox;
  for (const key of ['x', 'y', 'width', 'height'] as const) finite(box[key], `monsterHitbox.${key}`);
  if (box.width <= 0 || box.height <= 0 || box.width > RULES.arena.width || box.height > RULES.arena.height
    || Math.abs(box.x) > RULES.arena.width || Math.abs(box.y) > RULES.arena.height
    || Math.abs(box.x + box.width) > RULES.arena.width || Math.abs(box.y + box.height) > RULES.arena.height) {
    throw new RangeError('monsterHitbox 必须为正面积矩形，尺寸和相对坐标不可超出战场范围');
  }
  const wave = options.plan.waves[options.waveIndex];
  const state: CombatState = {
    context: { sessionId: options.plan.sessionId, waveId: wave.waveId, combatId: options.combatId, generation: options.generation },
    tick: 0, status: 'fighting', player: { x: playerX(options.playerX), y: RULES.arena.playerY },
    base: { hp: options.baseHp, maxHp: RULES.base.maxHp }, skills: options.skills,
    monsters: wave.spawnPlan.map(spawn => ({ id: spawn.monsterId, wordId: spawn.wordId, position: spawn.position,
      hitbox: box, hp: RULES.monster.maxHp, maxHp: RULES.monster.maxHp, status: 'entering',
      attackRemainingMs: RULES.monster.attackIntervalMs, attackSequence: 0 })),
    projectiles: [], shotRemainingMs: weapon.intervalMs, nextProjectileSequence: 0,
    defeatedMonsterIds: [], processedBaseAttackIds: [],
  };
  return freezeState({ ...state, projectiles: volley(state, weapon), nextProjectileSequence: weapon.count });
}

// Slab intersection in relative coordinates: expand the monster AABB by the
// projectile half-size, then sweep the projectile's centre against it. This
// includes both objects' motion, so thin targets cannot be skipped between frames.
export function sweptHitTime(from: Point, to: Point, width: number, height: number,
  monsterFrom: Point, monsterTo: Point, box: Rect): number | null {
  let enter = 0; let exit = 1;
  for (const axis of ['x', 'y'] as const) {
    const half = (axis === 'x' ? width : height) / 2;
    const start = from[axis] - monsterFrom[axis];
    const delta = to[axis] - monsterTo[axis] - start;
    const min = box[axis] - half;
    const max = box[axis] + (axis === 'x' ? box.width : box.height) + half;
    if (Math.abs(delta) < EPSILON) {
      if (start < min || start > max) return null;
    } else {
      const a = (min - start) / delta; const b = (max - start) / delta;
      enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      if (enter > exit) return null;
    }
  }
  return enter;
}
function advanceMonster(monster: MonsterState): MonsterState {
  if (monster.hp === 0 || monster.status === 'retiring') return monster;
  if (monster.status === 'attackingBase') return { ...monster, attackRemainingMs: monster.attackRemainingMs - COMBAT_STEP_MS };
  const distance = RULES.monster.attackY - monster.position.y;
  const travel = RULES.monster.speed * COMBAT_STEP_MS / 1000;
  const arrived = distance <= travel + EPSILON;
  const y = arrived ? RULES.monster.attackY : monster.position.y + travel;
  const leftoverMs = arrived ? Math.max(0, COMBAT_STEP_MS - distance / RULES.monster.speed * 1000) : 0;
  return { ...monster, position: { x: monster.position.x, y },
    status: arrived ? 'attackingBase' : y < 0 ? 'entering' : 'alive',
    attackRemainingMs: arrived ? RULES.monster.attackIntervalMs - leftoverMs : monster.attackRemainingMs };
}

// One fixed logical step. Only pass snapshots from createCombat/stepCombat.
// No callback/timer/image/answer event can directly kill a monster here.
export function stepCombat(previous: CombatState, input: CombatInput = {}): CombatStep {
  if (previous.status !== 'fighting') return { state: previous, events: Object.freeze([]) };
  const player = { x: input.playerX === undefined ? previous.player.x : playerX(input.playerX), y: RULES.arena.playerY };
  const tick = previous.tick + 1;
  const events: CombatEvent[] = [];
  const defeated = new Set(previous.defeatedMonsterIds);
  const attacks = new Set(previous.processedBaseAttackIds);
  const monsters = previous.monsters.map(advanceMonster);
  const moved = previous.projectiles.map(projectile => ({ ...projectile, previousPosition: projectile.position,
    position: { x: projectile.position.x, y: projectile.position.y - RULES.projectile.speed * COMBAT_STEP_MS / 1000 } }));
  // Resolve contacts by flight time; IDs break ties deterministically.
  const contacts: { time: number; projectileIndex: number; monsterIndex: number }[] = [];
  moved.forEach((projectile, projectileIndex) => {
    monsters.forEach((monster, monsterIndex) => {
      if (monster.hp <= 0 || defeated.has(monster.id) || monster.status === 'retiring') return;
      const time = sweptHitTime(projectile.previousPosition, projectile.position, projectile.width, projectile.height,
        previous.monsters[monsterIndex].position, monster.position, monster.hitbox);
      if (time !== null) contacts.push({ time, projectileIndex, monsterIndex });
    });
  });
  contacts.sort((a, b) => a.time - b.time || a.projectileIndex - b.projectileIndex || a.monsterIndex - b.monsterIndex);
  const consumed = new Set<string>();
  for (const contact of contacts) {
    const projectile = moved[contact.projectileIndex]; const monster = monsters[contact.monsterIndex];
    if (consumed.has(projectile.id) || defeated.has(monster.id)) continue;
    consumed.add(projectile.id);
    const hp = Math.max(0, monster.hp - projectile.damage);
    monsters[contact.monsterIndex] = { ...monster, hp, status: hp === 0 ? 'defeated' : monster.status };
    if (hp === 0) {
      defeated.add(monster.id);
      events.push({ type: 'monsterDefeated', context: previous.context, tick, monsterId: monster.id, wordId: monster.wordId });
    }
  }
  let baseHp = previous.base.hp;
  // Approved B6 ordering: a monster killed this step cannot attack, even if due.
  monsters.forEach((monster, index) => {
    if (baseHp <= 0 || monster.hp <= 0 || monster.status !== 'attackingBase' || monster.attackRemainingMs > EPSILON) return;
    const attackSequence = monster.attackSequence + 1;
    const attackId = `${previous.context.combatId}:${monster.id}:attack:${attackSequence}`;
    monsters[index] = { ...monster, attackSequence, attackRemainingMs: monster.attackRemainingMs + RULES.monster.attackIntervalMs };
    if (attacks.has(attackId)) return;
    attacks.add(attackId);
    baseHp = Math.max(0, baseHp - RULES.monster.attackDamage);
    events.push({ type: 'baseDamaged', context: previous.context, tick, attackId, monsterId: monster.id, hp: baseHp });
  });
  const status = baseHp === 0 ? 'baseDestroyed' : monsters.every(monster => defeated.has(monster.id)) ? 'cleared' : 'fighting';
  if (status === 'baseDestroyed') events.push({ type: 'baseDestroyed', context: previous.context, tick });
  let projectiles: readonly ProjectileState[] = status === 'fighting' ? moved.filter(projectile => !consumed.has(projectile.id)
    && projectile.position.y + projectile.height / 2 >= 0
    && projectile.position.x + projectile.width / 2 >= 0
    && projectile.position.x - projectile.width / 2 <= RULES.arena.width) : [];
  const weapon = getWeaponParameters(previous.skills);
  let shotRemainingMs = previous.shotRemainingMs - COMBAT_STEP_MS;
  let nextProjectileSequence = previous.nextProjectileSequence;
  if (status === 'fighting' && shotRemainingMs <= EPSILON) {
    projectiles = [...projectiles, ...volley({ ...previous, player }, weapon)];
    nextProjectileSequence += weapon.count;
    shotRemainingMs += weapon.intervalMs;
  }
  if (projectiles.length > MAX_PROJECTILES) throw new RangeError('弹体数量超过已确认参数推导的上限');
  const state = freezeState({ ...previous, tick, status, player, base: { ...previous.base, hp: baseHp }, monsters,
    projectiles, shotRemainingMs: Math.max(0, shotRemainingMs), nextProjectileSequence,
    defeatedMonsterIds: [...defeated], processedBaseAttackIds: [...attacks] });
  return { state, events: Object.freeze(events.map(event => Object.freeze(event))) };
}

export function rebindCombatGeneration(state: CombatState, generation: number): CombatState {
  if (!Number.isSafeInteger(generation) || generation <= state.context.generation) throw new RangeError('恢复时 generation 必须递增');
  return freezeState({ ...state, context: { ...state.context, generation } });
}
