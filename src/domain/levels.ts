import type { LevelDefinition, Mode, Obstacle, OrderDefinition, Slots3, TrayDefinition } from './types.js';

const FOOD_SYMBOLS: Record<string, string> = {
  a: 'sausage', b: 'corn', c: 'mushroom', d: 'shrimp', e: 'steak', f: 'broccoli',
  g: 'pepper', h: 'fish', i: 'tomato', j: 'eggplant', k: 'pineapple', l: 'onion', m: 'zucchini',
};

const MODE_NAMES: Record<Mode, string> = {
  sort: 'Story',
  'master-chef': 'Master Chef',
  'conveyor-chaos': 'Conveyor Chaos',
  'stacked-orders': 'Stacked Orders',
  'match-drop': 'Match & Drop',
  'color-match': 'Color Match',
};

type TrayRecipe = string | { plates: string; obstacle: Obstacle };

function tray(recipe: TrayRecipe, index: number): TrayDefinition {
  const id = 't' + (index + 1);
  const plates = typeof recipe === 'string' ? recipe : recipe.plates;
  const rows = plates.split('/').map((row) => {
    if (row.length !== 3 || [...row].some((symbol) => symbol !== '-' && !FOOD_SYMBOLS[symbol])) {
      throw new Error('Invalid plate ' + row + ' on ' + id);
    }
    return Array.from(row, (symbol) => symbol === '-' ? null : FOOD_SYMBOLS[symbol]) as Slots3;
  });
  return { id, slots: rows[0], layers: rows.slice(1), obstacle: typeof recipe === 'string' ? undefined : recipe.obstacle };
}

function level(
  id: string, name: string, description: string, seconds: number, rewardCoins: number,
  recipes: TrayRecipe[], options: { mode?: Mode; columns?: number; orders?: OrderDefinition[]; tutorial?: string } = {},
): LevelDefinition {
  const mode = options.mode ?? 'sort';
  const seed = [...id].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 17);
  return {
    id, name, description, mode, modeName: MODE_NAMES[mode], contentVersion: 1, seed,
    timeLimitMs: seconds * 1000, rewardCoins, columns: options.columns ?? 3,
    trays: recipes.map(tray), orders: options.orders ?? [], tutorial: options.tutorial,
  };
}

function order(
  id: string, customer: string, requirements: Record<string, number>, seconds: number,
  rewardCoins: number, mandatory = false, startsAfterGroups = 0,
): OrderDefinition {
  return { id, customer, requirements, startsAfterGroups, durationMs: seconds * 1000, mandatory, rewardCoins };
}

function covered(plates: string, foodId: string): TrayRecipe {
  return { plates, obstacle: { kind: 'cover', foodId, remaining: 1 } };
}

function iced(plates: string, remaining: number, neighbors?: string[]): TrayRecipe {
  return { plates, obstacle: { kind: 'ice', remaining, neighbors } };
}

function hot(plates: string, seconds: number): TrayRecipe {
  const durationMs = seconds * 1000;
  return { plates, obstacle: { kind: 'hot', remaining: 1, durationMs, remainingMs: durationMs } };
}

function wood(plates: string, rewardCoins: number): TrayRecipe {
  return { plates, obstacle: { kind: 'wood', remaining: 1, rewardCoins } };
}

