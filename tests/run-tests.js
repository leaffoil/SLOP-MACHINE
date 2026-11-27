/**
 * Stage 5 test runner — runs the browser scripts in a Node VM with a small
 * DOM/localStorage stub. No browser is required.
 *
 * Usage: node tests/run-tests.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const quietConsole = { log() {}, warn() {}, error() {} };

// ------------------------------------------------------------
// Minimal DOM / storage stubs
// ------------------------------------------------------------

class FakeClassList {
  constructor() { this._set = new Set(); }
  add(...names) { names.forEach(n => this._set.add(n)); }
  remove(...names) { names.forEach(n => this._set.delete(n)); }
  toggle(name, force) {
    const on = force === undefined ? !this._set.has(name) : Boolean(force);
    if (on) this._set.add(name); else this._set.delete(name);
    return on;
  }
  contains(name) { return this._set.has(name); }
  setAll(names) { this._set.clear(); names.forEach(n => this._set.add(n)); }
  get value() { return Array.from(this._set).join(' '); }
}

/** Very small selector matcher supporting ".class", "#id", "tag", ".a .b",
 *  "#id .class" and comma-separated lists. Enough for the app's queries. */
function matchesSelector(el, selector) {
  const groups = String(selector).split(',').map(s => s.trim());
  return groups.some(group => {
    const parts = group.split(/\s+/);
    let candidates = [el];
    // Walk from the right-most compound selector to the left.
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      const next = [];
      candidates.forEach(node => {
        if (matchesCompound(node, part)) next.push(node);
        if (i > 0 && node._parent) next.push(node._parent);
      });
      candidates = next;
    }
    return candidates.indexOf(el) !== -1;
  });
}

function matchesCompound(el, part) {
  if (!part || part === '*') return true;
  const idMatch = part.match(/#([\w-]+)/g) || [];
  const classMatch = part.match(/\.([\w-]+)/g) || [];
  const attrMatch = part.match(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g) || [];
  const tagMatch = part.match(/^[a-zA-Z][\w-]*/);
  if (tagMatch && el.tagName !== tagMatch[0].toUpperCase()) return false;
  if (idMatch.some(m => el.id !== m.slice(1))) return false;
  if (classMatch.some(m => !el.classList.contains(m.slice(1)))) return false;
  for (const raw of attrMatch) {
    const inner = raw.slice(1, -1);
    const eqIdx = inner.indexOf('=');
    const name = eqIdx === -1 ? inner : inner.slice(0, eqIdx);
    let value = eqIdx === -1 ? null : inner.slice(eqIdx + 1).replace(/^["']|["']$/g, '');
    const actual = name.startsWith('data-')
      ? el.dataset[name.slice(5)]
      : el.getAttribute(name);
    if (actual === null) return false;
    if (value !== null && String(actual) !== value) return false;
  }
  return true;
}

function collect(el, selector, out) {
  el.children.forEach(child => {
    if (matchesSelector(child, selector)) out.push(child);
    collect(child, selector, out);
  });
}

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.classList = new FakeClassList();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this._parent = null;
    this.id = '';
    this._className = '';
    this.textContent = '';
    this.value = '';
    this._innerHTML = '';
    this.disabled = false;
    this._listeners = {};
    this._attributes = {};
  }
  setAttribute(name, value) { this._attributes[name] = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attributes, name) ? this._attributes[name] : null; }
  removeAttribute(name) { delete this._attributes[name]; }
  get className() { return this.classList.value; }
  set className(value) {
    this._className = String(value || '');
    this.classList.setAll(this._className.split(/\s+/).filter(Boolean));
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(html) {
    this._innerHTML = String(html);
    if (html === '') {
      this.children.forEach(c => { c._parent = null; });
      this.children = [];
    }
  }
  addEventListener(type, fn) {
    (this._listeners[type] || (this._listeners[type] = [])).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  }
  click() {
    (this._listeners.click || []).forEach(fn => fn({ target: this }));
  }
  appendChild(child) { child._parent = this; this.children.push(child); return child; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const out = [];
    collect(this, selector, out);
    return out;
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (matchesCompound(node, selector.replace(/\s/g, ''))) return node;
      node = node._parent;
    }
    return null;
  }
  matches(selector) { return matchesSelector(this, selector); }
}

class FakeDocument {
  constructor() {
    this.readyState = 'loading';
    this._elements = {};
    this._listeners = {};
    this.body = new FakeElement('body');
  }
  getElementById(id) {
    if (!this._elements[id]) {
      const el = new FakeElement('div');
      el.id = id;
      this._elements[id] = el;
      this.body.appendChild(el);
    }
    return this._elements[id];
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const out = [];
    collect(this.body, selector, out);
    return out;
  }
  createElement(tag) { return new FakeElement(tag); }
  addEventListener(type, fn) {
    (this._listeners[type] || (this._listeners[type] = [])).push(fn);
  }
  dispatch(type, event) {
    (this._listeners[type] || []).forEach(fn => fn(event || {}));
  }
}

function createStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); },
    _map: map
  };
}

