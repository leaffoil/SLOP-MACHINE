/**
 * progression.js — Stage 4: XP, Levels, Achievements & Collections
 *
 * Handles:
 *   - XP formula and level progression curve (approved design)
 *   - XP awards after completed spins (win & loss) with dedup guard
 *   - Level progression with multiple level-ups per XP award
 *   - Virtual-coin level-up rewards via Economy.addBalance
 *   - Achievement definitions, progress tracking, unlock notifications
 *   - Collection tracking of game symbols + cosmetic reward on completion
 *   - LocalStorage persistence with safe loading of missing/corrupt data
 *
 * Approved XP formula:
 *   - XP earned: +5 for every completed spin (win or loss)
 *     +15 when the spin wins, +50 when it is a jackpot
 *   - XP needed to reach level L (L >= 1) = 100 × L × (L − 1)
 *     L1: 0, L2: 200, L3: 600, L4: 1200, L5: 2000, L6: 3000, L7: 4200,
 *     L8: 5600, L9: 7200, L10: 9000 ... growth increases with each level.
 *   - Level-up coin rewards are virtual (Economy.addBalance) — configurable.
 *
 * Integration: main.js calls Progression.onSpinComplete(payoutResult, outcome, spinToken)
 * from SlotMachine.onSpinComplete, after Economy.completeSpin has run.
 *
 * No player coins are ever spent here: level rewards are added only.
 */

'use strict';

const PROGRESS_STORAGE_KEY = 'slop-machine-progress';

// ---- XP formula (approved) ----
const XP_BASE_SPIN = 5;       // XP for every completed spin
const XP_WIN_BONUS = 15;      // XP bonus for a winning spin
const XP_JACKPOT_BONUS = 50;  // XP bonus for a jackpot spin

const MAX_LEVEL = 100;

// ---- Level-up coin rewards (virtual, configurable) ----
const LEVEL_REWARDS = {
  2: 60,
  3: 60,
  4: 80,
  5: 80,
  6: 100,
  7: 100,
  8: 120,
  9: 120,
  10: 150
};

// ---- Cosmetic reward unlocked when the full symbol collection completes ----
const COSMETIC_REWARDS = [
  { id: 'gold_star_badge', name: 'Gold Star Badge', description: 'Awarded for collecting every symbol' }
];

// ---- Achievement definitions (progress requirement + target) ----
const ACHIEVEMENT_DEFS = [
  { id: 'first_spin',       name: 'First Spin',       desc: 'Complete your first spin',    requirement: 'spins',    target: 1 },
  { id: 'first_win',        name: 'First Win',        desc: 'Win for the first time',      requirement: 'wins',     target: 1 },
  { id: 'getting_started',  name: 'Getting Started',  desc: 'Complete 10 spins',            requirement: 'spins',    target: 10 },
  { id: 'dedicated_player', name: 'Dedicated Player', desc: 'Complete 100 spins',           requirement: 'spins',    target: 100 },
  { id: 'jackpot',          name: 'Jackpot!',         desc: 'Hit your first jackpot',      requirement: 'jackpots', target: 1 },
  { id: 'collector',        name: 'Collector',        desc: 'Collect 5 different symbols', requirement: 'collected',target: 5 },
  { id: 'level_10',         name: 'Level 10',         desc: 'Reach level 10',              requirement: 'level',    target: 10 },
  { id: 'prestige_i',       name: 'Prestige I',       desc: 'Reach your first prestige',   requirement: 'prestige', target: 1, lockedByDefault: true }
];

// ---- Daily mission definitions (fixed daily set, unique ids) ----
const MISSION_DEFS = [
  {
    id: 'spins_10',
    name: 'Complete 10 Spins',
    description: 'Spin the reels 10 times',
    progressKey: 'spins',
    requirement: 10,
    rewardCoins: 100,
    rewardXP: 0
  },
  {
    id: 'coins_500',
    name: 'Win 500 Coins',
    description: 'Win a total of 500 coins',
    progressKey: 'coinsWon',
    requirement: 500,
    rewardCoins: 0,
    rewardXP: 50
  },
  {
    id: 'symbols_1',
    name: 'Collect a New Symbol',
    description: 'Add a new symbol to your collection',
    progressKey: 'symbolsCollected',
    requirement: 1,
    rewardCoins: 0,
    rewardXP: 200
  }
];

