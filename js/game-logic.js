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
// SYMBOL DEFINITIONS (per machine)
// ============================================================

const MACHINE_DEFS = {
  classic: {
    id: 'classic',
    name: 'Classic Machine',
    unlockLevel: 1,
    symbols: {
      CHERRY:    { id: 'cherry',    name: 'Cherry',     multiplier: 2,  weight: 30, color: '#e74c3c' },
      LEMON:     { id: 'lemon',     name: 'Lemon',      multiplier: 3,  weight: 25, color: '#f1c40f' },
      WATERMELON:{ id: 'watermelon',name: 'Watermelon',  multiplier: 5,  weight: 20, color: '#2ecc71' },
      DIAMOND:   { id: 'diamond',   name: 'Diamond',    multiplier: 10, weight: 12, color: '#3498db' },
      STAR:      { id: 'star',      name: 'Star',       multiplier: 15, weight: 8,  color: '#9b59b6' },
      SEVEN:     { id: 'seven',     name: 'Lucky 7',    multiplier: 50, weight: 3,  color: '#FFD700' },
      WILD:      { id: 'wild',      name: 'Wild',       multiplier: 0,  weight: 2,  color: '#e74c3c' },
    }
  },
  treasure: {
    id: 'treasure',
    name: 'Treasure Machine',
    unlockLevel: 5,
    symbols: {
      COIN:      { id: 'coin',      name: 'Gold Coin',  multiplier: 2,  weight: 30, color: '#FFD700' },
      GEM:       { id: 'gem',       name: 'Ruby',       multiplier: 3,  weight: 25, color: '#e74c3c' },
      CHEST:     { id: 'chest',     name: 'Chest',      multiplier: 5,  weight: 20, color: '#8B4513' },
      CROWN:     { id: 'crown',     name: 'Crown',      multiplier: 10, weight: 12, color: '#FFD700' },
      SAPPHIRE:  { id: 'sapphire',  name: 'Sapphire',   multiplier: 15, weight: 8,  color: '#0066cc' },
      TREASURE:  { id: 'treasure',  name: 'Treasure',   multiplier: 50, weight: 3,  color: '#FFD700' },
      WILD:      { id: 'wild',      name: 'Wild',       multiplier: 0,  weight: 2,  color: '#e74c3c' },
    }
  },
  cyber: {
    id: 'cyber',
    name: 'Cyber Machine',
    unlockLevel: 10,
    symbols: {
      CHIP:      { id: 'chip',      name: 'Chip',       multiplier: 2,  weight: 30, color: '#00d4ff' },
      DATA:      { id: 'data',      name: 'Data',       multiplier: 3,  weight: 25, color: '#00ff88' },
      ROBOT:     { id: 'robot',     name: 'Robot',      multiplier: 5,  weight: 20, color: '#888888' },
      LASER:     { id: 'laser',     name: 'Laser',      multiplier: 10, weight: 12, color: '#ff0066' },
      HOLOGRAM:  { id: 'hologram',  name: 'Hologram',   multiplier: 15, weight: 8,  color: '#aa00ff' },
      CORE:      { id: 'core',      name: 'Core',       multiplier: 50, weight: 3,  color: '#00d4ff' },
      WILD:      { id: 'wild',      name: 'Wild',       multiplier: 0,  weight: 2,  color: '#e74c3c' },
    }
  }
};

// Active machine (defaults to classic)
let activeMachineId = 'classic';

function getActiveMachine() {
  return MACHINE_DEFS[activeMachineId] || MACHINE_DEFS.classic;
}

function getActiveSymbols() {
  return getActiveMachine().symbols;
}

function getSymbolList() {
  return Object.values(getActiveSymbols());
}

function getTotalWeight() {
  return getSymbolList().reduce((sum, s) => sum + s.weight, 0);
}

function setActiveMachineId(machineId) {
  if (MACHINE_DEFS[machineId]) activeMachineId = machineId;
  return activeMachineId;
}

