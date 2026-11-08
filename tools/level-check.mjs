import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import {
  applyCommand, CHALLENGES, createGame, getFood, getLevel, hasPieceConservation,
  isAccessible, isValidCheckpoint, legalMoves, LEVELS, validateLevel,
} from '../dist/js/domain/index.js';
import { replayWitness, solveLevel } from './level-solver.mjs';

const witnessPath = new URL('./level-witnesses.json', import.meta.url);
const levels = [...LEVELS, ...CHALLENGES];
const mode = process.argv[2] ?? '--check';

function stats(level) {
  const state = createGame(level);
  return {
    groups: state.totalGroups,
    availableEmptySlots: state.trays.filter(isAccessible).flatMap((tray) => tray.slots).filter((slot) => slot === null).length,
    availableMoves: legalMoves(state).length,
    queueDepths: state.trays.map((tray) => tray.queuedLayers.length - tray.nextLayer),
    mandatoryOrders: state.orders.filter((order) => order.mandatory).map((order) => order.requirements),
    foodCounts: Object.values(state.pieces).reduce((counts, piece) => {
      counts[piece.foodId] = (counts[piece.foodId] ?? 0) + 1;
      return counts;
    }, {}),
    board: state.trays.map((tray) => ({
      id: tray.id, slots: tray.slots.map((piece) => getFood(state, piece)?.name ?? null), obstacle: tray.obstacle,
    })),
  };
}

function checkedLevel(input) {
  const errors = validateLevel(input);
  if (errors.length) throw new Error(errors.join('\n'));
  return input;
}

function acceptedWitness(level) {
  const { commands, expanded } = solveLevel(level);
  if (!commands) throw new Error(level.id + ' was not solved within ' + expanded + ' search states.');
  return { commands, expanded, state: replayWitness(level, commands) };
}

