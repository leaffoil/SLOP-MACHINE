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
  SPIN_DURATION_BASE: 1000, // base duration per reel in ms
  SPIN_DURATION_VARIANCE: 400, // additional random time
  STOP_DELAY: 400, // delay between reel stops
  
  // State
  isAnimating: false,
  animationPromises: [],
  
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
   * Populate a reel with symbols for animation
   * Creates a long strip of symbols that will scroll
   */
  prepareReel(reelElement, outcome, reelIndex) {
    // Clear existing content
    reelElement.innerHTML = '';
    
    // We need enough symbols to spin through
    // Create: 3 buffer symbols (above) + 3 outcome symbols + 3 buffer symbols (below)
    // Actually, let's create a longer strip for smoother animation
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
    
    // Initial position: start with first buffer symbol at top
    // The middle outcome symbol (index 5+1=6) should end up in the viewport center
    const initialOffset = -(5 * this.SYMBOL_HEIGHT); // 5 buffer symbols above
    reelElement.style.transform = `translateY(${initialOffset}px)`;
    reelElement.style.transition = 'none';
    
    // Force reflow
    reelElement.offsetHeight;
    
    return {
      totalSymbols: stripSymbols.length,
      targetIndex: 6, // index of middle outcome symbol in strip
      targetOffset: -(6 * this.SYMBOL_HEIGHT)
    };
  },
  
  /**
   * Animate a single reel to its target position
   */
  animateReel(reelElement, reelIndex, outcome, onComplete) {
    const duration = this.SPIN_DURATION_BASE + Math.random() * this.SPIN_DURATION_VARIANCE;
    const delay = reelIndex * this.STOP_DELAY;
    
    const reelInfo = this.prepareReel(reelElement, outcome, reelIndex);
    
    // Add spinning class for blur effect
    reelElement.classList.add('spinning');
    
    return new Promise((resolve) => {
      setTimeout(() => {
        // Enable transition
        reelElement.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        
        // Move to target position
        reelElement.style.transform = `translateY(${reelInfo.targetOffset}px)`;
        
        // Handle transition end
        const onTransitionEnd = () => {
          reelElement.removeEventListener('transitionend', onTransitionEnd);
          reelElement.classList.remove('spinning');
          reelElement.style.transition = 'none';
          
          // Snap to exact position (in case of floating point issues)
          reelElement.style.transform = `translateY(${reelInfo.targetOffset}px)`;
          
          if (onComplete) onComplete(reelIndex);
          resolve();
        };
        
        reelElement.addEventListener('transitionend', onTransitionEnd);
        
        // Fallback in case transitionend doesn't fire
        setTimeout(onTransitionEnd, duration + 100);
      }, delay);
    });
  },
  
  /**
   * Spin all three reels with predetermined outcome
   */
  async spinAll(outcome, onReelStop) {
    if (this.isAnimating) return Promise.reject(new Error('Already spinning'));
    
    this.isAnimating = true;
    this.animationPromises = [];
    
    const reelElements = [
      document.getElementById('reel-0'),
      document.getElementById('reel-1'),
      document.getElementById('reel-2')
    ];
    
    // Animate each reel
    const promises = reelElements.map((reel, index) => 
      this.animateReel(reel, index, outcome, onReelStop)
    );
    
    this.animationPromises = promises;
    
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
    
    reelElements.forEach(reel => {
      reel.classList.remove('spinning');
      reel.style.transition = 'none';
    });
    
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
    
    this.isSpinning = true;
    this.setSpinButtonState(true);
    
    // Clear previous result display
    this.clearResultDisplay();
    
    // Generate outcome BEFORE animation
    const outcome = OutcomeGenerator.generateOutcome();
    this.lastOutcome = outcome;
    
    // Calculate payout immediately (but don't display yet)
    const payoutResult = PayoutCalculator.evaluate(outcome, this.currentBet);
    this.lastPayoutResult = payoutResult;
    
    // Trigger spin start callback
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
      console.error('Spin error:', error);
    } finally {
      this.isSpinning = false;
      this.setSpinButtonState(false);
    }
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