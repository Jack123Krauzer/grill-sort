import {
  applyCommand, createGame, getFood, hasPieceConservation, isAccessible, legalMoves, matchKey, validateLevel,
} from '../dist/js/domain/index.js';

export const ACTION_MS = 800;

class SearchQueue {
  entries = [];

  push(entry) {
    const entries = this.entries;
    let index = entries.length;
    entries.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (entries[parent].priority >= entry.priority) break;
      entries[index] = entries[parent];
      index = parent;
    }
    entries[index] = entry;
  }

  pop() {
    const entries = this.entries;
    const first = entries[0];
    const last = entries.pop();
    if (!entries.length) return first;
    let index = 0;
    while (index * 2 + 1 < entries.length) {
      let child = index * 2 + 1;
      if (entries[child + 1]?.priority > entries[child].priority) child++;
      if (last.priority >= entries[child].priority) break;
      entries[index] = entries[child];
      index = child;
    }
    entries[index] = last;
    return first;
  }
}

function remainingRequiredAvailable(state) {
  const counts = new Map();
  const cleared = new Set(state.cleared);
  for (const piece of Object.values(state.pieces)) {
    if (!cleared.has(piece.id)) counts.set(piece.foodId, (counts.get(piece.foodId) ?? 0) + 1);
  }
  return state.orders.every((order) => !order.mandatory || order.status === 'completed'
    || Object.entries(order.requirements).every(([food, amount]) => (
      amount - (order.progress[food] ?? 0) <= (counts.get(food) ?? 0) / 3
    )));
}

function boardKey(state) {
  const trays = state.trays.map((tray) => [
    tray.id, tray.slots.map((pieceId) => getFood(state, pieceId)?.id ?? '').sort(),
    tray.nextLayer, tray.obstacle?.remaining ?? 0,
  ]);
  // Within a fixed tray identity, food positions and individual piece IDs have no effect on legal moves.
  // An earlier arrival can dominate a later arrival only with the same board and active required-order clocks.
  // HOT clocks start at the beginning and their remaining duration also improves on any earlier arrival.
  const orders = state.orders.filter((order) => order.mandatory).map((order) => [
    order.status, Object.entries(order.progress).sort(), order.remainingMs,
  ]);
  return JSON.stringify([trays, orders, state.rngState]);
}

function score(state) {
  let pairScore = 0;
  let layerScore = 0;
  for (const tray of state.trays) {
    if (!isAccessible(tray)) continue;
    const foods = tray.slots.filter(Boolean).map((pieceId) => matchKey(state.mode, getFood(state, pieceId)));
    if (foods.length === 2 && foods[0] === foods[1]) pairScore += 16;
    else if (foods.length === 3 && new Set(foods).size === 2) pairScore += 7;
    layerScore += tray.nextLayer * 16;
  }
  return state.groupsCleared * 1_000 + layerScore + pairScore + Math.min(state.bonusCoins, 500)
    + state.orders.filter((order) => order.mandatory && order.status === 'completed').length * 250
    - state.moves * 9;
}

function candidates(state) {
  const seen = new Set();
  return legalMoves(state).filter((move) => {
    const source = state.trays.find((tray) => tray.id === move.from.trayId);
    const food = getFood(state, source.slots[move.from.slot]);
    const key = JSON.stringify([source.id, food.id, move.to.trayId]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function commandsFrom(node) {
  const moves = [];
  for (let link = node; link.move; link = link.previous) moves.push(link.move);
  return moves.reverse().flatMap((move) => [{ type: 'tick', ms: ACTION_MS }, move]);
}

export function solveLevel(level, { maxExpanded = 30_000 } = {}) {
  const errors = validateLevel(level);
  if (errors.length) throw new Error(errors.join('\n'));
  const state = createGame(level);
  const queue = new SearchQueue();
  queue.push({ state, priority: 0 });
  const seen = new Map([[boardKey(state), 0]]);
  let expanded = 0;

  while (queue.entries.length && expanded < maxExpanded) {
    const node = queue.pop();
    if (node.state.status === 'won') return { commands: commandsFrom(node), expanded };
    if (node.state.status !== 'playing' || node.state.blocked) continue;
    expanded++;
    const aged = applyCommand(node.state, { type: 'tick', ms: ACTION_MS });
    if (!aged.ok || aged.state.status !== 'playing') continue;
    for (const move of candidates(aged.state)) {
      const result = applyCommand(aged.state, move);
      if (!result.ok || result.state.status === 'lost' || !remainingRequiredAvailable(result.state)) continue;
      const next = { ...result.state, replay: [], undo: null };
      const key = boardKey(next);
      if ((seen.get(key) ?? Infinity) <= next.elapsedMs) continue;
      seen.set(key, next.elapsedMs);
      queue.push({ state: next, priority: score(next), previous: node, move });
    }
  }
  return { commands: null, expanded };
}

export function replayWitness(level, commands) {
  let state = createGame(level);
  if (!hasPieceConservation(state)) throw new Error(level.id + ' has corrupt starting pieces.');
  for (const [index, command] of commands.entries()) {
    if (command.type !== 'move' && command.type !== 'tick') throw new Error(level.id + ' uses paid recovery.');
    const result = applyCommand(state, command);
    if (!result.ok || !hasPieceConservation(result.state)) {
      throw new Error(level.id + ' failed witness step ' + (index + 1) + '.');
    }
    state = result.state;
  }
  if (state.status !== 'won') throw new Error(level.id + ' witness did not win.');
  return state;
}