const Progression = {
  state: null,
  _lastAwardedToken: undefined,

  // ----------------------------------------------------------
  // State management
  // ----------------------------------------------------------

  _defaultState() {
    const achievements = {};
    ACHIEVEMENT_DEFS.forEach(d => {
      achievements[d.id] = { progress: 0, unlocked: false };
    });
    return {
      xp: 0,
      totalXp: 0,
      level: 1,
      spins: 0,
      wins: 0,
      jackpots: 0,
      achievements,
      collected: [],
      cosmeticRewards: [],
      levelRewards: [],

      // Stage 5: machine selection and daily missions
      machineSelected: 'classic',
      machineUnlocked: ['classic'],
      dailyMissions: this._freshDailyMissions(''),

      // Betting: selected +/- increment (see main.js BetControls)
      betIncrement: 10
    };
  },

  /** Fresh daily mission progress for a given local-date key. */
  _freshDailyMissions(dateKey) {
    return {
      date: dateKey || '',
      spins: 0,
      coinsWon: 0,
      symbolsCollected: [],
      completed: MISSION_DEFS.map(() => false),
      claimed: MISSION_DEFS.map(() => false)
    };
  },

  /** Local calendar date key (YYYY-MM-DD) — not a 24h countdown. */
  _localDateKey(date) {
    const d = date instanceof Date ? date : new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + month + '-' + day;
  },

  init() {
    if (typeof window === 'undefined' || !window.SYMBOLS) return;
    this.state = this._defaultState();
    this.load();
    this.syncLevel();

    // Stage 5: restore machine selection, unlock state and daily missions
    this._ensureDailyReset();
    this._recalculateMachines();
    this._applySelectedMachine();
    this._bindMissionUI();

    this.updateUI();
    this.save();

    // Refresh betting UI once persisted state (including betIncrement) is ready
    if (typeof window !== 'undefined' && window.BetControls) {
      window.BetControls.updateUI();
    }
  },

  // ----------------------------------------------------------
  // Stage 5: machines
  // ----------------------------------------------------------

  /** Machines currently available at the player's level. */
  _unlockedMachineIds() {
    if (typeof MACHINE_DEFS === 'undefined') return ['classic'];
    return Object.values(MACHINE_DEFS)
      .filter(m => this.state.level >= m.unlockLevel)
      .map(m => m.id);
  },

  /** Recalculate unlock availability from level (saved state is informational). */
  _recalculateMachines() {
    const unlocked = this._unlockedMachineIds();
    this.state.machineUnlocked = unlocked;

    // Never leave the player on a machine they cannot use
    if (unlocked.indexOf(this.state.machineSelected) === -1) {
      this.state.machineSelected = 'classic';
    }
  },

  /** Push the selected machine into the game view. */
  _applySelectedMachine() {
    if (window.SlotMachine && typeof window.SlotMachine.applyMachine === 'function') {
      window.SlotMachine.applyMachine(this.state.machineSelected);
    } else if (typeof window.setActiveMachineId === 'function') {
      window.setActiveMachineId(this.state.machineSelected);
    }
  },

  /**
   * Select an unlocked machine. Persists immediately and updates the UI.
   * Returns false when the machine is unknown or still locked.
   */
  selectMachine(machineId) {
    if (!this.state) return false;
    if (typeof MACHINE_DEFS === 'undefined' || !MACHINE_DEFS[machineId]) return false;
    const machine = MACHINE_DEFS[machineId];

    if (this.state.level < machine.unlockLevel) {
      if (typeof showToast === 'function') {
        showToast('Reach level ' + machine.unlockLevel + ' to unlock the ' + machine.name, 3000);
      }
      return false;
    }

    this.state.machineSelected = machineId;
    this._recalculateMachines();
    this.save();
    this._applySelectedMachine();
    this.updateMachineUI();

    if (typeof showToast === 'function') {
      showToast('Switched to ' + machine.name, 2000);
    }
    return true;
  },

  // ----------------------------------------------------------
  // Stage 5: daily missions
  // ----------------------------------------------------------

  /** Reset mission progress when the local calendar date changes. */
  _ensureDailyReset() {
    if (!this.state) return false;
    const today = this._localDateKey();
    const dm = this.state.dailyMissions;
    if (!dm || dm.date !== today) {
      this.state.dailyMissions = this._freshDailyMissions(today);
      return true;
    }
    return false;
  },

  /** Current progress value for a mission definition. */
  _missionProgress(def) {
    const dm = this.state.dailyMissions;
    if (!dm) return 0;
    switch (def.progressKey) {
      case 'spins': return dm.spins;
      case 'coinsWon': return dm.coinsWon;
      case 'symbolsCollected': return dm.symbolsCollected.length;
      default: return 0;
    }
  },

  /** Recompute the completed flags from current progress. */
  _recomputeMissionCompletion() {
    const dm = this.state.dailyMissions;
    if (!dm) return;
    dm.completed = MISSION_DEFS.map(def => this._missionProgress(def) >= def.requirement);
  },

  /** Record progress for one completed spin. */
  _recordMissionProgress(payoutResult, newlyCollected) {
    this._ensureDailyReset();
    const dm = this.state.dailyMissions;

    dm.spins += 1;
    if (payoutResult && payoutResult.isWin && payoutResult.payout > 0) {
      // Track actual winnings, never the wager
      dm.coinsWon += payoutResult.payout;
    }
    (newlyCollected || []).forEach(id => {
      if (dm.symbolsCollected.indexOf(id) === -1) dm.symbolsCollected.push(id);
    });

    this._recomputeMissionCompletion();
  },

  /**
   * Claim a completed mission exactly once. Coins use Economy, XP uses
   * Progression.addXP. The claimed flag is persisted before awarding.
   */
  claimMission(missionId) {
    if (!this.state) return false;
    const index = MISSION_DEFS.findIndex(def => def.id === missionId);
    if (index === -1) return false;

    this._ensureDailyReset();
    this._recomputeMissionCompletion();

    const dm = this.state.dailyMissions;
    if (!dm.completed[index] || dm.claimed[index]) return false;

    dm.claimed[index] = true;
    this.save(); // persist the claim before awarding anything

    const def = MISSION_DEFS[index];
    if (def.rewardCoins > 0 && window.Economy && typeof window.Economy.addBalance === 'function') {
      window.Economy.addBalance(def.rewardCoins);
    }
    if (def.rewardXP > 0) {
      this.addXP(def.rewardXP);
    }

    this.save();
    this.updateMissionsUI();

    if (typeof showToast === 'function') {
      const reward = def.rewardCoins > 0
        ? '+' + def.rewardCoins + ' coins'
        : '+' + def.rewardXP + ' XP';
      showToast('Mission complete: ' + def.name + ' — ' + reward, 2800);
    }
    return true;
  },

  /** Attach claim handlers once. */
  _bindMissionUI() {
    if (typeof document === 'undefined' || this._missionUIbound) return;
    this._missionUIbound = true;

    document.querySelectorAll('.mission-card').forEach(card => {
      const btn = card.querySelector('.mission-claim-btn');
      if (!btn) return;
      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled') || btn.classList.contains('claimed')) return;
        const id = card.dataset ? card.dataset.mission : null;
        if (id) this.claimMission(id);
      });
    });
  },

  // ----------------------------------------------------------
  // XP & levels
  // ----------------------------------------------------------

  getXP() { return this.state.xp; },
  getTotalXP() { return this.state.totalXp; },
  getLevel() { return this.state.level; },

  /** XP required to reach level L (L >= 1). L1 = 0, L2 = 200, L3 = 600 ... */
  xpForLevel(level) {
    const L = Math.max(1, Math.floor(level));
    return 100 * L * (L - 1);
  },

  /** XP threshold for the level after the current one. */
  thresholdForCurrentLevel() {
    return this.xpForLevel(this.state.level + 1);
  },

  /**
   * Add XP and process level-ups (possibly several from one award).
   */
  addXP(amount) {
    const n = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
    if (n === 0) return;

    const levelUps = [];
    this.state.xp += n;
    this.state.totalXp += n;
    this._runLevelUps(levelUps);
    this.updateUI();
    levelUps.forEach(lv => this._notifyLevelUp(lv));
  },

  /** Run the level-up loop, recording rewards per level (exactly once each). */
  _runLevelUps(levelUps) {
    const startLevel = this.state.level;
    while (this.state.level < MAX_LEVEL && this.state.xp >= this.xpForLevel(this.state.level + 1)) {
      this.state.level += 1;
      this._claimLevelReward(this.state.level, levelUps);
    }
    // Stage 5: a new level may unlock a machine
    if (this.state.level !== startLevel && typeof MACHINE_DEFS !== 'undefined') {
      this._recalculateMachines();
      this.updateMachineUI();
    }
  },

  _claimLevelReward(level, levelUps) {
    if (this.state.levelRewards.indexOf(level) !== -1) return;
    this.state.levelRewards.push(level);

    const reward = LEVEL_REWARDS[level] || 0;
    if (reward > 0 && window.Economy && typeof window.Economy.addBalance === 'function') {
      window.Economy.addBalance(reward);
    }
    levelUps.push({ level, reward });
  },

  _notifyLevelUp(lv) {
    const el = typeof document !== 'undefined' ? document.getElementById('header-level') : null;
    if (el && el.classList) el.classList.add('anim-level-up-pop');
    if (typeof showToast === 'function') {
      showToast('LEVEL ' + lv.level + '! Reward: +' + lv.reward + ' coins', 2600);
    }
    if (el && el.classList) {
      setTimeout(() => el.classList.remove('anim-level-up-pop'), 600);
    }
  },

  /** Re-apply level-ups that may already exist in loaded XP (safe on refresh). */
  syncLevel() {
    const levelUps = [];
    this._runLevelUps(levelUps);
    levelUps.forEach(lv => this._notifyLevelUp(lv));
  },

  // ----------------------------------------------------------
  // Spin completion hook (called once per completed spin by main.js)
  // ----------------------------------------------------------

  /**
   * Award XP, update spin counters, discover collections and unlock
   * achievements after a completed spin. Duplicate calls with the same
   * spinToken are ignored (guard against repeated callbacks).
   */
  onSpinComplete(payoutResult, outcome, spinToken) {
    if (spinToken !== undefined && spinToken === this._lastAwardedToken) return;
    if (spinToken !== undefined) this._lastAwardedToken = spinToken;
    if (!payoutResult) return;

    const isWin = Boolean(payoutResult.isWin && payoutResult.payout > 0);
    const isJackpot = payoutResult.winType === 'jackpot';

    this.state.spins += 1;
    if (isWin) {
      this.state.wins += 1;
      if (isJackpot) this.state.jackpots += 1;
    }

    // XP: wins and losses both earn XP (approved formula)
    const xp = XP_BASE_SPIN + (isWin ? XP_WIN_BONUS : 0) + (isJackpot ? XP_JACKPOT_BONUS : 0);
    if (xp > 0) this.addXP(xp);

    // Collections: discover symbols from the completed spin
    const newlyCollected = this._discoverSymbols(outcome);

    // Daily missions: count the completed spin and its results
    this._recordMissionProgress(payoutResult, newlyCollected);

    // Achievements: progress + unlock (exactly once each)
    const newlyUnlocked = this._syncAchievementProgress();
    this.updateUI();
    newlyUnlocked.forEach(def => this._notifyAchievement(def));

    // Persist after each completed spin (refresh-safe, no duplicate awards)
    this.save();
  },

  // ----------------------------------------------------------
  // Achievements
  // ----------------------------------------------------------

  _currentProgressFor(def) {
    switch (def.requirement) {
      case 'spins':    return this.state.spins;
      case 'wins':     return this.state.wins;
      case 'jackpots': return this.state.jackpots;
      case 'collected':return this.state.collected.length;
      case 'level':    return this.state.level;
      default:         return 0; // 'prestige' (not implemented yet)
    }
  },

  /** Store current progress values and unlock each achievement exactly once. */
  _syncAchievementProgress() {
    const newlyUnlocked = [];
    ACHIEVEMENT_DEFS.forEach(def => {
      const entry = this.state.achievements[def.id];
      if (!entry) return;
      entry.progress = Math.min(def.target, Math.max(0, this._currentProgressFor(def)));
      if (!entry.unlocked && entry.progress >= def.target) {
        entry.unlocked = true;
        newlyUnlocked.push(def);
      }
    });
    return newlyUnlocked;
  },

  _isUnlocked(def) {
    const entry = this.state.achievements[def.id];
    return Boolean(entry && entry.unlocked);
  },

  _notifyAchievement(def) {
    if (typeof showToast === 'function') {
      showToast('Unlocked: ' + def.name + ' — ' + def.desc, 3000);
    }
  },

  /** Render/update the achievement cards on the Achievements screen. */
  updateAchievements() {
    ACHIEVEMENT_DEFS.forEach(def => this._renderAchievement(def));
    const countEl = typeof document !== 'undefined' ? document.getElementById('stat-achievements') : null;
    if (countEl) countEl.textContent = this._achievementCount() + ' / ' + ACHIEVEMENT_DEFS.length;
  },

  _achievementCount() {
    return ACHIEVEMENT_DEFS.filter(d => this._isUnlocked(d)).length;
  },

  _renderAchievement(def) {
    if (typeof document === 'undefined') return;
    let card = document.querySelector('[data-achievement="' + def.id + '"]');
    if (!card) {
      card = document.createElement('div');
      card.className = 'achieve-card';
      card.dataset.achievement = def.id;
      card.innerHTML =
        '<div class="achieve-icon">' +
        '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="12" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M10 16l4 4 8-8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</div>' +
        '<div class="achieve-info">' +
        '<div class="achieve-name"></div><div class="achieve-desc"></div>' +
        '<div class="achieve-progress"><div class="achieve-progress-fill" style="width:0%"></div>' +
        '<span class="achieve-progress-count">0 / 0</span></div></div>';
      const grid = document.getElementById('achievements-grid');
      if (grid) grid.appendChild(card);
    }

    if (card.querySelector) {
      const nameEl = card.querySelector('.achieve-name');
      const descEl = card.querySelector('.achieve-desc');
      const fillEl = card.querySelector('.achieve-progress-fill');
      const countEl = card.querySelector('.achieve-progress-count');
      if (nameEl) nameEl.textContent = def.name;
      if (descEl) descEl.textContent = def.desc;
      const entry = this.state.achievements[def.id] || { progress: 0 };
      const pct = Math.max(0, Math.min(100, Math.round((entry.progress / def.target) * 100)));
      if (fillEl) fillEl.style.width = pct + '%';
      if (countEl) countEl.textContent = entry.progress + ' / ' + def.target;
    }

    const unlocked = this._isUnlocked(def);
    card.classList.toggle('unlocked-achieve', unlocked);
    card.classList.toggle('locked-achieve', !unlocked);
  },

  // ----------------------------------------------------------
  // Collections
  // ----------------------------------------------------------

  /**
   * Symbols the game actually uses. Includes every machine's symbol set so
   * collection missions work on Classic, Treasure and Cyber.
   */
  _collectibleIds() {
    if (typeof window !== 'undefined' && typeof window.getAllSymbolIds === 'function') {
      return window.getAllSymbolIds();
    }
    if (typeof window !== 'undefined' && window.SYMBOLS) {
      return Object.values(window.SYMBOLS).map(s => s.id);
    }
    return [];
  },

  _symbolLabel(id) {
    if (typeof window !== 'undefined' && typeof window.findSymbolById === 'function') {
      const symbol = window.findSymbolById(id);
      if (symbol) return symbol.name;
    }
    return id === 'seven' ? 'Lucky 7' : id.charAt(0).toUpperCase() + id.slice(1);
  },

  /**
   * Add newly seen symbols from a completed spin outcome to the collection.
   * @returns {string[]} ids that were newly collected by this spin
   */
  _discoverSymbols(outcome) {
    if (!outcome || !Array.isArray(outcome)) return [];
    const payline = [outcome[0] && outcome[0][1], outcome[1] && outcome[1][1], outcome[2] && outcome[2][1]];
    const seen = {};
    const collectibles = this._collectibleIds();
    this.state.collected.forEach(id => { seen[id] = true; });
    const newlyCollected = [];

    payline.forEach(id => {
      if (!id || seen[id]) return;
      // Ignore symbols that are not real collectibles
      if (collectibles.indexOf(id) === -1) return;
      this.state.collected.push(id);
      seen[id] = true;
      newlyCollected.push(id);
      if (typeof showToast === 'function') {
        showToast('Discovered: ' + this._symbolLabel(id) + ' — added to your collection', 2500);
      }
    });

    if (newlyCollected.length > 0) {
      this._syncAchievementProgress();
      this._maybeCompleteCollection();
      this.updateCollectionUI();
    }
    return newlyCollected;
  },

  /** Unlock the cosmetic reward once every collectible symbol is collected. */
  _maybeCompleteCollection() {
    const ids = this._collectibleIds();
    if (ids.length === 0) return;
    const done = ids.every(id => this.state.collected.indexOf(id) !== -1);
    if (!done) return;

    const reward = COSMETIC_REWARDS[0];
    if (!reward) return;
    if (this.state.cosmeticRewards.indexOf(reward.id) !== -1) return; // exactly once

    this.state.cosmeticRewards.push(reward.id);
    if (typeof showToast === 'function') {
      showToast('Cosmetic reward unlocked: ' + reward.name + ' — collection complete!', 3500);
    }
    this.updateCollectionUI();
  },

  /** Render collection cards, progress bar and the cosmetic reward status. */
  updateCollectionUI() {
    if (typeof document === 'undefined') return;
    const collectibles = this._collectibleIds();
    const grid = document.getElementById('collection-grid');

    // Update existing cards (match by data-symbol), creating missing ones
    if (grid) {
      if (grid.querySelectorAll) {
        const cards = grid.querySelectorAll('.collect-card');
        cards.forEach(card => {
          const symbolId = card.dataset && card.dataset.symbol;
          if (!symbolId || collectibles.indexOf(symbolId) === -1) return;
          const isCollected = this.state.collected.indexOf(symbolId) !== -1;
          card.classList.toggle('unlocked-card', isCollected);
          card.classList.toggle('locked-card', !isCollected);
          const icon = card.querySelector('.collect-icon');
          if (icon) icon.classList.toggle('collected', isCollected);
        });
      }

      // Add cards for symbols from the newer machines (Treasure / Cyber)
      const existing = {};
      grid.querySelectorAll('.collect-card').forEach(card => {
        if (card.dataset && card.dataset.symbol) existing[card.dataset.symbol] = true;
      });
      collectibles.forEach(symbolId => {
        if (existing[symbolId]) return;
        const card = document.createElement('div');
        card.className = 'collect-card locked-card';
        card.dataset.symbol = symbolId;
        card.innerHTML = '<div class="collect-icon">?</div>' +
          '<div class="collect-name">' + this._symbolLabel(symbolId) + '</div>';
        grid.appendChild(card);
      });
    }

    // Progress bar and count
    const total = collectibles.length;
    const collectedCount = this.state.collected.filter(id => collectibles.indexOf(id) !== -1).length;
    const bar = document.getElementById('collection-bar');
    if (bar) bar.style.width = total > 0 ? Math.round((collectedCount / total) * 100) + '%' : '0%';
    const pct = document.getElementById('collection-pct');
    if (pct) pct.textContent = collectedCount + ' / ' + total + ' Collected';

    // Cosmetic completion display
    const rewardEl = document.getElementById('collection-cosmetic');
    if (rewardEl) {
      const nameEl = rewardEl.querySelector('.collection-cosmetic-label');
      const textEl = document.getElementById('collection-cosmetic-text');
      const unlocked = this.state.cosmeticRewards.length > 0;
      rewardEl.classList.toggle('unlocked', unlocked);
      if (nameEl) nameEl.textContent = unlocked ? COSMETIC_REWARDS.filter(c => this.state.cosmeticRewards.indexOf(c.id) !== -1).map(c => c.name).join(', ') : '';
      if (textEl) textEl.textContent = unlocked ? 'Premium collection complete!' : '';
    }
  },

  // ----------------------------------------------------------
  // XP progress UI
  // ----------------------------------------------------------

  updateXPBar() {
    if (typeof document === 'undefined') return;
    const bar = document.getElementById('xp-bar');
    if (!bar) return;
    const threshold = this.thresholdForCurrentLevel();
    const pct = threshold > 0 ? this.state.xp / threshold : 1;
    bar.style.width = Math.round(Math.max(0, Math.min(100, pct * 100))) + '%';

    const cur = document.getElementById('xp-current');
    const next = document.getElementById('xp-next');
    if (cur) cur.textContent = this.state.xp.toLocaleString();
    if (next) next.textContent = threshold.toLocaleString();
  },

  updateHeaderLevel() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('header-level');
    if (el) el.textContent = this.state.level;
    const pro = document.getElementById('profile-level');
    if (pro) pro.textContent = this.state.level;
    const stats = document.getElementById('stat-level');
    if (stats) stats.textContent = this.state.level;
  },

  // ----------------------------------------------------------
  // Aggregate UI update
  // ----------------------------------------------------------

  updateUI() {
    this.updateXPBar();
    this.updateHeaderLevel();
    this.updateAchievements();
    this.updateCollectionUI();

    // Stage 5: update machine and mission UI
    if (typeof document !== 'undefined') {
      this.updateMachineUI();
      this.updateMissionsUI();
    }
  },

  /** Render machine cards: lock overlays, selected state and unlock count. */
  updateMachineUI() {
    if (typeof document === 'undefined' || typeof MACHINE_DEFS === 'undefined') return;

    const unlocked = this._unlockedMachineIds();
    this.state.machineUnlocked = unlocked;
    const selected = this.state.machineSelected;

    document.querySelectorAll('.machine-card').forEach(card => {
      const machineId = card.dataset ? card.dataset.machine : null;
      const machine = machineId ? MACHINE_DEFS[machineId] : null;
      if (!machine) return;

      const isUnlocked = unlocked.indexOf(machineId) !== -1;
      const isSelected = selected === machineId && isUnlocked;

      card.classList.toggle('locked', !isUnlocked);
      card.classList.toggle('active-machine', isSelected);

      const overlay = card.querySelector('.lock-overlay');
      if (overlay && overlay.style) overlay.style.display = isUnlocked ? 'none' : 'flex';

      const statusEl = card.querySelector('.machine-status');
      if (statusEl) {
        statusEl.classList.remove('unlocked', 'locked-status', 'selected');
        if (isSelected) {
          statusEl.textContent = 'SELECTED';
          statusEl.classList.add('selected');
        } else if (!isUnlocked) {
          statusEl.textContent = 'UNLOCK AT LEVEL ' + machine.unlockLevel;
          statusEl.classList.add('locked-status');
        } else {
          statusEl.textContent = 'UNLOCKED';
          statusEl.classList.add('unlocked');
        }
      }
    });

    const countEl = document.getElementById('stat-machines');
    if (countEl) countEl.textContent = unlocked.length + ' / ' + Object.keys(MACHINE_DEFS).length;
  },

  /** Render daily mission progress, completion and claim states. */
  updateMissionsUI() {
    if (typeof document === 'undefined' || !this.state) return;
    if (this._ensureDailyReset()) this.save();
    const dm = this.state.dailyMissions;
    if (!dm) return;

    const cards = document.querySelectorAll('.mission-card');
    cards.forEach((card, index) => {
      const id = card.dataset ? card.dataset.mission : null;
      let def = id ? MISSION_DEFS.find(d => d.id === id) : null;
      if (!def) def = MISSION_DEFS[index];
      if (!def) return;

      const defIndex = MISSION_DEFS.indexOf(def);
      const progress = this._missionProgress(def);
      const completed = Boolean(dm.completed[defIndex]) || progress >= def.requirement;
      const claimed = Boolean(dm.claimed[defIndex]);

      const nameEl = card.querySelector('.mission-card-name');
      if (nameEl) nameEl.textContent = def.name;

      const descEl = card.querySelector('.mission-card-desc');
      if (descEl) descEl.textContent = def.description;

      const rewardEl = card.querySelector('.mission-card-reward');
      if (rewardEl) {
        rewardEl.innerHTML = 'Reward: ' + (def.rewardCoins > 0
          ? '<span class="gold">+' + def.rewardCoins + ' Coins</span>'
          : '<span class="purple">+' + def.rewardXP + ' XP</span>');
      }

      const fill = card.querySelector('.mission-bar-fill');
      if (fill && fill.style) {
        const pct = def.requirement > 0 ? Math.min(100, Math.round((progress / def.requirement) * 100)) : 0;
        fill.style.width = pct + '%';
      }

      const fraction = card.querySelector('.mission-fraction');
      if (fraction) {
        const shown = Math.min(progress, def.requirement);
        fraction.textContent = shown + ' / ' + def.requirement;
      }

      card.classList.toggle('mission-complete', completed && !claimed);
      card.classList.toggle('mission-claimed', claimed);

      const btn = card.querySelector('.mission-claim-btn');
      if (btn) {
        btn.classList.remove('disabled', 'claimable', 'claimed');
        if (claimed) {
          btn.textContent = 'CLAIMED';
          btn.classList.add('claimed');
        } else if (completed) {
          btn.textContent = 'CLAIM';
          btn.classList.add('claimable');
        } else {
          btn.textContent = 'PROGRESS';
          btn.classList.add('disabled');
        }
      }
    });

    // Sidebar mini mission list (first two missions)
    const miniItems = document.querySelectorAll('#mission-mini-list .mission-item');
    MISSION_DEFS.slice(0, miniItems.length).forEach((def, i) => {
      const item = miniItems[i];
      const progress = this._missionProgress(def);
      const nameEl = item.querySelector('.mission-name');
      const fill = item.querySelector('.mission-prog-fill');
      const count = item.querySelector('.mission-count');
      if (nameEl) nameEl.textContent = def.name;
      if (fill && fill.style) {
        const pct = def.requirement > 0 ? Math.min(100, Math.round((progress / def.requirement) * 100)) : 0;
        fill.style.width = pct + '%';
      }
      if (count) count.textContent = Math.min(progress, def.requirement) + ' / ' + def.requirement;
    });
  },

  // ----------------------------------------------------------
  // Persistence
  // ----------------------------------------------------------

  save() {
    if (typeof window === 'undefined' || !this.state) return;
    try {
      const ls = window.localStorage;
      if (!ls) return;
      ls.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Progression: failed to save progress', e);
    }
  },

  load() {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (!raw) return; // nothing saved yet — fresh state
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      this._applyLoadedData(data);
    } catch (e) {
      // Corrupted/missing data (or unavailable storage) — start fresh without crashing
      console.warn('Progression: saved data invalid or unavailable, starting fresh', e);
    }
  },

  _applyLoadedData(data) {
    const num = (v, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
    };

    this.state.xp = num(data.xp, 0);
    this.state.totalXp = Number.isFinite(Number(data.totalXp)) ? num(data.totalXp, this.state.xp) : this.state.xp;
    this.state.level = Math.min(Math.max(1, num(data.level, 1)), MAX_LEVEL);
    this.state.spins = num(data.spins, 0);
    this.state.wins = num(data.wins, 0);
    this.state.jackpots = num(data.jackpots, 0);

    // Betting increment: positive integer only; default 10 on bad/missing data
    const rawIncrement = Number(data.betIncrement);
    this.state.betIncrement = Number.isInteger(rawIncrement) && rawIncrement > 0 ? rawIncrement : 10;

    // Stage 5: machine selection and daily missions
    const knownMachine = typeof MACHINE_DEFS !== 'undefined' && data.machineSelected && MACHINE_DEFS[data.machineSelected];
    this.state.machineSelected = knownMachine ? data.machineSelected : 'classic';
    this.state.machineUnlocked = Array.isArray(data.machineUnlocked)
      ? data.machineUnlocked.filter(id => typeof id === 'string')
      : ['classic'];

    // Daily missions: validate every field; unknown/corrupt data starts fresh
    const src = data.dailyMissions && typeof data.dailyMissions === 'object' ? data.dailyMissions : {};
    const dateRaw = typeof src.date === 'string' ? src.date : (typeof src.lastResetDate === 'string' ? src.lastResetDate : '');
    const symbols = Array.isArray(src.symbolsCollected)
      ? src.symbolsCollected.filter(id => typeof id === 'string').filter((v, i, a) => a.indexOf(v) === i)
      : [];
    this.state.dailyMissions = {
      date: dateRaw,
      spins: num(src.spins, 0),
      coinsWon: num(src.coinsWon, 0),
      symbolsCollected: symbols,
      completed: MISSION_DEFS.map((def, i) => Boolean(src.completed && src.completed[i])),
      claimed: MISSION_DEFS.map((def, i) => Boolean(src.claimed && src.claimed[i]))
    };

    // Achievements: keep only known ids, validate progress
    const ach = data.achievements && typeof data.achievements === 'object' ? data.achievements : {};
    this.state.achievements = {};
    ACHIEVEMENT_DEFS.forEach(d => {
      const src = ach[d.id];
      const progress = Number(src && src.progress);
      const unlocked = Boolean(src && src.unlocked);
      const validProgress = Number.isFinite(progress) && progress > 0 ? Math.floor(progress) : 0;
      this.state.achievements[d.id] = {
        progress: unlocked ? Math.max(validProgress, d.target) : validProgress,
        unlocked
      };
    });

    // Collected symbols (deduped, only known)
    const known = this._collectibleIds();
    this.state.collected = Array.isArray(data.collected)
      ? data.collected.filter(id => typeof id === 'string' && known.indexOf(id) !== -1).filter((v, i, a) => a.indexOf(v) === i)
      : [];

    // Cosmetic rewards + claimed level rewards
    this.state.cosmeticRewards = Array.isArray(data.cosmeticRewards) ? data.cosmeticRewards.filter(id => COSMETIC_REWARDS.some(c => c.id === id)) : [];
    this.state.levelRewards = Array.isArray(data.levelRewards) ? data.levelRewards.filter(n => Number.isFinite(n)) : [];
  }
};

if (typeof window !== 'undefined') {
  window.Progression = Progression;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Progression.init());
  } else {
    Progression.init();
  }
}
