import { getLevel, isValidCheckpoint, type GameState } from '../domain/index.js';

export type BoosterKey = 'collect' | 'shuffle' | 'time' | 'open';
export type Inventory = Record<BoosterKey, number>;

export interface Receipt {
  id: string;
  campaign: string;
  label: string;
  coins: number;
  boosters: Inventory;
  claimedAt: string;
}

export interface PlayerSave {
  version: 1;
  coins: number;
  inventory: Inventory;
  completed: string[];
  sound: boolean;
  playerToken: string;
  receipts: string[];
  active: GameState | null;
}

const mainKey = 'skewer-shift.save.v1';
const backupKey = 'skewer-shift.save.backup.v1';
export const boosterKeys: BoosterKey[] = ['collect', 'shuffle', 'time', 'open'];
let lastGoodPrimary: string | null = null;

function newSave(): PlayerSave {
  return {
    version: 1, coins: 180, inventory: { collect: 1, shuffle: 1, time: 1, open: 1 },
    completed: [], sound: true, playerToken: '', receipts: [], active: null,
  };
}

function amount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isReceipt(value: unknown): value is Receipt {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<Receipt>;
  return typeof entry.id === 'string' && entry.id.length > 0 && typeof entry.label === 'string'
    && typeof entry.campaign === 'string' && typeof entry.claimedAt === 'string' && amount(entry.coins)
    && boosterKeys.every(key => amount(entry.boosters?.[key]));
}

function parse(raw: string | null): PlayerSave | null {
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as Partial<PlayerSave>;
    if (!entry || entry.version !== 1 || !amount(entry.coins) || typeof entry.sound !== 'boolean'
      || typeof entry.playerToken !== 'string' || !Array.isArray(entry.completed) || !Array.isArray(entry.receipts)
      || !entry.completed.every(id => typeof id === 'string') || !entry.receipts.every(id => typeof id === 'string')
      || !boosterKeys.every(key => amount(entry.inventory?.[key]))) return null;
    const save = entry as PlayerSave;
    const level = save.active && getLevel(save.active.levelId);
    if (!level || !save.active || save.active.status !== 'playing' || !isValidCheckpoint(save.active, level)) save.active = null;
    return save;
  } catch {
    return null;
  }
}

export function loadSave(): PlayerSave {
  try {
    const primary = localStorage.getItem(mainKey);
    const save = parse(primary);
    if (save) {
      lastGoodPrimary = primary;
      return save;
    }
    return parse(localStorage.getItem(backupKey)) ?? newSave();
  } catch {
    return newSave();
  }
}

export function persist(save: PlayerSave): boolean {
  try {
    const next = JSON.stringify(save);
    if (next === lastGoodPrimary) return true;
    if (lastGoodPrimary && localStorage.getItem(mainKey) === lastGoodPrimary) {
      try { localStorage.setItem(backupKey, lastGoodPrimary); } catch { /* Keep the current save usable when quota is tight. */ }
    }
    localStorage.setItem(mainKey, next);
    lastGoodPrimary = next;
    return true;
  } catch {
    return false;
  }
}

export function applyReceipt(save: PlayerSave, receipt: Receipt): boolean {
  if (save.receipts.includes(receipt.id)) return false;
  save.coins += receipt.coins;
  for (const key of boosterKeys) save.inventory[key] += receipt.boosters[key];
  save.receipts.push(receipt.id);
  return true;
}
