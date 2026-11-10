import { enemyStats, armoredDamage } from './enemy-types';
import { enemyLayer, soldierLayer, soldierType, soldierCapability, targetable, validateSoldierIdentity } from './army';
import { invasionBatchPositions, invasionBatchSize } from './spawn-pressure';
import { qualityEffects, skillLevels } from './quality-skills';
import type { SkillCollection } from './skill-quality';
import { coinRulesFor } from './difficulty';
import type { DifficultyId } from './difficulty';
import { battlePetPosition, createBattlePet, PET_ATTACK_INTERVAL_MS, petDamage } from '../pets/battle';
import type { BattlePet } from '../pets/battle';
import { weaponForLevel } from '../weapons/catalog';
import { grandBossWindingUp, bossChargePhase, fortressMaxHp, monsterStats } from './battle-progression';
import { ALL_BATTLE_WORDS as BATTLE_WORDS } from './levels';
import { validateSkillLevels } from './plans';
import { FORTRESS_RULES as RULES, FORTRESS_SKILLS } from './rules';
import type { CombatContext, CombatEvent, ElementImpact, CombatState, MonsterSpawn, MonsterState, Point, ProjectileState, Rect, SessionPlan, SkillLevels, SupportSoldierState } from './types';
import { assertNoFortressIssues, validateSessionPlan } from './validation';