function checkRules() {
  const fixture = createGame(LEVELS[0]);
  const source = { trayId: 't1', slot: 0 };
  const invalid = applyCommand(fixture, { type: 'move', from: source, to: { trayId: 't2', slot: 0 } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.state, fixture);

  const covered = createGame(getLevel('005'));
  const opened = applyCommand(covered, { type: 'boost', booster: 'open', trayId: 't4' });
  assert(opened.ok && opened.state.trays[3].obstacle === null && hasPieceConservation(opened.state));
  assert.equal(applyCommand(opened.state, { type: 'boost', booster: 'open' }).ok, false);

  const collected = applyCommand(fixture, { type: 'boost', booster: 'collect' });
  assert(collected.ok && collected.state.groupsCleared === 1 && hasPieceConservation(collected.state));
  assert.equal(collected.events.filter((event) => event.type === 'TripleCleared').length, 1);
  const shuffled = applyCommand(fixture, { type: 'boost', booster: 'shuffle' });
  assert(shuffled.ok && hasPieceConservation(shuffled.state));
  assert.deepEqual(shuffled, applyCommand(fixture, { type: 'boost', booster: 'shuffle' }));
  const extended = applyCommand(fixture, { type: 'boost', booster: 'time' });
  assert(extended.ok && extended.state.remainingMs === fixture.remainingMs + 30_000);

  const jammed = createGame({
    ...LEVELS[0], trays: ['t1', 't2', 't3'].map((id) => ({ id, slots: ['sausage', 'corn', 'mushroom'], layers: [] })),
  });
  assert(jammed.blocked && jammed.status === 'playing' && legalMoves(jammed).length === 0);
  const rescued = applyCommand(jammed, { type: 'boost', booster: 'collect' });
  assert(rescued.ok && !rescued.state.blocked && legalMoves(rescued.state).length > 0);

  const expired = applyCommand(fixture, { type: 'tick', ms: fixture.remainingMs });
  assert(expired.ok && expired.state.status === 'lost' && expired.state.failure === 'timeout');
  assert.equal(applyCommand(expired.state, legalMoves(fixture)[0]).ok, false);
  const late = applyCommand(fixture, { type: 'tick', ms: fixture.remainingMs - 1 });
  assert(late.ok);
  const lateWin = applyCommand(applyCommand(late.state, { type: 'boost', booster: 'collect' }).state, { type: 'boost', booster: 'collect' });
  assert(lateWin.ok && lateWin.state.status === 'won' && lateWin.state.remainingMs === 1);

  const orders = createGame(getLevel('007'));
  const expiredBonus = applyCommand(orders, { type: 'tick', ms: orders.orders[0].remainingMs });
  assert(expiredBonus.ok && expiredBonus.state.orders[0].status === 'expired' && expiredBonus.state.status === 'playing');
  const chef = createGame(getLevel('master-chef'));
  const expiredRequired = applyCommand(chef, { type: 'tick', ms: chef.orders[0].remainingMs });
  assert(expiredRequired.ok && expiredRequired.state.failure === 'order');
  const expiredAfterLongTick = applyCommand(chef, { type: 'tick', ms: chef.remainingMs });
  assert(expiredAfterLongTick.ok && expiredAfterLongTick.state.failure === 'order');
  assert.equal(expiredAfterLongTick.state.elapsedMs, chef.orders[0].remainingMs);
  const hot = createGame(getLevel('008'));
  const burned = applyCommand(hot, { type: 'tick', ms: hot.remainingMs });
  assert(burned.ok && burned.state.failure === 'heat');
  assert.equal(burned.state.elapsedMs, hot.trays[0].obstacle.remainingMs);

  const stacks = createGame(getLevel('003'));
  const revealed = applyCommand(stacks, { type: 'move', from: { trayId: 't3', slot: 0 }, to: { trayId: 't4', slot: 0 } });
  assert(revealed.ok && revealed.events.some((event) => event.type === 'LayerRevealed'));
  assert.equal(revealed.events.filter((event) => event.type === 'TripleCleared').length, 1);
  const waited = applyCommand(revealed.state, { type: 'tick', ms: 1_234 });
  const undone = applyCommand(waited.state, { type: 'undo' });
  assert(undone.ok && undone.state.remainingMs === stacks.remainingMs - 1_234);
  assert.deepEqual(undone.state.trays, stacks.trays);
  assert.equal(undone.state.groupsCleared, stacks.groupsCleared);
  assert(hasPieceConservation(undone.state));
  const saved = JSON.parse(JSON.stringify(undone.state));
  assert(isValidCheckpoint(saved));
  saved.trays[0].slots[0] = 'duplicate';
  assert.equal(isValidCheckpoint(saved), false);
  console.log('Verified invalid moves, all boosters, jam recovery, timeout boundaries, orders, HOT, cascade, undo and save integrity.');
}

if (mode === '--generate-witnesses') {
  const witnesses = {};
  for (const level of levels) {
    const { commands, expanded, state } = acceptedWitness(checkedLevel(level));
    witnesses[level.id] = { contentVersion: level.contentVersion, expanded, commands };
    console.log(level.id, state.moves + ' moves', expanded + ' expanded');
  }
  await writeFile(witnessPath, JSON.stringify(witnesses, null, 2) + '\n');
} else if (mode === '--check') {
  const witnesses = JSON.parse(await readFile(witnessPath, 'utf8'));
  assert.equal(Object.keys(witnesses).length, levels.length);
  for (const level of levels) {
    checkedLevel(level);
    const witness = witnesses[level.id];
    assert.equal(witness.contentVersion, level.contentVersion);
    const state = replayWitness(level, witness.commands);
    assert(isValidCheckpoint(JSON.parse(JSON.stringify(state))));
    console.log(level.id, state.moves + ' moves', (state.elapsedMs / 1000).toFixed(1) + ' modeled seconds');
  }
  checkRules();
  console.log('Verified all ' + levels.length + ' level witnesses.');
} else if (mode === '--export') {
  const level = getLevel(process.argv[3]);
  if (!level) throw new Error('Supply a known level ID.');
  console.log(JSON.stringify(level, null, 2));
} else if (mode === '--inspect' || mode === '--solve') {
  const path = process.argv[3];
  if (!path) throw new Error('Supply a level JSON path.');
  const level = checkedLevel(JSON.parse(await readFile(path, 'utf8')));
  if (mode === '--inspect') console.log(JSON.stringify(stats(level), null, 2));
  else {
    const { commands, expanded } = acceptedWitness(level);
    console.log(JSON.stringify({ levelId: level.id, contentVersion: level.contentVersion, expanded, commands }, null, 2));
  }
} else {
  throw new Error('Use --check, --generate-witnesses, --export <id>, --inspect <json>, or --solve <json>.');
}
