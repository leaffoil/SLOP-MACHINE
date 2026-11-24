/**
 * game-logic.js — Stage 2: Slot Machine Core Logic
 * 
 * Handles:
 *   - Symbol definitions and rendering
 *   - Outcome generation (predetermined before animation)
 *   - Reel animation control
 *   - Payout calculation with wild substitution
 *   - Spin state management
 */

'use strict';

// ============================================================
// SYMBOL DEFINITIONS
// ============================================================

const SYMBOLS = {
  CHERRY:    { id: 'cherry',    name: 'Cherry',     multiplier: 2,  weight: 30, color: '#e74c3c' },
  LEMON:     { id: 'lemon',     name: 'Lemon',      multiplier: 3,  weight: 25, color: '#f1c40f' },
  WATERMELON:{ id: 'watermelon',name: 'Watermelon',  multiplier: 5,  weight: 20, color: '#2ecc71' },
  DIAMOND:   { id: 'diamond',   name: 'Diamond',    multiplier: 10, weight: 12, color: '#3498db' },
  STAR:      { id: 'star',      name: 'Star',       multiplier: 15, weight: 8,  color: '#9b59b6' },
  SEVEN:     { id: 'seven',     name: 'Lucky 7',    multiplier: 50, weight: 3,  color: '#FFD700' },
  WILD:      { id: 'wild',      name: 'Wild',       multiplier: 0,  weight: 2,  color: '#e74c3c' }, // multiplier 0 = special handling
};

const SYMBOL_LIST = Object.values(SYMBOLS);
const TOTAL_WEIGHT = SYMBOL_LIST.reduce((sum, s) => sum + s.weight, 0);

// ============================================================
// SVG SYMBOL RENDERERS
// ============================================================

const SymbolRenderer = {
  cherry(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="28" r="8" fill="${symbol.color}"/>
      <circle cx="14" cy="20" r="6" fill="${symbol.color}"/>
      <circle cx="26" cy="20" r="6" fill="${symbol.color}"/>
      <line x1="20" y1="12" x2="20" y2="4" stroke="#2ecc71" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
  },
  lemon(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="24" rx="12" ry="10" fill="${symbol.color}"/>
      <ellipse cx="20" cy="22" rx="8" ry="7" fill="#f39c12"/>
      <line x1="20" y1="14" x2="20" y2="4" stroke="#2ecc71" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
  },
  watermelon(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="22" rx="14" ry="11" fill="${symbol.color}"/>
      <ellipse cx="20" cy="22" rx="10" ry="8" fill="#27ae60"/>
      <circle cx="14" cy="20" r="2" fill="#000" opacity="0.3"/>
      <circle cx="20" cy="22" r="2" fill="#000" opacity="0.3"/>
      <circle cx="26" cy="20" r="2" fill="#000" opacity="0.3"/>
      <line x1="20" y1="11" x2="20" y2="4" stroke="#2ecc71" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
  },
  diamond(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <polygon points="20,4 25,15 37,15 28,23 31,35 20,27 9,35 12,23 3,15 15,15" fill="${symbol.color}" stroke="#5dade2" stroke-width="1"/>
    </svg>`;
  },
  star(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <polygon points="20,4 23,16 36,16 26,24 29,36 20,28 11,36 14,24 4,16 17,16" fill="${symbol.color}" stroke="#c39bd3" stroke-width="1"/>
    </svg>`;
  },
  seven(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <text x="20" y="30" font-size="26" font-weight="900" fill="${symbol.color}" font-family="Arial" text-anchor="middle">7</text>
    </svg>`;
  },
  wild(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <rect x="6" y="6" width="28" height="28" rx="6" fill="${symbol.color}"/>
      <text x="20" y="30" font-size="18" font-weight="900" fill="#fff" font-family="Arial" text-anchor="middle">W</text>
    </svg>`;
  },
  
  render(symbolId) {
    const symbol = SYMBOLS[symbolId.toUpperCase()];
    if (!symbol) return '';
    const renderer = this[symbol.id];
    return renderer ? renderer(symbol) : '';
  },
  
  // For mini symbols in sidebars
  renderMini(symbolId) {
    return this.render(symbolId);
  }
};

