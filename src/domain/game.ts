import { FOODS } from './catalog.js';
import type {
  BoosterId, Command, CommandResult, Food, GameEvent, GameState, LevelDefinition, Mode,
  MoveCommand, Obstacle, OrderState, Piece, SlotAddress, SlotIndex, Slots3, Snapshot, TrayState,
} from './types.js';

const SLOTS: SlotIndex[] = [0, 1, 2];
const EXTRA_TIME_MS = 30_000;
const MAX_TIME_MS = 3_600_000;

export function getFood(state: Pick<Snapshot, 'pieces'>, pieceId: string | null | undefined): Food | undefined {
  if (pieceId == null) return undefined;
  return FOODS[state.pieces[pieceId]?.foodId];
}

export function matchKey(mode: Mode, food: Food): string {
  return mode === 'color-match' ? food.family : food.id;
}

export function isAccessible(tray: TrayState): boolean {
  return tray.obstacle?.kind !== 'cover' && tray.obstacle?.kind !== 'ice';
}

function findTray(state: Snapshot, address: SlotAddress): TrayState | undefined {
  if (!SLOTS.includes(address.slot)) return undefined;
  return state.trays.find((tray) => tray.id === address.trayId);
}

function canSource(state: Snapshot, tray: TrayState): boolean {
  return isAccessible(tray) && (
    state.mode !== 'conveyor-chaos' || state.trays[0] === tray || state.trays[1] === tray
  );
}

export function canPick(state: Snapshot, address: SlotAddress): boolean {
  if (state.status !== 'playing' || state.remainingMs <= 0) return false;
  const tray = findTray(state, address);
  return tray !== undefined && canSource(state, tray) && tray.slots[address.slot] !== null;
}

export function canMove(state: Snapshot, from: SlotAddress, to: SlotAddress): boolean {
  if (from.trayId === to.trayId || !canPick(state, from)) return false;
  const destination = findTray(state, to);
  return destination !== undefined && isAccessible(destination) && destination.slots[to.slot] === null;
}

export function legalMoves(state: Snapshot): MoveCommand[] {
  if (state.status !== 'playing' || state.remainingMs <= 0) return [];
  const moves: MoveCommand[] = [];
  for (const source of state.trays) {
    if (!canSource(state, source)) continue;
    for (const from of SLOTS) {
      if (source.slots[from] === null) continue;
      for (const destination of state.trays) {
        if (source === destination || !isAccessible(destination)) continue;
        for (const to of SLOTS) {
          if (destination.slots[to] === null) {
            moves.push({ type: 'move', from: { trayId: source.id, slot: from }, to: { trayId: destination.id, slot: to } });
          }
        }
      }
    }
  }
  return moves;
}

function hasMove(state: Snapshot): boolean {
  return state.trays.some((source) => canSource(state, source) && source.slots.some(Boolean)
    && state.trays.some((destination) => source !== destination && isAccessible(destination) && destination.slots.includes(null)));
}

function copySnapshot(state: Snapshot): Snapshot {
  return {
    levelId: state.levelId, contentVersion: state.contentVersion, mode: state.mode,
    pieces: state.pieces,
    trays: state.trays.map((tray) => ({ ...tray, slots: [...tray.slots], obstacle: tray.obstacle && { ...tray.obstacle } })),
    orders: state.orders.map((order) => ({ ...order, progress: { ...order.progress } })),
    cleared: [...state.cleared],
    remainingMs: state.remainingMs, timeLimitMs: state.timeLimitMs, elapsedMs: state.elapsedMs,
    groupsCleared: state.groupsCleared, totalGroups: state.totalGroups, moves: state.moves,
    bonusCoins: state.bonusCoins, rngState: state.rngState, blocked: state.blocked,
    status: state.status, failure: state.failure,
  };
}

function sortedTrays(state: Snapshot): TrayState[] {
  return [...state.trays].sort((a, b) => a.id < b.id ? -1 : Number(a.id !== b.id));
}

function activateOrders(state: Snapshot, events: GameEvent[]): void {
  for (const order of state.orders) {
    if (order.status !== 'waiting' || order.startsAfterGroups > state.groupsCleared) continue;
    order.status = 'active';
    events.push({ type: 'OrderChanged', orderId: order.id, status: order.status });
  }
}