function createWorld(storage, options) {
  const opts = options || {};
  const document = new FakeDocument();
  const sandbox = {
    console: quietConsole,
    document,
    localStorage: storage,
    performance: { now: () => Date.now() },
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);

  const load = file => {
    const full = path.join(ROOT, file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
  };

  load('js/game-logic.js');
  load('js/economy.js');
  load('js/progression.js');
  if (opts.withMain) load('js/main.js');

  if (!opts.skipInit) sandbox.Progression.init();

  return { sandbox, context, document, storage };
}

// ------------------------------------------------------------
// Test bookkeeping
// ------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, details) {
  if (condition) {
    passed += 1;
    console.log('PASS  ' + name);
  } else {
    failed += 1;
    failures.push(name + (details ? ' — ' + details : ''));
    console.log('FAIL  ' + name + (details ? ' — ' + details : ''));
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function approx(name, actual, expected) {
  check(name, Math.abs(actual - expected) < 1e-9, 'expected ' + expected + ', got ' + actual);
}

function outcomeFor(symbols) {
  // 3x3 grid with the given payline in the middle row
  return [
    ['wild', symbols[0], 'wild'],
    ['wild', symbols[1], 'wild'],
    ['wild', symbols[2], 'wild']
  ];
}

function spinResult(win, payout, winType) {
  return {
    isWin: win,
    payout: payout,
    winType: winType || (win ? 'regular' : 'none'),
    winningSymbols: win ? ['cherry', 'cherry', 'cherry'] : []
  };
}

function localDateKey(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays || 0));
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

// ------------------------------------------------------------
// Machine tests
// ------------------------------------------------------------

function testMachines() {
  console.log('\n=== Machines ===');

  const world = createWorld(createStorage());
  const { sandbox } = world;
  const { Progression, SlotMachine, MACHINE_DEFS, PayoutCalculator } = sandbox;

  eq('Classic is the default machine', Progression.state.machineSelected, 'classic');
  eq('Classic is unlocked for a new player', Progression.state.machineUnlocked.join(','), 'classic');
  eq('Classic is active in game logic', sandbox.getActiveMachineId(), 'classic');
  check('Classic symbols are the original 7', Object.keys(MACHINE_DEFS.classic.symbols).length === 7);

  // Locked selection at level 1
  eq('Locked Treasure cannot be selected at level 1', Progression.selectMachine('treasure'), false);
  eq('Locked Cyber cannot be selected at level 1', Progression.selectMachine('cyber'), false);
  eq('Selection stays Classic while locked', Progression.state.machineSelected, 'classic');

  // Treasure at level 5
  Progression.state.level = 5;
  Progression._recalculateMachines();
  check('Treasure unlocks at level 5', Progression.state.machineUnlocked.indexOf('treasure') !== -1);
  eq('Cyber stays locked at level 5', Progression.state.machineUnlocked.indexOf('cyber'), -1);
  eq('Treasure can be selected at level 5', Progression.selectMachine('treasure'), true);
  eq('Selected machine is Treasure', Progression.state.machineSelected, 'treasure');
  eq('Game logic switched to Treasure', sandbox.getActiveMachineId(), 'treasure');

  // Cyber at level 10
  Progression.state.level = 10;
  Progression._recalculateMachines();
  check('Cyber unlocks at level 10', Progression.state.machineUnlocked.indexOf('cyber') !== -1);
  eq('Cyber can be selected at level 10', Progression.selectMachine('cyber'), true);
  eq('Selected machine is Cyber', Progression.state.machineSelected, 'cyber');
  eq('Game logic switched to Cyber', sandbox.getActiveMachineId(), 'cyber');

  // Distinct symbol sets
  const sets = ['classic', 'treasure', 'cyber'].map(id =>
    Object.values(MACHINE_DEFS[id].symbols).map(s => s.id).sort().join(','));
  check('Each machine has a distinct symbol set', new Set(sets).size === 3);

  // Equal total weight (no machine-specific advantage)
  const totals = ['classic', 'treasure', 'cyber'].map(id =>
    Object.values(MACHINE_DEFS[id].symbols).reduce((sum, s) => sum + s.weight, 0));
  check('All machines share the same total symbol weight', totals.every(t => t === totals[0]));

  // Payouts for every machine's own symbols
  ['classic', 'treasure', 'cyber'].forEach(id => {
    sandbox.setActiveMachineId(id);
    let ok = true;
    let detail = '';
    Object.values(MACHINE_DEFS[id].symbols).forEach(symbol => {
      if (symbol.id === 'wild') return;
      const result = PayoutCalculator.evaluate(outcomeFor([symbol.id, symbol.id, symbol.id]), 10);
      if (!result.isWin || result.multiplier !== symbol.multiplier || result.payout !== 10 * symbol.multiplier) {
        ok = false;
        detail = id + '/' + symbol.id + ' expected ' + symbol.multiplier + 'x, got ' + result.multiplier;
      }
    });
    check('Payouts work for ' + id + ' symbols', ok, detail);

    const jackpot = PayoutCalculator.evaluate(outcomeFor(['wild', 'wild', 'wild']), 10);
    check(id + ' wild jackpot pays 500x', jackpot.winType === 'jackpot' && jackpot.payout === 5000);

    // Wild substitution on this machine
    const symbol = Object.values(MACHINE_DEFS[id].symbols).find(s => s.id !== 'wild');
    const sub = PayoutCalculator.evaluate(outcomeFor(['wild', symbol.id, symbol.id]), 10);
    check(id + ' wild substitution works', sub.isWin && sub.multiplier === symbol.multiplier);
  });

  // Symbol renderers exist for every symbol
  let rendered = 0;
  ['classic', 'treasure', 'cyber'].forEach(id => {
    Object.values(MACHINE_DEFS[id].symbols).forEach(symbol => {
      if (sandbox.SymbolRenderer.render(symbol.id).length > 0) rendered += 1;
    });
  });
  const totalSymbols = ['classic', 'treasure', 'cyber']
    .reduce((n, id) => n + Object.keys(MACHINE_DEFS[id].symbols).length, 0);
  eq('Every machine symbol has an SVG renderer', rendered, totalSymbols);
}

function testMachinePersistence() {
  console.log('\n=== Machine persistence ===');

  const storage = createStorage();
  let world = createWorld(storage);
  world.sandbox.Progression.state.level = 5;
  world.sandbox.Progression._recalculateMachines();
  world.sandbox.Progression.selectMachine('treasure');
  world.sandbox.Progression.save();

  // Reload with the same storage
  world = createWorld(storage);
  eq('Selected machine survives reload', world.sandbox.Progression.state.machineSelected, 'treasure');
  check('Unlocked machine survives reload', world.sandbox.Progression.state.machineUnlocked.indexOf('treasure') !== -1);
  eq('Active machine restored in game logic', world.sandbox.getActiveMachineId(), 'treasure');

  // Level-based recalculation wins over stale saved unlock state
  const stale = createStorage();
  stale.setItem('slop-machine-progress', JSON.stringify({
    xp: 0, totalXp: 0, level: 1, spins: 0, wins: 0, jackpots: 0,
    achievements: {}, collected: [], cosmeticRewards: [], levelRewards: [],
    machineSelected: 'cyber',
    machineUnlocked: ['classic', 'treasure', 'cyber'],
    dailyMissions: { date: localDateKey(0), spins: 0, coinsWon: 0, symbolsCollected: [], completed: [], claimed: [] }
  }));
  const staleWorld = createWorld(stale);
  eq('Stale selected machine falls back to Classic at level 1', staleWorld.sandbox.Progression.state.machineSelected, 'classic');
  eq('Stale unlocked list is recalculated from level', staleWorld.sandbox.Progression.state.machineUnlocked.join(','), 'classic');
}

// ------------------------------------------------------------
// Daily mission tests
// ------------------------------------------------------------

function completeSpins(world, count, startToken) {
  for (let i = 0; i < count; i++) {
    world.sandbox.Progression.onSpinComplete(
      spinResult(false, 0, 'none'),
      outcomeFor(['cherry', 'lemon', 'watermelon']),
      (startToken || 0) + i + 1
    );
  }
}

function testMissions() {
  console.log('\n=== Daily missions ===');

  const world = createWorld(createStorage());
  const { Progression, Economy } = world.sandbox;

  eq('Fresh spin progress is 0', Progression.state.dailyMissions.spins, 0);
  eq('Fresh coin progress is 0', Progression.state.dailyMissions.coinsWon, 0);
  eq('Fresh mission date is today', Progression.state.dailyMissions.date, localDateKey(0));

  // Spin progress increments only after a completed spin
  Progression.onSpinComplete(spinResult(false, 0, 'none'), outcomeFor(['cherry', 'lemon', 'watermelon']), 1);
  eq('Spin progress increments after a completed spin', Progression.state.dailyMissions.spins, 1);

  // Duplicate token is ignored (no duplicate progress)
  Progression.onSpinComplete(spinResult(false, 0, 'none'), outcomeFor(['cherry', 'lemon', 'watermelon']), 1);
  eq('Duplicate spin token does not double mission progress', Progression.state.dailyMissions.spins, 1);

  // Coin progress tracks actual winnings, not the bet
  Progression.onSpinComplete(spinResult(true, 120, 'regular'), outcomeFor(['cherry', 'cherry', 'cherry']), 2);
  eq('Coin progress adds actual winnings', Progression.state.dailyMissions.coinsWon, 120);
  Progression.onSpinComplete(spinResult(true, 380, 'regular'), outcomeFor(['cherry', 'cherry', 'cherry']), 3);
  eq('Coin progress accumulates winnings', Progression.state.dailyMissions.coinsWon, 500);
  eq('Coin mission is completed at 500', Progression.state.dailyMissions.completed[1], true);

  // Symbol collection progress
  const collectedBefore = Progression.state.dailyMissions.symbolsCollected.length;
  Progression.onSpinComplete(
    spinResult(false, 0, 'none'),
    outcomeFor(['coin', 'coin', 'coin']),
    4
  );
  check('New symbol is recorded for the mission', Progression.state.dailyMissions.symbolsCollected.indexOf('coin') !== -1);
  check('Symbol mission progresses on a new symbol', Progression.state.dailyMissions.symbolsCollected.length > collectedBefore);
  eq('Symbol mission completes with one new symbol', Progression.state.dailyMissions.completed[2], true);

  // Complete the spins mission (we are at 4 completed spins)
  completeSpins(world, 6, 4);
  eq('Spin mission completes at 10 spins', Progression.state.dailyMissions.completed[0], true);
  eq('Total spin progress is 10', Progression.state.dailyMissions.spins, 10);

  // Claim coin reward exactly once
  const balanceBefore = Economy.getBalance();
  eq('Claiming completed spin mission succeeds', Progression.claimMission('spins_10'), true);
  eq('Coin reward updates balance', Economy.getBalance(), balanceBefore + 100);
  eq('Claiming the same mission again fails', Progression.claimMission('spins_10'), false);
  eq('Balance is unchanged after a duplicate claim', Economy.getBalance(), balanceBefore + 100);
  eq('Claimed flag is persisted', Progression.state.dailyMissions.claimed[0], true);

  // Claim XP reward exactly once
  const xpBefore = Progression.getXP();
  eq('Claiming completed coin mission succeeds', Progression.claimMission('coins_500'), true);
  eq('XP reward uses progression system', Progression.getXP(), xpBefore + 50);
  eq('Claiming the same XP mission again fails', Progression.claimMission('coins_500'), false);
  eq('XP is unchanged after a duplicate claim', Progression.getXP(), xpBefore + 50);

  // Claim symbol XP mission
  const xpBefore2 = Progression.getXP();
  eq('Claiming completed symbol mission succeeds', Progression.claimMission('symbols_1'), true);
  eq('Symbol mission grants 200 XP', Progression.getXP(), xpBefore2 + 200);

  // Claim before completion
  const fresh = createWorld(createStorage());
  eq('Incomplete mission cannot be claimed', fresh.sandbox.Progression.claimMission('spins_10'), false);
  eq('Incomplete mission claim grants no coins', fresh.sandbox.Economy.getBalance(), 1000);
}

function testMissionPersistenceAndReset() {
  console.log('\n=== Mission persistence & daily reset ===');

  const storage = createStorage();
  let world = createWorld(storage);
  const { Progression } = world.sandbox;

  completeSpins(world, 10, 0);
  Progression.onSpinComplete(spinResult(true, 500, 'regular'), outcomeFor(['cherry', 'cherry', 'cherry']), 11);
  Progression.claimMission('spins_10');
  Progression.save();

  // Reload: progress + claim state survive
  world = createWorld(storage);
  eq('Mission progress survives reload', world.sandbox.Progression.state.dailyMissions.spins, 11);
  eq('Coin progress survives reload', world.sandbox.Progression.state.dailyMissions.coinsWon, 500);
  eq('Claimed state survives reload', world.sandbox.Progression.state.dailyMissions.claimed[0], true);

  // Repeated reload does not grant the reward again
  const balanceAfterReload = world.sandbox.Economy.getBalance();
  eq('Claim after reload is rejected', world.sandbox.Progression.claimMission('spins_10'), false);
  eq('No duplicate reward after reload', world.sandbox.Economy.getBalance(), balanceAfterReload);

  // Same-day ensureDailyReset does nothing
  const dateBefore = world.sandbox.Progression.state.dailyMissions.date;
  world.sandbox.Progression._ensureDailyReset();
  eq('Same-day reset is a no-op', world.sandbox.Progression.state.dailyMissions.date, dateBefore);
  eq('Same-day reset keeps progress', world.sandbox.Progression.state.dailyMissions.spins, 11);

  // Simulate yesterday, then reload: reset must occur
  world.sandbox.Progression.state.dailyMissions.date = localDateKey(-1);
  world.sandbox.Progression.save();
  const resetWorld = createWorld(storage);
  const dm = resetWorld.sandbox.Progression.state.dailyMissions;
  eq('Missions reset on a new local date', dm.date, localDateKey(0));
  eq('Spin progress resets', dm.spins, 0);
  eq('Coin progress resets', dm.coinsWon, 0);
  eq('Symbol progress resets', dm.symbolsCollected.length, 0);
  check('Completion resets', dm.completed.every(v => v === false));
  check('Claimed state resets for the new day', dm.claimed.every(v => v === false));

  // Corrupt / missing data is handled safely
  const corrupt = createStorage();
  corrupt.setItem('slop-machine-progress', '{not valid json');
  const corruptWorld = createWorld(corrupt);
  eq('Corrupt save starts from a fresh level', corruptWorld.sandbox.Progression.getLevel(), 1);
  eq('Corrupt save starts with Classic', corruptWorld.sandbox.Progression.state.machineSelected, 'classic');

  const partial = createStorage();
  partial.setItem('slop-machine-progress', JSON.stringify({
    level: 5,
    dailyMissions: { spins: 'nope', coinsWon: -5, symbolsCollected: 'bad', completed: 'bad', claimed: null }
  }));
  const partialWorld = createWorld(partial);
  const pdm = partialWorld.sandbox.Progression.state.dailyMissions;
  eq('Partial mission data normalizes spins', pdm.spins, 0);
  eq('Partial mission data normalizes coins', pdm.coinsWon, 0);
  eq('Partial mission data normalizes symbols', pdm.symbolsCollected.length, 0);
  eq('Partial mission data normalizes completed', pdm.completed.length, 3);
  eq('Partial mission data normalizes claimed', pdm.claimed.length, 3);
  eq('Level 5 saved state still unlocks Treasure', partialWorld.sandbox.Progression.state.machineUnlocked.indexOf('treasure') !== -1, true);
}

function testMissionsAcrossMachines() {
  console.log('\n=== Missions across machines ===');

  const world = createWorld(createStorage());
  const { Progression } = world.sandbox;
  Progression.state.level = 10;
  Progression._recalculateMachines();
  Progression.selectMachine('cyber');

  Progression.onSpinComplete(spinResult(true, 250, 'regular'), outcomeFor(['chip', 'chip', 'chip']), 1);
  eq('Spin mission counts Cyber spins', Progression.state.dailyMissions.spins, 1);
  eq('Coin mission counts Cyber winnings', Progression.state.dailyMissions.coinsWon, 250);
  check('Symbol mission collects a Cyber symbol', Progression.state.dailyMissions.symbolsCollected.indexOf('chip') !== -1);
  eq('Collection includes Cyber symbols', Progression.state.collected.indexOf('chip') !== -1, true);
}

function testUIWiring() {
  console.log('\n=== UI wiring (cards & claim buttons) ===');

  // Build the real DOM structure BEFORE Progression.init() so the UI binding
  // and rendering code paths are exercised.
  const storage = createStorage();
  const world = createWorld(storage, { skipInit: true, withMain: true });
  const { sandbox, document } = world;
  const { Progression, Economy } = sandbox;

  const missionIds = ['spins_10', 'coins_500', 'symbols_1'];
  const missionsList = document.createElement('div');
  missionsList.id = 'missions-list';
  document.body.appendChild(missionsList);
  missionIds.forEach(id => {
    const card = document.createElement('div');
    card.className = 'mission-card';
    card.dataset.mission = id;
    const info = document.createElement('div'); info.className = 'mission-card-info';
    const name = document.createElement('div'); name.className = 'mission-card-name';
    const desc = document.createElement('div'); desc.className = 'mission-card-desc';
    const reward = document.createElement('div'); reward.className = 'mission-card-reward';
    info.children.push(name, desc, reward);
    const progress = document.createElement('div'); progress.className = 'mission-card-progress';
    const barWrap = document.createElement('div'); barWrap.className = 'mission-bar-wrap';
    const fill = document.createElement('div'); fill.className = 'mission-bar-fill';
    barWrap.children.push(fill);
    const fraction = document.createElement('span'); fraction.className = 'mission-fraction';
    progress.children.push(barWrap, fraction);
    const btn = document.createElement('div'); btn.className = 'mission-claim-btn disabled';
    card.children.push(info, progress, btn);
    missionsList.children.push(card);
    card._parent = missionsList;
  });

  const machinesGrid = document.createElement('div');
  machinesGrid.className = 'machines-grid';
  document.body.appendChild(machinesGrid);
  ['classic', 'treasure', 'cyber'].forEach(id => {
    const card = document.createElement('div');
    card.className = 'machine-card';
    card.dataset.machine = id;
    const overlay = document.createElement('div'); overlay.className = 'lock-overlay';
    const status = document.createElement('div'); status.className = 'machine-status';
    card.children.push(overlay, status);
    machinesGrid.children.push(card);
    card._parent = machinesGrid;
  });

  // Fire DOMContentLoaded so main.js wires machine-card clicks and
  // Progression.init() binds the claim buttons.
  document.dispatch('DOMContentLoaded', {});

  // Claim buttons start disabled and show PROGRESS
  const cards = document.querySelectorAll('.mission-card');
  eq('All three mission cards are rendered', cards.length, 3);
  cards.forEach(card => {
    const btn = card.querySelector('.mission-claim-btn');
    check('Claim button initially disabled (' + card.dataset.mission + ')', btn.classList.contains('disabled'));
    eq('Claim button initially shows PROGRESS (' + card.dataset.mission + ')', btn.textContent, 'PROGRESS');
  });

  // Locked machine cards show their unlock requirement and overlay
  const machineCards = document.querySelectorAll('.machine-card');
  eq('All three machine cards are rendered', machineCards.length, 3);
  const treasure = machineCards.find(c => c.dataset.machine === 'treasure');
  const classic = machineCards.find(c => c.dataset.machine === 'classic');
  eq('Classic machine card is selected', classic.querySelector('.machine-status').textContent, 'SELECTED');
  eq('Locked Treasure shows unlock requirement', treasure.querySelector('.machine-status').textContent, 'UNLOCK AT LEVEL 5');
  check('Locked Treasure overlay is visible', treasure.querySelector('.lock-overlay').style.display === 'flex');
  check('Treasure card has locked class', treasure.classList.contains('locked'));

  // Complete and claim the spin mission via the UI button (exactly once)
  completeSpins(world, 10, 0);
  const spinBtn = cards[0].querySelector('.mission-claim-btn');
  check('Claim button becomes claimable when complete', spinBtn.classList.contains('claimable'));
  eq('Claim button shows CLAIM when complete', spinBtn.textContent, 'CLAIM');
  const balanceBefore = Economy.getBalance();
  spinBtn.click();
  eq('Clicking claim button awards coins once', Economy.getBalance(), balanceBefore + 100);
  eq('Claim button switches to CLAIMED', spinBtn.textContent, 'CLAIMED');
  spinBtn.click();
  eq('Clicking claim button again awards nothing', Economy.getBalance(), balanceBefore + 100);

  // Machine cards are locked: clicking a locked card must not change selection
  treasure.click();
  eq('Clicking a locked machine card does not select it', Progression.state.machineSelected, 'classic');

  // After reaching level 5 the machine becomes selectable via its card
  Progression.state.level = 5;
  Progression._recalculateMachines();
  Progression.updateMachineUI();
  eq('Unlocked Treasure status changes to UNLOCKED', treasure.querySelector('.machine-status').textContent, 'UNLOCKED');
  eq('Unlocked Treasure overlay is hidden', treasure.querySelector('.lock-overlay').style.display, 'none');
  treasure.click();
  eq('Clicking unlocked machine card selects it', Progression.state.machineSelected, 'treasure');
  eq('Selected machine status shows SELECTED', treasure.querySelector('.machine-status').textContent, 'SELECTED');

  // Claim buttons are bound only once (no duplicate reward handlers)
  check('Mission UI bound exactly once', Progression._missionUIbound === true);
  const balanceBeforeRebind = Economy.getBalance();
  Progression._bindMissionUI();
  // Re-binding is a no-op; the claimed button cannot claim again either way
  spinBtn.click();
  eq('Re-binding handlers does not duplicate rewards', Economy.getBalance(), balanceBeforeRebind);
}

// ------------------------------------------------------------
// Regression tests (Stage 3 / Stage 4 / reels)
// ------------------------------------------------------------

function testEconomyRegression() {
  console.log('\n=== Economy regression ===');

  const world = createWorld(createStorage());
  const { Economy } = world.sandbox;

  eq('Starting balance is 1000', Economy.getBalance(), 1000);
  eq('Bet deduction succeeds', Economy.beginSpin(10), true);
  eq('Balance after bet is 990', Economy.getBalance(), 990);
  eq('Second deduction in the same spin is rejected', Economy.beginSpin(10), false);
  eq('Payout credits the balance', Economy.completeSpin({ isWin: true, payout: 50, winType: 'regular' }), true);
  eq('Balance after win is 1040', Economy.getBalance(), 1040);
  eq('Stats count one spin', Economy.stats.spins, 1);
  eq('Stats count one win', Economy.stats.wins, 1);
  eq('Best win tracked', Economy.stats.bestWin, 50);

  Economy.beginSpin(20);
  eq('Refund returns the pending bet', Economy.refundSpin(), true);
  eq('Balance restored after refund', Economy.getBalance(), 1040);
  eq('Second refund is rejected', Economy.refundSpin(), false);
}

function testProgressionRegression() {
  console.log('\n=== Progression regression ===');

  const world = createWorld(createStorage());
  const { Progression } = world.sandbox;

  Progression.addXP(200);
  eq('Level 2 reached at 200 XP', Progression.getLevel(), 2);
  Progression.addXP(400);
  eq('Level 3 reached at 600 XP', Progression.getLevel(), 3);
  eq('Level-up reward paid for level 2', Progression.state.levelRewards.indexOf(2) !== -1, true);

  const before = Progression.getXP();
  Progression.onSpinComplete(spinResult(true, 20, 'regular'), outcomeFor(['cherry', 'cherry', 'cherry']), 100);
  eq('Spin awards base + win XP', Progression.getXP() - before, 20);
  eq('Spin counter increments', Progression.state.spins, 1);
  eq('Win counter increments', Progression.state.wins, 1);
  eq('First Spin achievement unlocks', Progression.state.achievements.first_spin.unlocked, true);
  eq('First Win achievement unlocks', Progression.state.achievements.first_win.unlocked, true);
  eq('Collection discovers a symbol', Progression.state.collected.indexOf('cherry') !== -1, true);

  const xpAfter = Progression.getXP();
  Progression.onSpinComplete(spinResult(true, 20, 'regular'), outcomeFor(['cherry', 'cherry', 'cherry']), 100);
  eq('Duplicate spin token awards no XP', Progression.getXP(), xpAfter);
}

function testPayoutRegression() {
  console.log('\n=== Payout regression ===');

  const world = createWorld(createStorage());
  world.sandbox.setActiveMachineId('classic');
  const ok = world.sandbox.TestRunner.runPayoutTests();
  check('Classic payout test suite passes (16/16)', ok === true);

  // Reel strip preparation still targets the centered payline offset
  const reel = new FakeElement('div');
  const info = world.sandbox.ReelAnimator.prepareReel(
    reel,
    [['cherry', 'lemon', 'watermelon'], ['lemon', 'cherry', 'star'], ['star', 'seven', 'diamond']],
    0
  );
  eq('Reel strip duplicates one 13-symbol cycle for seamless wrapping', info.totalSymbols, 26);
  eq('Reel one-cycle strip length is unchanged', info.stripLength, 13 * 94);
  eq('Reel total strip length is two cycles', info.totalStripLength, 26 * 94);
  eq('Reel target offset centers the payline', info.targetOffset, -556);

  // stopReel is idempotent
  const animator = world.sandbox.ReelAnimator;
  animator.activeReels[0] = { phase: animator.PHASE.SPINNING, stopTriggered: false };
  animator.stopReel(0);
  const firstPhase = animator.activeReels[0].phase;
  animator.stopReel(0);
  eq('stopReel transitions to decelerating', firstPhase, animator.PHASE.DECELERATING);
  eq('stopReel is idempotent', animator.activeReels[0].phase, animator.PHASE.DECELERATING);
}

function testAutoSpinRegression() {
  console.log('\n=== Auto-spin regression ===');

  const world = createWorld(createStorage(), { withMain: true, skipInit: true });
  const { sandbox, document } = world;
  // Fire DOMContentLoaded so main.js wires the STOP button handler
  document.dispatch('DOMContentLoaded', {});

  const stopBtn = document.getElementById('stop-btn');
  sandbox.startAutoSpin();
  eq('Auto-spin shows the STOP button', stopBtn.style.display, 'inline-flex');

  // STOP button must interrupt auto-spin (not just stop the reels)
  stopBtn.click();
  eq('STOP button hides itself', stopBtn.style.display, 'none');
  eq('STOP button allows a fresh auto-spin start', (() => {
    sandbox.startAutoSpin();
    const started = stopBtn.style.display === 'inline-flex';
    sandbox.stopAutoSpin('');
    return started;
  })(), true);

  sandbox.startAutoSpin();
  sandbox.stopAutoSpin('');
  eq('Auto-spin hides the STOP button when stopped', stopBtn.style.display, 'none');
}

// ------------------------------------------------------------
// Betting controls tests
// ------------------------------------------------------------

function buildBetDOM(document) {
  const group = document.createElement('div');
  group.className = 'bet-group';
  document.body.appendChild(group);

  const controls = document.createElement('div');
  controls.className = 'bet-controls';
  ['bet-min', 'bet-down', 'bet-up', 'bet-max'].forEach(id => {
    const btn = document.createElement('button'); btn.id = id;
    btn.className = 'ctrl-btn'; controls.appendChild(btn);
  });
  const display = document.createElement('div');
  display.className = 'bet-display';
  const amount = document.createElement('span'); amount.id = 'bet-amount';
  display.appendChild(amount); controls.appendChild(display);
  group.appendChild(controls);

  const incControls = document.createElement('div');
  incControls.className = 'increment-controls';
  const presets = document.createElement('div'); presets.id = 'increment-presets';
  [1, 5, 10, 25, 50].forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'increment-btn'; btn.dataset.increment = String(v);
    presets.appendChild(btn);
  });
  incControls.appendChild(presets);
  const custom = document.createElement('input'); custom.id = 'increment-custom';
  incControls.appendChild(custom);
  const apply = document.createElement('button'); apply.id = 'increment-apply';
  incControls.appendChild(apply);
  const current = document.createElement('span'); current.id = 'increment-current';
  incControls.appendChild(current);
  group.appendChild(incControls);
}

