import {
  applyCommand, BOOSTERS, canMove, canPick, CHALLENGES, createGame, FOODS, getFood,
  getLevel, LEVELS, type Command, type GameEvent, type GameState, type LevelDefinition, type SlotAddress,
} from '../domain/index.js';
import { canShareGame, gameFetch, getShareUrl, shareGame } from '../platform.js';
import { foodArt, heroArt, icon } from './art.js';
import { applyReceipt, boosterKeys, isReceipt, loadSave, persist, type BoosterKey } from './save.js';

type Address = SlotAddress;
type Screen = 'home' | 'trail' | 'arcade' | 'game';
type Modal = 'pause' | 'help' | 'settings' | 'redeem' | 'share' | 'boost' | 'won' | 'lost' | 'blocked' | 'restart';
type Pointer = { id: number; from: Address; x: number; y: number; ghost?: HTMLElement };

const boostIcons: Record<BoosterKey, string> = { collect: 'spark', shuffle: 'shuffle', time: 'clock', open: 'key' };
const familyMarks: Record<string, string> = { red: 'R', gold: 'Y', green: 'G', purple: 'P' };
const modeIcons: Record<string, string> = {
  'master-chef': 'chef', 'conveyor-chaos': 'refresh', 'stacked-orders': 'layers', 'match-drop': 'arrow', 'color-match': 'spark',
};
const defaultShareCode = 'WELCOME';
const labels: Record<Exclude<Screen, 'game'>, [string, string]> = {
  home: ['flame', 'Kitchen'], trail: ['grid', 'Level trail'], arcade: ['spark', 'Arcade'],
};

function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function number(value: number): string { return value.toLocaleString(); }