function updateOrders(state: Snapshot, foodId: string, events: GameEvent[]): void {
  for (const order of state.orders) {
    if (order.status !== 'active' || !order.requirements[foodId]) continue;
    const progress = order.progress[foodId] ?? 0;
    if (progress >= order.requirements[foodId]) continue;
    order.progress[foodId] = progress + 1;
    if (Object.keys(order.requirements).every((key) => order.progress[key] === order.requirements[key])) {
      order.status = 'completed';
      state.bonusCoins += order.rewardCoins;
    }
    events.push({ type: 'OrderChanged', orderId: order.id, status: order.status });
  }
}

function hitObstacle(tray: TrayState, events: GameEvent[]): void {
  const obstacle = tray.obstacle;
  if (!obstacle) return;
  obstacle.remaining -= 1;
  if (obstacle.remaining === 0) tray.obstacle = null;
  events.push({ type: 'ObstacleChanged', trayId: tray.id, remaining: obstacle.remaining });
}

function clearGroup(
  state: Snapshot, pieceIds: string[], contributingTrays: string[],
  events: GameEvent[], formedTray?: TrayState,
): void {
  const food = getFood(state, pieceIds[0])!;
  state.cleared.push(...pieceIds);
  state.groupsCleared += 1;
  events.push({
    type: 'TripleCleared', foodId: food.id, matchKey: matchKey(state.mode, food), pieceIds,
    trayId: formedTray?.id, boosted: formedTray === undefined,
  });
  updateOrders(state, food.id, events);
  for (const tray of sortedTrays(state)) {
    const obstacle = tray.obstacle;
    if (!obstacle) continue;
    if (obstacle.kind === 'cover' && obstacle.foodId === food.id) hitObstacle(tray, events);
    if (obstacle.kind === 'ice' && (!obstacle.neighbors || contributingTrays.some((id) => obstacle.neighbors!.includes(id)))) {
      hitObstacle(tray, events);
    }
    if (obstacle.kind === 'wood' && tray === formedTray) {
      state.bonusCoins += obstacle.rewardCoins;
      hitObstacle(tray, events);
    }
  }
  activateOrders(state, events);
}

function matchingTray(state: Snapshot, tray: TrayState): string[] | undefined {
  if (!isAccessible(tray)) return undefined;
  const ids = tray.slots.filter((id): id is string => id !== null);
  if (ids.length !== 3) return undefined;
  const firstKey = matchKey(state.mode, getFood(state, ids[0])!);
  return ids.every((id) => matchKey(state.mode, getFood(state, id)!) === firstKey) ? ids : undefined;
}

function compact(tray: TrayState): void {
  const pieces = tray.slots.filter((piece) => piece !== null);
  tray.slots = [pieces[0] ?? null, pieces[1] ?? null, pieces[2] ?? null];
}

function settle(state: Snapshot, events: GameEvent[]): void {
  const trays = sortedTrays(state);
  // Every repeat consumes a triple or a queued layer, so finite content bounds the loop.
  let changed = true;
  while (changed) {
    changed = false;
    if (state.mode === 'match-drop') {
      for (const tray of trays) {
        if (isAccessible(tray)) compact(tray);
      }
    }

    const triples = trays.map((tray) => ({ tray, ids: matchingTray(state, tray) }));
    for (const { tray, ids } of triples) {
      if (!ids) continue;
      tray.slots = [null, null, null];
      clearGroup(state, ids, [tray.id], events, tray);
      changed = true;
    }

    for (const tray of trays) {
      if (!isAccessible(tray) || tray.slots.some(Boolean)) continue;
      if (tray.nextLayer < tray.queuedLayers.length) {
        const layer = tray.nextLayer++;
        tray.slots = [...tray.queuedLayers[layer]];
        events.push({ type: 'LayerRevealed', trayId: tray.id, layer });
        changed = true;
      } else if (tray.obstacle?.kind === 'hot') {
        hitObstacle(tray, events);
      }
    }
  }
}

