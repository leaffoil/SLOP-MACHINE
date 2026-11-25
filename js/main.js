/**
 * main.js — Stage 2: Navigation, UI Shell & Game Integration
 * Handles:
 *   - Section switching
 *   - Toast notifications
 *   - Modal dialogs
 *   - Mute button toggle (UI only)
 *   - Slot Machine integration
 */

'use strict';

// ---- Navigation ----
const navBtns = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.section');

function showSection(id) {
  sections.forEach(s => s.classList.remove('active'));
  navBtns.forEach(b => b.classList.remove('active'));

  const target = document.getElementById('section-' + id);
  if (target) target.classList.add('active');

  const btn = document.querySelector(`.nav-btn[data-section="${id}"]`);
  if (btn) btn.classList.add('active');
}

navBtns.forEach(btn => {
  btn.addEventListener('click', () => showSection(btn.dataset.section));
});

// ---- Toast ----
let toastTimer = null;
function showToast(message, duration = 2800) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ---- Modal ----
function showModal(title, body, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('modal-overlay').classList.add('show');

  const confirmBtn = document.getElementById('modal-confirm');
  const cancelBtn  = document.getElementById('modal-cancel');

  function cleanup() {
    document.getElementById('modal-overlay').classList.remove('show');
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', cleanup);
  }

  function handleConfirm() {
    cleanup();
    if (typeof onConfirm === 'function') onConfirm();
  }

  confirmBtn.addEventListener('click', handleConfirm);
  cancelBtn.addEventListener('click', cleanup);
}

// ---- Mute toggle (UI only — wired to Audio in Stage 6) ----
let muted = false;
const muteBtn = document.getElementById('mute-btn');
muteBtn.addEventListener('click', () => {
  muted = !muted;
  if (muted) {
    muteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
    muteBtn.style.color = 'var(--red)';
    showToast('Sound muted');
  } else {
    muteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
    muteBtn.style.color = '';
    showToast('Sound on');
  }
});

// ---- Prestige button (placeholder — wired in Stage 5) ----
document.getElementById('prestige-btn').addEventListener('click', () => {
  showModal(
    'Prestige',
    'Prestige resets your level but grants permanent rewards and badges. This feature will be fully enabled in a later stage.',
    () => showToast('Prestige coming soon!')
  );
});

// ---- Reset button (placeholder — wired in Stage 7) ----
document.getElementById('reset-btn').addEventListener('click', () => {
  showModal(
    'Reset Progress',
    'This will permanently reset all your progress, coins, achievements, and collections. This action cannot be undone. Are you sure?',
    () => showToast('Reset coming soon!')
  );
});

// ---- Slot Machine Integration ----
function initSlotMachine() {
  // Ensure SlotMachine is available
  if (!window.SlotMachine) {
    console.error('SlotMachine not loaded!');
    return;
  }
  
  // Wire spin button with economy integration (Stage 3)
  document.getElementById('spin-btn').addEventListener('click', handleSpinClick);
  
  // Wire STOP button
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.addEventListener('click', handleStopClick);
  }
  
  // Wire bet controls (Stage 3 integration)
  ['bet-up', 'bet-down', 'bet-min', 'bet-max'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', handleBetControlClick(id));
    }
  });
  
  // Set up callbacks
  SlotMachine.onSpinStart = (outcome, payoutResult) => {
    if (payoutResult.winType === 'jackpot') {
      document.getElementById('slot-machine').classList.add('anticipation');
    }
    // Wire to economy - bet deduction happens here (Stage 3)
    if (window.Economy) {
      window.Economy.beginSpin(SlotMachine.currentBet);
    }
  };
  
  SlotMachine.onReelStop = (reelIndex, outcome) => {
    const chromeLights = document.querySelectorAll('.chrome-light');
    if (chromeLights[reelIndex]) {
      chromeLights[reelIndex].classList.add('on');
      setTimeout(() => chromeLights[reelIndex].classList.remove('on'), 200);
    }
  };
  
  SlotMachine.onSpinComplete = (payoutResult, spinSerial) => {
    document.getElementById('slot-machine').classList.remove('anticipation');

    // Stage 4: progression events (XP, levels, achievements, collections)
    if (window.Progression) {
      window.Progression.onSpinComplete(payoutResult, SlotMachine.lastOutcome, spinSerial);
    }

    if (payoutResult.isWin) {
      if (payoutResult.winType === 'jackpot') {
        showToast('🎰 JACKPOT! ' + payoutResult.payout.toLocaleString() + ' COINS!', 4000);
      } else {
        showToast('WIN! ' + payoutResult.message + ' +' + payoutResult.payout.toLocaleString(), 3000);
      }
    }
    
    // Update session stats via Economy (Stage 3)
    if (window.Economy) {
      window.Economy.completeSpin(payoutResult);
    } else {
      updateSessionStats(payoutResult);
    }
    
    // Update STOP button visibility
    updateAutoStopUI();
  };
  
  // Handle errors
  SlotMachine.onError = (error) => {
    console.error('Spin error:', error);
    if (window.Economy && error.type === 'spin-error' && window.Economy.hasPendingSpin()) {
      window.Economy.refundSpin();
    }
  };
  
  // Initialize the slot machine
  SlotMachine.init();
  
  // Update initial balance display
  if (window.Economy) {
    window.Economy.updateBalanceDisplay();
    window.Economy.updateStatsDisplay();
  }
}