function getActiveMachineId() {
  return activeMachineId;
}

/** Look up a symbol across every machine (used for collection cards). */
function findSymbolById(symbolId) {
  const id = String(symbolId || '').toLowerCase();
  for (const machine of Object.values(MACHINE_DEFS)) {
    for (const symbol of Object.values(machine.symbols)) {
      if (symbol.id === id) return symbol;
    }
  }
  return null;
}

/** All unique symbol ids across every machine. */
function getAllSymbolIds() {
  const ids = [];
  Object.values(MACHINE_DEFS).forEach(machine => {
    Object.values(machine.symbols).forEach(symbol => {
      if (ids.indexOf(symbol.id) === -1) ids.push(symbol.id);
    });
  });
  return ids;
}

// Legacy exports for backwards compatibility (classic machine)
const SYMBOLS = MACHINE_DEFS.classic.symbols;
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

  // ---- Treasure machine ----
  coin(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="15" fill="${symbol.color}" stroke="#b8860b" stroke-width="2"/>
      <circle cx="20" cy="20" r="10" fill="none" stroke="#b8860b" stroke-width="1.5" opacity="0.7"/>
      <text x="20" y="26" font-size="15" font-weight="900" fill="#7a5c00" font-family="Arial" text-anchor="middle">$</text>
    </svg>`;
  },
  gem(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <polygon points="20,4 34,16 20,36 6,16" fill="${symbol.color}" stroke="#ff8a8a" stroke-width="1.5"/>
      <polygon points="20,4 27,16 20,36 13,16" fill="#ff6b6b" opacity="0.55"/>
      <line x1="6" y1="16" x2="34" y2="16" stroke="#ffd0d0" stroke-width="1" opacity="0.6"/>
    </svg>`;
  },
  chest(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <rect x="6" y="17" width="28" height="16" rx="2" fill="${symbol.color}" stroke="#5c2e0e" stroke-width="1.5"/>
      <path d="M6 17c0-6 6-9 14-9s14 3 14 9" fill="#a0522d" stroke="#5c2e0e" stroke-width="1.5"/>
      <rect x="17" y="17" width="6" height="9" rx="1" fill="${symbol.color}" stroke="#5c2e0e" stroke-width="1"/>
      <circle cx="20" cy="22" r="1.6" fill="#ffe066"/>
    </svg>`;
  },
  crown(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <path d="M5 30L3 12l9 7 8-13 8 13 9-7-2 18z" fill="${symbol.color}" stroke="#b8860b" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="20" cy="25" r="2.5" fill="#e74c3c"/>
      <circle cx="10" cy="26" r="1.8" fill="#3498db"/>
      <circle cx="30" cy="26" r="1.8" fill="#2ecc71"/>
    </svg>`;
  },
  sapphire(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <polygon points="20,4 34,14 28,34 12,34 6,14" fill="${symbol.color}" stroke="#66b3ff" stroke-width="1.5"/>
      <polygon points="20,4 27,14 20,34 13,14" fill="#4da3ff" opacity="0.6"/>
      <line x1="6" y1="14" x2="34" y2="14" stroke="#cce6ff" stroke-width="1" opacity="0.7"/>
    </svg>`;
  },
  treasure(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <rect x="5" y="19" width="30" height="15" rx="2" fill="#8B4513" stroke="#5c2e0e" stroke-width="1.5"/>
      <path d="M5 19c0-6 6-9 15-9s15 3 15 9" fill="#a0522d" stroke="#5c2e0e" stroke-width="1.5"/>
      <circle cx="13" cy="17" r="2.5" fill="${symbol.color}"/>
      <circle cx="20" cy="14" r="2.5" fill="${symbol.color}"/>
      <circle cx="27" cy="17" r="2.5" fill="${symbol.color}"/>
      <rect x="17" y="19" width="6" height="8" rx="1" fill="#FFD700"/>
    </svg>`;
  },

  // ---- Cyber machine ----
  chip(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <rect x="9" y="9" width="22" height="22" rx="3" fill="#10222e" stroke="${symbol.color}" stroke-width="2"/>
      <rect x="15" y="15" width="10" height="10" rx="1" fill="${symbol.color}" opacity="0.7"/>
      <path d="M14 9V4M20 9V4M26 9V4M14 36v-5M20 36v-5M26 36v-5M9 14H4M9 20H4M9 26H4M36 14h-5M36 20h-5M36 26h-5" stroke="${symbol.color}" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
  },
  data(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <ellipse cx="20" cy="9" rx="12" ry="5" fill="${symbol.color}" opacity="0.85"/>
      <path d="M8 9v9c0 2.8 5.4 5 12 5s12-2.2 12-5V9" fill="none" stroke="${symbol.color}" stroke-width="2"/>
      <path d="M8 18v9c0 2.8 5.4 5 12 5s12-2.2 12-5v-9" fill="none" stroke="${symbol.color}" stroke-width="2"/>
      <ellipse cx="20" cy="18" rx="12" ry="5" fill="${symbol.color}" opacity="0.35"/>
    </svg>`;
  },
  robot(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <rect x="9" y="12" width="22" height="19" rx="4" fill="#26343d" stroke="${symbol.color}" stroke-width="2"/>
      <circle cx="16" cy="20" r="2.4" fill="${symbol.color}"/>
      <circle cx="24" cy="20" r="2.4" fill="${symbol.color}"/>
      <rect x="15" y="26" width="10" height="2" rx="1" fill="${symbol.color}" opacity="0.7"/>
      <path d="M20 12V6" stroke="${symbol.color}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="20" cy="5" r="2" fill="${symbol.color}"/>
    </svg>`;
  },
  laser(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <path d="M6 34L34 6" stroke="${symbol.color}" stroke-width="4" stroke-linecap="round"/>
      <path d="M6 34L34 6" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
      <circle cx="34" cy="6" r="3" fill="${symbol.color}"/>
      <circle cx="6" cy="34" r="3" fill="${symbol.color}"/>
    </svg>`;
  },
  hologram(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <polygon points="20,4 34,12 34,28 20,36 6,28 6,12" fill="${symbol.color}" opacity="0.18" stroke="${symbol.color}" stroke-width="1.5"/>
      <polygon points="20,10 28,15 28,25 20,30 12,25 12,15" fill="${symbol.color}" opacity="0.35" stroke="${symbol.color}" stroke-width="1.2"/>
      <polygon points="20,16 24,18 24,22 20,24 16,22 16,18" fill="${symbol.color}" opacity="0.8"/>
    </svg>`;
  },
  core(symbol) {
    return `<svg viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="13" fill="none" stroke="${symbol.color}" stroke-width="2" opacity="0.5"/>
      <circle cx="20" cy="20" r="8" fill="${symbol.color}" opacity="0.25"/>
      <circle cx="20" cy="20" r="4" fill="${symbol.color}"/>
      <path d="M20 3v5M20 32v5M3 20h5M32 20h5M8 8l3.5 3.5M28.5 28.5L32 32M32 8l-3.5 3.5M11.5 28.5L8 32" stroke="${symbol.color}" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
  },
  
  render(symbolId) {
    const symbol = findSymbolById(symbolId);
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
   * Pick a random symbol based on weighted probabilities from active machine
   */
  pickSymbol() {
    const symbolList = getSymbolList();
    const totalWeight = getTotalWeight();
    let random = Math.random() * totalWeight;
    for (const symbol of symbolList) {
      random -= symbol.weight;
      if (random <= 0) return symbol.id;
    }
    return symbolList[0].id; // fallback
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
    
    // Count wilds using active machine's WILD symbol
    const wildSymbolId = Object.values(getActiveSymbols()).find(s => s.id === 'wild')?.id || 'wild';
    const wildCount = payline.filter(s => s === wildSymbolId).length;
    
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
    const nonWildSymbols = payline.filter(s => s !== wildSymbolId);
    
    // If all are wilds (already handled) or no non-wild symbols, no regular win
    if (nonWildSymbols.length === 0) {
      return { isWin: false, multiplier: 0, payout: 0, winType: 'none', winningSymbols: [], message: '' };
    }
    
    // Check if all non-wild symbols are the same
    const targetSymbol = nonWildSymbols[0];
    const allMatch = nonWildSymbols.every(s => s === targetSymbol);
    
    if (allMatch) {
      const symbol = getActiveSymbols()[targetSymbol.toUpperCase()];
      const multiplier = symbol ? symbol.multiplier : 1;
      return {
        isWin: true,
        multiplier: multiplier,
        payout: bet * multiplier,
        winType: 'regular',
        winningSymbols: payline,
        message: `${symbol ? symbol.name : targetSymbol} ${multiplier}x!`
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
   * Get symbol info by ID from the active machine
   */
  getSymbolInfo(symbolId) {
    return getActiveSymbols()[String(symbolId).toUpperCase()] || null;
  }
};

// ============================================================
// MACHINE THEME + PAYTABLE
// ============================================================

/** Update the live machine frame, badge and paytable to match the active machine. */
function applyMachineTheme() {
  if (typeof document === 'undefined') return;
  const machine = getActiveMachine();

  const frame = document.getElementById('slot-machine');
  if (frame && frame.classList) {
    frame.classList.remove('machine-classic', 'machine-treasure', 'machine-cyber');
    frame.classList.add('machine-' + machine.id);
  }

  const badge = document.getElementById('machine-name-badge');
  if (badge) badge.textContent = machine.name.toUpperCase();

  renderPaytable();
}

/** Rebuild the paytable sidebar from the active machine's symbol set. */
function renderPaytable() {
  if (typeof document === 'undefined') return;
  const table = document.querySelector('.payout-table');
  if (!table) return;

  const machine = getActiveMachine();
  const rows = Object.values(machine.symbols);
  let html = '<div class="sidebar-label">PAYTABLE</div>';

  rows.forEach(symbol => {
    const isWild = symbol.id === 'wild';
    const label = isWild ? 'Wild x3' : symbol.name;
    const value = isWild
      ? '<span class="pay-mult jackpot">JACKPOT</span>'
      : '<span class="pay-mult gold">' + symbol.multiplier + 'x</span>';
    html +=
      '<div class="pay-row">' +
      '<div class="pay-symbol-mini">' + SymbolRenderer.render(symbol.id) + '</div>' +
      '<span class="pay-name">' + label + '</span>' +
      value +
      '</div>';
  });

  table.innerHTML = html;
}

// ============================================================
// REEL ANIMATOR
// ============================================================

const ReelAnimator = {
  // Animation constants (optimized for ~2s total spin)
  SYMBOL_HEIGHT: 94, // Actual strip spacing (CSS gap 4px + symbol 90px)
  SYMBOL_GAP: 4, // CSS gap between symbols
  SYMBOL_VISIBLE_HEIGHT: 90, // symbol-slot CSS height
  ACCEL_DURATION: 180, // ms to accelerate from 0 to max speed
  DECEL_DURATION: 420, // ms to decelerate to stop
  SPINNING_DURATION: 600, // ms to maintain spinning before auto-stop
  STOP_STAGGER: 300, // ms between sequential reel stops (visible gap)
  SETTLING_DURATION: 200, // ms subtle settling after stop
  
  // Performance settings
  MAX_SPEED: 8, // pixels per frame
  ACCEL_SPEED_FACTOR: 2.5, // speed curve exponent
  WINDOW_CENTER: 55, // Center of .reel-window (110px / 2)
  
  // State
  isAnimating: false,
  animationPromises: [],
  activeReels: {},
  
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
   * Get symbol info by ID from active machine
   */
  getSymbolInfo(symbolId) {
    const symbol = getActiveSymbols()[symbolId.toUpperCase()];
    return symbol || null;
  },
  
  /**
   * Populate a reel with symbols for continuous animation
   */
  prepareReel(reelElement, outcome, reelIndex) {
    // Clear existing symbols to prevent duplicates
    reelElement.innerHTML = '';
    
    const stripSymbols = [];
    for (let i = 0; i < 5; i++) stripSymbols.push(OutcomeGenerator.pickSymbol());
    stripSymbols.push(...outcome[reelIndex]);
    for (let i = 0; i < 5; i++) stripSymbols.push(OutcomeGenerator.pickSymbol());
    
    stripSymbols.forEach(symbolId => {
      reelElement.appendChild(this.createSymbolElement(symbolId));
    });
    
    // Use SYMBOL_HEIGHT (94) for accurate strip calculation
    const stripLength = stripSymbols.length * this.SYMBOL_HEIGHT;
    
    // Calculate target offset to center the middle outcome symbol (index 6)
    // Math: scrollY + (6 * SYMBOL_HEIGHT) + (SYMBOL_HEIGHT/2) = WINDOW_CENTER
    // Solve: scrollY = WINDOW_CENTER - 6*SYMBOL_HEIGHT - SYMBOL_HEIGHT/2
    const symbolIndex = 6; // Middle outcome symbol position in strip
    const targetOffset = -(symbolIndex * this.SYMBOL_HEIGHT + this.SYMBOL_HEIGHT / 2 - this.WINDOW_CENTER);
    
    reelElement.style.transform = `translateY(${-(5 * this.SYMBOL_HEIGHT)}px)`;
    
    return { stripLength, targetOffset, totalSymbols: stripSymbols.length, targetIndex: 6 };
  },
  
  /**
   * Continuous animation loop using requestAnimationFrame
   */
  animateReel(reelElement, reelIndex, reelInfo, onComplete) {
    const state = {
      phase: this.PHASE.ACCELERATING,
      scrollY: -(5 * this.SYMBOL_HEIGHT),
      speed: 0,
      stopTriggered: false,
      decelerationStart: null,
      startTime: performance.now(),
      rafId: null
    };
    
    this.activeReels[reelIndex] = state;
    const self = this;
    const stripLength = reelInfo.stripLength;
    const targetOffset = reelInfo.targetOffset;
    
    function animateLoop() {
      const now = performance.now();
      const elapsed = now - state.startTime;
      
      switch (state.phase) {
        case self.PHASE.ACCELERATING:
          const accelT = Math.min(elapsed / self.ACCEL_DURATION, 1);
          state.speed = self.MAX_SPEED * Math.pow(accelT, self.ACCEL_SPEED_FACTOR);
          if (accelT >= 1) state.phase = self.PHASE.SPINNING;
          break;
          
        case self.PHASE.SPINNING:
          // Explicit speed control during spinning phase
          const spinT = Math.min(elapsed / 300, 1);
          state.speed = self.MAX_SPEED * spinT;
          
          // Auto-stop trigger (but sequentialStop may have already triggered)
          if (!state.stopTriggered && elapsed >= self.SPINNING_DURATION) {
            self.stopReel(reelIndex);
          }
          break;
          
        case self.PHASE.DECELERATING:
          const decelElapsed = now - state.decelerationStart;
          const decelT = Math.min(decelElapsed / self.DECEL_DURATION, 1);
          state.speed = self.MAX_SPEED * (1 - Math.pow(decelT, 1.5));
          if (decelT >= 1) {
            state.phase = self.PHASE.SETTLING;
            state.settlingStart = now;
            state.speed = 0; // Full stop before settle
          }
          break;
          
        case self.PHASE.SETTLING:
          // Subtle settling: stay near target with small random wobble
          const settleElapsed = now - state.settlingStart;
          const settleT = Math.min(settleElapsed / self.SETTLING_DURATION, 1);
          
          // Slight nudge towards target during settle, then hold
          const nudge = state.nudge || 0;
          state.nudge = Math.min(nudge + 1, 10);
          
          // Stay at target position during settle (no bouncing away)
          state.scrollY = targetOffset + Math.sin(settleT * Math.PI) * 2;
          
          if (settleT >= 1) {
            state.scrollY = targetOffset; // Exact final position
            state.phase = self.PHASE.DONE;
            state.rafId = null;
            
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
        if (state.scrollY > 0) state.scrollY -= stripLength;
      }
      
      reelElement.style.transform = `translateY(${state.scrollY.toFixed(2)}px)`;
      state.rafId = requestAnimationFrame(animateLoop);
    }
    
    state.rafId = requestAnimationFrame(animateLoop);
  },
  
  /**
   * Stop a specific reel (begin deceleration)
   * Idempotent - safe to call multiple times
   */
  stopReel(reelIndex) {
    const state = this.activeReels[reelIndex];
    if (!state || state.stopTriggered) return; // Prevent duplicate triggers
    
    state.stopTriggered = true;
    
    // Allow stop from ACCELERATING, SPINNING, or even DECELERATING (skip if already stopping)
    if (state.phase === this.PHASE.SPINNING) {
      state.phase = this.PHASE.DECELERATING;
      state.decelerationStart = performance.now();
    } else if (state.phase === this.PHASE.ACCELERATING) {
      // Transition directly to deceleration
      state.phase = this.PHASE.DECELERATING;
      state.decelerationStart = performance.now();
    }
    // If already in DECELERATING, no action needed
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
    
    const reelInfos = reelElements.map((el, index) => this.prepareReel(el, outcome, index));
    reelElements.forEach(el => el.classList.add('spinning'));
    
    // Start all reels quickly (all spin together, sequential stop comes later)
    const promises = reelElements.map((reel, index) => 
      new Promise((resolve) => {
        this.animateReel(reel, index, reelInfos[index], resolve);
      })
    );
    this.animationPromises = promises;
    
    // Sequential stopping: stop reel 0, wait briefly, then stop reel 1, etc.
    this.sequentialStop(reelElements, outcome);
    
    try {
      await Promise.all(promises);
    } finally {
      this.isAnimating = false;
      this.animationPromises = [];
    }
  },
  
  /**
   * Sequential stop: decelerate reels in order (0 → 1 → 2)
   * Each reel: stop → decelerate (420ms) → settle (200ms) → delay (300ms) → next
   */
  sequentialStop(reelElements) {
    const self = this;
    
    const stopOne = (index, delayMs) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const state = self.activeReels[index];
          
          // If reel already done, skip to next
          if (!state || state.phase === self.PHASE.DONE) {
            resolve();
            return;
          }
          
          // Stop this reel (begin deceleration)
          self.stopReel(index);
          
          // Wait for this reel to fully complete (DONE phase)
          const pollCompletion = () => {
            const s = self.activeReels[index];
            if (!s || s.phase === self.PHASE.DONE) {
              resolve();
            } else {
              setTimeout(pollCompletion, 25);
            }
          };
          setTimeout(pollCompletion, 50);
        }, delayMs);
      });
    };
    
    const stopAll = async () => {
      // Stop reel 0 immediately
      await stopOne(0, 0);
      
      // Stop reel 1 after 500ms (enough for reel 0 to be in stop phase)
      await stopOne(1, 500);
      
      // Stop reel 2 after 1000ms (ensures clear sequential gap)
      await stopOne(2, 1000);
    };
    
    stopAll();
  },
  
  /**
   * Stop all animations immediately (for emergency stop)
   */
  stopAll() {
    Object.keys(this.activeReels).forEach(idx => {
      const state = this.activeReels[idx];
      if (state && state.rafId) cancelAnimationFrame(state.rafId);
    });
    
    document.querySelectorAll('.reel').forEach(r => r.classList.remove('spinning', 'settling'));
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
  spinSerial: 0, // Stage 4: unique token per completed spin (dedup guard for progression)
  
  // Callbacks
  onSpinStart: null,
  onReelStop: null,
  onSpinComplete: null,
  onSpinStateChange: null, // fired whenever the spin lock toggles
  
  /**
   * Initialize the slot machine
   */
  init() {
    this.bindUI();
    this.updateDisplay();
    // Apply the default (or restored) machine theme/paytable
    applyMachineTheme();
  },
  
  /**
   * UI event wiring is owned by main.js (Stage 3 integration) so each control
   * has exactly one handler. Kept as a no-op hook for init().
   */
  bindUI() {
    // Intentionally empty — see main.js initSlotMachine().
  },
  
  /**
   * Handle spin button click
   */
  async handleSpin() {
    if (this.isSpinning) return;

    // Stage 4: per-spin token (prevents duplicate progression awards)
    this.spinSerial += 1;

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
      
      // Stage 4: spinSerial passed for progression dedup
      if (this.onSpinComplete) this.onSpinComplete(payoutResult, this.spinSerial);
      
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
    if (this.onSpinStateChange) this.onSpinStateChange(Boolean(disabled));
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
    const min = (window.Economy && window.Economy.MIN_BET) || 10;
    const max = (window.Economy && window.Economy.MAX_BET) || 100;
    this.setBet(Math.max(min, Math.min(max, this.currentBet + delta)));
  },

  /**
   * Set bet to specific amount, clamped to the economy's real limits.
   */
  setBet(amount) {
    const min = (window.Economy && window.Economy.MIN_BET) || 10;
    const max = (window.Economy && window.Economy.MAX_BET) || 100;
    this.currentBet = Math.max(min, Math.min(max, amount));
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
  },

  /**
   * Switch to a different machine. Validation and persistence live in
   * Progression (the owner of saved state); this method only delegates.
   * @param {string} machineId - 'classic' | 'treasure' | 'cyber'
   * @returns {boolean} true when the machine was selected
   */
  switchMachine(machineId) {
    if (!MACHINE_DEFS[machineId]) return false;
    if (window.Progression && typeof window.Progression.selectMachine === 'function') {
      return window.Progression.selectMachine(machineId);
    }

    // Fallback used only if Progression is unavailable (e.g. isolated tests)
    const level = 1;
    if (level < MACHINE_DEFS[machineId].unlockLevel) {
      if (typeof showToast === 'function') {
        showToast('Reach level ' + MACHINE_DEFS[machineId].unlockLevel + ' to unlock this machine', 3000);
      }
      return false;
    }
    this.applyMachine(machineId);
    return true;
  },

  /**
   * Apply a machine to the live game view (theme, badge, paytable).
   * Progression calls this after restoring/selecting a machine.
   */
  applyMachine(machineId) {
    setActiveMachineId(machineId);
    applyMachineTheme();
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
window.MACHINE_DEFS = MACHINE_DEFS;
window.OutcomeGenerator = OutcomeGenerator;
window.PayoutCalculator = PayoutCalculator;
window.ReelAnimator = ReelAnimator;
window.SymbolRenderer = SymbolRenderer;
window.TestRunner = TestRunner;
window.getActiveMachineId = getActiveMachineId;
window.setActiveMachineId = setActiveMachineId;
window.findSymbolById = findSymbolById;
window.getAllSymbolIds = getAllSymbolIds;
window.applyMachineTheme = applyMachineTheme;
window.renderPaytable = renderPaytable;

// Auto-run tests in development (can be removed in production)
// TestRunner.runPayoutTests();
// TestRunner.testSymbolRendering();
// TestRunner.testOutcomeGeneration();