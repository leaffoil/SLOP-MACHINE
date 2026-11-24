/**
 * economy.js — Stage 3: Coin Economy, Betting Validation & Session Statistics
 *
 * Handles:
 *   - Player coin balance (starting at 1,000)
 *   - Safe bet deduction (once per spin, no negative balances)
 *   - Safe payout crediting (gross payouts tracked separately from wagers)
 *   - Spin error refunding (once per failed spin, no duplicate refunds)
 *   - Bet clamping (10–100, capped to available funds)
 *   - Session & Statistics UI synchronization
 */

'use strict';

const Economy = {
  STARTING_BALANCE: 1000,
  MIN_BET: 10,
  MAX_BET: 100,
  BET_STEP: 10,

  balance: 1000,
  pendingBet: null,

  stats: {
    spins: 0,
    wins: 0,
    losses: 0,
    bestWin: 0,
    totalWagered: 0,
    totalEarned: 0
  },

  /**
   * Initialize economy state and sync UI
   */
  init() {
    this.updateBalanceDisplay();
    this.updateStatsDisplay();
  },

  /**
   * Reset economy to initial state (used by tests)
   */
  reset() {
    this.balance = this.STARTING_BALANCE;
    this.pendingBet = null;
    this.stats = {
      spins: 0,
      wins: 0,
      losses: 0,
      bestWin: 0,
      totalWagered: 0,
      totalEarned: 0
    };
    this.updateBalanceDisplay();
    this.updateStatsDisplay();
  },

  /**
   * Get current coin balance
   */
  getBalance() {
    return this.balance;
  },

  /**
   * Check whether the player can afford a given amount
   */
  canAfford(amount) {
    return typeof amount === 'number' &&
      Number.isFinite(amount) &&
      amount > 0 &&
      this.balance >= amount;
  },

  /**
   * Check if a spin transaction is currently in progress
   */
  hasPendingSpin() {
    return this.pendingBet !== null;
  },

  /**
   * Clamp a requested bet to [MIN_BET, MAX_BET] and available balance.
   * If balance is below MIN_BET, returns MIN_BET (canAfford will be false).
   */
  clampBet(amount) {
    const numeric = Number.isFinite(amount) ? amount : this.MIN_BET;
    const inRange = Math.max(this.MIN_BET, Math.min(this.MAX_BET, numeric));
    if (this.balance < this.MIN_BET) {
      return this.MIN_BET;
    }
    const maxAffordable = Math.floor(this.balance / this.BET_STEP) * this.BET_STEP;
    const cappedMax = Math.min(this.MAX_BET, Math.max(this.MIN_BET, maxAffordable));
    return Math.min(inRange, cappedMax);
  },

  /**
   * Deduct bet at spin start.
   * Ensures deduction happens at most once per spin and never goes negative.
   */
  beginSpin(bet) {
    if (this.pendingBet !== null) {
      return false;
    }
    if (typeof bet !== 'number' || !Number.isFinite(bet) || bet < this.MIN_BET || bet > this.MAX_BET) {
      return false;
    }
    if (!this.canAfford(bet)) {
      return false;
    }

    this.balance -= bet;
    this.pendingBet = bet;
    this.updateBalanceDisplay();
    return true;
  },

  /**
   * Complete a spin: credit gross payout and record statistics once.
   */
  completeSpin(payoutResult) {
    if (this.pendingBet === null) {
      return false;
    }

    const wagered = this.pendingBet;
    this.pendingBet = null;

    const isWin = Boolean(payoutResult && payoutResult.isWin && payoutResult.payout > 0);
    const payout = isWin ? payoutResult.payout : 0;

    if (payout > 0) {
      this.balance += payout;
    }

    this.stats.spins += 1;
    this.stats.totalWagered += wagered;

    if (isWin) {
      this.stats.wins += 1;
      this.stats.totalEarned += payout; // Gross payout, not net profit
      if (payout > this.stats.bestWin) {
        this.stats.bestWin = payout;
      }
    } else {
      this.stats.losses += 1;
    }

    this.updateBalanceDisplay();
    this.updateStatsDisplay();
    return true;
  },

  /**
   * Refund pending bet if a spin fails unexpectedly.
   * Prevents duplicate refunds by clearing pendingBet.
   */
  refundSpin() {
    if (this.pendingBet === null) {
      return false;
    }
    this.balance += this.pendingBet;
    this.pendingBet = null;
    this.updateBalanceDisplay();
    return true;
  },

  /**
   * Update header balance display
   */
  updateBalanceDisplay() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('header-balance');
    if (el) {
      el.textContent = this.balance.toLocaleString();
    }
  },

  /**
   * Update session sidebar and statistics section
   */
  updateStatsDisplay() {
    if (typeof document === 'undefined') return;

    const setEl = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    // Session sidebar
    setEl('sess-spins', this.stats.spins.toLocaleString());
    setEl('sess-wins', this.stats.wins.toLocaleString());
    setEl('sess-best', this.stats.bestWin.toLocaleString());

    // Statistics section
    setEl('stat-spins', this.stats.spins.toLocaleString());
    setEl('stat-wins', this.stats.wins.toLocaleString());
    setEl('stat-losses', this.stats.losses.toLocaleString());
    setEl('stat-biggest', this.stats.bestWin.toLocaleString());
    setEl('stat-earned', this.stats.totalEarned.toLocaleString());
  },

  /**
   * Snapshot of current state for testing/debugging
   */
  getState() {
    return {
      balance: this.balance,
      pendingBet: this.pendingBet,
      stats: { ...this.stats }
    };
  }
};

if (typeof window !== 'undefined') {
  window.Economy = Economy;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Economy };
}