// Handlers for click events with economy integration
function handleSpinClick() {
  if (!window.Economy || window.Economy.hasPendingSpin()) {
    // Allow spinning if economy isn't loaded or already spinning
    if (!window.Economy) {
      SlotMachine.handleSpin();
    }
    return;
  }
  
  // Check affordability before spinning
  const bet = SlotMachine.currentBet;
  if (!window.Economy.canAfford(bet)) {
    showToast('Insufficient funds for this bet', 2000);
    return;
  }
  
  SlotMachine.handleSpin();
}

function handleStopClick() {
  // Stop both spinning and auto-spin
  SlotMachine.stopAllReels();
}

function handleBetControlClick(controlId) {
  if (!window.Economy || SlotMachine.isSpinning) {
    return; // Block bet changes during spin
  }
  
  if (window.Economy && window.Economy.hasPendingSpin()) {
    return; // Block bet changes during active spin transaction
  }
  
  const currentBet = SlotMachine.currentBet;
  let newBet;
  
  switch (controlId) {
    case 'bet-up':
      newBet = currentBet + 10;
      break;
    case 'bet-down':
      newBet = currentBet - 10;
      break;
    case 'bet-min':
      newBet = 10;
      break;
    case 'bet-max':
      newBet = 100;
      break;
    default:
      return;
  }
  
  if (window.Economy) {
    newBet = window.Economy.clampBet(newBet);
  }
  
  SlotMachine.setBet(newBet);
}

// Auto-spin management
let autoSpinTimer = null;
let autoSpinActive = false;
let autoSpinsRemaining = 10;

function startAutoSpin() {
  if (autoSpinActive || SlotMachine.isSpinning) return;
  
  const spinCountEl = document.getElementById('auto-amount');
  const spins = parseInt(spinCountEl?.textContent || '10');
  
  if (!window.Economy || !window.Economy.canAfford(SlotMachine.currentBet) && spins > 0) {
    showToast('Insufficient funds to start auto-spin', 2000);
    return;
  }
  
  autoSpinActive = true;
  autoSpinsRemaining = spins;
  autoSpinTimer = setInterval(() => {
    if (!SlotMachine.isSpinning && autoSpinsRemaining > 0) {
      if (window.Economy && !window.Economy.canAfford(SlotMachine.currentBet)) {
        stopAutoSpin('Funds insufficient for further spins');
        return;
      }
      SlotMachine.handleSpin();
      autoSpinsRemaining--;
      
      if (autoSpinsRemaining <= 0) {
        stopAutoSpin('Auto-spin complete');
      } else {
        updateAutoDisplay();
      }
    }
  }, 3000); // 3-second interval
  
  updateAutoStopUI();
}

function stopAutoSpin(message) {
  if (autoSpinTimer) {
    clearInterval(autoSpinTimer);
    autoSpinTimer = null;
  }
  autoSpinActive = false;
  autoSpinsRemaining = 0;
  updateAutoStopUI();
  if (message) showToast(message, 2000);
}

function updateAutoDisplay() {
  const el = document.getElementById('auto-amount');
  if (el) el.textContent = autoSpinsRemaining;
}

function updateAutoStopUI() {
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.style.display = (autoSpinActive || SlotMachine.isSpinning) ? 'inline-flex' : 'none';
  }
}

// Wire up AUTO button
const autoBtn = document.getElementById('auto-btn');
if (autoBtn) {
  autoBtn.addEventListener('click', startAutoSpin);
}

// Wire up auto +/- buttons
const autoUp = document.getElementById('auto-up');
const autoDown = document.getElementById('auto-down');
const autoAmount = document.getElementById('auto-amount');

if (autoUp) {
  autoUp.addEventListener('click', () => {
    if (autoAmount) {
      const val = Math.min(50, parseInt(autoAmount.textContent) + 5);
      autoAmount.textContent = val;
      autoSpinsRemaining = val;
    }
  });
}
if (autoDown) {
  autoDown.addEventListener('click', () => {
    if (autoAmount) {
      const val = Math.max(5, parseInt(autoAmount.textContent) - 5);
      autoAmount.textContent = val;
      autoSpinsRemaining = val;
    }
  });
}

function updateSessionStats(payoutResult) {
  // Placeholder for Stage 3 session tracking
  const spinsEl = document.getElementById('sess-spins');
  const winsEl = document.getElementById('sess-wins');
  const bestEl = document.getElementById('sess-best');
  
  if (spinsEl) {
    const spins = parseInt(spinsEl.textContent || '0') + 1;
    spinsEl.textContent = spins;
  }
  if (payoutResult.isWin && winsEl) {
    const wins = parseInt(winsEl.textContent || '0') + 1;
    winsEl.textContent = wins;
  }
  if (payoutResult.isWin && bestEl) {
    const best = Math.max(parseInt(bestEl.textContent || '0'), payoutResult.payout);
    bestEl.textContent = best.toLocaleString();
  }
}

// Keyboard support: Space to spin
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.matches('input, textarea, button')) {
    e.preventDefault();
    if (!SlotMachine.isSpinning) {
      document.getElementById('spin-btn').click();
    }
  }
});

// ---- Init ----
showSection('game');
showToast('Welcome to Neon Arcade Slots!', 3000);

// Initialize slot machine after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSlotMachine);
} else {
  initSlotMachine();
}
