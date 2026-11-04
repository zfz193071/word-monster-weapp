import { battlePetPosition, createBattlePet, PET_ATTACK_INTERVAL_MS, petDamage } from '../pets/battle';
import type { BattlePet } from '../pets/battle';
import { weaponForLevel } from '../weapons/catalog';
import { bossChargePhase, fortressMaxHp, monsterStats } from './battle-progression';
import { ALL_BATTLE_WORDS as BATTLE_WORDS } from './levels';
import { validateSkillLevels } from './plans';
import { FORTRESS_RULES as RULES, FORTRESS_SKILLS } from './rules';
import type { CombatContext, CombatEvent, ElementImpact, CombatState, MonsterSpawn, MonsterState, Point, ProjectileState, Rect, SessionPlan, SkillLevels, SupportSoldierState } from './types';
import { assertNoFortressIssues, validateSessionPlan } from './validation';

// Technical simulation cadence, not a configurable gameplay/balance value.
export const COMBAT_STEP_MS = 10;
const EPSILON = 1e-8;
const AUTO_MUZZLE_LATERAL = 16.8;
const AUTO_MUZZLE_FORWARD = 34.4;
export const SUPPORT_SOLDIER_MAX_HP = 30;
const MIN_INTERVAL = Math.min(...FORTRESS_SKILLS[1].values);
const MAX_SHOTS = Math.max(...FORTRESS_SKILLS[0].values);
export const MAX_PROJECTILES = (Math.ceil(
  Math.hypot(RULES.arena.width, RULES.arena.height + RULES.projectile.height) / RULES.projectile.speed * 1000 / MIN_INTERVAL,
) + 1) * MAX_SHOTS;
export interface CombatInput { readonly playerX?: number }
export interface WeaponParameters { readonly count: number; readonly intervalMs: number; readonly width: number }
export interface CombatStep { readonly state: CombatState; readonly events: readonly CombatEvent[] }
export interface CreateCombatOptions {
  readonly difficulty?: { readonly levelId: number; readonly heroLevel: number };
  readonly weaponLevel?: number;
  readonly automatic?: boolean;
  readonly monsterSpeed?: number;
  readonly monsterAttackIntervalMs?: number;
  readonly plan: SessionPlan;
  readonly waveIndex: number;
  readonly combatId: string;
  readonly generation: number;
  readonly baseHp: number; // carried across waves, not automatically repaired
  readonly playerX: number;
  readonly skills: SkillLevels;
  readonly supportSoldiers?: readonly SupportSoldierState[];
  readonly monsterHitboxes?: Readonly<Record<string, Rect>>;
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
  const value = (id: 'doubleShot' | 'fireRate' | 'bulletWidth'): number => {
    const definition = FORTRESS_SKILLS.find(skill => skill.id === id)!;
    return definition.values[levels[id]];
  };
  return Object.freeze({ count: value('doubleShot'), intervalMs: value('fireRate'), width: value('bulletWidth') });
}
function freezeState(state: CombatState): CombatState {
  return Object.freeze({ ...state,
    ...(state.pet ? { pet: createBattlePet(state.pet, state.pet.attackRemainingMs) } : {}),
    ...(state.aimDirection ? { aimDirection: Object.freeze({ ...state.aimDirection }) } : {}),
    ...(state.elementImpacts ? { elementImpacts: Object.freeze(state.elementImpacts.map(impact => Object.freeze({ ...impact, position: Object.freeze({ ...impact.position }), ...(impact.target ? { target: Object.freeze({ ...impact.target }) } : {}) }))) } : {}),
    context: Object.freeze({ ...state.context }), player: Object.freeze({ ...state.player }),
    base: Object.freeze({ ...state.base }), skills: Object.freeze({ ...state.skills }),
    monsters: Object.freeze(state.monsters.map(monster => Object.freeze({ ...monster,
      position: Object.freeze({ ...monster.position }), hitbox: Object.freeze({ ...monster.hitbox }),
    }))),
    supportSoldiers: Object.freeze((state.supportSoldiers ?? []).map(soldier => Object.freeze({ ...soldier, position: Object.freeze({ ...soldier.position }) }))),
    projectiles: Object.freeze(state.projectiles.map(projectile => Object.freeze({ ...projectile,
      ...(projectile.elements ? { elements: Object.freeze({ ...projectile.elements }) } : {}),
      position: Object.freeze({ ...projectile.position }), previousPosition: Object.freeze({ ...projectile.previousPosition }),
      ...(projectile.direction ? { direction: Object.freeze({ ...projectile.direction }) } : {}),
    }))),
    defeatedMonsterIds: Object.freeze([...state.defeatedMonsterIds]),
    processedBaseAttackIds: Object.freeze([...state.processedBaseAttackIds]),
  });
}
function volley(state: CombatState, weapon: WeaponParameters, charged = false, firepowerActive = false): readonly ProjectileState[] {
  // Matches the muzzle in hero-back-weapon-{1..7}.svg when the 160x200 sprite
  // is drawn at 48x60 with its center on player: x=+16.8, y=-34.4.
  const muzzle = state.automatic ? { lateral: AUTO_MUZZLE_LATERAL, forward: AUTO_MUZZLE_FORWARD } : { lateral: 0, forward: 0 };
  const usedTargets = new Set<string>();
  return Array.from({ length: weapon.count }, (_, index) => {
    const offset = (index - (weapon.count - 1) / 2) * RULES.projectile.spread;
    const direction = state.aimDirection ?? { x: 0, y: -1 };
    const side = offset + muzzle.lateral;
    const position = { x: state.player.x - direction.y * side + direction.x * muzzle.forward,
      y: state.player.y + direction.x * side + direction.y * muzzle.forward };
    const homingTargets = state.skills.homing ? state.monsters.filter(monster => monster.hp > 0 && monster.status !== 'waiting' && monster.status !== 'retiring' && monster.position.y >= 0 && monster.position.y <= RULES.arena.baseTop) : [];
    const target = homingTargets.filter(monster => !usedTargets.has(monster.id)).sort((a, b) => Math.hypot(a.position.x - position.x, a.position.y - position.y) - Math.hypot(b.position.x - position.x, b.position.y - position.y))[0]
      ?? homingTargets.sort((a, b) => Math.hypot(a.position.x - position.x, a.position.y - position.y) - Math.hypot(b.position.x - position.x, b.position.y - position.y))[0];
    if (target) usedTargets.add(target.id);
    return { id: `${state.context.sessionId}:${state.context.combatId}:bullet:${state.nextProjectileSequence + index}`,
      ...(charged && index === 0 ? { elements: { flame: state.skills.flame ?? 0, frost: state.skills.frost ?? 0, lightning: state.skills.lightning ?? 0 } } : {}),
      position, previousPosition: position, ...(target ? { direction: directionTo(position, target.position), targetMonsterId: target.id } : state.aimDirection ? { direction: state.aimDirection } : {}), ...(state.skills.homing ? { homing: true } : {}), width: weapon.width, height: RULES.projectile.height, damage: firepowerActive ? Math.round(weaponForLevel(state.weaponLevel ?? 1).damage * 1.5) : weaponForLevel(state.weaponLevel ?? 1).damage };
  });
}
export function createCombat(options: CreateCombatOptions): CombatState {
  assertNoFortressIssues(validateSessionPlan(options.plan));
  if (!Number.isInteger(options.waveIndex) || options.waveIndex < 0 || options.waveIndex >= options.plan.waves.length) throw new RangeError('waveIndex 越界');
  if (Object.values(options.skills).reduce((sum, level) => sum + level, 0) !== options.waveIndex) throw new RangeError('技能已选次数与波次不符');
  const wave = options.plan.waves[options.waveIndex];
  return initializeCombat(options, { sessionId: options.plan.sessionId, waveId: wave.waveId, combatId: options.combatId, generation: options.generation }, wave.spawnPlan);
}