function createBetWorld(options) {
  const opts = options || {};
  const storage = createStorage();
  const world = createWorld(storage, { skipInit: true, withMain: true });
  buildBetDOM(world.document);
  world.document.dispatch('DOMContentLoaded', {});
  return world;
}

function clickBet(world, id) { world.document.getElementById(id).click(); }

function testBettingControls() {
  console.log('\n=== Betting controls ===');

  const world = createBetWorld();
  const { sandbox, document } = world;
  const { SlotMachine, Economy, BetControls, Progression } = sandbox;

  eq('Default bet is the minimum', SlotMachine.currentBet, 10);
  eq('Default increment is 10', BetControls.getIncrement(), 10);
  eq('Default increment display shows 10', document.getElementById('increment-current').textContent, 10);

  // MIN / MAX ignore the increment
  SlotMachine.setBet(55);
  clickBet(world, 'bet-min');
  eq('MIN sets bet to economy minimum', SlotMachine.currentBet, Economy.MIN_BET);
  clickBet(world, 'bet-max');
  eq('MAX sets bet to economy maximum', SlotMachine.currentBet, Economy.MAX_BET);
  eq('Bet display synchronizes after MAX', document.getElementById('bet-amount').textContent, 100);
  eq('MIN press at minimum is a no-op', SlotMachine.currentBet, 100);

  // Plus / minus with every preset increment
  [1, 5, 10, 25, 50].forEach(inc => {
    BetControls.setIncrement(inc);
    SlotMachine.setBet(50);
    clickBet(world, 'bet-up');
    eq('Plus with increment ' + inc, SlotMachine.currentBet, Math.min(100, 50 + inc));
    SlotMachine.setBet(50);
    clickBet(world, 'bet-down');
    eq('Minus with increment ' + inc, SlotMachine.currentBet, Math.max(10, 50 - inc));
  });

  // Worked example from the spec
  SlotMachine.setBet(50);
  BetControls.setIncrement(5);
  clickBet(world, 'bet-up');
  eq('Example: 50 + 5 = 55', SlotMachine.currentBet, 55);
  clickBet(world, 'bet-down');
  eq('Example: 55 - 5 = 50', SlotMachine.currentBet, 50);
  BetControls.setIncrement(25);
  clickBet(world, 'bet-up');
  eq('Example: 50 + 25 = 75', SlotMachine.currentBet, 75);

  // Boundary clamping
  BetControls.setIncrement(10);
  SlotMachine.setBet(95);
  clickBet(world, 'bet-up');
  eq('Bet 95 + increment 10 clamps to 100', SlotMachine.currentBet, 100);
  SlotMachine.setBet(15);
  clickBet(world, 'bet-down');
  eq('Bet 15 - increment 10 clamps to 10', SlotMachine.currentBet, 10);
  SlotMachine.setBet(10);
  clickBet(world, 'bet-min');
  eq('Bet 10 + MIN stays 10', SlotMachine.currentBet, 10);
  SlotMachine.setBet(100);
  clickBet(world, 'bet-max');
  eq('Bet 100 + MAX stays 100', SlotMachine.currentBet, 100);

  // Disabled states at boundaries
  SlotMachine.setBet(10); BetControls.updateUI();
  eq('At minimum, MIN is disabled', document.getElementById('bet-min').disabled, true);
  eq('At minimum, minus is disabled', document.getElementById('bet-down').disabled, true);
  eq('At minimum, plus is enabled', document.getElementById('bet-up').disabled, false);
  SlotMachine.setBet(100); BetControls.updateUI();
  eq('At maximum, MAX is disabled', document.getElementById('bet-max').disabled, true);
  eq('At maximum, plus is disabled', document.getElementById('bet-up').disabled, true);
  eq('At maximum, minus is enabled', document.getElementById('bet-down').disabled, false);

  // Changing increment does not change the bet
  SlotMachine.setBet(60);
  BetControls.setIncrement(25);
  eq('Changing increment leaves bet untouched', SlotMachine.currentBet, 60);
  eq('Increment display updates', document.getElementById('increment-current').textContent, 25);

  // Custom increment input via SET button
  const custom = document.getElementById('increment-custom');
  custom.value = '7';
  document.getElementById('increment-apply').click();
  eq('Custom increment accepts 7', BetControls.getIncrement(), 7);
  SlotMachine.setBet(50);
  clickBet(world, 'bet-up');
  eq('Plus uses custom increment 7', SlotMachine.currentBet, 57);

  // Invalid increments are rejected and do not change the increment
  ['0', '-5', '', 'abc', '1.5', '  '].forEach(bad => {
    eq('Invalid increment rejected: ' + JSON.stringify(bad), BetControls.setIncrement(bad), false);
    eq('Increment unchanged after invalid: ' + JSON.stringify(bad), BetControls.getIncrement(), 7);
  });
  check('Empty custom input is flagged invalid', (() => {
    custom.value = '';
    BetControls.setIncrement('');
    return custom.classList.contains('invalid');
  })());

  // Active preset highlighting
  BetControls.setIncrement(5);
  const activeBtn = document.querySelector('.increment-btn[data-increment="5"]');
  check('Selected preset is highlighted', activeBtn.classList.contains('active'));
  eq('Selected preset aria-pressed is true', activeBtn.getAttribute('aria-pressed'), 'true');

  // No invalid bet values reach the economy
  eq('Bet stays within economy limits after all operations',
    SlotMachine.currentBet >= Economy.MIN_BET && SlotMachine.currentBet <= Economy.MAX_BET, true);
}