function time(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function sameAddress(a: Address | null, b: Address): boolean { return a?.trayId === b.trayId && a.slot === b.slot; }

function food(id: string): string { return foodArt(id, escape(FOODS[id]?.emoji)); }

function button(action: string, content: string, kind = 'secondary', attrs = ''): string {
  return `<button class="button ${kind}" type="button" data-action="${action}" ${attrs}>${content}</button>`;
}

function iconButton(action: string, glyph: string, label: string): string {
  return `<button class="icon-button" type="button" data-action="${action}" aria-label="${escape(label)}" title="${escape(label)}">${icon(glyph)}</button>`;
}

function levelNumber(level: LevelDefinition): string {
  const index = LEVELS.findIndex(entry => entry.id === level.id);
  return String(index + 1).padStart(2, '0');
}

class Kitchen {
  private save = loadSave();
  private screen: Screen = 'home';
  private state: GameState | null = null;
  private level: LevelDefinition | null = null;
  private modal: Modal | null = null;
  private selected: Address | null = null;
  private pointer: Pointer | null = null;
  private toastTimer = 0;
  private suppressClicksUntil = 0;
  private tickAt = performance.now();
  private checkpointAt = performance.now();
  private lastFocus = '';
  private redeemCode = '';
  private shareCode = defaultShareCode;
  private rewardNotice = '';
  private rewardDetails = '';
  private busy = false;
  private booster: BoosterKey = 'collect';
  private earned = 0;
  private audio: AudioContext | null = null;

  constructor(private root: HTMLElement) {
    try {
      const url = new URL(location.href);
      const fragment = new URLSearchParams(url.hash.slice(1));
      const sharedCode = fragment.get('code') ?? url.searchParams.get('code');
      if (sharedCode) {
        this.redeemCode = sharedCode.slice(0, 100);
        this.modal = 'redeem';
        url.searchParams.delete('code');
        if (fragment.has('code')) {
          fragment.delete('code');
          url.hash = fragment.toString();
        }
        history.replaceState(history.state, '', url);
      }
    } catch { /* An embedded host may restrict history updates. */ }
    root.addEventListener('click', this.click);
    root.addEventListener('submit', this.submit);
    root.addEventListener('pointerdown', this.pointerDown);
    window.addEventListener('pointermove', this.pointerMove);
    window.addEventListener('pointerup', this.pointerUp);
    window.addEventListener('pointercancel', event => {
      if (event.pointerId === this.pointer?.id) {
        const dragged = Boolean(this.pointer.ghost);
        this.cancelPointer();
        if (dragged) { this.selected = null; this.updateSelection(); }
      }
    });
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('skewer-native-pause', this.suspend);
    window.addEventListener('pagehide', this.suspend);
    document.addEventListener('visibilitychange', () => {
      this.tickAt = performance.now();
      if (document.hidden) this.suspend();
    });
    window.setInterval(this.tick, 250);
    if (this.save.playerToken) void this.syncReceipts();
    this.render();
  }

  private navigation(): string {
    return (Object.keys(labels) as (keyof typeof labels)[]).map(screen => {
      const [glyph, label] = labels[screen];
      return `<button class="nav-button${this.screen === screen ? ' current' : ''}" data-action="${screen}" type="button" ${this.screen === screen ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></button>`;
    }).join('');
  }

  private header(): string {
    return `<header class="topbar"><div class="topbar-inner">
      <button class="brand" data-action="home" type="button" aria-label="Skewer Shift kitchen"><span class="brand-mark">${icon('flame')}</span><span>Skewer<span>Shift</span><small>GRILL SORT PUZZLES</small></span></button>
      <nav class="main-nav" aria-label="Main navigation">${this.navigation()}</nav>
      <div class="top-actions"><span class="coin-pill" aria-label="${number(this.save.coins)} coins">${icon('coin')} <span data-coins>${number(this.save.coins)}</span></span>${iconButton('settings', 'settings', 'Settings')}</div>
    </div></header>`;
  }

  private home(): string {
    const next = this.nextLevel();
    const active = this.save.active && getLevel(this.save.active.levelId);
    const label = active ? 'Resume shift' : 'Play next level';
    return `<main class="home content" id="main-content">
      <section class="hero" aria-labelledby="home-title">
        <div class="hero-copy"><p class="eyebrow"><span class="live-dot"></span> THE NIGHT MARKET IS OPEN</p>
        <h1 id="home-title">Fire up<br>the <em>grill.</em></h1>
        <p class="hero-description">Sort the skewers, serve the crowd and keep your cool at the hottest grill in town.</p>
        <div class="hero-actions">${button('play', `${icon('play')}${label}`, 'primary')}<span class="hero-level">${active && active.mode !== 'sort' ? escape(active.modeName) : `LEVEL ${levelNumber(active || next)}`}</span></div></div>
        <div class="hero-picture">${heroArt()}<span class="hero-stamp">FLAME<br>GRILLED</span></div>
      </section>
      <div class="section-heading home-heading"><div><p class="eyebrow">YOUR SHIFT</p><h2>Kitchen counter</h2></div><span class="no-ads">${icon('check')} Ad-free</span></div>
      <section class="home-cards" aria-label="Kitchen counter">
        <article class="feature-card feature-trail"><span class="feature-mark">${icon('grid')}</span><div class="feature-copy"><h3>Level trail</h3><p>${this.save.completed.filter(id => LEVELS.some(level => level.id === id)).length} of ${LEVELS.length} grills cleared</p></div>${iconButton('trail', 'arrow', 'Open level trail')}</article>
        <article class="feature-card feature-arcade"><span class="feature-mark">${icon('spark')}</span><div class="feature-copy"><h3>Arcade</h3><p>${CHALLENGES.length} ways to turn up the heat</p></div>${iconButton('arcade', 'arrow', 'Open arcade')}</article>
      </section>
      <section class="reward-card" aria-label="Redeem rewards"><span class="feature-mark">${icon('gift')}</span><div class="feature-copy"><p class="eyebrow">GRILL PERKS</p><h3>Good food is better shared.</h3><p>Give a friend a code or claim coins and boosters for your next shift.</p></div><div class="reward-actions">${button('redeem', `${icon('gift')} Redeem code`, 'subtle')}${iconButton('share', 'share', 'Share the game')}</div></section>
      <footer class="home-footer"><span>${icon('flame')} SKEWER SHIFT</span>${button('help', `${icon('help')} How to play`, 'text-button')}</footer>
    </main>`;
  }

  private nextLevel(): LevelDefinition {
    return LEVELS.find(level => !this.save.completed.includes(level.id)) ?? LEVELS[0];
  }

  private isUnlocked(level: LevelDefinition): boolean {
    const index = LEVELS.findIndex(entry => entry.id === level.id);
    return index <= 0 || this.save.completed.includes(LEVELS[index - 1].id) || this.save.completed.includes(level.id);
  }

  private trail(): string {
    const cleared = LEVELS.filter(level => this.save.completed.includes(level.id)).length;
    return `<main class="content catalog" id="main-content"><section class="catalog-header"><div><p class="eyebrow">THE NIGHT MARKET</p><h1>Level trail</h1><p>Work through the market, from first skewers to the final rush.</p></div><span class="catalog-tally">${icon('flame')}<strong>${cleared} / ${LEVELS.length}</strong><small>GRILLS CLEARED</small></span></section>
      <div class="level-list">${LEVELS.map(level => {
        const unlocked = this.isUnlocked(level);
        const complete = this.save.completed.includes(level.id);
        return `<button type="button" class="level-card${complete ? ' complete' : ''}${!unlocked ? ' locked' : ''}" data-action="level" data-level="${escape(level.id)}" ${unlocked ? '' : 'disabled'}><span class="level-index">${levelNumber(level)}</span><span class="level-copy"><strong>${escape(level.name)}</strong><span>${escape(level.description)}</span></span><span class="level-mark">${icon(complete ? 'check' : unlocked ? 'arrow' : 'lock')}</span></button>`;
      }).join('')}</div></main>`;
  }

  private arcade(): string {
    return `<main class="content catalog" id="main-content"><section class="catalog-header"><div><p class="eyebrow">ARCADE SERVICE</p><h1>Turn up the heat.</h1><p>Five specialties. Each changes what it takes to clear the grill.</p></div><span class="catalog-tally">${icon('spark')}<strong>${CHALLENGES.length} modes</strong><small>OPEN FOR PLAY</small></span></section>
      <div class="arcade-grid">${CHALLENGES.map((level, index) => `<article class="mode-card mode-${index}"><span class="feature-mark">${icon(modeIcons[level.mode] ?? 'spark')}</span><p class="eyebrow">SPECIALTY ${String(index + 1).padStart(2, '0')}</p><h2>${escape(level.modeName)}</h2><p>${escape(level.description)}</p>${button('level', `${this.save.completed.includes(level.id) ? 'Play again' : 'Play challenge'} ${icon('arrow')}`, 'subtle', `data-level="${escape(level.id)}"`)}</article>`).join('')}</div></main>`;
  }

  private game(): string {
    const level = this.level!;
    const state = this.state!;
    return `<main class="content game" id="main-content"><div class="game-heading">
      <div class="game-title">${iconButton('leave', 'back', 'Save and return to kitchen')}<div><p class="eyebrow">${level.mode === 'sort' ? `LEVEL ${levelNumber(level)}` : escape(level.modeName.toUpperCase())}</p><h1>${escape(level.name)}</h1></div></div>
      <div class="game-heading-controls">${iconButton('help', 'help', 'How to play')}${iconButton('pause', 'pause', 'Pause game')}</div></div>
      <section class="game-meter" aria-label="Level progress"><div class="meter-stat"><span class="meter-mark">${icon('flame')}</span><span><small>GROUPS SERVED</small><strong data-progress>${state.groupsCleared} / ${state.totalGroups}</strong></span></div><div class="meter-track" role="progressbar" aria-label="Groups served" aria-valuemin="0" aria-valuemax="${state.totalGroups}" aria-valuenow="${state.groupsCleared}"><span data-progress-fill style="width:${100 * state.groupsCleared / Math.max(1, state.totalGroups)}%"></span></div><div class="meter-stat timer${state.remainingMs <= 15000 ? ' danger' : ''}" data-timer>${icon('clock')}<strong>${time(state.remainingMs)}</strong></div></section>
      ${state.orders.length ? `<div class="orders" data-orders>${this.orderCards()}</div>` : ''}
      ${level.tutorial ? `<p class="tutorial"><span>${icon('spark')}</span>${escape(level.tutorial)}</p>` : ''}
      <section class="board-panel" aria-label="Grill board"><div class="board-top"><span>${icon('flame')} ${level.mode === 'conveyor-chaos' ? 'CONVEYOR GRILL' : 'CAST-IRON GRILL'}</span><span>${state.trays.length} TRAYS</span></div><div class="board" data-board style="--columns:${level.columns}">${this.trays()}</div></section>
      <section class="game-tools" aria-label="Boosters"><div class="game-tools-head"><div><p class="eyebrow">THE PREP STATION</p><h2>Boosters</h2></div>${button('undo', `${icon('undo')} Undo`, 'text-button', state.undo ? '' : 'disabled')}</div><div class="boosters">${boosterKeys.map(key => this.boosterButton(key)).join('')}</div></section>
    </main>`;
  }

  private orderCards(): string {
    return this.state!.orders.map(order => `<article class="order-card order-${order.status}" data-order="${escape(order.id)}"><span class="order-icon">${icon(order.status === 'completed' ? 'check' : 'chef')}</span><div class="order-copy"><strong>${escape(order.customer)}</strong><small>${order.mandatory ? 'Required order' : `Bonus order · ${order.rewardCoins} coins`}</small></div><div class="order-foods">${Object.entries(order.requirements).map(([id, required]) => `<span title="${escape(FOODS[id]?.name ?? id)}">${food(id)}<small>${order.progress[id] ?? 0}/${required}</small></span>`).join('')}</div><span class="order-time" data-order-time>${order.status === 'active' ? time(order.remainingMs) : escape(order.status)}</span></article>`).join('');
  }

  private trayStatus(tray: GameState['trays'][number]): string {
    const obstacle = tray.obstacle;
    if (!obstacle) return '';
    if (obstacle.kind === 'hot') return `<span class="obstacle obstacle-hot" title="Empty this tray before the heat timer runs out">${icon('flame')} HOT <span data-heat="${escape(tray.id)}">${time(obstacle.remainingMs)}</span></span>`;
    if (obstacle.kind === 'wood') return `<span class="obstacle obstacle-wood" title="Clear a group here for bonus coins">${icon('coin')} BONUS</span>`;
    if (obstacle.kind === 'ice') return `<span class="obstacle obstacle-ice" title="Clear nearby groups to melt the ice">${icon('ice')} ${obstacle.remaining}</span>`;
    return `<span class="obstacle obstacle-cover" title="Clear ${escape(FOODS[obstacle.foodId]?.name ?? obstacle.foodId)} to open the cover">${icon('lock')} ${food(obstacle.foodId)} ${obstacle.remaining}</span>`;
  }

  private trays(): string {
    const state = this.state!;
    return state.trays.map((tray, index) => {
      const obstacle = tray.obstacle?.kind ?? 'plain';
      const inaccessible = (obstacle === 'cover' || obstacle === 'ice') && (tray.obstacle?.remaining ?? 0) > 0;
      const depth = tray.queuedLayers.length - tray.nextLayer;
      const preview = tray.queuedLayers[tray.nextLayer];
      return `<article class="tray tray-${obstacle}${depth > 0 ? ' tray-stacked' : ''}${state.levelId && this.level?.mode === 'conveyor-chaos' && index < 2 ? ' tray-belt-front' : ''}" data-tray="${escape(tray.id)}" aria-label="Tray ${index + 1}${inaccessible ? ' covered' : ''}">
        <div class="tray-meta"><span class="tray-index">${String(index + 1).padStart(2, '0')}</span>${this.trayStatus(tray)}${depth > 0 ? `<span class="tray-depth" title="${depth} layers waiting">${icon('layers')} ${depth}</span>` : ''}</div>
        <div class="tray-plate">${tray.slots.map((pieceId, slotIndex) => {
          const slot = slotIndex as Address['slot'];
          const address = { trayId: tray.id, slot };
          const item = pieceId && getFood(state, pieceId);
          const valid = this.selected && canMove(state, this.selected, address);
          const pickable = canPick(state, address);
          const family = this.level?.mode === 'color-match' && item ? item.family : '';
          const badge = family ? `<span class="family-dot" data-family="${escape(family)}" title="${escape(family)} group">${escape(familyMarks[family])}</span>` : '';
          return `<button type="button" data-slot="${slot}" data-tray-id="${escape(tray.id)}" class="slot${pieceId ? ' occupied' : ' empty'}${pickable ? ' pickable' : ''}${valid ? ' valid' : ''}${sameAddress(this.selected, address) ? ' selected' : ''}" aria-label="Tray ${index + 1}, slot ${slot + 1}, ${item ? escape(item.name) : 'empty'}${family ? `, ${escape(family)} group` : ''}${inaccessible ? ', covered' : ''}" ${inaccessible ? 'disabled' : ''} ${sameAddress(this.selected, address) ? 'aria-pressed="true"' : ''}>${item ? `${food(item.id)}${badge}` : '<span class="slot-dimple"></span>'}</button>`;
        }).join('')}${inaccessible ? `<span class="tray-overlay" aria-hidden="true">${obstacle === 'ice' ? icon('ice') : icon('lock')}</span>` : ''}</div>
        ${preview ? `<div class="tray-preview" aria-label="Next layer">${preview.map(id => { const item = id && getFood(state, id); return `<span>${item ? food(item.id) : '·'}</span>`; }).join('')}</div>` : ''}
      </article>`;
    }).join('');
  }

  private boosterButton(key: BoosterKey): string {
    const entry = BOOSTERS[key];
    const owned = this.save.inventory[key];
    return `<button class="booster boost-${key}" data-action="boost" data-boost="${key}" type="button" title="${escape(entry.description)}"><span class="booster-mark">${icon(boostIcons[key])}</span><span class="booster-label">${escape(entry.name)}</span><span class="booster-count" aria-label="${owned ? `${owned} available` : `${entry.cost} coins`}">${owned || `${entry.cost} ¢`}</span></button>`;
  }

  private dialog(): string {
    const modal = this.modal;
    if (!modal) return '';
    let title = '';
    let body = '';
    let glyph = 'flame';
    let eyebrow = 'SKEWER SHIFT';
    if (modal === 'settings') {
      title = 'Settings';
      glyph = 'settings';
      body = `<div class="setting-row"><div><strong>Game sounds</strong><p>Hear taps, matches and the end of a shift.</p></div><button class="switch" type="button" role="switch" aria-label="Game sounds" aria-checked="${this.save.sound}" data-action="toggle-sound"><span></span></button></div><div class="dialog-actions">${button('help', `${icon('help')} How to play`, 'subtle')}${button('close', 'Done', 'primary')}</div>`;
    } else if (modal === 'help') {
      title = 'How to play';
      glyph = 'help';
      body = `<ol class="help-list"><li><strong>Move one skewer.</strong> Drag it or tap it, then pick an empty slot on another tray.</li><li><strong>Serve three of a kind.</strong> Fill a tray with three matching skewers to clear it. Empty a tray to reveal the next layer.</li><li><strong>Beat the clock.</strong> Clear every tray and finish any required orders. Bonus orders and wooden trays earn extra coins when you win.</li><li><strong>Find a way out.</strong> Undo a move, use a booster or restart if the grill gets stuck.</li></ol><div class="dialog-actions">${button('close', 'Got it', 'primary')}</div>`;
    } else if (modal === 'pause') {
      title = 'Shift paused';
      glyph = 'pause';
      body = `<p>Take a breather. Your grill and timer will be right here.</p><div class="dialog-actions stacked">${button('close', `${icon('play')} Resume shift`, 'primary')}${button('restart', `${icon('refresh')} Restart level`, 'subtle')}${button('leave', `${icon('back')} Save and return to kitchen`, 'subtle')}</div>`;
    } else if (modal === 'restart') {
      title = 'Restart this grill?';
      glyph = 'refresh';
      body = `<p>This resets the tray layout, orders and timer. Boosters spent during this attempt stay spent.</p><div class="dialog-actions">${button('cancel-restart', 'Cancel', 'subtle')}${button('retry', 'Restart level', 'primary')}</div>`;
    } else if (modal === 'blocked') {
      title = 'Grill jammed';
      glyph = 'grid';
      body = `<p>There are no legal moves left. Undo your last move or use a booster to free up a slot.</p><div class="dialog-actions stacked">${this.state?.undo ? button('undo', `${icon('undo')} Undo last move`, 'primary') : ''}${button('close', 'View grill and boosters', 'subtle')}${button('restart', 'Restart level', 'subtle')}</div>`;
    } else if (modal === 'won') {
      title = 'Grill cleared!';
      glyph = 'flag';
      eyebrow = 'SHIFT COMPLETE';
      const next = this.level && LEVELS[LEVELS.findIndex(level => level.id === this.level!.id) + 1];
      const advance = next && this.level?.mode === 'sort';
      body = `<p>You served ${this.state?.groupsCleared ?? 0} matching groups with ${time(this.state?.remainingMs ?? 0)} left on the clock.</p><div class="result-prize">${icon('coin')} <strong>${this.earned > 0 ? `+${number(this.earned)} coins` : 'Already cleared'}</strong></div><div class="dialog-actions stacked">${advance ? button('next', `Next level ${icon('arrow')}`, 'primary') : button('leave', 'Return to kitchen', 'primary')}${advance ? button('leave', 'Return to kitchen', 'subtle') : ''}</div>`;
    } else if (modal === 'lost') {
      title = 'Shift ended';
      glyph = 'clock';
      const reason = this.state?.failure;
      body = `<p>${reason === 'heat' ? 'A hot tray overheated.' : reason === 'order' ? 'A required customer order was missed.' : 'The grill timer ran out.'} Give the level another go.</p><div class="dialog-actions stacked">${button('retry', `${icon('refresh')} Try again`, 'primary')}${button('leave', 'Return to kitchen', 'subtle')}</div>`;
    } else if (modal === 'boost') {
      const entry = BOOSTERS[this.booster];
      const owned = this.save.inventory[this.booster];
      const cost = owned ? `Uses 1 booster · ${owned} available` : `Costs ${entry.cost} coins · ${number(this.save.coins)} in wallet`;
      const targets = this.state?.trays.filter(tray => tray.obstacle?.kind === 'cover' || tray.obstacle?.kind === 'ice') ?? [];
      const hasTarget = this.booster !== 'open' || targets.length > 0;
      title = entry.name;
      glyph = boostIcons[this.booster];
      eyebrow = 'BOOSTER';
      body = `<p>${escape(entry.description)}</p><p class="booster-price">${icon(owned ? 'spark' : 'coin')} ${escape(cost)}</p>
        ${hasTarget && this.booster === 'open' ? `<label class="field-label" for="target-tray">Pick a tray</label><select id="target-tray">${targets.map(tray => `<option value="${escape(tray.id)}">Tray ${this.state!.trays.indexOf(tray) + 1} · ${tray.obstacle?.kind === 'ice' ? 'Ice' : 'Cover'}</option>`).join('')}</select>` : ''}
        ${hasTarget ? '' : '<p class="form-note">This grill has no covered trays.</p>'}<div class="dialog-actions">${button('close', 'Cancel', 'subtle')}${button('use-boost', 'Use booster', 'primary', hasTarget && (owned || this.save.coins >= entry.cost) ? '' : 'disabled')}</div>`;
    } else if (modal === 'redeem') {
      title = 'Redeem a code';
      glyph = 'gift';
      eyebrow = 'GRILL PERKS';
      body = `<p>Enter a code you received to add rewards to this kitchen.</p><form class="code-form" data-form="redeem"><label for="redeem-code">Reward code</label><input id="redeem-code" name="code" value="${escape(this.redeemCode)}" maxlength="100" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Enter code" required><div class="reward-status" data-reward-status aria-live="polite">${this.rewardNotice ? `<p class="form-note">${escape(this.rewardNotice)}</p>` : ''}${this.rewardDetails ? `<p class="reward-details">${icon('coin')} ${escape(this.rewardDetails)}</p>` : ''}</div><div class="dialog-actions"><button class="button primary" type="submit" ${this.busy ? 'disabled' : ''}>${icon('gift')} ${this.busy ? 'Checking code…' : 'Claim rewards'}</button></div></form>`;
    } else {
      title = 'Share the grill';
      glyph = 'share';
      eyebrow = 'GRILL PERKS';
      body = `<p>Send the game and a reward code in one message. You can use WELCOME or enter a code you want to share.</p><form class="code-form" data-form="share"><label for="share-code">Code to include</label><input id="share-code" name="code" value="${escape(this.shareCode)}" maxlength="100" autocomplete="off" autocapitalize="characters" spellcheck="false" required><div class="dialog-actions">${canShareGame() ? '<button class="button primary" type="submit">' + icon('share') + ' Share</button>' : ''}<button class="button ${canShareGame() ? 'subtle' : 'primary'}" type="submit" name="copy" value="copy">Copy invite</button></div><div class="share-output" data-share-output aria-live="polite"></div></form>`;
    }
    return `<div class="modal-backdrop" data-action="dismiss"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><div class="dialog-top"><span class="dialog-mark">${icon(glyph)}</span>${iconButton('close', 'x', 'Close dialog')}</div><p class="eyebrow">${eyebrow}</p><h2 id="dialog-title">${escape(title)}</h2>${body}</section></div>`;
  }

  private render(): void {
    const previousFocus = document.activeElement;
    const focusedSlot = previousFocus instanceof HTMLElement ? this.address(previousFocus) : null;
    const currentModal = this.root.querySelector<HTMLElement>('.dialog');
    const focusedId = currentModal?.contains(previousFocus) && previousFocus instanceof HTMLElement ? previousFocus.id : '';
    const page = this.screen === 'game' ? this.game() : this.screen === 'trail' ? this.trail() : this.screen === 'arcade' ? this.arcade() : this.home();
    this.root.innerHTML = `<div class="app-frame" ${this.modal ? 'inert' : ''}>${this.header()}${page}</div>${this.dialog()}<div class="toast" role="status" aria-live="polite"></div>`;
    if (this.modal) {
      const focus = (focusedId && document.getElementById(focusedId)) || this.root.querySelector<HTMLElement>(this.modal === 'redeem' ? '#redeem-code' : '.dialog');
      focus?.focus({ preventScroll: true });
    } else if (focusedSlot && this.screen === 'game') {
      this.slotElement(focusedSlot)?.focus({ preventScroll: true });
    } else if (this.lastFocus) {
      [...this.root.querySelectorAll<HTMLElement>('[data-action]')].find(el => el.dataset.action === this.lastFocus)?.focus({ preventScroll: true });
      this.lastFocus = '';
    }
  }

  private toast(message: string): void {
    const target = this.root.querySelector<HTMLElement>('.toast');
    if (!target) return;
    window.clearTimeout(this.toastTimer);
    target.textContent = message;
    target.classList.add('visible');
    this.toastTimer = window.setTimeout(() => target.classList.remove('visible'), 2700);
  }

  private checkpoint(): boolean {
    this.checkpointAt = performance.now();
    if (this.screen === 'game') this.save.active = this.state?.status === 'playing' ? this.state : null;
    return persist(this.save);
  }

  private showScreen(screen: Exclude<Screen, 'game'>): void {
    if (!this.modal) this.tick();
    this.cancelPointer();
    this.checkpoint();
    this.screen = screen;
    this.modal = null;
    this.selected = null;
    this.lastFocus = '';
    this.render();
    window.scrollTo(0, 0);
    this.root.querySelector<HTMLElement>('main h1')?.setAttribute('tabindex', '-1');
    this.root.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }

  private start(level: LevelDefinition, resume = true): void {
    this.cancelPointer();
    this.screen = 'game';
    this.level = level;
    this.state = resume && this.save.active?.levelId === level.id ? this.save.active : createGame(level);
    this.earned = 0;
    this.selected = null;
    this.modal = this.state.blocked ? 'blocked' : null;
    this.tickAt = performance.now();
    this.checkpoint();
    this.render();
    window.scrollTo(0, 0);
  }

  private open(modal: Modal, opener?: string): void {
    if (!this.modal && this.screen === 'game') this.tick();
    if (this.modal === 'won' || this.modal === 'lost') return;
    this.cancelPointer();
    this.lastFocus ||= opener ?? '';
    this.modal = modal;
    this.tickAt = performance.now();
    this.checkpoint();
    this.render();
  }

  private close(): void {
    if (this.modal === 'won' || this.modal === 'lost') {
      this.showScreen('home');
      return;
    }
    this.modal = null;
    this.tickAt = performance.now();
    this.render();
  }

  private click = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return;
    const slot = event.target.closest<HTMLElement>('[data-slot]');
    if (slot) {
      if (!this.pointer && performance.now() >= this.suppressClicksUntil) this.tapSlot(this.address(slot));
      return;
    }
    const control = event.target.closest<HTMLElement>('[data-action]');
    if (!control || (control instanceof HTMLButtonElement && control.disabled)) return;
    const action = control.dataset.action;
    switch (action) {
      case 'home': case 'trail': case 'arcade': this.showScreen(action); break;
      case 'leave': this.showScreen('home'); break;
      case 'play': this.start((this.save.active && getLevel(this.save.active.levelId)) || this.nextLevel()); break;
      case 'level': {
        const level = getLevel(control.dataset.level ?? '');
        if (level && this.isUnlocked(level)) this.start(level);
        break;
      }
      case 'next': {
        const next = this.level && LEVELS[LEVELS.findIndex(level => level.id === this.level!.id) + 1];
        if (next) this.start(next);
        break;
      }
      case 'retry': if (this.level) this.start(this.level, false); break;
      case 'undo': if (this.state?.undo) { this.close(); this.run({ type: 'undo' }); } break;
      case 'redeem': case 'share': case 'help': case 'settings': case 'pause': case 'restart': this.open(action, action); break;
      case 'cancel-restart': this.open('pause'); break;
      case 'toggle-sound':
        this.save.sound = !this.save.sound;
        this.checkpoint();
        control.setAttribute('aria-checked', String(this.save.sound));
        this.sound('tap');
        break;
      case 'boost': {
        const key = control.dataset.boost as BoosterKey;
        if (boosterKeys.includes(key)) { this.booster = key; this.open('boost', 'boost'); }
        break;
      }
      case 'use-boost': this.useBooster(); break;
      case 'dismiss': if (event.target === control) this.close(); break;
      case 'close': this.close(); break;
    }
  };

  private keyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (this.modal) this.close();
      else if (this.screen === 'game') {
        if (this.selected) { this.selected = null; this.updateSelection(); }
        else this.open('pause', 'pause');
      }
      return;
    }
    if (event.key !== 'Tab' || !this.modal) return;
    const dialog = this.root.querySelector<HTMLElement>('.dialog');
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, a[href]')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  private address(element: HTMLElement): Address | null {
    const trayId = element.dataset.trayId;
    const slot = Number(element.dataset.slot);
    return trayId && (slot === 0 || slot === 1 || slot === 2) ? { trayId, slot } : null;
  }

  private slotElement(address: Address): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`[data-tray-id="${CSS.escape(address.trayId)}"][data-slot="${address.slot}"]`);
  }

  private updateSelection(): void {
    const state = this.state;
    if (!state) return;
    for (const slot of this.root.querySelectorAll<HTMLElement>('[data-slot]')) {
      const address = this.address(slot);
      if (!address) continue;
      const selected = sameAddress(this.selected, address);
      slot.classList.toggle('selected', selected);
      slot.classList.toggle('valid', Boolean(this.selected && canMove(state, this.selected, address)));
      if (selected) slot.setAttribute('aria-pressed', 'true');
      else slot.removeAttribute('aria-pressed');
    }
  }

  private tapSlot(address: Address | null): void {
    if (!address || !this.state || this.modal || this.state.status !== 'playing') return;
    if (this.selected && canMove(this.state, this.selected, address)) {
      this.run({ type: 'move', from: this.selected, to: address });
      return;
    }
    if (sameAddress(this.selected, address)) this.selected = null;
    else if (canPick(this.state, address)) {
      this.selected = address;
      this.sound('tap');
    } else if (this.selected) {
      this.toast('Choose an empty slot on another open tray.');
      return;
    }
    this.updateSelection();
  }

  private pointerDown = (event: PointerEvent): void => {
    if (this.pointer || this.modal || !this.state || this.screen !== 'game' || event.button !== 0 || !(event.target instanceof Element)) return;
    const slot = event.target.closest<HTMLElement>('[data-slot]');
    const from = slot && this.address(slot);
    if (!from || !canPick(this.state, from)) return;
    this.pointer = { id: event.pointerId, from, x: event.clientX, y: event.clientY };
  };

  private pointerMove = (event: PointerEvent): void => {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId || !this.state) return;
    if (!pointer.ghost) {
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 8) return;
      const piece = this.state.trays.find(tray => tray.id === pointer.from.trayId)?.slots[pointer.from.slot];
      const item = piece && getFood(this.state, piece);
      if (!item) return;
      this.selected = pointer.from;
      this.updateSelection();
      this.slotElement(pointer.from)?.classList.add('dragging');
      pointer.ghost = document.createElement('div');
      pointer.ghost.className = 'drag-ghost';
      pointer.ghost.innerHTML = food(item.id);
      this.root.appendChild(pointer.ghost);
    }
    pointer.ghost.style.left = `${event.clientX}px`;
    pointer.ghost.style.top = `${event.clientY}px`;
    this.root.querySelector('.drop-hover')?.classList.remove('drop-hover');
    const target = this.dropTarget(event.clientX, event.clientY, pointer.from);
    if (target) this.slotElement(target)?.classList.add('drop-hover');
  };

  private dropTarget(x: number, y: number, from: Address): Address | null {
    const state = this.state;
    const hit = document.elementFromPoint(x, y);
    if (!state || !hit) return null;
    const slot = hit.closest<HTMLElement>('[data-slot]');
    if (slot) {
      const to = this.address(slot);
      return to && canMove(state, from, to) ? to : null;
    }
    const trayId = hit.closest<HTMLElement>('[data-tray]')?.dataset.tray;
    if (!trayId) return null;
    return ([0, 1, 2] as const).map(index => ({ trayId, slot: index })).find(to => canMove(state, from, to)) ?? null;
  }

  private pointerUp = (event: PointerEvent): void => {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dragged = Boolean(pointer.ghost);
    const to = dragged ? this.dropTarget(event.clientX, event.clientY, pointer.from) : null;
    this.cancelPointer();
    if (dragged) {
      this.suppressClicksUntil = performance.now() + 240;
      if (to) this.run({ type: 'move', from: pointer.from, to });
      else { this.selected = null; this.updateSelection(); }
    }
  };

  private cancelPointer = (): void => {
    this.pointer?.ghost?.remove();
    this.pointer = null;
    this.root.querySelector('.dragging')?.classList.remove('dragging');
    this.root.querySelector('.drop-hover')?.classList.remove('drop-hover');
  };

  private suspend = (): void => {
    if (!document.hidden) this.tick();
    this.cancelPointer();
    this.checkpoint();
    if (this.screen === 'game' && !this.modal && this.state?.status === 'playing') {
      this.modal = 'pause';
      this.render();
    }
  };

  private tick = (): void => {
    const now = performance.now();
    const elapsed = Math.floor(now - this.tickAt);
    if (this.modal || document.hidden || this.screen !== 'game' || this.state?.status !== 'playing') {
      this.tickAt = now;
      return;
    }
    if (elapsed <= 0) return;
    this.tickAt += elapsed;
    const result = applyCommand(this.state, { type: 'tick', ms: elapsed });
    if (!result.ok) return;
    this.state = result.state;
    if (this.finishIfNeeded()) return;
    this.refreshTimers();
    if (now - this.checkpointAt >= 2500) this.checkpoint();
  };

  private refreshTimers(): void {
    const state = this.state;
    if (!state) return;
    const timer = this.root.querySelector<HTMLElement>('[data-timer]');
    timer?.classList.toggle('danger', state.remainingMs <= 15000);
    const current = timer?.querySelector('strong');
    if (current) current.textContent = time(state.remainingMs);
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-order]')) {
      const order = state.orders.find(entry => entry.id === element.dataset.order);
      const value = element.querySelector('[data-order-time]');
      if (!order || !value) continue;
      element.className = `order-card order-${order.status}`;
      value.textContent = order.status === 'active' ? time(order.remainingMs) : order.status;
    }
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-heat]')) {
      const obstacle = state.trays.find(tray => tray.id === element.dataset.heat)?.obstacle;
      if (obstacle?.kind === 'hot') element.textContent = time(obstacle.remainingMs);
    }
  }

  private run(command: Command): void {
    this.tick();
    if (!this.state || this.modal || this.state.status !== 'playing') return;
    const result = applyCommand(this.state, command);
    if (!result.ok) { this.toast(result.error); return; }
    this.state = result.state;
    this.commit(result.events);
  }

  private useBooster(): void {
    const state = this.state;
    if (!state || this.modal !== 'boost') return;
    const key = this.booster;
    const owned = this.save.inventory[key];
    const cost = BOOSTERS[key].cost;
    if (owned < 1 && this.save.coins < cost) return;
    const target = this.root.querySelector<HTMLSelectElement>('#target-tray')?.value;
    const result = applyCommand(state, { type: 'boost', booster: key, trayId: target });
    if (!result.ok) { this.toast(result.error); return; }
    this.state = result.state;
    if (owned > 0) this.save.inventory[key] -= 1;
    else this.save.coins -= cost;
    this.modal = null;
    this.tickAt = performance.now();
    this.commit(result.events);
  }

  private finishIfNeeded(): boolean {
    const state = this.state;
    if (!state || state.status === 'playing') return false;
    this.cancelPointer();
    this.selected = null;
    if (state.status === 'won') {
      if (!this.save.completed.includes(state.levelId)) {
        this.earned = (this.level?.rewardCoins ?? 0) + state.bonusCoins;
        this.save.coins += this.earned;
        this.save.completed.push(state.levelId);
      }
      this.modal = 'won';
      this.sound('win');
    } else {
      this.modal = 'lost';
      this.sound('lose');
    }
    this.checkpoint();
    this.render();
    return true;
  }

  private commit(events: GameEvent[]): void {
    this.selected = null;
    if (this.finishIfNeeded()) return;
    if (events.some(event => event.type === 'Blocked')) this.modal = 'blocked';
    this.checkpoint();
    this.render();
    const matching = events.filter(event => event.type === 'TripleCleared');
    if (matching.length) {
      for (const match of matching) {
        if (match.trayId) this.root.querySelector(`[data-tray="${CSS.escape(match.trayId)}"]`)?.classList.add('matched');
      }
      this.sound('match');
      this.toast(matching.length === 1 ? 'Three of a kind! Group served.' : `${matching.length} groups served!`);
    } else {
      const moved = events.find(event => event.type === 'PieceMoved');
      if (moved) this.slotElement(moved.to)?.classList.add('moved');
      this.sound('tap');
    }
    for (const event of events) {
      if (event.type === 'LayerRevealed') this.root.querySelector(`[data-tray="${CSS.escape(event.trayId)}"]`)?.classList.add('revealed');
    }
  }

  private sound(kind: 'tap' | 'match' | 'win' | 'lose'): void {
    if (!this.save.sound || !window.AudioContext) return;
    try {
      this.audio ??= new AudioContext();
      const audio = this.audio;
      if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
      const notes = kind === 'win' ? [392, 523, 659, 784] : kind === 'match' ? [440, 587, 740] : kind === 'lose' ? [270, 180] : [460];
      for (const [index, note] of notes.entries()) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = audio.currentTime + index * .065;
        oscillator.type = 'sine';
        oscillator.frequency.value = note;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(kind === 'tap' ? .045 : .075, start + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .13);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + .15);
      }
    } catch { /* Sound is optional on embedded browsers. */ }
  }

  private submit = (event: SubmitEvent): void => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const code = String(new FormData(form).get('code') ?? '').trim();
    if (form.dataset.form === 'redeem') {
      event.preventDefault();
      void this.redeem(code);
    } else if (form.dataset.form === 'share') {
      event.preventDefault();
      const copy = event.submitter instanceof HTMLButtonElement && event.submitter.name === 'copy';
      void this.share(code, copy);
    }
  };

  private async playerToken(): Promise<string> {
    if (this.save.playerToken) return this.save.playerToken;
    const response = await gameFetch('/api/player', { method: 'POST' });
    const payload = await response.json() as { token?: string; message?: string };
    if (!response.ok || typeof payload.token !== 'string' || !payload.token) throw new Error(payload.message ?? 'The reward service is unavailable.');
    this.save.playerToken = payload.token;
    if (!this.checkpoint()) {
      this.save.playerToken = '';
      throw new Error('Allow local storage before claiming a reward.');
    }
    return payload.token;
  }

  private updateWallet(): void {
    const coins = this.root.querySelector<HTMLElement>('[data-coins]');
    if (coins) {
      coins.textContent = number(this.save.coins);
      coins.parentElement?.setAttribute('aria-label', `${number(this.save.coins)} coins`);
    }
    for (const key of boosterKeys) {
      const count = this.root.querySelector<HTMLElement>(`[data-boost="${key}"] .booster-count`);
      if (!count) continue;
      const owned = this.save.inventory[key];
      count.textContent = String(owned || `${BOOSTERS[key].cost} ¢`);
      count.setAttribute('aria-label', owned ? `${owned} available` : `${BOOSTERS[key].cost} coins`);
    }
  }

  private async syncReceipts(): Promise<void> {
    try {
      const token = this.save.playerToken;
      const response = await gameFetch('/api/receipts', { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401) this.resetToken(token);
      if (!response.ok) return;
      const payload = await response.json() as { receipts?: unknown[] };
      if (!Array.isArray(payload.receipts)) return;
      let changed = false;
      for (const receipt of payload.receipts) {
        if (isReceipt(receipt) && applyReceipt(this.save, receipt)) changed = true;
      }
      if (changed) {
        this.checkpoint();
        this.updateWallet();
      }
    } catch { /* Gameplay remains available while the reward service is offline. */ }
  }

  private resetToken(token: string): void {
    if (this.save.playerToken !== token) return;
    this.save.playerToken = '';
    this.checkpoint();
  }

  private async claim(code: string, retry = true): Promise<Response> {
    const token = await this.playerToken();
    const response = await gameFetch('/api/redeem', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ code }),
    });
    if (response.status === 401 && retry) {
      this.resetToken(token);
      return this.claim(code, false);
    }
    return response;
  }

  private async redeem(code: string): Promise<void> {
    if (this.busy) return;
    this.redeemCode = code;
    this.rewardNotice = '';
    this.rewardDetails = '';
    if (!code) {
      this.rewardNotice = 'Enter a reward code.';
      this.render();
      return;
    }
    this.busy = true;
    this.render();
    try {
      const response = await this.claim(code);
      const payload = await response.json() as { receipt?: unknown; message?: string; alreadyClaimed?: boolean };
      if (!response.ok || !isReceipt(payload.receipt)) throw new Error(payload.message ?? 'The reward service is unavailable.');
      const receipt = payload.receipt;
      const added = applyReceipt(this.save, receipt);
      const saved = this.checkpoint();
      this.redeemCode = '';
      this.rewardNotice = !saved ? 'Your reward is saved by the reward service.' : added ? `${receipt.label} added to your kitchen.` : 'This kitchen already claimed this reward.';
      if (added) {
        const coins = receipt.coins ? `${number(receipt.coins)} coins` : '';
        const items = boosterKeys.filter(key => receipt.boosters[key] > 0)
          .map(key => `${receipt.boosters[key]} ${BOOSTERS[key].name}`);
        this.rewardDetails = [coins, ...items].filter(Boolean).join(' · ');
        this.sound('win');
      }
    } catch (error) {
      this.rewardNotice = error instanceof Error && error.message && error.name !== 'TypeError' && error.name !== 'SyntaxError'
        ? error.message : 'Could not reach the reward service. Check your connection and try again.';
    } finally {
      this.busy = false;
      if (this.modal === 'redeem') this.render();
      else this.updateWallet();
    }
  }

  private async share(code: string, copy: boolean): Promise<void> {
    this.shareCode = code;
    const output = this.root.querySelector<HTMLElement>('[data-share-output]');
    if (!output) return;
    if (!code) { output.textContent = 'Enter a code to share.'; return; }
    const app = getShareUrl();
    if (app) app.hash = new URLSearchParams({ code }).toString();
    const message = `Play Skewer Shift with me. Redeem ${code} for grill rewards!`;
    if (!copy && canShareGame()) {
      try {
        await shareGame({ title: 'Skewer Shift', text: message, url: app?.href });
        output.textContent = 'Invite ready to share.';
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const invitation = app ? `${message}\n${app.href}` : message;
    try {
      await navigator.clipboard.writeText(invitation);
      output.textContent = 'Invite copied.';
    } catch {
      output.innerHTML = `<label for="copy-invite">Copy this invite</label><textarea id="copy-invite" readonly>${escape(invitation)}</textarea>`;
      output.querySelector('textarea')?.select();
    }
  }
}

export function mountGame(root: HTMLElement): void {
  new Kitchen(root);
}