export const LEVELS: LevelDefinition[] = [
  level('001', 'First Fire', 'Light the grill with two familiar foods.', 90, 80,
    ['ab-', 'ab-', 'ab-', '---'], {
      columns: 2, tutorial: 'Drag or tap one skewer, then choose an empty slot on another tray. Put three sausages together, then match the corn.',
    }),
  level('002', 'Grill Marks', 'Make space on a busy grill.', 100, 95,
    ['abc', 'abc', 'abc', '---', '---', '---'], {
      tutorial: 'A tray can hold different foods. Keep one tray free so you can collect the next set of three.',
    }),
  level('003', 'Hidden Plates', 'There is more under the counter.', 105, 110,
    ['a--/bb-', 'a--/b--', 'a--/ccc', '---'], {
      columns: 2, tutorial: 'Empty the top tray to uncover the plate underneath. A matching plate clears as soon as it appears.',
    }),
  level('004', 'Six-Burner Rush', 'Four foods compete for space.', 115, 125,
    ['aab', 'bbc', 'ccd', 'dda', '---', '---']),
  level('005', 'Under Cover', 'A skewer on the lid tells you how to open it.', 115, 145,
    ['aab', 'a-c', 'bbc', covered('c--', 'sausage'), '---', '---'], {
      tutorial: 'Match the food pictured on the lid anywhere on the grill to uncover that tray.',
    }),
  level('006', 'Break the Ice', 'Clear two sets to thaw the frozen tray.', 125, 165,
    ['aab', 'bbc', 'ccd', iced('dda', 2, ['t1', 't2', 't3', 't5', 't6']), '---', '---'], {
      tutorial: 'Every triple clears one layer of ice here. Once the ice is gone, the tray works normally.',
    }),
  level('007', 'On the House', 'A regular has a favorite order.', 125, 180,
    ['ab-', 'ab-', 'ab-', 'ddc', 'dcc', '---'], {
      orders: [order('tasting', 'Mina', { corn: 1, mushroom: 1 }, 60, 75)],
      tutorial: 'Fill Mina’s order before its timer runs out for bonus coins. You can still win by clearing the grill.',
    }),
  level('008', 'Hot Plate', 'Empty the hot tray and its reserve before it burns.', 140, 200,
    [hot('aa-/dd-', 50), 'bbd', 'bce', 'cea', 'c-e', '---', '---', '---', '---'], {
      tutorial: 'The red tray has its own countdown. Empty it and all the plates beneath it before time runs out.',
    }),
  level('009', 'Cedar Special', 'Serve one triple on the cedar tray for a bonus.', 145, 220,
    ['abc', 'cde', 'eab', 'bcd', 'dea', wood('---', 90), '---', '---', '---'], {
      tutorial: 'Make a triple on the wooden tray to earn a bonus when you win.',
    }),
  level('010', 'Dinner Service', 'Covers, ice and reserve plates share one crowded board.', 160, 250,
    ['aab/def', 'bbc/eff', covered('ccd/ade', 'corn'), iced('eff/eef', 2), '---', wood('---', 95), '---', '---', '---'], {
      orders: [order('dinner', 'Jules', { shrimp: 1, steak: 1 }, 80, 105, false, 1)],
    }),
  level('011', 'Coastline Menu', 'Fish, peppers and tomatoes head to the grill.', 160, 275,
    ['ghi/jjk', 'ifg/jkk', 'hfg', 'ihf', '---', '---', '---', '---', '---'], {
      orders: [order('coast', 'Sol', { fish: 1, pineapple: 1 }, 85, 115)],
    }),
  level('012', 'Last Seating', 'Close the kitchen with a full menu and a hot station.', 175, 320,
    ['abc/ghi', hot('def/gh-', 65), 'adf/i--', 'bec/ghi', 'afd', covered('ebc', 'shrimp'), '---', wood('---', 125), '---'], {
      orders: [
        order('opening', 'Mina', { broccoli: 1, shrimp: 1 }, 65, 120),
        order('closing', 'Jules', { fish: 1, pepper: 1 }, 80, 150, false, 2),
      ],
    }),
];

export const CHALLENGES: LevelDefinition[] = [
  level('master-chef', 'Chef’s Table', 'Clear the grill and finish the featured order before it expires.', 145, 500,
    ['abc/deg', 'bcd/efg', covered('acd/ffg', 'corn'), 'abe', '---', wood('---', 100), '---', '---', '---'], {
      mode: 'master-chef', orders: [
        order('chef', 'Chef Noa', { sausage: 1, steak: 1, pepper: 1 }, 85, 200, true),
        order('side', 'Sol', { broccoli: 1 }, 70, 90, false, 2),
      ],
      tutorial: 'Chef Noa’s order is required. Clear every tray and serve each requested match before its deadline.',
    }),
  level('conveyor-chaos', 'The Moving Line', 'Choose food from the first two trays before the line advances.', 140, 400,
    ['ab-', 'ab-', 'ab-', '---', 'cc-', 'c--'], {
      mode: 'conveyor-chaos',
      tutorial: 'Pick up food from either of the first two trays. You can drop it on any other open tray. After each move, the first tray goes to the back.',
    }),
  level('stacked-orders', 'Tickets Up', 'Serve four required orders in sequence while clearing the board.', 145, 475,
    ['ab-/cd-', 'ab-/cd-', 'ab-/cd-', '---', '---', '---'], {
      mode: 'stacked-orders', orders: [
        order('ticket-1', 'Mina', { sausage: 1 }, 38, 70, true),
        order('ticket-2', 'Sol', { corn: 1 }, 38, 80, true, 1),
        order('ticket-3', 'Jules', { mushroom: 1 }, 40, 90, true, 2),
        order('ticket-4', 'Chef Noa', { shrimp: 1 }, 45, 100, true, 3),
      ],
      tutorial: 'Tickets open one after the other. Match the food on the active ticket before clearing foods from later tickets.',
    }),
  level('match-drop', 'Four Deep', 'Clear tall stacks as exposed skewers slide into the next open position.', 145, 430,
    ['ab-/cd-/ef-/gh-', 'ab-/cd-/ef-/gh-', 'ab-/cd-/ef-/gh-', '---'], {
      mode: 'match-drop', columns: 2,
      tutorial: 'Skewers slide left to fill gaps after each move. Empty a tray to reveal the next layer of food.',
    }),
  level('color-match', 'Market Palette', 'Match food by its color badge to clear the grill.', 135, 410,
    ['abf', 'cdg', 'ekm', 'hij', 'lea', '---', '---', '---', '---'], {
      mode: 'color-match',
      tutorial: 'Three skewers with the same color badge make a match, even when they’re different foods.',
    }),
];

export function getLevel(id: string): LevelDefinition | undefined {
  return LEVELS.find((definition) => definition.id === id) ?? CHALLENGES.find((definition) => definition.id === id);
}