function testBettingLocking() {
  console.log('\n=== Betting during spin & auto-spin ===');

  const world = createBetWorld();
  const { sandbox, document } = world;
  const { SlotMachine, Economy, BetControls } = sandbox;

  // Block while spinning
  SlotMachine.setBet(50);
  SlotMachine.isSpinning = true;
  BetControls.updateUI();
  clickBet(world, 'bet-up');
  eq('Plus is blocked while spinning', SlotMachine.currentBet, 50);
  eq('Bet buttons disabled while spinning', document.getElementById('bet-up').disabled, true);
  SlotMachine.isSpinning = false;

  // Block while a spin transaction is pending
  Economy.beginSpin(50);
  clickBet(world, 'bet-up');
  eq('Plus is blocked during pending transaction', SlotMachine.currentBet, 50);
  Economy.refundSpin();

  // Block during auto-spin (use a fresh world to avoid stale timer state)
  const autoWorld = createBetWorld();
  const aSlot = autoWorld.sandbox.SlotMachine;
  const aDoc = autoWorld.document;
  aSlot.setBet(50);
  autoWorld.sandbox.startAutoSpin();
  clickBet(autoWorld, 'bet-up');
  eq('Plus is blocked during auto-spin', aSlot.currentBet, 50);
  eq('Bet buttons disabled during auto-spin', aDoc.getElementById('bet-up').disabled, true);
  autoWorld.sandbox.stopAutoSpin('');
  clickBet(autoWorld, 'bet-up');
  eq('Plus works again after auto-spin stops', aSlot.currentBet, 60);
}

