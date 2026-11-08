import { parseArgs } from 'node:util';
import { openRedemptions, superRewards } from '../server/redemptions.mjs';

const usage = `Skewer Shift reward administration

  node tools/redeem-admin.mjs init
  node tools/redeem-admin.mjs status
  node tools/redeem-admin.mjs super:rotate [--cap <number|unlimited>] [--new-round]
  node tools/redeem-admin.mjs super:disable
  node tools/redeem-admin.mjs promo:set <id> <code> [--label <name>] [--coins <number>]
    [--collect <number>] [--shuffle <number>] [--time <number>] [--open <number>]
    [--cap <number|unlimited>] [--new-round]
  node tools/redeem-admin.mjs promo:disable <id>

Run from the project directory, or set GRILL_DATA_DIR to the same directory as the running server.
Rotation preserves claims and the cap by default. Use --new-round to reopen eligibility and reset the count.
Copy each new SUPER code when printed. The stored digest cannot recover its plaintext.`;

const capOptions = { cap: { type: 'string' }, 'new-round': { type: 'boolean' } };
const promoOptions = {
  ...capOptions,
  label: { type: 'string' },
  coins: { type: 'string' },
  collect: { type: 'string' },
  shuffle: { type: 'string' },
  time: { type: 'string' },
  open: { type: 'string' },
};

function integer(value, label) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${label} must be an integer.`);
  return Number(value);
}

function limit(values) {
  return {
    cap: values.cap === 'unlimited' ? null : integer(values.cap, 'Claim cap'),
    newRound: values['new-round'],
  };
}

function showCode(code) {
  console.log('New SUPER code:', code);
  console.log(`Rewards: ${superRewards.coins.toLocaleString('en-US')} coins and ${superRewards.boosters.collect} of each booster.`);
  console.log('Copy the code now and share it only with intended recipients.');
}

function run(args) {
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === 'help') {
    console.log(usage);
    return;
  }
  const commands = {
    init: 0, status: 0, 'super:rotate': 0, 'super:disable': 0, 'promo:set': 2, 'promo:disable': 1,
  };
  if (!Object.hasOwn(commands, command)) throw new Error('Unknown command. Run with --help for usage.');
  const options = command === 'promo:set' ? promoOptions : command === 'super:rotate' ? capOptions : {};
  const { positionals, values } = parseArgs({ args: rest, options, allowPositionals: true });
  if (positionals.length !== commands[command]) throw new Error('Incorrect arguments. Run with --help for usage.');
  const [id, code] = positionals;
  if (command === 'promo:disable' && id === 'super') throw new Error('Use super:disable for the SUPER campaign.');

  const store = openRedemptions();
  try {
    switch (command) {
      case 'init': {
        const result = store.init();
        if (result.welcomeCreated) console.log('Public WELCOME code is active.');
        if (result.code) showCode(result.code);
        else console.log('SUPER campaign already exists. Run status or super:rotate as needed.');
        break;
      }
      case 'status':
        console.log(JSON.stringify(store.status(), null, 2));
        break;
      case 'super:rotate':
        showCode(store.rotateSuper(limit(values)));
        break;
      case 'super:disable':
        store.disable('super');
        console.log('SUPER code disabled.');
        break;
      case 'promo:set':
        store.setPromo({
          id, code, label: values.label, coins: integer(values.coins, 'Coins'), ...limit(values),
          boosters: Object.fromEntries(['collect', 'shuffle', 'time', 'open']
            .filter((kind) => values[kind] !== undefined)
            .map((kind) => [kind, integer(values[kind], kind)])),
        });
        console.log(`Promo campaign ${id} is active.`);
        break;
      case 'promo:disable':
        store.disable(id);
        console.log(`Promo campaign ${id} disabled.`);
        break;
    }
  } finally {
    store.close();
  }
}

try {
  run(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