// ============================================================
// OUTCOME GENERATOR
// ============================================================

const OutcomeGenerator = {
  /**
   * Pick a random symbol based on weighted probabilities
   */
  pickSymbol() {
    let random = Math.random() * TOTAL_WEIGHT;
    for (const symbol of SYMBOL_LIST) {
      random -= symbol.weight;
      if (random <= 0) return symbol.id;
    }
    return SYMBOL_LIST[0].id; // fallback
  },
  
  /**
   * Generate a complete 3x3 grid outcome (3 reels × 3 visible symbols)
   * Returns array of 3 reels, each with 3 symbol IDs [top, middle, bottom]
   */
  generateOutcome() {
    const reels = [];
    for (let reel = 0; reel < 3; reel++) {
      const reelSymbols = [
        this.pickSymbol(), // top
        this.pickSymbol(), // middle (payline)
        this.pickSymbol()  // bottom
      ];
      reels.push(reelSymbols);
    }
    return reels;
  },
  
  /**
   * Generate a specific outcome for testing (deterministic)
   */
  generateTestOutcome(symbolId) {
    const reels = [];
    for (let reel = 0; reel < 3; reel++) {
      reels.push([symbolId, symbolId, symbolId]);
    }
    return reels;
  }
};

// ============================================================
// PAYOUT CALCULATOR
// ============================================================

const PayoutCalculator = {
  /**
   * Evaluate the middle row (payline) for winning combinations
   * @param {Array} outcome - 3x3 grid [reel][position]
   * @param {number} bet - Current bet amount
   * @returns {Object} { isWin, multiplier, payout, winType, winningSymbols }
   */
  evaluate(outcome, bet) {
    // Get middle row symbols (payline)
    const payline = [outcome[0][1], outcome[1][1], outcome[2][1]];
    
    // Count wilds
    const wildCount = payline.filter(s => s === SYMBOLS.WILD.id).length;
    
    // Check for 3 Wilds = JACKPOT
    if (wildCount === 3) {
      return {
        isWin: true,
        multiplier: 500, // Jackpot multiplier
        payout: bet * 500,
        winType: 'jackpot',
        winningSymbols: payline,
        message: 'JACKPOT!'
      };
    }
    
    // Find the non-wild symbol to match (if any)
    const nonWildSymbols = payline.filter(s => s !== SYMBOLS.WILD.id);
    
    // If all are wilds (already handled) or no non-wild symbols, no regular win
    if (nonWildSymbols.length === 0) {
      return { isWin: false, multiplier: 0, payout: 0, winType: 'none', winningSymbols: [], message: '' };
    }
    
    // Check if all non-wild symbols are the same
    const targetSymbol = nonWildSymbols[0];
    const allMatch = nonWildSymbols.every(s => s === targetSymbol);
    
    if (allMatch) {
      const symbol = SYMBOLS[targetSymbol.toUpperCase()];
      const multiplier = symbol.multiplier;
      return {
        isWin: true,
        multiplier: multiplier,
        payout: bet * multiplier,
        winType: 'regular',
        winningSymbols: payline,
        message: `${symbol.name} ${multiplier}x!`
      };
    }
    
    // No win
    return {
      isWin: false,
      multiplier: 0,
      payout: 0,
      winType: 'none',
      winningSymbols: [],
      message: 'NO WIN'
    };
  },
  
  /**
   * Get symbol info by ID
   */
  getSymbolInfo(symbolId) {
    return SYMBOLS[symbolId.toUpperCase()] || null;
  }
};

// ============================================================
// REEL ANIMATOR
// ============================================================