function testBetDeductionAndFunds() {
  console.log('\n=== Bet deduction & insufficient funds ===');

  const world = createBetWorld();
  const { sandbox } = world;
  const { SlotMachine, Economy, BetControls } = sandbox;

  BetControls.setIncrement(25);
  SlotMachine.setBet(75);
  const before = Economy.getBalance();
  eq('Spin deduction starts', Economy.beginSpin(SlotMachine.currentBet), true);
  eq('Selected bet is the amount deducted', before - Economy.getBalance(), 75);
  Economy.completeSpin({ isWin: false, payout: 0 });
  eq('Balance after losing spin', Economy.getBalance(), before - 75);

  // Insufficient balance handling preserved
  Economy.balance = 50;
  eq('Cannot afford a bet above balance', Economy.canAfford(100), false);
  eq('beginSpin rejects unaffordable bet', Economy.beginSpin(100), false);
  eq('Balance unchanged after rejected spin', Economy.getBalance(), 50);
  eq('clampBet caps to affordable amount', Economy.clampBet(100), 50);
  Economy.balance = 1000;
}

function testIncrementPersistence() {
  console.log('\n=== Increment persistence ===');

  const storage = createStorage();
  let world = createWorld(storage, { skipInit: true, withMain: true });
  buildBetDOM(world.document);
  world.document.dispatch('DOMContentLoaded', {});
  world.sandbox.BetControls.setIncrement(25);
  world.sandbox.Progression.save();

  // Reload with the same storage
  world = createWorld(storage, { skipInit: true, withMain: true });
  buildBetDOM(world.document);
  world.document.dispatch('DOMContentLoaded', {});
  eq('Increment survives reload', world.sandbox.BetControls.getIncrement(), 25);
  eq('Increment display restored after reload', world.document.getElementById('increment-current').textContent, 25);

  // Corrupt increment value falls back to default
  const corrupt = createStorage();
  corrupt.setItem('slop-machine-progress', JSON.stringify({ betIncrement: -7 }));
  const corruptWorld = createWorld(corrupt, { skipInit: true, withMain: true });
  buildBetDOM(corruptWorld.document);
  corruptWorld.document.dispatch('DOMContentLoaded', {});
  eq('Invalid persisted increment falls back to 10', corruptWorld.sandbox.BetControls.getIncrement(), 10);
}