export interface EncounterCombatOptions extends Omit<CreateCombatOptions, 'plan' | 'waveIndex'> {
  readonly sessionId: string;
  readonly allowedWordIds?: readonly string[];
  readonly targetWordId: string;
  readonly spawns: readonly MonsterSpawn[];
}
export function createEncounterCombat(options: EncounterCombatOptions): CombatState {
  if (!options.sessionId.trim() || !BATTLE_WORDS.some(word => word.id === options.targetWordId) || !options.spawns.length
    || new Set(options.spawns.map(spawn => spawn.monsterId)).size !== options.spawns.length
    || options.spawns.some(spawn => !spawn.monsterId.trim() || !(options.allowedWordIds ?? [options.targetWordId]).includes(spawn.wordId) || !BATTLE_WORDS.some(word => word.id === spawn.wordId)
      || !Number.isFinite(spawn.position.x) || spawn.position.x < RULES.monster.spawnMinX || spawn.position.x > RULES.monster.spawnMaxX
      || (spawn.spawnAtMs !== undefined && (!Number.isSafeInteger(spawn.spawnAtMs) || spawn.spawnAtMs < 0))
      || (spawn.dropCoins !== undefined && (!Number.isInteger(spawn.dropCoins) || spawn.dropCoins < 0 || spawn.dropCoins > 20))
      || (spawn.soldierDropCount !== undefined && (!spawn.boss || !Number.isInteger(spawn.soldierDropCount) || spawn.soldierDropCount < 0 || spawn.soldierDropCount > 3))
      || spawn.position.y !== RULES.monster.startY)) throw new Error('僵尸批次必须包含唯一实体、已允许的水果和有效出生位置');
  return initializeCombat(options, { sessionId: options.sessionId, waveId: `${options.sessionId}:opening`, combatId: options.combatId, generation: options.generation }, options.spawns);
}
function initializeCombat(options: Omit<CreateCombatOptions, 'plan' | 'waveIndex'>, context: CombatContext, spawns: readonly MonsterSpawn[]): CombatState {
  if (!options.combatId.trim()) throw new RangeError('combatId 不能为空');
  if (!Number.isSafeInteger(options.generation) || options.generation < 0) throw new RangeError('generation 必须为非负安全整数');
  const maxHp = options.difficulty ? fortressMaxHp(options.difficulty.levelId) : RULES.base.maxHp;
  if (!Number.isSafeInteger(options.baseHp) || options.baseHp <= 0 || options.baseHp > maxHp) throw new RangeError(`baseHp 必须为1—${maxHp}的整数；失败局不能进入下一波`);
  const weapon = getWeaponParameters(options.skills);
  const monsterSpeed = options.monsterSpeed ?? RULES.monster.speed;
  if (!Number.isFinite(monsterSpeed) || monsterSpeed <= 0) throw new RangeError('monsterSpeed 必须为正数');
  const attackIntervalMs = options.monsterAttackIntervalMs ?? RULES.monster.attackIntervalMs;
  if (!Number.isFinite(attackIntervalMs) || attackIntervalMs <= 0) throw new Error('攻击间隔无效');
  const box = options.monsterHitbox;
  for (const box of [options.monsterHitbox, ...Object.values(options.monsterHitboxes ?? {})]) {
    for (const key of ['x', 'y', 'width', 'height'] as const) finite(box[key], `monsterHitbox.${key}`);
    if (box.width <= 0 || box.height <= 0 || box.width > RULES.arena.width || box.height > RULES.arena.height
      || Math.abs(box.x) > RULES.arena.width || Math.abs(box.y) > RULES.arena.height
      || Math.abs(box.x + box.width) > RULES.arena.width || Math.abs(box.y + box.height) > RULES.arena.height) {
      throw new RangeError('monsterHitbox 必须为正面积矩形，尺寸和相对坐标不可超出战场范围');
    }
  }
  const weaponLevel = weaponForLevel(options.weaponLevel ?? 1).level;
  if ((options.supportSoldiers?.length ?? 0) > 3 || options.supportSoldiers?.some(soldier => !soldier.id.trim() || !Number.isInteger(soldier.slot) || soldier.slot < 0 || soldier.slot > 2
    || !Number.isInteger(soldier.maxHp) || soldier.maxHp !== SUPPORT_SOLDIER_MAX_HP || !Number.isInteger(soldier.hp) || soldier.hp <= 0 || soldier.hp > soldier.maxHp
    || !Number.isFinite(soldier.attackRemainingMs) || soldier.attackRemainingMs < 0)) throw new Error('援军状态无效');
  const state: CombatState = {
    weaponLevel, context, monsterSpeed, elementReadyTick: 500, elementImpacts: [],
    ...(options.automatic ? { automatic: true, aimDirection: { x: 0, y: -1 } } : {}),
    tick: 0, ...(options.skills.firepower ? { firepowerUntilTick: 500, firepowerReadyTick: 2000 } : {}), status: 'fighting', player: { x: playerX(options.playerX), y: RULES.arena.playerY },
    base: { hp: options.baseHp, maxHp }, skills: options.skills,
    monsters: spawns.map(spawn => {
      const stats = options.difficulty ? monsterStats(options.difficulty.levelId, options.difficulty.heroLevel, spawn.boss) : { hp: RULES.monster.maxHp, attackDamage: RULES.monster.attackDamage };
      const size = spawn.boss ? 1.5 : 1;
      const hitbox = options.monsterHitboxes?.[spawn.wordId] ?? box;
      return { id: spawn.monsterId, wordId: spawn.wordId, position: spawn.position,
      ...(spawn.boss ? { boss: true } : {}), ...(spawn.dropCoins !== undefined ? { dropCoins: spawn.dropCoins } : {}), ...(spawn.soldierDropCount !== undefined ? { soldierDropCount: spawn.soldierDropCount } : {}), attackDamage: stats.attackDamage,
      ...(spawn.spawnAtMs !== undefined ? { spawnAtMs: spawn.spawnAtMs } : {}),
      hitbox: { x: hitbox.x * size, y: hitbox.y * size, width: hitbox.width * size, height: hitbox.height * size }, hp: stats.hp, maxHp: stats.hp, status: (spawn.spawnAtMs ?? 0) > 0 ? 'waiting' : 'entering',
      attackIntervalMs, attackRemainingMs: attackIntervalMs, attackSequence: 0 }; }),
    projectiles: [], supportSoldiers: options.supportSoldiers ?? [], shotRemainingMs: weapon.intervalMs, nextProjectileSequence: 0,
    defeatedMonsterIds: [], processedBaseAttackIds: [],
  };
  return freezeState(options.automatic ? { ...state, shotRemainingMs: 0 } : { ...state, projectiles: volley(state, weapon, false, !!state.skills.firepower), nextProjectileSequence: weapon.count });
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
function advanceMonster(monster: MonsterState, speed: number, elapsedMs: number): MonsterState {
  if (elapsedMs < (monster.spawnAtMs ?? 0)) return monster;
  if (monster.hp === 0 || monster.status === 'retiring') return monster;
  if (monster.status === 'attackingBase') return { ...monster, attackRemainingMs: monster.attackRemainingMs - COMBAT_STEP_MS };
  if (monster.boss) speed *= .7 * (bossChargePhase(elapsedMs - (monster.spawnAtMs ?? 0)) === 'charging' ? 1.5 : 1);
  if ((monster.slowUntilTick ?? 0) > elapsedMs / COMBAT_STEP_MS) speed *= 1 - (monster.slowRatio ?? 0);
  const distance = RULES.monster.attackY - monster.position.y;
  const travel = speed * COMBAT_STEP_MS / 1000;
  const arrived = distance <= travel + EPSILON;
  const y = arrived ? RULES.monster.attackY : monster.position.y + travel;
  const leftoverMs = arrived ? Math.max(0, COMBAT_STEP_MS - distance / speed * 1000) : 0;
  return { ...monster, position: { x: monster.position.x, y },
    status: arrived ? 'attackingBase' : y < 0 ? 'entering' : 'alive',
    attackRemainingMs: arrived ? (monster.attackIntervalMs ?? RULES.monster.attackIntervalMs) - leftoverMs : monster.attackRemainingMs };
}

// One fixed logical step. Only pass snapshots from createCombat/stepCombat.
// No callback/timer/image/answer event can directly kill a monster here.
export function stepCombat(previous: CombatState, input: CombatInput = {}): CombatStep {
  if (previous.status !== 'fighting') return { state: previous, events: Object.freeze([]) };
  const player = { x: previous.automatic || input.playerX === undefined ? previous.player.x : playerX(input.playerX), y: RULES.arena.playerY };
  const tick = previous.tick + 1;
  const events: CombatEvent[] = [];
  const defeated = new Set(previous.defeatedMonsterIds);
  const attacks = new Set(previous.processedBaseAttackIds);
  let supportSoldiers = [...(previous.supportSoldiers ?? [])];
  const monsters = previous.monsters.map(monster => advanceMonster(monster, previous.monsterSpeed ?? RULES.monster.speed, tick * COMBAT_STEP_MS));
  const activeTargets = monsters.filter(monster => monster.hp > 0 && monster.status !== 'waiting' && monster.status !== 'retiring' && monster.position.y >= 0 && monster.position.y <= RULES.arena.baseTop);
  const moved = previous.projectiles.map(projectile => {
    let target = projectile.homing ? activeTargets.find(monster => monster.id === projectile.targetMonsterId) : undefined;
    if (projectile.homing && !target) target = activeTargets.slice().sort((a, b) => Math.hypot(a.position.x - projectile.position.x, a.position.y - projectile.position.y) - Math.hypot(b.position.x - projectile.position.x, b.position.y - projectile.position.y))[0];
    const direction = target ? directionTo(projectile.position, target.position) : projectile.direction ?? { x: 0, y: -1 };
    return { ...projectile, ...(projectile.homing ? { targetMonsterId: target?.id } : {}), direction, previousPosition: projectile.position,
      position: { x: projectile.position.x + direction.x * RULES.projectile.speed * COMBAT_STEP_MS / 1000, y: projectile.position.y + direction.y * RULES.projectile.speed * COMBAT_STEP_MS / 1000 } };
  });
  // Resolve contacts by flight time; IDs break ties deterministically.
  const contacts: { time: number; projectileIndex: number; monsterIndex: number }[] = [];
  moved.forEach((projectile, projectileIndex) => {
    monsters.forEach((monster, monsterIndex) => {
      if (monster.hp <= 0 || defeated.has(monster.id) || monster.status === 'retiring' || monster.status === 'waiting') return;
      const direction = projectile.direction ?? { x: 0, y: -1 };
      const width = Math.abs(direction.y) * projectile.width + Math.abs(direction.x) * projectile.height;
      const height = Math.abs(direction.x) * projectile.width + Math.abs(direction.y) * projectile.height;
      const time = sweptHitTime(projectile.previousPosition, projectile.position, width, height,
        previous.monsters[monsterIndex].position, monster.position, monster.hitbox);
      if (time !== null) contacts.push({ time, projectileIndex, monsterIndex });
    });
  });
  contacts.sort((a, b) => a.time - b.time || a.projectileIndex - b.projectileIndex || a.monsterIndex - b.monsterIndex);
  const impacts: ElementImpact[] = (previous.elementImpacts ?? []).filter(impact => impact.untilTick > tick);
  const damageMonster = (index: number, damage: number, kind: 'projectile' | 'flame' | 'lightning' | 'soldier' | 'pet') => {
    const monster = monsters[index]; if (monster.hp <= 0 || monster.status === 'waiting') return;
    if (!Number.isSafeInteger(damage) || !Number.isSafeInteger(monster.hp)) throw new RangeError('怪物伤害与生命值必须为整数');
    const hp = Math.max(0, monster.hp - damage);
    monsters[index] = { ...monster, hp, status: hp === 0 ? 'defeated' : monster.status };
    events.push({ type: 'monsterDamaged', context: previous.context, tick, monsterId: monster.id, hp, damage, kind, position: Object.freeze({ ...monster.position }) });
    if (hp === 0 && !defeated.has(monster.id)) {
      defeated.add(monster.id); events.push({ type: 'monsterDefeated', context: previous.context, tick, monsterId: monster.id, wordId: monster.wordId });
      if (monster.dropCoins) events.push({ type: 'coinsDropped', context: previous.context, tick, monsterId: monster.id, amount: monster.dropCoins, position: Object.freeze({ ...monster.position }) });
      if (monster.boss && (monster.soldierDropCount ?? 0) > 0) {
        const count = Math.min(3, supportSoldiers.length + (monster.soldierDropCount ?? 0));
        supportSoldiers = Array.from({ length: count }, (_, slot) => ({
          id: `${monster.id}:soldier:${slot + 1}`, slot, position: supportPosition(player, slot, count), hp: SUPPORT_SOLDIER_MAX_HP, maxHp: SUPPORT_SOLDIER_MAX_HP, attackRemainingMs: 2000,
        }));
      }
    }
  };
  const consumed = new Set<string>();
  for (const contact of contacts) {
    const projectile = moved[contact.projectileIndex]; const monster = monsters[contact.monsterIndex];
    if (consumed.has(projectile.id) || defeated.has(monster.id)) continue;
    consumed.add(projectile.id);
    damageMonster(contact.monsterIndex, projectile.damage, 'projectile');
    const elements = projectile.elements;
    const position = { x: projectile.previousPosition.x + (projectile.position.x - projectile.previousPosition.x) * contact.time, y: projectile.previousPosition.y + (projectile.position.y - projectile.previousPosition.y) * contact.time };
    const nearby = (index: number, radius: number) => monsters[index].hp > 0 && monsters[index].status !== 'waiting' && monsters[index].status !== 'retiring' && Math.hypot(monsters[index].position.x - position.x, monsters[index].position.y - position.y) <= radius;
    if (elements?.frost) {
      if (monsters[contact.monsterIndex].hp > 0) monsters[contact.monsterIndex] = { ...monsters[contact.monsterIndex], slowUntilTick: tick + 200, slowRatio: Math.min(.2 + .05 * elements.frost, .7) };
      impacts.push({ kind: 'frost', position: monster.position, untilTick: tick + 35 });
    }
    if (elements?.lightning) {
      let target = -1; let nearest = Infinity;
      monsters.forEach((candidate, index) => { if (index === contact.monsterIndex || !nearby(index, 90)) return; const distance = Math.hypot(candidate.position.x - position.x, candidate.position.y - position.y); if (distance < nearest) { nearest = distance; target = index; } });
      if (target >= 0) { impacts.push({ kind: 'lightning', position, target: monsters[target].position, untilTick: tick + 35 }); damageMonster(target, 10 + 5 * elements.lightning, 'lightning'); }
    }
    if (elements?.flame) {
      impacts.push({ kind: 'flame', position, untilTick: tick + 35 });
      monsters.forEach((_candidate, index) => { if (nearby(index, 45)) damageMonster(index, 10 + 5 * elements.flame!, 'flame'); });
    }
  }
  const supportCount = supportSoldiers.length;
  supportSoldiers = supportSoldiers.map(soldier => ({ ...soldier,
    position: supportPosition(player, soldier.slot, supportCount),
    attackRemainingMs: Math.max(0, soldier.attackRemainingMs - COMBAT_STEP_MS),
  }));
  const supportDamage = weaponForLevel(previous.weaponLevel ?? 1).damage;
  for (let soldierIndex = 0; soldierIndex < supportSoldiers.length; soldierIndex++) {
    const soldier = supportSoldiers[soldierIndex];
    if (soldier.attackRemainingMs > 0) continue;
    let target = -1; let distance = Infinity;
    monsters.forEach((monster, index) => {
      if (monster.hp <= 0 || monster.status === 'waiting' || monster.status === 'retiring'
        || monster.position.y < 0 || monster.position.y > RULES.arena.baseTop) return;
      const candidate = Math.hypot(monster.position.x - soldier.position.x, monster.position.y - soldier.position.y);
      if (candidate < distance) { distance = candidate; target = index; }
    });
    if (target < 0) continue;
    damageMonster(target, supportDamage, 'soldier');
    supportSoldiers[soldierIndex] = { ...soldier, attackRemainingMs: 2000 };
  }
  let pet = previous.pet;
  if (pet) {
    pet = { ...pet, attackRemainingMs: Math.max(0, pet.attackRemainingMs - COMBAT_STEP_MS) };
    if (pet.attackRemainingMs === 0) {
      const position = battlePetPosition(player);
      let target = -1; let distance = Infinity;
      monsters.forEach((monster, index) => {
        if (monster.hp <= 0 || monster.status === 'waiting' || monster.status === 'retiring'
          || monster.position.y < 0 || monster.position.y > RULES.arena.baseTop) return;
        const candidate = Math.hypot(monster.position.x - position.x, monster.position.y - position.y);
        if (candidate < distance) { distance = candidate; target = index; }
      });
      if (target >= 0) {
        impacts.push({ kind: 'lightning', position, target: monsters[target].position, untilTick: tick + 35 });
        damageMonster(target, petDamage(pet.level), 'pet');
        pet = { ...pet, attackRemainingMs: PET_ATTACK_INTERVAL_MS };
      }
    }
  }
  let baseHp = previous.base.hp;
  // Approved B6 ordering: a monster killed this step cannot attack, even if due.
  monsters.forEach((monster, index) => {
    if (baseHp <= 0 || monster.hp <= 0 || monster.status !== 'attackingBase' || monster.attackRemainingMs > EPSILON) return;
    const attackSequence = monster.attackSequence + 1;
    const attackId = `${previous.context.combatId}:${monster.id}:attack:${attackSequence}`;
    monsters[index] = { ...monster, attackSequence, attackRemainingMs: monster.attackRemainingMs + (monster.attackIntervalMs ?? RULES.monster.attackIntervalMs) };
    if (attacks.has(attackId)) return;
    attacks.add(attackId);
    const soldierIndex = supportSoldiers.findIndex(soldier => soldier.hp > 0);
    if (soldierIndex >= 0) {
      const soldier = supportSoldiers[soldierIndex];
      const hp = Math.max(0, soldier.hp - (monster.attackDamage ?? RULES.monster.attackDamage));
      if (hp === 0) supportSoldiers.splice(soldierIndex, 1);
      else supportSoldiers[soldierIndex] = { ...soldier, hp };
      events.push({ type: 'supportSoldierDamaged', context: previous.context, tick, attackId, monsterId: monster.id, soldierId: soldier.id, hp });
      if (hp === 0) events.push({ type: 'supportSoldierDefeated', context: previous.context, tick, attackId, monsterId: monster.id, soldierId: soldier.id });
      return;
    }
    baseHp = Math.max(0, baseHp - (monster.attackDamage ?? RULES.monster.attackDamage));
    events.push({ type: 'baseDamaged', context: previous.context, tick, attackId, monsterId: monster.id, hp: baseHp });
  });
  const status = baseHp === 0 ? 'baseDestroyed' : monsters.every(monster => defeated.has(monster.id)) ? 'cleared' : 'fighting';
  if (status === 'baseDestroyed') events.push({ type: 'baseDestroyed', context: previous.context, tick });
  let projectiles: readonly ProjectileState[] = status === 'fighting' ? moved.filter(projectile => !consumed.has(projectile.id)
    && projectile.position.y + projectile.height / 2 >= 0
    && projectile.position.x + projectile.width / 2 >= 0
    && projectile.position.x - projectile.width / 2 <= RULES.arena.width) : [];
  const target = previous.automatic ? findAutomaticTarget(monsters) : undefined;
  const aimDirection = target ? (previous.automatic
    ? directionToMuzzle(player, target.position, AUTO_MUZZLE_LATERAL)
    : directionTo(player, target.position)) : previous.aimDirection;
  const weapon = getWeaponParameters(previous.skills);
  let shotRemainingMs = previous.shotRemainingMs - COMBAT_STEP_MS;
  let nextProjectileSequence = previous.nextProjectileSequence;
  let elementReadyTick = previous.elementReadyTick ?? 500;
  let firepowerUntilTick = previous.firepowerUntilTick;
  let firepowerReadyTick = previous.firepowerReadyTick;
  if (previous.skills.firepower && tick >= (firepowerReadyTick ?? 0)) { firepowerUntilTick = tick + 500; firepowerReadyTick = tick + 2000; }
  const firepowerActive = !!previous.skills.firepower && tick < (firepowerUntilTick ?? 0);
  if (status === 'fighting' && shotRemainingMs <= EPSILON && (!previous.automatic || target)) {
    const charged = tick >= elementReadyTick && !!(previous.skills.flame || previous.skills.frost || previous.skills.lightning);
    projectiles = [...projectiles, ...volley({ ...previous, player, monsters, ...(aimDirection ? { aimDirection } : {}) }, weapon, charged, firepowerActive)];
    if (charged) elementReadyTick = tick + 500;
    nextProjectileSequence += weapon.count;
    shotRemainingMs += weapon.intervalMs;
  }
  if (projectiles.length > MAX_PROJECTILES) throw new RangeError('弹体数量超过已确认参数推导的上限');
  const state = freezeState({ ...previous, ...(aimDirection ? { aimDirection } : {}), tick, ...(firepowerUntilTick !== undefined ? { firepowerUntilTick } : {}), ...(firepowerReadyTick !== undefined ? { firepowerReadyTick } : {}), status, player, base: { ...previous.base, hp: baseHp }, monsters, supportSoldiers, ...(pet ? { pet } : {}),
    elementReadyTick, elementImpacts: impacts, projectiles, shotRemainingMs: Math.max(0, shotRemainingMs), nextProjectileSequence,
    defeatedMonsterIds: [...defeated], processedBaseAttackIds: [...attacks] });
  return { state, events: Object.freeze(events.map(event => Object.freeze(event))) };
}

export function rebindCombatGeneration(state: CombatState, generation: number): CombatState {
  if (!Number.isSafeInteger(generation) || generation <= state.context.generation) throw new RangeError('恢复时 generation 必须递增');
  return freezeState({ ...state, context: { ...state.context, generation } });
}


export function applyCombatSkills(state: CombatState, skills: SkillLevels): CombatState {
  getWeaponParameters(skills);
  return freezeState({ ...state, skills });
}


export function findAutomaticTarget(monsters: readonly MonsterState[]): MonsterState | undefined {
  let target: MonsterState | undefined;
  for (const monster of monsters) {
    if (monster.hp <= 0 || monster.status === 'waiting' || monster.status === 'retiring' || monster.position.x < 0 || monster.position.x > RULES.arena.width
      || monster.position.y < 0 || monster.position.y > RULES.arena.baseTop) continue;
    // Strict greater-than preserves spawn order when distance to the defense line ties.
    if (!target || monster.position.y > target.position.y) target = monster;
  }
  return target;
}
function directionTo(from: Point, to: Point): Point {
  const dx = to.x - from.x; const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  return distance > EPSILON ? { x: dx / distance, y: dy / distance } : { x: 0, y: -1 };
}
function supportPosition(player: Point, slot: number, count: number): Point {
  const offsets = count === 1 ? [-30] : count === 2 ? [-40, 40] : [-50, 0, 50];
  return { x: playerX(player.x + (offsets[slot] ?? 0)), y: player.y + 20 };
}
function directionToMuzzle(from: Point, to: Point, lateral: number): Point {
  const dx = to.x - from.x; const dy = to.y - from.y;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared <= EPSILON) return { x: 0, y: -1 };
  // Compensate for the visible muzzle being to the right of the sprite center,
  // so the barrel ray from that muzzle still passes through the selected target.
  const forward = Math.sqrt(Math.max(0, distanceSquared - lateral * lateral));
  if (distanceSquared < lateral * lateral) return directionTo(from, to);
  return { x: (dx * forward + dy * lateral) / distanceSquared,
    y: (dy * forward - dx * lateral) / distanceSquared };
}

// Attaching a companion never resets an existing attack timer.
export function attachCombatPet(state: CombatState, pet: BattlePet): CombatState {
  if (state.pet || state.status === 'baseDestroyed') return state;
  return freezeState({ ...state, pet: createBattlePet(pet, pet.attackRemainingMs) });
}