const ReelAnimator = {
  // Animation constants
  SYMBOL_HEIGHT: 94, // symbol-slot height (90px) + gap (4px)
  SPIN_DURATION_BASE: 1200, // base duration per reel in ms
  SPIN_DURATION_VARIANCE: 500, // additional random time
  STOP_DELAY: 500, // delay between reel stops
  
  // State
  isAnimating: false,
  animationPromises: [],
  activeReels: {}, // Track per-reel animation state
  
  // Animation phases per reel
  PHASE: {
    ACCELERATING: 'accelerating',
    SPINNING: 'spinning',
    DECELERATING: 'decelerating',
    STOPPING: 'stopping',
    SETTLING: 'settling',
    DONE: 'done'
  },
  
  /**
   * Create symbol slot element
   */
  createSymbolElement(symbolId) {
    const div = document.createElement('div');
    div.className = 'symbol-slot';
    div.dataset.symbol = symbolId;
    div.innerHTML = SymbolRenderer.render(symbolId);
    return div;
  },
  
  /**
   * Populate a reel with symbols for continuous animation
   */
  prepareReel(reelElement, outcome, reelIndex) {
    // Clear existing content
    reelElement.innerHTML = '';
    
    // Create: 3 buffer symbols (above) + 3 outcome symbols + 3 buffer symbols (below)
    const stripSymbols = [];
    
    // Add 5 random symbols above
    for (let i = 0; i < 5; i++) {
      stripSymbols.push(OutcomeGenerator.pickSymbol());
    }
    
    // Add the 3 outcome symbols (top, middle, bottom)
    stripSymbols.push(...outcome[reelIndex]);
    
    // Add 5 random symbols below
    for (let i = 0; i < 5; i++) {
      stripSymbols.push(OutcomeGenerator.pickSymbol());
    }
    
    // Create DOM elements
    stripSymbols.forEach(symbolId => {
      const el = this.createSymbolElement(symbolId);
      reelElement.appendChild(el);
    });
    
    // Set initial position - start with first buffer symbol at top
    const initialOffset = -(5 * this.SYMBOL_HEIGHT);
    reelElement.style.transform = `translateY(${initialOffset}px)`;
    
    return {
      totalSymbols: stripSymbols.length,
      stripLength: stripSymbols.length * this.SYMBOL_HEIGHT,
      targetIndex: 6, // index of middle outcome symbol in strip
      targetOffset: -(6 * this.SYMBOL_HEIGHT)
    };
  },
  
  /**
   * Continuous animation loop using requestAnimationFrame
   */
  animateReel(reelElement, reelIndex, reelInfo, onComplete) {
    const state = {
      phase: this.PHASE.ACCELERATING,
      scrollY: -(5 * this.SYMBOL_HEIGHT), // Start at top
      speed: 0,
      maxSpeed: 3.5, // pixels per frame
      decelerationStart: null,
      startTime: performance.now(),
      rafId: null
    };
    
    this.activeReels[reelIndex] = state;
    
    const self = this;
    
    function animateLoop() {
      const now = performance.now();
      const elapsed = now - state.startTime;
      const stripLength = reelInfo.stripLength;
      
      switch (state.phase) {
        case self.PHASE.ACCELERATING:
          // Accelerate over ~600ms
          const accelProgress = Math.min(elapsed / 600, 1);
          state.speed = state.maxSpeed * accelProgress * accelProgress;
          if (accelProgress >= 1) {
            state.phase = self.PHASE.SPINNING;
          }
          break;
          
        case self.PHASE.SPINNING:
          state.speed = state.maxSpeed + Math.random() * 0.5;
          break;
          
        case self.PHASE.DECELERATING:
          // Decelerate over ~500ms
          const decelProgress = Math.min((elapsed - state.decelerationStart) / 500, 1);
          state.speed = state.maxSpeed * (1 - decelProgress) * (1 - decelProgress);
          if (decelProgress >= 1) {
            state.phase = self.PHASE.STOPPING;
            state.decelerationStart = now;
          }
          break;
          
        case self.PHASE.STOPPING:
          // Slight settling movement before final stop
          const stopProgress = Math.min((elapsed - state.decelerationStart) / 200, 1);
          state.speed = Math.max(0, state.speed - 0.5);
          if (stopProgress >= 1 && state.speed <= 0) {
            state.phase = self.PHASE.SETTLING;
            state.decelerationStart = now;
          }
          break;
          
        case self.PHASE.SETTLING:
          // Final settling: gentle bounce to target
          const settleProgress = Math.min((elapsed - state.decelerationStart) / 300, 1);
          // Create a gentle bounce by using ease-out with slight overshoot
          const easeOut = 1 - Math.pow(1 - settleProgress, 3);
          const offset = easeOut * 15 * Math.sin(settleProgress * Math.PI * 3);
          // Snap to target
          state.scrollY = reelInfo.targetOffset + offset;
          
          if (settleProgress >= 1) {
            state.scrollY = reelInfo.targetOffset;
            state.phase = self.PHASE.DONE;
            state.rafId = null;
            
            // Clean up
            reelElement.classList.remove('spinning');
            delete self.activeReels[reelIndex];
            
            if (onComplete) onComplete(reelIndex);
            return;
          }
          break;
      }
      
      // Apply continuous movement
      if (state.phase === self.PHASE.ACCELERATING || state.phase === self.PHASE.SPINNING) {
        state.scrollY += state.speed;
        
        // Wrap around continuously
        if (state.scrollY > 0) {
          state.scrollY -= stripLength;
        }
      }
      
      // Apply transform
      reelElement.style.transform = `translateY(${state.scrollY}px)`;
      
      // Request next frame
      state.rafId = requestAnimationFrame(animateLoop);
    }
    
    // Start the loop
    state.rafId = requestAnimationFrame(animateLoop);
  },
  
  /**
   * Stop a specific reel (begin deceleration)
   */
  stopReel(reelIndex) {
    const state = this.activeReels[reelIndex];
    if (!state) return;
    
    // Transition to deceleration
    if (state.phase === this.PHASE.SPINNING) {
      state.phase = this.PHASE.DECELERATING;
      state.decelerationStart = performance.now();
    }
  },
  
  /**
   * Spin all three reels with predetermined outcome
   */
  async spinAll(outcome, onReelStop) {
    if (this.isAnimating) return Promise.reject(new Error('Already spinning'));
    
    this.isAnimating = true;
    this.animationPromises = [];
    this.activeReels = {};
    
    const reelElements = [
      document.getElementById('reel-0'),
      document.getElementById('reel-1'),
      document.getElementById('reel-2')
    ];
    
    // Prepare each reel (generate outline for animation)
    const reelInfos = reelElements.map((el, index) => 
      this.prepareReel(el, outcome, index)
    );
    
    // Add spinning class to all reels
    reelElements.forEach(el => el.classList.add('spinning'));
    
    // Start all reels with small delay between starts for visual effect
    const promises = reelElements.map((reel, index) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          this.animateReel(reel, index, reelInfos[index], resolve);
        }, index * 50); // Small stagger between reel starts
      });
    });
    
    this.animationPromises = promises;
    
    // Add sequential stopping logic
    let stopIndex = 0;
    const stopSequence = () => {
      if (stopIndex < reelElements.length && this.activeReels[stopIndex]) {
        this.stopReel(stopIndex);
        // Wait for this reel to fully stop before stopping next
        this.animationPromises[stopIndex].then(() => {
          stopIndex++;
          stopSequence();
        });
      }
    };
    setTimeout(stopSequence, 1500); // Let all reels spin first
    
    try {
      await Promise.all(promises);
    } finally {
      this.isAnimating = false;
      this.animationPromises = [];
    }
  },
  
  /**
   * Stop all animations immediately (for emergency stop)
   */
  stopAll() {
    const reelElements = [
      document.getElementById('reel-0'),
      document.getElementById('reel-1'),
      document.getElementById('reel-2')
    ];
    
    // Cancel all animation frames
    Object.keys(this.activeReels).forEach(idx => {
      const state = this.activeReels[idx];
      if (state && state.rafId) {
        cancelAnimationFrame(state.rafId);
      }
    });
    
    reelElements.forEach(reel => {
      reel.classList.remove('spinning');
    });
    
    this.activeReels = {};
    this.isAnimating = false;
    this.animationPromises = [];
  }
};