function evaluate(state: Snapshot, events: GameEvent[]): void {
  if (state.status !== 'playing') return;
  const done = state.groupsCleared === state.totalGroups;
  const required = state.orders.filter((order) => order.mandatory);
  if (done && required.every((order) => order.status === 'completed')) {
    state.status = 'won';
    state.blocked = false;
    events.push({ type: 'Won' });
    return;
  }

  let failure: Snapshot['failure'];
  if (state.remainingMs <= 0) failure = 'timeout';
  else if (done || required.some((order) => order.status === 'expired')) failure = 'order';
  else if (state.trays.some((tray) => tray.obstacle?.kind === 'hot' && tray.obstacle.remainingMs <= 0)) failure = 'heat';
  if (failure) {
    state.status = 'lost';
    state.failure = failure;
    state.blocked = false;
    events.push({ type: 'Lost', failure });
    return;
  }

  const wasBlocked = state.blocked;
  state.blocked = !hasMove(state);
  if (state.blocked && !wasBlocked) events.push({ type: 'Blocked' });
}

function ageClock(state: Snapshot, ms: number, events: GameEvent[]): void {
  state.elapsedMs += ms;
  state.remainingMs = Math.max(0, state.remainingMs - ms);
  for (const order of state.orders) {
    if (order.status !== 'active') continue;
    order.remainingMs = Math.max(0, order.remainingMs - ms);
    if (order.remainingMs > 0) continue;
    order.status = 'expired';
    events.push({ type: 'OrderChanged', orderId: order.id, status: order.status });
  }
  for (const tray of state.trays) {
    const obstacle = tray.obstacle;
    if (obstacle?.kind === 'hot') obstacle.remainingMs = Math.max(0, obstacle.remainingMs - ms);
  }
}

function timeUntilLoss(state: Snapshot): number {
  let remaining = state.remainingMs;
  for (const order of state.orders) {
    if (order.mandatory && order.status === 'active') remaining = Math.min(remaining, order.remainingMs);
  }
  for (const tray of state.trays) {
    if (tray.obstacle?.kind === 'hot') remaining = Math.min(remaining, tray.obstacle.remainingMs);
  }
  return remaining;
}

export function createGame(level: LevelDefinition): GameState {
  const pieces: Record<string, Piece> = {};
  const trays = level.trays.map((definition) => {
    function createLayer(slots: Slots3, layer: number): Slots3 {
      return slots.map((foodId, slot) => {
        if (foodId === null) return null;
        const id = definition.id + ':' + layer + ':' + slot;
        pieces[id] = { id, foodId };
        return id;
      }) as Slots3;
    }
    return {
      id: definition.id,
      slots: createLayer(definition.slots, 0),
      queuedLayers: definition.layers.map((slots, index) => createLayer(slots, index + 1)),
      nextLayer: 0,
      obstacle: definition.obstacle ? { ...definition.obstacle } : null,
    };
  });
  const orders: OrderState[] = level.orders.map((order) => ({
    ...order, progress: {}, remainingMs: order.durationMs, status: 'waiting',
  }));
  const state: GameState = {
    levelId: level.id, contentVersion: level.contentVersion, mode: level.mode, pieces, trays, orders,
    cleared: [], remainingMs: level.timeLimitMs, timeLimitMs: level.timeLimitMs, elapsedMs: 0,
    groupsCleared: 0, totalGroups: Object.keys(pieces).length / 3, moves: 0, bonusCoins: 0,
    rngState: level.seed >>> 0 || 1, blocked: false, status: 'playing', undo: null, replay: [],
  };
  const events: GameEvent[] = [];
  activateOrders(state, events);
  settle(state, events);
  evaluate(state, events);
  return state;
}

function random(state: Snapshot): number {
  let seed = state.rngState;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  state.rngState = seed >>> 0;
  return state.rngState / 0x1_0000_0000;
}

