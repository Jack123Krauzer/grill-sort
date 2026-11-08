import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SUPER_ID = 'super';
const SUPER_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BOOSTERS = ['collect', 'shuffle', 'time', 'open'];
const MINUTE = 60_000;

export const superRewards = {
  coins: 25_000,
  boosters: { collect: 25, shuffle: 25, time: 25, open: 25 },
};

const welcomeRewards = {
  coins: 300,
  boosters: { collect: 2, shuffle: 2, time: 2, open: 2 },
};

export class RedemptionError extends Error {
  constructor(status, error, message, retryAfter) {
    super(message);
    this.status = status;
    this.error = error;
    this.retryAfter = retryAfter;
  }
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function transaction(db, run) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function superCode() {
  const characters = Array.from(randomBytes(32), (byte) => SUPER_ALPHABET[byte & 31]);
  return 'SUPER-' + characters.join('').match(/.{4}/g).join('-');
}

function normalizeCode(code) {
  if (typeof code !== 'string') return null;
  const normalized = code.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{2,62}[A-Za-z0-9]$/.test(normalized)) return null;
  return normalized.toUpperCase();
}

function boundedInteger(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

function rewardValues(rewards) {
  const { coins = 0, boosters = {} } = rewards ?? {};
  if (!boundedInteger(coins, 1_000_000)) throw new Error('Coins must be between 0 and 1000000.');
  const inventory = {};
  for (const kind of BOOSTERS) {
    const count = boosters[kind] ?? 0;
    if (!boundedInteger(count, 1_000)) throw new Error(`${kind} must be between 0 and 1000.`);
    inventory[kind] = count;
  }
  if (coins === 0 && BOOSTERS.every((kind) => inventory[kind] === 0)) {
    throw new Error('A campaign must grant at least one reward.');
  }
  return { coins, boosters: inventory };
}

function receipt(row) {
  return {
    id: row.id,
    campaign: row.campaign,
    label: row.label,
    ...JSON.parse(row.rewards),
    claimedAt: new Date(row.claimed_at).toISOString(),
  };
}

export function openRedemptions(dataDir = process.env.GRILL_DATA_DIR || '.grill-data') {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(resolve(dataDir, 'redemptions.sqlite'), { timeout: 5_000 });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;

    CREATE TABLE IF NOT EXISTS players (
      token_hash TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      rewards TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      round INTEGER NOT NULL,
      claim_cap INTEGER,
      updated_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      campaign TEXT NOT NULL REFERENCES campaigns(id),
      round INTEGER NOT NULL,
      token_hash TEXT NOT NULL REFERENCES players(token_hash),
      label TEXT NOT NULL,
      rewards TEXT NOT NULL,
      claimed_at INTEGER NOT NULL,
      UNIQUE (campaign, round, token_hash)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS claims_player ON claims (token_hash, claimed_at, id);

    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits (expires_at);
  `);

  const findPlayer = db.prepare('SELECT 1 FROM players WHERE token_hash = ?');
  const insertPlayer = db.prepare('INSERT INTO players VALUES (?, ?)');
  const purgeLimits = db.prepare('DELETE FROM rate_limits WHERE expires_at <= ?');
  const getLimit = db.prepare('SELECT expires_at, attempts FROM rate_limits WHERE bucket = ?');
  const incrementLimit = db.prepare(`
    INSERT INTO rate_limits VALUES (?, ?, 1)
    ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1
  `);
  const findCampaign = db.prepare('SELECT * FROM campaigns WHERE id = ?');
  const findCode = db.prepare('SELECT * FROM campaigns WHERE code_hash = ?');
  const upsertCampaign = db.prepare(`
    INSERT INTO campaigns VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code_hash = excluded.code_hash,
      label = excluded.label,
      rewards = excluded.rewards,
      enabled = 1,
      round = excluded.round,
      claim_cap = excluded.claim_cap,
      updated_at = excluded.updated_at
  `);
  const disableCampaign = db.prepare('UPDATE campaigns SET enabled = 0, updated_at = ? WHERE id = ?');
  const findClaim = db.prepare('SELECT * FROM claims WHERE campaign = ? AND round = ? AND token_hash = ?');
  const getClaimCount = db.prepare('SELECT COUNT(*) AS total FROM claims WHERE campaign = ? AND round = ?');
  const insertClaim = db.prepare('INSERT INTO claims VALUES (?, ?, ?, ?, ?, ?, ?)');
  const getClaims = db.prepare('SELECT * FROM claims WHERE token_hash = ? ORDER BY claimed_at, id');
  const campaignStatus = db.prepare(`
    SELECT id, label, enabled, round, claim_cap AS claimCap, updated_at, rewards,
      (SELECT COUNT(*) FROM claims WHERE claims.campaign = campaigns.id AND claims.round = campaigns.round) AS claims
    FROM campaigns
    ORDER BY CASE WHEN id = 'super' THEN 0 ELSE 1 END, id
  `);

  function requirePlayer(token) {
    const valid = typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
    const tokenHash = valid ? digest(token) : '';
    if (!valid || !findPlayer.get(tokenHash)) {
      throw new RedemptionError(401, 'unauthorized', 'Your player key is missing or expired.');
    }
    return tokenHash;
  }

  function limit(now, rules) {
    purgeLimits.run(now);
    for (const { bucket, max } of rules) {
      const previous = getLimit.get(bucket);
      if (previous && previous.attempts >= max) {
        const retryAfter = Math.max(1, Math.ceil((previous.expires_at - now) / 1_000));
        throw new RedemptionError(429, 'rate_limited', 'Too many requests. Wait a little and try again.', retryAfter);
      }
    }
    for (const { bucket, duration } of rules) incrementLimit.run(bucket, now + duration);
  }

  function setCampaign({ id, code, label, rewards, cap, newRound, now }) {
    const previous = findCampaign.get(id);
    const codeHash = digest(code);
    const existing = findCode.get(codeHash);
    if (existing && existing.id !== id) throw new Error('That code belongs to a different campaign.');
    const round = (previous?.round ?? 0) + (previous && !newRound ? 0 : 1);
    upsertCampaign.run(id, codeHash, label, JSON.stringify(rewardValues(rewards)), round, cap, now);
  }

  function capValue(cap, fallback) {
    if (cap === undefined) return fallback;
    if (cap !== null && (!Number.isSafeInteger(cap) || cap < 1 || cap > 100_000_000)) {
      throw new Error('Claim cap must be unlimited or an integer from 1 to 100000000.');
    }
    return cap;
  }

  return {
    close: () => db.close(),

    createPlayer(ip, now = Date.now()) {
      return transaction(db, () => {
        limit(now, [{ bucket: `create:${digest(ip)}`, max: 12, duration: 60 * MINUTE }]);
        const token = randomBytes(32).toString('base64url');
        insertPlayer.run(digest(token), now);
        return token;
      });
    },

    listReceipts(token) {
      return getClaims.all(requirePlayer(token)).map(receipt);
    },

    redeem(token, ip, input, now = Date.now()) {
      const tokenHash = requirePlayer(token);
      const code = normalizeCode(input);
      return transaction(db, () => {
        limit(now, [
          { bucket: `redeem:player:${tokenHash}`, max: 8, duration: 10 * MINUTE },
          { bucket: `redeem:ip:${digest(ip)}`, max: 30, duration: 10 * MINUTE },
        ]);

        const campaign = code && findCode.get(digest(code));
        if (!campaign?.enabled) return { invalid: true };

        const previous = findClaim.get(campaign.id, campaign.round, tokenHash);
        if (previous) return { receipt: receipt(previous), alreadyClaimed: true };

        const { total } = getClaimCount.get(campaign.id, campaign.round);
        if (campaign.claim_cap !== null && total >= campaign.claim_cap) return { exhausted: true };

        const id = randomUUID();
        insertClaim.run(id, campaign.id, campaign.round, tokenHash, campaign.label, campaign.rewards, now);
        return { receipt: receipt(findClaim.get(campaign.id, campaign.round, tokenHash)), alreadyClaimed: false };
      });
    },

    init(now = Date.now()) {
      return transaction(db, () => {
        const welcomeCreated = !findCampaign.get('welcome');
        if (welcomeCreated) {
          setCampaign({ id: 'welcome', code: 'WELCOME', label: 'Welcome gift', rewards: welcomeRewards, cap: null, now });
        }
        if (findCampaign.get(SUPER_ID)) return { welcomeCreated };
        const code = superCode();
        setCampaign({ id: SUPER_ID, code, label: 'SUPER reward', rewards: superRewards, cap: null, now });
        return { welcomeCreated, code };
      });
    },

    rotateSuper({ cap, newRound = false } = {}, now = Date.now()) {
      return transaction(db, () => {
        const previous = findCampaign.get(SUPER_ID);
        const code = superCode();
        setCampaign({
          id: SUPER_ID, code, label: 'SUPER reward', rewards: superRewards,
          cap: capValue(cap, previous?.claim_cap ?? null), newRound, now,
        });
        return code;
      });
    },

    setPromo({ id, code, label, coins, boosters, cap, newRound = false }, now = Date.now()) {
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(id) || id === SUPER_ID) throw new Error('Invalid promo campaign ID.');
      const normalized = normalizeCode(code);
      if (!normalized || normalized.startsWith('SUPER-') || normalized === 'SUPER') {
        throw new Error('Promo codes need 4–64 ASCII letters, digits or hyphens, with no SUPER prefix.');
      }
      if (label !== undefined && (label.trim().length === 0 || label.length > 80)) {
        throw new Error('Label must contain 1–80 characters.');
      }
      transaction(db, () => {
        const previous = findCampaign.get(id);
        const priorRewards = previous ? JSON.parse(previous.rewards) : {};
        setCampaign({
          id, code: normalized, label: label?.trim() ?? previous?.label ?? 'Share reward',
          rewards: { coins: coins ?? priorRewards.coins, boosters: { ...priorRewards.boosters, ...boosters } },
          cap: capValue(cap, previous?.claim_cap ?? null), newRound, now,
        });
      });
    },

    disable(id, now = Date.now()) {
      if (disableCampaign.run(now, id).changes === 0) throw new Error('Campaign does not exist.');
    },

    status() {
      return campaignStatus.all().map(({ rewards, updated_at, enabled, ...fields }) => ({
        ...fields,
        enabled: Boolean(enabled),
        rewards: JSON.parse(rewards),
        updatedAt: new Date(updated_at).toISOString(),
      }));
    },
  };
}
