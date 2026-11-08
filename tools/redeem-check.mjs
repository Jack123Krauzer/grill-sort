import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createGameServer } from '../server/index.mjs';
import { openRedemptions } from '../server/redemptions.mjs';

const parent = resolve(tmpdir());
const data = mkdtempSync(join(parent, 'skewer-shift-redeem-'));
const admin = openRedemptions(data);

function validSuperCode(code) {
  assert.match(code, /^SUPER-(?:[0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/);
  return code;
}

async function startServer() {
  const store = openRedemptions(data);
  const listener = createGameServer(store);
  await new Promise((fulfill, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', fulfill);
  }).catch((error) => {
    store.close();
    throw error;
  });
  return { store, listener, base: `http://127.0.0.1:${listener.address().port}` };
}

async function stopServer(server) {
  if (!server?.listener.listening) return;
  await new Promise((fulfill) => server.listener.close(fulfill));
  server.store.close();
}

let server;

async function request(path, { token, code, method = 'GET', headers = {} } = {}) {
  if (token) headers.Authorization = `Bearer ${token}`;
  if (code !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${server.base}/api/${path}`, {
    method,
    headers,
    body: code === undefined ? undefined : JSON.stringify({ code }),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function createPlayer() {
  const player = await request('player', { method: 'POST' });
  assert.equal(player.status, 201);
  return player.body.token;
}

function redeem(token, code, headers) {
  return request('redeem', { token, code, method: 'POST', headers });
}

try {
  const initial = validSuperCode(admin.init().code);
  assert.equal(admin.init().code, undefined);
  server = await startServer();
  assert.equal((await request('health')).status, 200);
  assert.equal((await request('receipts')).status, 401);
  const first = await createPlayer();
  const second = await createPlayer();
  const third = await createPlayer();
  const fourth = await createPlayer();

  const welcome = await redeem(first, '  welcome  ');
  assert.equal(welcome.status, 200);
  assert.deepEqual(welcome.body.receipt.boosters, { collect: 2, shuffle: 2, time: 2, open: 2 });
  assert.equal(welcome.body.receipt.coins, 300);
  const duplicateWelcome = await redeem(first, 'WELCOME');
  assert.equal(duplicateWelcome.body.alreadyClaimed, true);
  assert.equal(duplicateWelcome.body.receipt.id, welcome.body.receipt.id);

  const duplicateRace = await Promise.all([redeem(first, initial), redeem(first, initial)]);
  assert.ok(duplicateRace.every((item) => item.status === 200));
  assert.equal(duplicateRace.filter((item) => !item.body.alreadyClaimed).length, 1);
  const superReceipt = duplicateRace[0].body.receipt;
  assert.equal(superReceipt.coins, 25_000);
  assert.deepEqual(superReceipt.boosters, { collect: 25, shuffle: 25, time: 25, open: 25 });
  assert.deepEqual(duplicateRace[1].body.receipt, superReceipt);

  const rotated = validSuperCode(admin.rotateSuper({ cap: 2 }));
  assert.notEqual(rotated, initial);
  assert.equal((await redeem(second, initial)).status, 404);
  assert.equal((await redeem(first, rotated)).body.receipt.id, superReceipt.id);
  const capRace = await Promise.all([redeem(second, rotated), redeem(third, rotated)]);
  assert.deepEqual(capRace.map((result) => result.status).sort(), [200, 409]);
  const status = admin.status();
  assert.equal(status.find(({ id }) => id === 'super').claims, 2);
  assert.doesNotMatch(JSON.stringify(status), /SUPER-[A-Z0-9]/);

  const nextRound = validSuperCode(admin.rotateSuper({ newRound: true, cap: null }));
  const roundTwo = await redeem(first, nextRound);
  assert.equal(roundTwo.status, 200);
  assert.equal(roundTwo.body.alreadyClaimed, false);
  assert.notEqual(roundTwo.body.receipt.id, superReceipt.id);
  admin.disable('super');
  assert.equal((await redeem(third, nextRound)).status, 404);

  admin.setPromo({ id: 'share-test', code: 'SHARE-TEST', coins: 47, boosters: { time: 3 }, cap: 1 });
  const custom = await redeem(fourth, 'SHARE-TEST');
  assert.equal(custom.body.receipt.coins, 47);
  assert.equal(custom.body.receipt.boosters.time, 3);
  assert.equal((await redeem(third, 'SHARE-TEST')).status, 409);
  admin.disable('share-test');
  assert.equal((await redeem(fourth, 'SHARE-TEST')).status, 404);

  for (let index = 0; index < 6; index += 1) assert.equal((await redeem(second, 'UNKNOWN')).status, 404);
  const rateLimit = await redeem(second, 'UNKNOWN', { 'X-Forwarded-For': '203.0.113.5' });
  assert.equal(rateLimit.status, 429);
  assert.ok(Number(rateLimit.headers.get('Retry-After')) > 0);

  for (let index = 0; index < 8; index += 1) await createPlayer();
  const registrationLimit = await request('player', { method: 'POST', headers: { 'X-Forwarded-For': '203.0.113.5' } });
  assert.equal(registrationLimit.status, 429);

  await stopServer(server);
  server = await startServer();
  const restored = await request('receipts', { token: first });
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.body.receipts.map(({ id }) => id), [welcome.body.receipt.id, superReceipt.id, roundTwo.body.receipt.id]);

  const db = new DatabaseSync(join(data, 'redemptions.sqlite'), { readOnly: true });
  try {
    const codeHashes = db.prepare('SELECT code_hash FROM campaigns').all().map(({ code_hash }) => code_hash);
    assert.ok(codeHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)));
    const tokenHashes = db.prepare('SELECT token_hash FROM players').all().map(({ token_hash }) => token_hash);
    assert.ok(tokenHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)));
  } finally {
    db.close();
  }
  console.log('Redeem checks passed.');
} finally {
  await stopServer(server);
  admin.close();
  assert.match(relative(parent, data), /^skewer-shift-redeem-[A-Za-z0-9]+$/);
  rmSync(data, { recursive: true, force: true });
}