// ============================================================
// SLOT MACHINE CONTROLLER
// ============================================================

const SlotMachine = {
  // State
  isSpinning: false,
  currentBet: 10,
  lastOutcome: null,
  lastPayoutResult: null,
  
  // Callbacks
  onSpinStart: null,
  onReelStop: null,
  onSpinComplete: null,
  
  /**
   * Initialize the slot machine
   */
  init() {
    this.bindUI();
    this.updateDisplay();
  },
  
  /**
   * Bind UI event listeners
   */
  bindUI() {
    // Spin button
    const spinBtn = document.getElementById('spin-btn');
    spinBtn.addEventListener('click', () => this.handleSpin());
    
    // Bet controls (for future Stage 3, but wire up display now)
    document.getElementById('bet-up').addEventListener('click', () => this.adjustBet(10));
    document.getElementById('bet-down').addEventListener('click', () => this.adjustBet(-10));
    document.getElementById('bet-min').addEventListener('click', () => this.setBet(10));
    document.getElementById('bet-max').addEventListener('click', () => this.setBet(100));
  },
  
  /**
   * Handle spin button click
   */
  async handleSpin() {
    if (this.isSpinning) return;
    
    // Check economy affordability if available
    if (window.Economy) {
      if (!window.Economy.canAfford(this.currentBet)) {
        console.log('Cannot afford spin:', this.currentBet, '>', window.Economy.balance);
        return;
      }
      // Begin spin - deduct bet (Stage 3 integration)
      const deducted = window.Economy.beginSpin(this.currentBet);
      if (!deducted) {
        console.log('beginSpin failed');
        return;
      }
    }
    
    this.isSpinning = true;
    this.setSpinButtonState(true);
    
    // Clear previous result display
    this.clearResultDisplay();
    
    // Generate outcome BEFORE animation (determinism)
    const outcome = OutcomeGenerator.generateOutcome();
    this.lastOutcome = outcome;
    
    // Calculate payout immediately (don't display yet)
    const payoutResult = PayoutCalculator.evaluate(outcome, this.currentBet);
    this.lastPayoutResult = payoutResult;
    
    // Trigger spin start callback (economy deduction happens here as safety net)
    if (this.onSpinStart) this.onSpinStart(outcome, payoutResult);
    
    // Animate reels
    try {
      await ReelAnimator.spinAll(outcome, (reelIndex) => {
        if (this.onReelStop) this.onReelStop(reelIndex, outcome);
      });
      
      // Animation complete - show results
      this.showResult(payoutResult);
      this.updateLastResultDisplay(outcome);
      this.highlightWinningSymbols(payoutResult);
      
      if (this.onSpinComplete) this.onSpinComplete(payoutResult);
      
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isSpinning = false;
      this.setSpinButtonState(false);
      
      // Re-enable bet controls
      this.updateBetControlsState();
    }
  },
  
  /**
   * Handle spin errors safely
   */
  handleError(error) {
    console.error('Spin error:', error);
    
    if (error && error.type === 'spin-error' && window.Economy) {
      // Refund if spin was not completed (Stage 3 safety)
      window.Economy.refundSpin();
    }
    
    // Show error message in UI
    const resultText = document.getElementById('result-text');
    if (resultText) {
      resultText.textContent = 'ERROR - RESETTING';
      resultText.className = 'result-text';
      setTimeout(() => {
        resultText.textContent = 'PRESS SPIN TO PLAY';
      }, 2000);
    }
  },
  
  /**
   * Stop all reels (for STOP button)
   */
  stopAllReels() {
    ReelAnimator.stopAll();
    // Note: if a spin is in progress, let it finish gracefully
    // The isSpinning flag will be cleared when the animation completes
    if (window.Economy && window.Economy.hasPendingSpin()) {
      // If deducation happened but animation was stopped, refund
      // (Cannot refund while spinning - we need to let it complete first)
      console.log('Stop requested during spin - will let it complete');
    }
  },
  
  /**
   * Update bet controls state (disabled during spin)
   */
  updateBetControlsState() {
    const controls = ['bet-up', 'bet-down', 'bet-min', 'bet-max'];
    controls.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.disabled = this.isSpinning;
      }
    });
  },
  
  /**
   * Enable/disable spin button
   */
  setSpinButtonState(disabled) {
    const spinBtn = document.getElementById('spin-btn');
    spinBtn.disabled = disabled;
    if (disabled) {
      spinBtn.classList.add('spinning');
    } else {
      spinBtn.classList.remove('spinning');
    }
    // Block bet controls during spin
    this.updateBetControlsState();
  },
  
  /**
   * Clear result display
   */
  clearResultDisplay() {
    const resultText = document.getElementById('result-text');
    const payoutText = document.getElementById('payout-text');
    const winLine = document.getElementById('win-line');
    
    resultText.textContent = 'SPINNING...';
    resultText.className = 'result-text';
    payoutText.textContent = '';
    winLine.classList.remove('active');
    
    // Clear winning highlights
    document.querySelectorAll('.symbol-slot.winning').forEach(el => {
      el.classList.remove('winning');
    });
  },
  
  /**
   * Show spin result
   */
  showResult(payoutResult) {
    const resultText = document.getElementById('result-text');
    const payoutText = document.getElementById('payout-text');
    const winLine = document.getElementById('win-line');
    
    if (payoutResult.isWin) {
      if (payoutResult.winType === 'jackpot') {
        resultText.textContent = 'JACKPOT!';
        resultText.className = 'result-text jackpot-txt';
        winLine.classList.add('active');
        // Add jackpot pulse animation to machine
        document.getElementById('slot-machine').classList.add('jackpot');
        setTimeout(() => document.getElementById('slot-machine').classList.remove('jackpot'), 3000);
      } else {
        resultText.textContent = payoutResult.message || 'WIN!';
        resultText.className = 'result-text win';
        winLine.classList.add('active');
      }
      payoutText.textContent = `+${payoutResult.payout.toLocaleString()}`;
      payoutText.classList.add('anim-payout-count');
      setTimeout(() => payoutText.classList.remove('anim-payout-count'), 300);
    } else {
      resultText.textContent = 'NO WIN';
      resultText.className = 'result-text';
      payoutText.textContent = '';
      winLine.classList.remove('active');
    }
  },
  
  /**
   * Update last result sidebar display
   */
  updateLastResultDisplay(outcome) {
    const lastSymbols = document.getElementById('last-symbols');
    if (!lastSymbols) return;
    
    // Get middle row (payline)
    const payline = [outcome[0][1], outcome[1][1], outcome[2][1]];
    
    const boxes = lastSymbols.querySelectorAll('.last-sym-box');
    boxes.forEach((box, index) => {
      box.innerHTML = SymbolRenderer.renderMini(payline[index]);
      box.className = 'last-sym-box';
      // Add win highlight if this was a winning spin
      if (this.lastPayoutResult?.isWin) {
        box.classList.add('winning');
      }
    });
  },
  
  /**
   * Highlight winning symbols in the reels
   */
  highlightWinningSymbols(payoutResult) {
    if (!payoutResult.isWin) return;
    
    const reelElements = [
      document.getElementById('reel-0'),
      document.getElementById('reel-1'),
      document.getElementById('reel-2')
    ];
    
    // The middle symbol in each reel (index 1 in the visible 3) is the payline
    // In our DOM, after animation, the symbols are at positions 5, 6, 7 in the strip
    // (5=top outcome, 6=middle outcome, 7=bottom outcome)
    // We need to find the middle one (index 6 in strip = 2nd child of visible outcome)
    
    reelElements.forEach((reel, reelIndex) => {
      const symbolSlots = reel.querySelectorAll('.symbol-slot');
      // The middle payline symbol is at index 6 (0-based: 5 buffer + 1 middle)
      if (symbolSlots[6]) {
        symbolSlots[6].classList.add('winning');
      }
    });
  },
  
  /**
   * Adjust bet by delta
   */
  adjustBet(delta) {
    const newBet = Math.max(10, Math.min(100, this.currentBet + delta));
    this.setBet(newBet);
  },
  
  /**
   * Set bet to specific amount
   */
  setBet(amount) {
    this.currentBet = Math.max(10, Math.min(100, amount));
    this.updateDisplay();
  },
  
  /**
   * Update bet display
   */
  updateDisplay() {
    document.getElementById('bet-amount').textContent = this.currentBet;
  },
  
  /**
   * Get current state for testing/debugging
   */
  getState() {
    return {
      isSpinning: this.isSpinning,
      currentBet: this.currentBet,
      lastOutcome: this.lastOutcome,
      lastPayoutResult: this.lastPayoutResult
    };
  }
};