// Technical simulation cadence, not a configurable gameplay/balance value.
export const COMBAT_STEP_MS = 10;
export const FROST_ENERGY_MAX = 30;
const EPSILON = 1e-8;
const AUTO_MUZZLE_LATERAL = 16.8;
const AUTO_MUZZLE_FORWARD = 34.4;
export const SUPPORT_SOLDIER_MAX_HP = 30;
const QUALITY_PROJECTILE_LIMIT = (Math.ceil(4000 / 160) + 1) * 8; // Four-second lifetime, fastest cadence, largest volley.
const MIN_INTERVAL = Math.min(...FORTRESS_SKILLS[1].values);
const MAX_SHOTS = Math.max(...FORTRESS_SKILLS[0].values);
export const MAX_PROJECTILES = (Math.ceil(
  Math.hypot(RULES.arena.width, RULES.arena.height + RULES.projectile.height) / RULES.projectile.speed * 1000 / MIN_INTERVAL,
) + 1) * MAX_SHOTS;
export interface CombatInput { readonly playerX?: number }
export interface WeaponParameters { readonly count: number; readonly intervalMs: number; readonly width: number }
export interface CombatStep { readonly state: CombatState; readonly events: readonly CombatEvent[] }
export interface CreateCombatOptions {
  readonly difficulty?: { readonly levelId: number; readonly heroLevel: number; readonly mode?: DifficultyId };
  readonly houseLevel?: number;
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
  readonly skillCollection?: SkillCollection;
  readonly supportSoldiers?: readonly SupportSoldierState[];
  readonly monsterHitboxes?: Readonly<Record<string, Rect>>;
  readonly monsterHitbox: Rect; // required; no fake/default monster art geometry
}

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} 必须是有限数值`);
}
function playerX(value: number, width = RULES.arena.width): number {
  finite(value, 'playerX');
  return Math.max(RULES.arena.playerMinX, Math.min(width - RULES.arena.playerMinX, value));
}
export function getWeaponParameters(levels: SkillLevels, collection?: SkillCollection): WeaponParameters {
  if (collection) return qualityEffects(collection);
  validateSkillLevels(levels);
  const value = (id: 'doubleShot' | 'fireRate' | 'bulletWidth'): number => {
    const definition = FORTRESS_SKILLS.find(skill => skill.id === id)!;
    return definition.values[levels[id]];
  };
  return Object.freeze({ count: value('doubleShot'), intervalMs: value('fireRate'), width: value('bulletWidth') });
}
function freezeState(state: CombatState): CombatState {
  return Object.freeze({ ...state,
    ...(state.flameVolleyHits ? { flameVolleyHits: Object.freeze(Object.fromEntries(Object.entries(state.flameVolleyHits).map(([id, hits]) => [id, Object.freeze([...hits])]))) } : {}),
    ...(state.pet ? { pet: createBattlePet(state.pet, state.pet.attackRemainingMs, state.pet) } : {}),
    ...(state.aimDirection ? { aimDirection: Object.freeze({ ...state.aimDirection }) } : {}),
    ...(state.elementImpacts ? { elementImpacts: Object.freeze(state.elementImpacts.map(impact => Object.freeze({ ...impact, position: Object.freeze({ ...impact.position }), ...(impact.target ? { target: Object.freeze({ ...impact.target }) } : {}) }))) } : {}),
    context: Object.freeze({ ...state.context }), player: Object.freeze({ ...state.player }),
    base: Object.freeze({ ...state.base }), skills: Object.freeze({ ...state.skills }),
    monsters: Object.freeze(state.monsters.map(monster => Object.isFrozen(monster) ? monster : Object.freeze({ ...monster,
      ...(monster.burn ? { burn: Object.freeze({ ...monster.burn }) } : {}),
      position: Object.freeze({ ...monster.position }), hitbox: Object.freeze({ ...monster.hitbox }),
    }))),
    fallenSoldiers: Object.freeze((state.fallenSoldiers ?? []).map(soldier => Object.freeze({...soldier, position: Object.freeze({...soldier.position})}))),
    supportSoldiers: Object.freeze((state.supportSoldiers ?? []).map(soldier => Object.freeze({ ...soldier, position: Object.freeze({ ...soldier.position }), ...(soldier.shotTarget ? { shotTarget: Object.freeze({ ...soldier.shotTarget }) } : {}) }))),
    projectiles: Object.freeze(state.projectiles.map(projectile => Object.freeze({ ...projectile,
      ...(projectile.hitMonsterIds ? { hitMonsterIds: Object.freeze([...projectile.hitMonsterIds]) } : {}),
      ...(projectile.elements ? { elements: Object.freeze({ ...projectile.elements }) } : {}),
      position: Object.freeze({ ...projectile.position }), previousPosition: Object.freeze({ ...projectile.previousPosition }),
      ...(projectile.direction ? { direction: Object.freeze({ ...projectile.direction }) } : {}),
    }))),
    defeatedMonsterIds: Object.freeze([...state.defeatedMonsterIds]),
    processedBaseAttackIds: Object.freeze([...state.processedBaseAttackIds]),
  });
}
// Reflow positions, not sprite sizes or hitboxes. No time, damage, rewards or
// spawn identities advance when a device rotates or changes its split view.
export function resizeCombatArena(state: CombatState, width: number): CombatState {
  if (!Number.isFinite(width) || width <= RULES.monster.spawnMinX * 2) throw new RangeError('战场宽度不足');
  const before = state.arenaWidth ?? RULES.arena.width;
  if (Math.abs(before - width) < 1e-8) return state;
  const ratio = width / before;
  const point = (p: Point): Point => ({x: p.x * ratio, y: p.y});
  const direction = (p: Point): Point => { const x = p.x * ratio; const length = Math.hypot(x, p.y); return length ? {x: x / length, y: p.y / length} : p; };
  const player = point(state.player);
  const entryPoint = (p: Point): Point => state.tick === 0
    ? {x: RULES.monster.spawnMinX + (p.x - RULES.monster.spawnMinX) * (width - RULES.monster.spawnMinX * 2) / (before - RULES.monster.spawnMinX * 2), y: p.y}
    : point(p);
  const monsters = state.monsters.map(monster => ({...monster, position: entryPoint(monster.position)}));
  const target = state.automatic ? findAutomaticTarget(monsters, width) : undefined;
  return freezeState({...state, arenaWidth: width, player, monsters,
    ...(state.incomingMonsters ? {incomingMonsters: Object.freeze(state.incomingMonsters.map(monster => Object.freeze({...monster, position: Object.freeze(entryPoint(monster.position))})))} : {}),
    supportSoldiers: (state.supportSoldiers ?? []).map(soldier => ({...soldier, position: supportPosition(player, soldier.slot, state.supportSoldiers!.length, width), ...(soldier.shotTarget ? {shotTarget: point(soldier.shotTarget)} : {})})),
    fallenSoldiers: (state.fallenSoldiers ?? []).map(soldier => ({...soldier, position: point(soldier.position)})),
    projectiles: state.projectiles.map(projectile => ({...projectile, position: point(projectile.position), previousPosition: point(projectile.previousPosition), ...(projectile.direction ? {direction: direction(projectile.direction)} : {})})),
    ...(state.aimDirection ? {aimDirection: target ? directionToMuzzle(player, target.position, AUTO_MUZZLE_LATERAL) : direction(state.aimDirection)} : {}),
    ...(state.elementImpacts ? {elementImpacts: state.elementImpacts.map(impact => ({...impact, position: point(impact.position), ...(impact.target ? {target: point(impact.target)} : {})}))} : {}),
  });
}
function volley(state: CombatState, weapon: WeaponParameters, charged = false, firepowerActive = false): readonly ProjectileState[] {
  // Matches the muzzle in hero-back-weapon-{1..7}.svg when the 160x200 sprite
  // is drawn at 48x60 with its center on player: x=+16.8, y=-34.4.
  const muzzle = state.automatic ? { lateral: AUTO_MUZZLE_LATERAL, forward: AUTO_MUZZLE_FORWARD } : { lateral: 0, forward: 0 };
  const usedTargets = new Set<string>();
  const fireFan = charged && !!state.skills.flame && !!state.skills.doubleShot;
  return Array.from({ length: weapon.count }, (_, index) => {
    const offset = (index - (weapon.count - 1) / 2) * RULES.projectile.spread;
    const direction = state.aimDirection ?? { x: 0, y: -1 };
    const side = offset + muzzle.lateral;
    const position = { x: state.player.x - direction.y * side + direction.x * muzzle.forward,
      y: state.player.y + direction.x * side + direction.y * muzzle.forward };
    const homingTargets = state.skills.homing ? state.monsters.filter(monster => targetable(monster) && monster.position.y >= 0 && monster.position.y <= RULES.arena.baseTop) : [];
    const target = homingTargets.filter(monster => !usedTargets.has(monster.id)).sort((a, b) => Math.hypot(a.position.x - position.x, a.position.y - position.y) - Math.hypot(b.position.x - position.x, b.position.y - position.y))[0]
      ?? homingTargets.sort((a, b) => Math.hypot(a.position.x - position.x, a.position.y - position.y) - Math.hypot(b.position.x - position.x, b.position.y - position.y))[0];
    if (target) usedTargets.add(target.id);
    return { id: `${state.context.sessionId}:${state.context.combatId}:bullet:${state.nextProjectileSequence + index}`,
      ...(state.skillCollection ? { skillCollection: state.skillCollection, expiresAtTick: state.tick + 400, remainingPenetrations: qualityEffects(state.skillCollection).homingPenetrations, hitMonsterIds: [] } : {}),
      ...(charged && (index === 0 || (fireFan && index < 3)) ? { elements: { flame: state.skills.flame ?? 0, frost: index === 0 ? state.skills.frost ?? 0 : 0, lightning: index === 0 ? state.skills.lightning ?? 0 : 0 },
        ...(fireFan ? { flameVolleyId: `${state.context.combatId}:volley:${state.nextProjectileSequence}` } : {}) } : {}),
      position, previousPosition: position, ...(target ? { direction: directionTo(position, target.position), targetMonsterId: target.id } : state.aimDirection ? { direction: state.aimDirection } : {}), ...(state.skills.homing ? { homing: true } : {}), width: weapon.width, height: RULES.projectile.height, damage: state.skillCollection ? Math.ceil(weaponForLevel(state.weaponLevel ?? 1).damage * qualityEffects(state.skillCollection).projectileMultiplier * (firepowerActive ? 1 + qualityEffects(state.skillCollection).firepowerBonus : 1)) : firepowerActive ? Math.round(weaponForLevel(state.weaponLevel ?? 1).damage * 1.5) : weaponForLevel(state.weaponLevel ?? 1).damage };
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
      || (spawn.dropCoins !== undefined && (!Number.isInteger(spawn.dropCoins) || spawn.dropCoins < 0 || spawn.dropCoins > coinRulesFor(options.difficulty?.mode).bossMax))
      || (spawn.soldierDropCount !== undefined && (!spawn.boss || !Number.isInteger(spawn.soldierDropCount) || spawn.soldierDropCount < 0 || spawn.soldierDropCount > 3))
      || spawn.position.y !== RULES.monster.startY)) throw new Error('僵尸批次必须包含唯一实体、已允许的水果和有效出生位置');
  return initializeCombat(options, { sessionId: options.sessionId, waveId: `${options.sessionId}:opening`, combatId: options.combatId, generation: options.generation }, options.spawns);
}
function initializeCombat(options: Omit<CreateCombatOptions, 'plan' | 'waveIndex'>, context: CombatContext, spawns: readonly MonsterSpawn[]): CombatState {
  if (!options.combatId.trim()) throw new RangeError('combatId 不能为空');
  if (!Number.isSafeInteger(options.generation) || options.generation < 0) throw new RangeError('generation 必须为非负安全整数');
  const maxHp = options.difficulty ? fortressMaxHp(options.difficulty.levelId, options.houseLevel) : RULES.base.maxHp;
  if (!Number.isSafeInteger(options.baseHp) || options.baseHp <= 0 || options.baseHp > maxHp) throw new RangeError(`baseHp 必须为1—${maxHp}的整数；失败局不能进入下一波`);
  const weapon = getWeaponParameters(options.skills, options.skillCollection);
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
  spawns.forEach(enemyLayer);
  options.supportSoldiers?.forEach(validateSoldierIdentity);
  if ((options.supportSoldiers?.length ?? 0) > 3 || options.supportSoldiers?.some(soldier => !soldier.id.trim() || !Number.isInteger(soldier.slot) || soldier.slot < 0 || soldier.slot > 2
    || !Number.isInteger(soldier.maxHp) || soldier.maxHp !== SUPPORT_SOLDIER_MAX_HP || !Number.isInteger(soldier.hp) || soldier.hp <= 0 || soldier.hp > soldier.maxHp
    || !Number.isFinite(soldier.attackRemainingMs) || soldier.attackRemainingMs < 0)) throw new Error('援军状态无效');
  const state: CombatState = {
    houseLevel: options.houseLevel ?? 1, weaponLevel, context, monsterSpeed, frostEnergy: 0, flameVolleyHits: {}, elementReadyTick: 500, elementImpacts: [],
    ...(options.automatic ? { automatic: true, aimDirection: { x: 0, y: -1 } } : {}),
    tick: 0, ...(options.skills.firepower ? { firepowerUntilTick: options.skillCollection ? qualityEffects(options.skillCollection).firepowerTicks : 500, firepowerReadyTick: 2000 } : {}), status: 'fighting', player: { x: playerX(options.playerX), y: RULES.arena.playerY },
    base: { hp: options.baseHp, maxHp }, skills: options.skills, ...(options.skillCollection ? { skillCollection: options.skillCollection } : {}),
    monsters: spawns.map(spawn => {
      const stats = options.difficulty ? monsterStats(options.difficulty.levelId, options.difficulty.heroLevel, spawn.bossKind === 'grand' ? 'grand' : spawn.boss, options.difficulty.mode) : { hp: RULES.monster.maxHp, attackDamage: RULES.monster.attackDamage };
      const variant = enemyStats(spawn.enemyType);
      const interval = spawn.enemyType === 'giant' ? 3000 : attackIntervalMs;
      const size = spawn.bossKind === 'grand' ? 2 : spawn.boss ? 1.5 : spawn.enemyType === 'giant' ? 1.5 : 1;
      const hitbox = options.monsterHitboxes?.[spawn.wordId] ?? box;
      return { id: spawn.monsterId, wordId: spawn.wordId, position: spawn.position, ...(spawn.enemyType ? {enemyType: spawn.enemyType} : {}),
      ...(spawn.boss ? { boss: true, bossKind: spawn.bossKind ?? 'iron', ...(spawn.bossKind === 'grand' ? { shockwaveDamage: stats.shockwaveDamage ?? RULES.monster.attackDamage * 3 } : {}) } : {}), ...(spawn.dropCoins !== undefined ? { dropCoins: spawn.dropCoins } : {}), ...(spawn.soldierDropCount !== undefined ? { soldierDropCount: spawn.soldierDropCount } : {}), attackDamage: Math.ceil(stats.attackDamage * variant.attack),
      ...(spawn.spawnAtMs !== undefined ? { spawnAtMs: spawn.spawnAtMs } : {}),
      hitbox: { x: hitbox.x * size, y: hitbox.y * size, width: hitbox.width * size, height: hitbox.height * size }, hp: Math.ceil(stats.hp * variant.hp), maxHp: Math.ceil(stats.hp * variant.hp), status: (spawn.spawnAtMs ?? 0) > 0 ? 'waiting' : 'entering',
      attackIntervalMs: interval, attackRemainingMs: interval, attackSequence: 0 }; }),
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
  if (!monster.boss && (monster.frozenUntilTick ?? -1) >= elapsedMs / COMBAT_STEP_MS) return monster;
  if (monster.status === 'attackingBase') return monster.enemyType === 'exploder'
    ? { ...monster, explosionRemainingMs: Math.max(0, (monster.explosionRemainingMs ?? 1000) - COMBAT_STEP_MS) }
    : { ...monster, attackRemainingMs: monster.attackRemainingMs - COMBAT_STEP_MS };
  speed *= enemyStats(monster.enemyType).speed;
  if (monster.boss) speed *= .7 * (monster.bossKind !== 'grand' && bossChargePhase(elapsedMs - (monster.spawnAtMs ?? 0)) === 'charging' ? 1.5 : 1);
  if ((monster.slowUntilTick ?? 0) > elapsedMs / COMBAT_STEP_MS) speed *= 1 - (monster.slowRatio ?? 0);
  const distance = RULES.monster.attackY - monster.position.y;
  const travel = speed * COMBAT_STEP_MS / 1000;
  const arrived = distance <= travel + EPSILON;
  const y = arrived ? RULES.monster.attackY : monster.position.y + travel;
  const leftoverMs = arrived ? Math.max(0, COMBAT_STEP_MS - distance / speed * 1000) : 0;
  return { ...monster, position: { x: monster.position.x, y },
    ...(arrived && monster.enemyType === 'exploder' ? {explosionRemainingMs: 1000 - leftoverMs} : {}),
    status: arrived ? 'attackingBase' : y < 0 ? 'entering' : 'alive',
    attackRemainingMs: arrived ? (monster.attackIntervalMs ?? RULES.monster.attackIntervalMs) - leftoverMs : monster.attackRemainingMs };
}

// One fixed logical step. Only pass snapshots from createCombat/stepCombat.
// No callback/timer/image/answer event can directly kill a monster here.
export function stepCombat(previous: CombatState, input: CombatInput = {}): CombatStep {
  if (previous.status !== 'fighting') return { state: previous, events: Object.freeze([]) };
  const player = { x: previous.automatic || input.playerX === undefined ? previous.player.x : playerX(input.playerX, previous.arenaWidth), y: RULES.arena.playerY };
  const tick = previous.tick + 1;
  const events: CombatEvent[] = [];
  const defeated = new Set(previous.defeatedMonsterIds);
  const attacks = new Set(previous.processedBaseAttackIds);
  const fallenSoldiers = [...(previous.fallenSoldiers ?? [])];
  let supportSoldiers = [...(previous.supportSoldiers ?? [])];
  const pending = previous.incomingMonsters ?? [];
  let arrivalCount = 0;
  let invasion = previous.invasion;
  const waveStarts = previous.waveStartTimesMs;
  if (invasion && pending.length) {
    const nextWave = waveStarts!.filter(time => time <= pending[0].spawnAtMs!).length;
    const alive = previous.monsters.filter(monster => monster.hp > 0 && monster.status !== 'retiring').length;
    const limit = invasion.aliveLimits?.[nextWave - 1] ?? Infinity;
    if (tick * COMBAT_STEP_MS >= invasion.nextAtMs && alive < limit) {
      // Easy pressure follows wave progress, so slow clearing does not increase batches.
      const batchSize = invasion.batchLimits?.[nextWave - 1] ?? invasionBatchSize(tick * COMBAT_STEP_MS, invasion.batchLimit ?? 1);
      // Keep each batch within its wave; the following wave keeps its own limit/event.
      const nextWaveAt = waveStarts![nextWave] ?? Infinity;
      while (arrivalCount < pending.length && arrivalCount < batchSize && arrivalCount < limit - alive
        && pending[arrivalCount].spawnAtMs! < nextWaveAt) arrivalCount++;
      // A delayed batch never catches up by firing several batches back-to-back.
      const interval = pending.length > arrivalCount ? pending[arrivalCount].spawnAtMs! - pending[arrivalCount - 1].spawnAtMs! : 0;
      invasion = Object.freeze({...invasion, nextAtMs:tick * COMBAT_STEP_MS + interval, waveNumber:nextWave});
      if (nextWave !== previous.invasion!.waveNumber) events.push({type:'waveStarted', context:previous.context, tick, waveNumber:nextWave});
    }
  } else if (!invasion) {
    while (arrivalCount < pending.length && (pending[arrivalCount].spawnAtMs ?? 0) <= tick * COMBAT_STEP_MS) arrivalCount++;
    if (waveStarts) {
      const before = waveStarts.filter(time => time <= previous.tick * COMBAT_STEP_MS).length;
      const after = waveStarts.filter(time => time <= tick * COMBAT_STEP_MS).length;
      if (after !== before) events.push({type:'waveStarted', context:previous.context, tick, waveNumber:after});
    }
  }
  const incomingMonsters = arrivalCount ? Object.freeze(pending.slice(arrivalCount)) : pending;
  const batch = pending.slice(0, arrivalCount);
  const positions = invasion && arrivalCount ? invasionBatchPositions(batch.map(monster => monster.id), RULES.monster.startY, previous.arenaWidth) : undefined;
  const admitted = invasion ? batch.map((monster, index) => ({...monster, spawnAtMs:tick * COMBAT_STEP_MS,
    ...(positions ? {position: positions[index]} : {})})) : batch;
  const arrivals = arrivalCount ? [...previous.monsters, ...admitted] : previous.monsters;
  const monsters = arrivals.map(monster => advanceMonster(monster, previous.monsterSpeed ?? RULES.monster.speed, tick * COMBAT_STEP_MS));
  const activeTargets = monsters.filter(monster => targetable(monster) && monster.position.y >= 0 && monster.position.y <= RULES.arena.baseTop);
  const moved = previous.projectiles.filter(projectile => (projectile.expiresAtTick ?? Infinity) > tick).map(projectile => {
    // Ordinary bullets need no target search. Homing uses one linear scan,
    // preserving the first target on ties without sorting/allocating per bullet.
    let target: MonsterState | undefined;
    if (projectile.homing) {
      let nearest = Infinity;
      for (const monster of activeTargets) {
        if (!targetable(monster, projectile.capability) || projectile.hitMonsterIds?.includes(monster.id)) continue;
        if (monster.id === projectile.targetMonsterId) { target = monster; break; }
        const distance = (monster.position.x - projectile.position.x) ** 2 + (monster.position.y - projectile.position.y) ** 2;
        if (distance < nearest) { nearest = distance; target = monster; }
      }
    }
    const direction = target ? directionTo(projectile.position, target.position) : projectile.direction ?? { x: 0, y: -1 };
    return { ...projectile, ...(projectile.homing ? { targetMonsterId: target?.id } : {}), direction, previousPosition: projectile.position,
      position: { x: projectile.position.x + direction.x * RULES.projectile.speed * COMBAT_STEP_MS / 1000, y: projectile.position.y + direction.y * RULES.projectile.speed * COMBAT_STEP_MS / 1000 } };
  });
  // Resolve contacts by flight time; IDs break ties deterministically.
  const contacts: { time: number; projectileIndex: number; monsterIndex: number }[] = [];
  moved.forEach((projectile, projectileIndex) => {
    monsters.forEach((monster, monsterIndex) => {
      if (!targetable(monster, projectile.capability) || defeated.has(monster.id) || projectile.hitMonsterIds?.includes(monster.id)) return;
      const direction = projectile.direction ?? { x: 0, y: -1 };
      const width = Math.abs(direction.y) * projectile.width + Math.abs(direction.x) * projectile.height;
      const height = Math.abs(direction.x) * projectile.width + Math.abs(direction.y) * projectile.height;
      const time = sweptHitTime(projectile.previousPosition, projectile.position, width, height,
        arrivals[monsterIndex].position, monster.position, monster.hitbox);
      if (time !== null) contacts.push({ time, projectileIndex, monsterIndex });
    });
  });
  contacts.sort((a, b) => a.time - b.time || a.projectileIndex - b.projectileIndex || a.monsterIndex - b.monsterIndex);
  const impacts: ElementImpact[] = (previous.elementImpacts ?? []).filter(impact => impact.untilTick > tick);
  const damageMonster = (index: number, damage: number, kind: 'projectile' | 'flame' | 'lightning' | 'soldier' | 'pet') => {
    const monster = monsters[index]; if (!targetable(monster)) return;
    if (!Number.isSafeInteger(damage) || !Number.isSafeInteger(monster.hp)) throw new RangeError('怪物伤害与生命值必须为整数');
    damage = armoredDamage(monster.enemyType, damage, kind === 'projectile' || kind === 'soldier');
    if (monster.bossKind === 'grand' && grandBossWindingUp(tick * COMBAT_STEP_MS - (monster.spawnAtMs ?? 0))) damage = Math.ceil(damage * 1.5);
    const hp = Math.max(0, monster.hp - damage);
    monsters[index] = { ...monster, hp, status: hp === 0 ? 'defeated' : monster.status };
    events.push({ type: 'monsterDamaged', context: previous.context, tick, monsterId: monster.id, hp, damage, kind, position: Object.freeze({ ...monster.position }) });
    if (hp === 0 && !defeated.has(monster.id)) {
      defeated.add(monster.id); events.push({ type: 'monsterDefeated', context: previous.context, tick, monsterId: monster.id, wordId: monster.wordId });
      if (monster.dropCoins) events.push({ type: 'coinsDropped', context: previous.context, tick, monsterId: monster.id, amount: monster.dropCoins, position: Object.freeze({ ...monster.position }) });
      if (monster.boss && monster.bossKind !== 'grand' && (monster.soldierDropCount ?? 0) > 0) {
        const count = Math.min(3, supportSoldiers.length + (monster.soldierDropCount ?? 0));
        while (supportSoldiers.length < count) {
          const slot = [0,1,2].find(slot => !supportSoldiers.some(soldier => soldier.slot === slot))!;
          supportSoldiers.push({id: `${monster.id}:soldier:${slot + 1}`, slot, source: 'boss',
            position: supportPosition(player, slot, count, previous.arenaWidth), hp: SUPPORT_SOLDIER_MAX_HP,
            maxHp: SUPPORT_SOLDIER_MAX_HP, attackRemainingMs: 2000});
        }
      }
    }
  };
  // Damage over time uses simulation ticks and the same kill/drop path as direct hits.
  monsters.forEach((monster, index) => {
    const burn = monster.burn;
    if (!burn || monster.hp <= 0 || monster.status === 'waiting' || monster.status === 'retiring') return;
    if (tick > burn.untilTick) { monsters[index] = { ...monster, burn: undefined }; return; }
    if (tick >= burn.nextTick) {
      damageMonster(index, burn.damage, 'flame');
      monsters[index] = { ...monsters[index], burn: { ...burn, nextTick: burn.nextTick + 100 } };
    }
  });
  const flameHits = new Map(Object.entries(previous.flameVolleyHits ?? {}).map(([id, hits]) => [id, new Set(hits)]));
  const consumed = new Set<string>();
  for (const contact of contacts) {
    const projectile = moved[contact.projectileIndex]; const monster = monsters[contact.monsterIndex];
    if (consumed.has(projectile.id) || defeated.has(monster.id) || projectile.hitMonsterIds?.includes(monster.id)) continue;
    if ((projectile.remainingPenetrations ?? 0) > 0) {
      moved[contact.projectileIndex] = { ...projectile, remainingPenetrations: projectile.remainingPenetrations! - 1,
        hitMonsterIds: [...(projectile.hitMonsterIds ?? []), monster.id], damage: Math.ceil(projectile.damage * .7), elements: undefined, targetMonsterId: undefined };
    } else consumed.add(projectile.id);
    damageMonster(contact.monsterIndex, projectile.damage, 'projectile');
    const elements = projectile.elements;
    const effect = projectile.skillCollection ? qualityEffects(projectile.skillCollection) : undefined;
    const position = { x: projectile.previousPosition.x + (projectile.position.x - projectile.previousPosition.x) * contact.time, y: projectile.previousPosition.y + (projectile.position.y - projectile.previousPosition.y) * contact.time };
    const nearby = (index: number, radius: number) => targetable(monsters[index]) && Math.hypot(monsters[index].position.x - position.x, monsters[index].position.y - position.y) <= radius;
    if (elements?.frost) {
      if (monsters[contact.monsterIndex].hp > 0) monsters[contact.monsterIndex] = applyFrost(monsters[contact.monsterIndex], tick, effect?.frostSlow ?? .2 + .05 * elements.frost, 200, effect?.freezeTicks ?? 0);
      impacts.push({ kind: 'frost', position: monster.position, untilTick: tick + 35 });
    }
    if (elements?.lightning) {
      const targets = monsters.map((candidate, index) => ({ index, distance: Math.hypot(candidate.position.x - position.x, candidate.position.y - position.y) }))
        .filter(item => item.index !== contact.monsterIndex && nearby(item.index, effect?.lightningRange ?? 90))
        .sort((a,b) => a.distance - b.distance || a.index - b.index).slice(0, effect?.lightningTargets ?? 1);
      for (const {index} of targets) {
        impacts.push({ kind: 'lightning', iceChain: !!elements.frost, position, target: monsters[index].position, untilTick: tick + 35 });
        damageMonster(index, effect?.lightningDamage ?? 10 + 5 * elements.lightning, 'lightning');
        if (elements.frost && monsters[index].hp > 0) monsters[index] = applyFrost(monsters[index], tick, effect?.frostSlow ?? .2 + .05 * elements.frost, 200, effect?.freezeTicks ?? 0);
      }
    }
    if (elements?.flame) {
      impacts.push({ kind: 'flame', position, radius: effect?.flameRadius ?? 45, untilTick: tick + 35 });
      monsters.forEach((_candidate, index) => {
        if (!nearby(index, effect?.flameRadius ?? 45)) return;
        if (projectile.flameVolleyId) {
          const hits = flameHits.get(projectile.flameVolleyId) ?? new Set<string>();
          if (hits.has(monsters[index].id)) return;
          hits.add(monsters[index].id); flameHits.set(projectile.flameVolleyId, hits);
        }
        const damage = Math.ceil((effect?.flameDamage ?? 10 + 5 * elements.flame!) * (projectile.flameVolleyId ? .5 : 1));
        damageMonster(index, damage, 'flame');
        if (effect?.burnRatio && monsters[index].hp > 0) {
          const current = monsters[index].burn;
          monsters[index] = { ...monsters[index], burn: { damage: Math.ceil(damage * effect.burnRatio), untilTick: tick + 200,
            nextTick: current && current.untilTick >= tick ? current.nextTick : tick + 100 } };
        }
      });
    }
  }
  const supportCount = supportSoldiers.length;
  supportSoldiers = supportSoldiers.map(soldier => ({ ...soldier,
    position: supportPosition(player, soldier.slot, supportCount, previous.arenaWidth),
    attackRemainingMs: Math.max(0, soldier.attackRemainingMs - COMBAT_STEP_MS),
  }));
  const supportDamage = weaponForLevel(previous.weaponLevel ?? 1).damage;
  for (let soldierIndex = 0; soldierIndex < supportSoldiers.length; soldierIndex++) {
    const soldier = supportSoldiers[soldierIndex];
    if (soldier.attackRemainingMs > 0) continue;
    let target = -1; let distance = Infinity;
    monsters.forEach((monster, index) => {
      if (!targetable(monster, soldierCapability(soldier))
        || monster.position.y < 0 || monster.position.y > RULES.arena.baseTop) return;
      const candidate = Math.hypot(monster.position.x - soldier.position.x, monster.position.y - soldier.position.y);
      if (candidate < distance) { distance = candidate; target = index; }
    });
    if (target < 0) continue;
    damageMonster(target, supportDamage, 'soldier');
    supportSoldiers[soldierIndex] = { ...soldier, attackRemainingMs: 2000, lastShotTick: tick, shotCombatId: previous.context.combatId, shotTarget: monsters[target].position };
  }
  let pet = previous.pet ? createBattlePet(previous.pet, previous.pet.attackRemainingMs, previous.pet) : undefined;
  if (pet && pet.hp > 0) {
    pet = { ...pet, attackRemainingMs: Math.max(0, pet.attackRemainingMs - COMBAT_STEP_MS) };
    if (pet.attackRemainingMs === 0) {
      const position = battlePetPosition(player, previous.arenaWidth);
      let target = -1; let distance = Infinity;
      monsters.forEach((monster, index) => {
        if (!targetable(monster)
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
  // Resolve shockwaves after damage: a boss killed on release cannot attack.
  monsters.forEach(monster => {
    const elapsed = tick * COMBAT_STEP_MS - (monster.spawnAtMs ?? 0);
    if (monster.bossKind !== 'grand' || monster.hp <= 0 || baseHp <= 0 || elapsed < 11000 || Math.floor((elapsed - 1000) / 10000) === Math.floor((elapsed - COMBAT_STEP_MS - 1000) / 10000)) return;
    const attackId = `${previous.context.combatId}:${monster.id}:shockwave:${Math.floor(elapsed / 10000)}`;
    if (attacks.has(attackId)) return;
    attacks.add(attackId);
    baseHp = Math.max(0, baseHp - (monster.shockwaveDamage ?? RULES.monster.attackDamage * 3));
    events.push({ type: 'baseDamaged', context: previous.context, tick, attackId, monsterId: monster.id, hp: baseHp });
  });
  monsters.forEach((monster, index) => {
    if (baseHp <= 0 || !targetable(monster) || monster.enemyType !== 'exploder' || monster.status !== 'attackingBase'
      || (monster.frozenUntilTick ?? -1) >= tick || (monster.explosionRemainingMs ?? 1000) > EPSILON) return;
    const attackId = `${previous.context.combatId}:${monster.id}:explode`;
    if (attacks.has(attackId)) return;
    attacks.add(attackId); defeated.add(monster.id);
    monsters[index] = {...monster, hp:0, status:'retiring'};
    const damage = monster.attackDamage ?? RULES.monster.attackDamage * 2;
    supportSoldiers = supportSoldiers.flatMap(soldier => {
      if (soldierLayer(soldier) !== 'ground' || Math.hypot(soldier.position.x - monster.position.x, soldier.position.y - monster.position.y) > 60) return [soldier];
      const hp = Math.max(0, soldier.hp - damage);
      events.push({type:'supportSoldierDamaged',context:previous.context,tick,attackId,monsterId:monster.id,soldierId:soldier.id,hp});
      if (hp > 0) return [{...soldier,hp}];
      fallenSoldiers.push({...soldier,hp:0});
      events.push({type:'supportSoldierDefeated',context:previous.context,tick,attackId,monsterId:monster.id,soldierId:soldier.id});
      return [];
    });
    // The defense is a full-width horizontal line, not a point at screen center.
    if (Math.abs(RULES.arena.baseTop - monster.position.y) <= 60) {
      baseHp = Math.max(0, baseHp - damage);
      events.push({type:'baseDamaged',context:previous.context,tick,attackId,monsterId:monster.id,hp:baseHp});
    }
  });
  // Approved B6 ordering: a monster killed this step cannot attack, even if due.
  monsters.forEach((monster, index) => {
    if (baseHp <= 0 || monster.hp <= 0 || monster.enemyType === 'exploder' || (!monster.boss && (monster.frozenUntilTick ?? -1) >= tick) || monster.status !== 'attackingBase' || monster.attackRemainingMs > EPSILON) return;
    const attackSequence = monster.attackSequence + 1;
    const attackId = `${previous.context.combatId}:${monster.id}:attack:${attackSequence}`;
    monsters[index] = { ...monster, attackSequence, attackRemainingMs: monster.attackRemainingMs + (monster.attackIntervalMs ?? RULES.monster.attackIntervalMs) };
    if (attacks.has(attackId)) return;
    attacks.add(attackId);
    const candidates = supportSoldiers.map((soldier,index) => ({soldier,index})).filter(({soldier}) => soldier.hp > 0 && soldierLayer(soldier) === enemyLayer(monster));
    candidates.sort((a,b) => Number(soldierType(b.soldier.soldierType) === 'shield') - Number(soldierType(a.soldier.soldierType) === 'shield') || a.soldier.slot - b.soldier.slot);
    const soldierIndex = monster.boss ? -1 : candidates[0]?.index ?? -1;
    if (soldierIndex >= 0) {
      const soldier = supportSoldiers[soldierIndex];
      const hp = Math.max(0, soldier.hp - (monster.attackDamage ?? RULES.monster.attackDamage));
      if (hp === 0) { supportSoldiers.splice(soldierIndex, 1); if (!fallenSoldiers.some(s => s.id === soldier.id)) fallenSoldiers.push({...soldier, hp: 0}); }
      else supportSoldiers[soldierIndex] = { ...soldier, hp };
      events.push({ type: 'supportSoldierDamaged', context: previous.context, tick, attackId, monsterId: monster.id, soldierId: soldier.id, hp });
      if (hp === 0) events.push({ type: 'supportSoldierDefeated', context: previous.context, tick, attackId, monsterId: monster.id, soldierId: soldier.id });
      return;
    }
    baseHp = Math.max(0, baseHp - (monster.attackDamage ?? RULES.monster.attackDamage));
    events.push({ type: 'baseDamaged', context: previous.context, tick, attackId, monsterId: monster.id, hp: baseHp });
  });
  const status = baseHp === 0 ? 'baseDestroyed' : incomingMonsters.length === 0 && monsters.every(monster => defeated.has(monster.id)) ? 'cleared' : 'fighting';
  if (status === 'baseDestroyed') events.push({ type: 'baseDestroyed', context: previous.context, tick });
  let projectiles: readonly ProjectileState[] = status === 'fighting' ? moved.filter(projectile => !consumed.has(projectile.id)
    && projectile.position.y + projectile.height / 2 >= 0
    && projectile.position.x + projectile.width / 2 >= 0
    && projectile.position.x - projectile.width / 2 <= (previous.arenaWidth ?? RULES.arena.width)) : [];
  const target = previous.automatic ? findAutomaticTarget(monsters, previous.arenaWidth) : undefined;
  const aimDirection = target ? (previous.automatic
    ? directionToMuzzle(player, target.position, AUTO_MUZZLE_LATERAL)
    : directionTo(player, target.position)) : previous.aimDirection;
  const weapon = getWeaponParameters(previous.skills, previous.skillCollection);
  let shotRemainingMs = previous.shotRemainingMs - COMBAT_STEP_MS;
  let nextProjectileSequence = previous.nextProjectileSequence;
  let elementReadyTick = previous.elementReadyTick ?? 500;
  let flameFanUntilTick = previous.flameFanUntilTick;
  let firepowerUntilTick = previous.firepowerUntilTick;
  let firepowerReadyTick = previous.firepowerReadyTick;
  if (previous.skills.firepower && tick >= (firepowerReadyTick ?? 0)) { firepowerUntilTick = tick + (previous.skillCollection ? qualityEffects(previous.skillCollection).firepowerTicks : 500); firepowerReadyTick = tick + 2000; }
  const firepowerActive = !!previous.skills.firepower && tick < (firepowerUntilTick ?? 0);
  if (status === 'fighting' && shotRemainingMs <= EPSILON && (!previous.automatic || target)) {
    const charged = tick >= elementReadyTick && !!(previous.skills.flame || previous.skills.frost || previous.skills.lightning);
    projectiles = [...projectiles, ...volley({ ...previous, player, monsters, ...(aimDirection ? { aimDirection } : {}) }, weapon, charged, firepowerActive)];
    if (charged) elementReadyTick = tick + 500;
    if (charged && previous.skills.flame && previous.skills.doubleShot) flameFanUntilTick = tick + 25;
    nextProjectileSequence += weapon.count;
    shotRemainingMs += weapon.intervalMs;
  }
  if (projectiles.length > (previous.skillCollection ? QUALITY_PROJECTILE_LIMIT : Math.max(MAX_PROJECTILES, (Math.ceil(Math.hypot(previous.arenaWidth ?? RULES.arena.width, RULES.arena.height + RULES.projectile.height) / RULES.projectile.speed * 1000 / MIN_INTERVAL) + 1) * MAX_SHOTS))) throw new RangeError('弹体数量超过已确认参数推导的上限');
  const state = freezeState({ ...previous, ...(invasion ? {invasion} : {}), ...(aimDirection ? { aimDirection } : {}), tick, ...(firepowerUntilTick !== undefined ? { firepowerUntilTick } : {}), ...(firepowerReadyTick !== undefined ? { firepowerReadyTick } : {}), status, player, ...(previous.incomingMonsters ? {incomingMonsters: status === 'baseDestroyed' ? Object.freeze([]) : incomingMonsters} : {}), base: { ...previous.base, hp: baseHp }, monsters, supportSoldiers, fallenSoldiers: status === 'baseDestroyed' ? [] : fallenSoldiers, ...(pet ? { pet } : {}),
    frostEnergy: Math.min(FROST_ENERGY_MAX, (previous.frostEnergy ?? 0) + events.filter(event => event.type === 'monsterDefeated').length),
    flameVolleyHits: Object.fromEntries([...flameHits].filter(([id]) => projectiles.some(p => p.flameVolleyId === id && !!p.elements?.flame)).map(([id, hits]) => [id, [...hits]])),
    ...(flameFanUntilTick !== undefined ? {flameFanUntilTick} : {}),
    elementReadyTick, elementImpacts: impacts, projectiles, shotRemainingMs: Math.max(0, shotRemainingMs), nextProjectileSequence,
    defeatedMonsterIds: [...defeated], processedBaseAttackIds: [...attacks] });
  return { state, events: Object.freeze(events.map(event => Object.freeze(event))) };
}

function applyFrost(monster: MonsterState, tick: number, slow: number, duration: number, freeze: number): MonsterState {
  const ratio = Math.min(slow, monster.boss ? .35 : .7);
  return { ...monster,
    slowRatio: Math.max((monster.slowUntilTick ?? 0) > tick ? monster.slowRatio ?? 0 : 0, ratio),
    slowUntilTick: Math.max(monster.slowUntilTick ?? 0, tick + duration),
    ...(!monster.boss && freeze > 0 ? { frozenUntilTick: Math.max(monster.frozenUntilTick ?? 0, tick + freeze) } : {}),
  };
}

export function releaseFrostBurst(state: CombatState): CombatState | null {
  const active = (monster: MonsterState) => targetable(monster);
  if (state.status !== 'fighting' || state.base.hp <= 0 || (state.frostEnergy ?? 0) < FROST_ENERGY_MAX || !state.monsters.some(active)) return null;
  return freezeState({ ...state, frostEnergy: 0,
    monsters: state.monsters.map(monster => active(monster) ? applyFrost(monster, state.tick, .35, 300, 300) : monster),
    elementImpacts: [...(state.elementImpacts ?? []), ...state.monsters.filter(active).map(monster => ({kind: 'frost' as const, position: monster.position, untilTick: state.tick + 35}))],
  });
}

export function rebindCombatGeneration(state: CombatState, generation: number): CombatState {
  if (!Number.isSafeInteger(generation) || generation <= state.context.generation) throw new RangeError('恢复时 generation 必须递增');
  return freezeState({ ...state, context: { ...state.context, generation } });
}


// Build the complete next state before the caller commits the inventory debit.
export function summonSupportSoldier(state: CombatState, id: string): CombatState | null {
  const current = state.supportSoldiers ?? [];
  if (state.status !== 'fighting' || state.base.hp <= 0 || !id.trim() || current.length >= 3 || current.some(soldier => soldier.id === id)) return null;
  const count = current.length + 1;
  const soldiers = current.map((soldier, slot) => ({...soldier, slot, position: supportPosition(state.player, slot, count, state.arenaWidth)}));
  soldiers.push({id, slot: current.length, position: supportPosition(state.player, current.length, count, state.arenaWidth), hp: SUPPORT_SOLDIER_MAX_HP, maxHp: SUPPORT_SOLDIER_MAX_HP, attackRemainingMs: 2000});
  return freezeState({...state, supportSoldiers: soldiers});
}

export function applyCombatSkills(state: CombatState, skills: SkillLevels, collection?: SkillCollection): CombatState {
  getWeaponParameters(skills, collection);
  return freezeState({ ...state, skills: collection ? skillLevels(collection) : skills, ...(collection ? { skillCollection: collection } : {}) });
}


export function findAutomaticTarget(monsters: readonly MonsterState[], width = RULES.arena.width): MonsterState | undefined {
  let target: MonsterState | undefined;
  for (const monster of monsters) {
    if (!targetable(monster) || monster.position.x < 0 || monster.position.x > width
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
function supportPosition(player: Point, slot: number, count: number, width = RULES.arena.width): Point {
  const offsets = count === 1 ? [-30] : count === 2 ? [-40, 40] : [-50, 0, 50];
  return { x: playerX(player.x + (offsets[slot] ?? 0), width), y: player.y + 20 };
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
  return freezeState({ ...state, pet: createBattlePet(pet, pet.attackRemainingMs, pet) });
}

// Revival is prepared in full before inventory is debited by the paused runner.
export function reviveCompanion(state: CombatState, kind: string, id: string): CombatState | null {
  if (state.status !== 'fighting' || state.base.hp <= 0) return null;
  if (kind !== 'soldier' || !state.fallenSoldiers?.some(s => s.id === id)) return null;
  const next = summonSupportSoldier(state, id);
  return next ? freezeState({...next, fallenSoldiers: state.fallenSoldiers.filter(s => s.id !== id)}) : null;
}
