import { BOOSTERS, FOODS } from './catalog.js';
import { applyCommand, createGame, matchKey } from './game.js';
import { getLevel } from './levels.js';
import type { Command, GameState, LevelDefinition, Mode, Snapshot } from './types.js';

const MODES: ReadonlySet<string> = new Set(['sort', 'master-chef', 'conveyor-chaos', 'stacked-orders', 'match-drop', 'color-match']);
const MAX_REPLAY_COMMANDS = 20_000;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function id(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(value);
}

function named(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
}

function knownFood(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(FOODS, value);
}

export function validateLevel(value: unknown): string[] {
  if (!record(value)) return ['Level must be an object.'];
  const errors: string[] = [];
  if (!id(value.id)) errors.push('Level needs a stable ID.');
  if (!integer(value.contentVersion, 1, 1_000_000)) errors.push('Invalid content version.');
  if (!named(value.name) || !named(value.description) || !named(value.modeName)) errors.push('Missing level display text.');
  if (value.tutorial !== undefined && !named(value.tutorial)) errors.push('Invalid tutorial text.');
  if (typeof value.mode !== 'string' || !MODES.has(value.mode)) errors.push('Unknown game mode.');
  if (!integer(value.seed, 1, 0xffff_ffff)) errors.push('Invalid random seed.');
  if (!integer(value.columns, 1, 6)) errors.push('Column count must be from 1 to 6.');
  if (!integer(value.timeLimitMs, 1, 3_600_000)) errors.push('Invalid level timer.');
  if (!integer(value.rewardCoins, 0, 1_000_000)) errors.push('Invalid level reward.');
  if (!Array.isArray(value.trays) || value.trays.length < 2 || value.trays.length > 48) {
    return [...errors, 'A level needs between 2 and 48 trays.'];
  }

  const trayIds = new Set<string>();
  const counts = new Map<string, number>();
  const obstacles: { trayId: string; obstacle: Record<string, unknown> }[] = [];
  for (const [index, tray] of value.trays.entries()) {
    if (!record(tray) || !id(tray.id) || trayIds.has(tray.id)) {
      errors.push('Tray ' + (index + 1) + ' has a missing or duplicate ID.');
      continue;
    }
    trayIds.add(tray.id);
    if (!Array.isArray(tray.layers) || tray.layers.length > 12) {
      errors.push(tray.id + ' needs a valid queue with at most 12 layers.');
      continue;
    }
    for (const slots of [tray.slots, ...tray.layers]) {
      if (!Array.isArray(slots) || slots.length !== 3) {
        errors.push(tray.id + ' needs exactly three slots on every plate.');
        continue;
      }
      for (const slot of slots) {
        if (slot === null) continue;
        if (!knownFood(slot)) {
          errors.push(tray.id + ' uses an unknown food.');
          continue;
        }
        counts.set(slot, (counts.get(slot) ?? 0) + 1);
      }
    }
    if (tray.obstacle !== undefined) {
      if (!record(tray.obstacle)) errors.push(tray.id + ' has an invalid obstacle.');
      else obstacles.push({ trayId: tray.id, obstacle: tray.obstacle });
    }
  }

  const groupCounts = new Map<string, number>();
  for (const [foodId, count] of counts) {
    const key = matchKey(value.mode as Mode, FOODS[foodId]);
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + count);
  }
  const total = [...groupCounts.values()].reduce((sum, count) => sum + count, 0) / 3;
  if (total === 0) errors.push('The grill is empty.');
  for (const [key, count] of groupCounts) {
    if (count % 3 !== 0) errors.push('The count for ' + key + ' must be divisible by three.');
  }

  for (const { trayId, obstacle } of obstacles) {
    const limit = obstacle.kind === 'ice' || obstacle.kind === 'cover' ? Math.floor(total) : 1;
    if (!integer(obstacle.remaining, 1, limit)) errors.push(trayId + ' has an invalid obstacle count.');
    switch (obstacle.kind) {
      case 'cover':
        if (value.mode === 'color-match' || !knownFood(obstacle.foodId)
          || (counts.get(obstacle.foodId) ?? 0) < Number(obstacle.remaining) * 3) {
          errors.push(trayId + ' cover requires an obtainable exact-food match.');
        }
        break;
      case 'ice':
        if (obstacle.neighbors !== undefined && (!Array.isArray(obstacle.neighbors)
          || obstacle.neighbors.length === 0
          || obstacle.neighbors.some((neighbor) => !trayIds.has(neighbor) || neighbor === trayId)
          || new Set(obstacle.neighbors).size !== obstacle.neighbors.length)) {
          errors.push(trayId + ' ice must use distinct neighbor tray IDs.');
        }
        break;
      case 'hot':
        if (!integer(obstacle.durationMs, 1, 3_600_000) || obstacle.remainingMs !== obstacle.durationMs) {
          errors.push(trayId + ' HOT countdown must start at its configured duration.');
        }
        break;
      case 'wood':
        if (!integer(obstacle.rewardCoins, 0, 1_000_000)) errors.push(trayId + ' wooden reward is invalid.');
        break;
      default:
        errors.push(trayId + ' uses an unknown obstacle.');
    }
  }

  if (!Array.isArray(value.orders)) return [...errors, 'The level must declare its order list.'];
  if (value.mode === 'color-match' && value.orders.length > 0) errors.push('Color Match cannot use exact-food orders.');
  const orderIds = new Set<string>();
  for (const order of value.orders) {
    if (!record(order) || !id(order.id) || orderIds.has(order.id)) {
      errors.push('An order has a missing or duplicate ID.');
      continue;
    }
    orderIds.add(order.id);
    if (!named(order.customer) || typeof order.mandatory !== 'boolean'
      || !integer(order.durationMs, 1, 3_600_000) || !integer(order.rewardCoins, 0, 1_000_000)
      || !integer(order.startsAfterGroups, 0, Math.floor(total) - 1)
      || !record(order.requirements) || Object.keys(order.requirements).length === 0) {
      errors.push(order.id + ' has invalid order fields.');
      continue;
    }
    for (const [foodId, count] of Object.entries(order.requirements)) {
      if (!knownFood(foodId) || !integer(count, 1, Math.floor((counts.get(foodId) ?? 0) / 3))) {
        errors.push(order.id + ' requests more ' + foodId + ' than the level supplies.');
      }
    }
  }
  return errors;
}