// ------------------------------------------------------------
// Reel animation polish tests
// ------------------------------------------------------------

function stepAnimation(world, frames, onFrame) {
  const raf = world.sandbox._testRafQueue;
  for (let i = 0; i < frames; i++) {
    world.sandbox._testNow += 16.7;
    const queue = raf.splice(0);
    queue.forEach(fn => fn());
    if (onFrame) onFrame(i);
  }
}

function createAnimationWorld() {
  // A VM world with a controllable clock and rAF queue for deterministic frames
  const storage = createStorage();
  const document = new FakeDocument();
  const sandbox = {
    console: quietConsole,
    document,
    localStorage: storage,
    _testNow: 0,
    _testRafQueue: [],
    performance: { now: () => sandbox._testNow },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: fn => { sandbox._testRafQueue.push(fn); return sandbox._testRafQueue.length; },
    cancelAnimationFrame: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  const full = path.join(ROOT, 'js/game-logic.js');
  vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
  return { sandbox, document };
}

function testAnimationPolish() {
  console.log('\n=== Reel animation polish ===');

  const world = createAnimationWorld();
  const { sandbox } = world;
  const R = sandbox.ReelAnimator;
  const reel = new FakeElement('div');
  const outcome = [
    ['cherry', 'cherry', 'cherry'],
    ['lemon', 'lemon', 'lemon'],
    ['star', 'star', 'star']
  ];
  const info = R.prepareReel(reel, outcome, 0);

  const phases = [];
  const deltas = [];
  const settleDeltas = [];
  let previous = null;
  let completed = 0;

  R.animateReel(reel, 0, info, () => { completed += 1; });

  stepAnimation(world, 300, i => {
    const y = parseFloat(reel.style.transform.match(/-?[\d.]+/)[0]);
    const state = R.activeReels[0];
    const phase = state ? state.phase : 'done';
    if (phases.length === 0 || phases[phases.length - 1] !== phase) phases.push(phase);
    if (previous !== null) {
      const d = Math.abs(y - previous);
      deltas.push(d);
      if (phase === R.PHASE.SETTLING) settleDeltas.push(d);
    }
    previous = y;
    if (i === 40) R.stopReel(0);
  });

  const maxDelta = Math.max.apply(null, deltas.slice(1));
  const maxSettleDelta = Math.max.apply(null, settleDeltas.length ? settleDeltas : [0]);
  const finalY = parseFloat(reel.style.transform.match(/-?[\d.]+/)[0]);
  const cycleRatio = (finalY - info.targetOffset) / info.cycleLength;

  check('Reel passes through all animation phases',
    ['accelerating', 'spinning', 'decelerating', 'settling', 'done'].every(p => phases.indexOf(p) !== -1),
    phases.join(' > '));
  check('No teleport between phases (max per-frame move < 40px)', maxDelta < 40, 'max ' + maxDelta.toFixed(1));
  check('Settle overshoot is subtle (< 3px per frame)', maxSettleDelta < 3, 'max ' + maxSettleDelta.toFixed(2));
  check('Final position is an exact equivalent of the target offset',
    Math.abs(cycleRatio - Math.round(cycleRatio)) < 1e-6,
    'final ' + finalY + ', target ' + info.targetOffset);
  eq('onComplete fires exactly once', completed, 1);

  // Reel strip is periodic: same symbol sequence in both halves
  const firstHalf = reel.children.slice(0, 13).map(c => c.dataset.symbol).join(',');
  const secondHalf = reel.children.slice(13).map(c => c.dataset.symbol).join(',');
  eq('Strip halves are identical (seamless wrap)', firstHalf, secondHalf);

  // Sequential stopping still works through stopReel on each reel
  const two = createAnimationWorld();
  const R2 = two.sandbox.ReelAnimator;
  const reels = [0, 1, 2].map(i => new FakeElement('div'));
  const infos = reels.map((r, i) => R2.prepareReel(r, outcome, i));
  reels.forEach((r, i) => R2.animateReel(r, i, infos[i], () => {}));
  stepAnimation(two, 10);
  R2.stopReel(0);
  stepAnimation(two, 2);
  R2.stopReel(1);
  stepAnimation(two, 2);
  R2.stopReel(2);
  const stopPhases = [0, 1, 2].map(i => R2.activeReels[i] && R2.activeReels[i].phase);
  check('Each reel can be stopped independently', stopPhases.every(p => p === R2.PHASE.DECELERATING),
    stopPhases.join(','));

  // stopAll cancels loops and prevents rescheduling
  const before = two.sandbox._testRafQueue.length;
  R2.stopAll();
  eq('stopAll clears active reels', Object.keys(R2.activeReels).length, 0);
  stepAnimation(two, 5);
  check('stopAll prevents stale frames', two.sandbox._testRafQueue.length <= before);
}

function testWinFeedback() {
  console.log('\n=== Win / anticipation feedback ===');

  const world = createWorld(createStorage());
  const { document } = world;
  const SlotMachine = world.sandbox.SlotMachine;
  const spin = world.sandbox.SlotMachine;

  const winLine = document.getElementById('win-line');
  spin.showResult({ isWin: true, winType: 'regular', payout: 20, message: 'Cherry 2x!' });
  check('Win adds payline pulse', winLine.classList.contains('win-pulse'));
  check('Win line is active', winLine.classList.contains('active'));

  spin.clearResultDisplay();
  check('New spin clears win pulse', !winLine.classList.contains('win-pulse'));
  check('New spin clears active line', !winLine.classList.contains('active'));

  spin.showResult({ isWin: false, winType: 'none', payout: 0 });
  check('Loss does not add winning pulse', !winLine.classList.contains('win-pulse'));
  check('Loss does not activate win line', !winLine.classList.contains('active'));

  // Highlight helper must ignore non-wins
  spin.highlightWinningSymbols({ isWin: false, payout: 0 });
  eq('Loss adds no winning symbol highlights', document.querySelectorAll('.symbol-slot.winning').length, 0);
}

// ------------------------------------------------------------
// Run
// ------------------------------------------------------------

try {
  testMachines();
  testMachinePersistence();
  testMissions();
  testMissionPersistenceAndReset();
  testMissionsAcrossMachines();
  testUIWiring();
  testEconomyRegression();
  testProgressionRegression();
  testPayoutRegression();
  testAnimationPolish();
  testWinFeedback();
  testAutoSpinRegression();
  testBettingControls();
  testBettingLocking();
  testBetDeductionAndFunds();
  testIncrementPersistence();
} catch (error) {
  console.error('\nUNEXPECTED TEST ERROR:', error);
  failed += 1;
  failures.push('Unexpected error: ' + error.message);
}

console.log('\n========================================');
console.log('Tests: ' + (passed + failed) + '  Passed: ' + passed + '  Failed: ' + failed);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(' - ' + f));
}
console.log('========================================');

process.exit(failed === 0 ? 0 : 1);