// ============================================================
// TESTING UTILITIES (deterministic test cases)
// ============================================================

const TestRunner = {
  /**
   * Run all payout calculation tests
   */
  runPayoutTests() {
    console.log('=== Running Payout Tests ===\n');
    
    const testCases = [
      // [reel1, reel2, reel3, expectedMultiplier, description]
      ['cherry', 'cherry', 'cherry', 2, 'Three Cherries'],
      ['lemon', 'lemon', 'lemon', 3, 'Three Lemons'],
      ['watermelon', 'watermelon', 'watermelon', 5, 'Three Watermelons'],
      ['diamond', 'diamond', 'diamond', 10, 'Three Diamonds'],
      ['star', 'star', 'star', 15, 'Three Stars'],
      ['seven', 'seven', 'seven', 50, 'Three Lucky Sevens'],
      ['wild', 'wild', 'wild', 500, 'Three Wilds (Jackpot)'],
      
      // Wild substitution tests
      ['wild', 'cherry', 'cherry', 2, 'Wild + Cherry + Cherry'],
      ['cherry', 'wild', 'cherry', 2, 'Cherry + Wild + Cherry'],
      ['cherry', 'cherry', 'wild', 2, 'Cherry + Cherry + Wild'],
      ['wild', 'wild', 'seven', 50, 'Wild + Wild + Seven'],
      ['seven', 'wild', 'wild', 50, 'Seven + Wild + Wild'],
      ['wild', 'seven', 'wild', 50, 'Wild + Seven + Wild'],
      
      // Losing combinations
      ['cherry', 'lemon', 'cherry', 0, 'Cherry + Lemon + Cherry (no win)'],
      ['wild', 'cherry', 'lemon', 0, 'Wild + Cherry + Lemon (no win)'],
      ['seven', 'diamond', 'star', 0, 'Seven + Diamond + Star (no win)'],
    ];
    
    let passed = 0;
    let failed = 0;
    
    testCases.forEach(([s1, s2, s3, expectedMult, desc]) => {
      // Create outcome with these symbols in middle row
      const outcome = [
        ['cherry', s1, 'lemon'],   // reel 0: top, middle, bottom
        ['lemon', s2, 'cherry'],   // reel 1
        ['watermelon', s3, 'star'] // reel 2
      ];
      
      const result = PayoutCalculator.evaluate(outcome, 10);
      const actualMult = result.multiplier;
      
      if (actualMult === expectedMult) {
        console.log(`✓ PASS: ${desc} → ${actualMult}x`);
        passed++;
      } else {
        console.log(`✗ FAIL: ${desc} → Expected ${expectedMult}x, got ${actualMult}x`);
        failed++;
      }
    });
    
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    return failed === 0;
  },
  
  /**
   * Test symbol rendering
   */
  testSymbolRendering() {
    console.log('\n=== Testing Symbol Rendering ===');
    SYMBOL_LIST.forEach(symbol => {
      const html = SymbolRenderer.render(symbol.id);
      console.log(`${symbol.name}: ${html.length > 0 ? 'OK' : 'FAIL'} (${html.length} chars)`);
    });
  },
  
  /**
   * Test outcome generation
   */
  testOutcomeGeneration() {
    console.log('\n=== Testing Outcome Generation ===');
    const outcome = OutcomeGenerator.generateOutcome();
    console.log('Generated outcome:', outcome);
    console.log('Structure:', outcome.map(r => r.join(', ')).join(' | '));
    return outcome;
  }
};

// ============================================================
// EXPORTS
// ============================================================

// Make available globally for main.js and testing
window.SlotMachine = SlotMachine;
window.SYMBOLS = SYMBOLS;
window.OutcomeGenerator = OutcomeGenerator;
window.PayoutCalculator = PayoutCalculator;
window.ReelAnimator = ReelAnimator;
window.SymbolRenderer = SymbolRenderer;
window.TestRunner = TestRunner;

// Auto-run tests in development (can be removed in production)
// TestRunner.runPayoutTests();
// TestRunner.testSymbolRendering();
// TestRunner.testOutcomeGeneration();