function address(value: unknown): boolean {
  return record(value) && id(value.trayId) && integer(value.slot, 0, 2);
}

function isCommand(value: unknown): value is Command {
  if (!record(value)) return false;
  if (value.type === 'move') return address(value.from) && address(value.to);
  if (value.type === 'tick') return integer(value.ms, 1, Number.MAX_SAFE_INTEGER);
  if (value.type === 'boost') {
    return typeof value.booster === 'string' && Object.hasOwn(BOOSTERS, value.booster)
      && (value.trayId === undefined || id(value.trayId));
  }
  return value.type === 'undo';
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!record(value)) return value;
  return Object.fromEntries(Object.keys(value).sort()
    .filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]));
}

export function isValidCheckpoint(value: unknown, expected?: LevelDefinition): value is GameState {
  if (!record(value) || !id(value.levelId) || !Array.isArray(value.replay)
    || value.replay.length > MAX_REPLAY_COMMANDS || !value.replay.every(isCommand)) return false;
  const level = expected ?? getLevel(value.levelId);
  if (!level || value.levelId !== level.id || value.contentVersion !== level.contentVersion) return false;
  const { replay, ...checkpoint } = value;
  let reconstructed = createGame(level);
  for (const command of replay) {
    const result = applyCommand({ ...reconstructed, replay: [] }, command);
    if (!result.ok) return false;
    reconstructed = result.state;
  }
  const { replay: ignored, ...verified } = reconstructed;
  return JSON.stringify(canonical(checkpoint)) === JSON.stringify(canonical(verified));
}

export function hasPieceConservation(state: Snapshot): boolean {
  const pieceIds = Object.keys(state.pieces);
  const live = state.trays.flatMap((tray) => [
    ...tray.slots, ...tray.queuedLayers.slice(tray.nextLayer).flat(),
  ]).filter((piece): piece is string => piece !== null);
  const accounted = new Set([...live, ...state.cleared]);
  return state.cleared.length === state.groupsCleared * 3 && live.length + state.cleared.length === pieceIds.length
    && accounted.size === pieceIds.length && pieceIds.every((pieceId) => accounted.has(pieceId));
}