function collect(state: Snapshot, events: GameEvent[]): boolean {
  type Entry = { tray: TrayState; slot: SlotIndex; pieceId: string };
  const candidates = new Map<string, Entry[]>();
  for (const tray of sortedTrays(state)) {
    if (!isAccessible(tray)) continue;
    for (const slot of SLOTS) {
      const pieceId = tray.slots[slot];
      if (pieceId === null) continue;
      const key = matchKey(state.mode, getFood(state, pieceId)!);
      const entries = candidates.get(key) ?? [];
      entries.push({ tray, slot, pieceId });
      candidates.set(key, entries);
    }
  }
  const requested = state.orders
    .filter((order) => order.status === 'active')
    .sort((a, b) => Number(b.mandatory) - Number(a.mandatory))
    .flatMap((order) => Object.keys(order.requirements).filter((key) => (order.progress[key] ?? 0) < order.requirements[key]));
  const matches = [...new Set([...requested, ...candidates.keys()])];
  for (const key of matches) {
    const entries = candidates.get(key);
    if (!entries || entries.length < 3) continue;
    const group = entries.slice(0, 3);
    for (const entry of group) entry.tray.slots[entry.slot] = null;
    clearGroup(state, group.map((entry) => entry.pieceId), group.map((entry) => entry.tray.id), events);
    return true;
  }
  return false;
}

function shuffle(state: Snapshot): boolean {
  const trays = sortedTrays(state).filter(isAccessible);
  const original = trays.flatMap((tray) => tray.slots);
  for (let attempt = 0; attempt < 12; attempt++) {
    const slots = [...original];
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(random(state) * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    for (const [index, tray] of trays.entries()) {
      const start = index * 3;
      tray.slots = [slots[start], slots[start + 1], slots[start + 2]];
      if (state.mode === 'match-drop') compact(tray);
    }
    const rearranged = trays.flatMap((tray) => tray.slots);
    if (rearranged.every((id, index) => getFood(state, id) === getFood(state, original[index]))) continue;
    if (hasMove(state) || trays.some((tray) => matchingTray(state, tray))) return true;
  }
  return false;
}

function boost(state: Snapshot, booster: BoosterId, events: GameEvent[], trayId?: string): boolean {
  if (booster === 'collect') return collect(state, events);
  if (booster === 'shuffle') return shuffle(state);
  if (booster === 'time') {
    if (state.remainingMs > MAX_TIME_MS - EXTRA_TIME_MS) return false;
    state.remainingMs += EXTRA_TIME_MS;
    return true;
  }
  if (booster === 'open') {
    const tray = sortedTrays(state).find((candidate) => !isAccessible(candidate) && (trayId === undefined || candidate.id === trayId));
    if (!tray) return false;
    tray.obstacle = null;
    events.push({ type: 'ObstacleChanged', trayId: tray.id, remaining: 0 });
    return true;
  }
  return false;
}

export function applyCommand(state: GameState, command: Command): CommandResult {
  function fail(error: string): CommandResult { return { ok: false, state, error, events: [] }; }
  if (state.status !== 'playing' || state.remainingMs <= 0) return fail('This round has ended.');
  const events: GameEvent[] = [];
  let next = copySnapshot(state);
  let undo = state.undo;

  if (command.type === 'move') {
    if (!canMove(state, command.from, command.to)) return fail('Choose an empty slot on another open tray.');
    undo = copySnapshot(state);
    const source = findTray(next, command.from)!;
    const target = findTray(next, command.to)!;
    const pieceId = source.slots[command.from.slot]!;
    source.slots[command.from.slot] = null;
    target.slots[command.to.slot] = pieceId;
    next.moves += 1;
    events.push({ type: 'PieceMoved', from: command.from, to: command.to, pieceId });
    settle(next, events);
    if (next.mode === 'conveyor-chaos') {
      const head = next.trays.shift()!;
      next.trays.push(head);
      events.push({ type: 'ConveyorAdvanced', trayId: head.id });
    }
  } else if (command.type === 'tick') {
    if (!Number.isSafeInteger(command.ms) || command.ms <= 0) return fail('Elapsed time must be a positive integer.');
    ageClock(next, Math.min(command.ms, timeUntilLoss(next)), events);
  } else if (command.type === 'boost') {
    if (!boost(next, command.booster, events, command.trayId)) return fail('That booster has no valid action right now.');
    undo = null;
    events.push({ type: 'BoosterUsed', booster: command.booster });
    settle(next, events);
  } else if (command.type === 'undo') {
    if (!state.undo) return fail('There is no move to undo.');
    next = copySnapshot(state.undo);
    ageClock(next, state.elapsedMs - next.elapsedMs, events);
    undo = null;
    events.push({ type: 'Undone' });
  } else {
    return fail('Unknown command.');
  }

  evaluate(next, events);
  return { ok: true, state: { ...next, undo, replay: [...state.replay, command] }, events };
}
