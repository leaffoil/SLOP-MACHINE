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
  
  // Set up callbacks
  SlotMachine.onSpinStart = (outcome, payoutResult) => {
    // Could add screen shake or other effects here
    if (payoutResult.winType === 'jackpot') {
      // Pre-trigger jackpot excitement
      document.getElementById('slot-machine').classList.add('anticipation');
    }
  };
  
  SlotMachine.onReelStop = (reelIndex, outcome) => {
    // Could add individual reel stop sound/effect here
    const chromeLights = document.querySelectorAll('.chrome-light');
    if (chromeLights[reelIndex]) {
      chromeLights[reelIndex].classList.add('on');
      setTimeout(() => chromeLights[reelIndex].classList.remove('on'), 200);
    }
  };
  
  SlotMachine.onSpinComplete = (payoutResult) => {
    document.getElementById('slot-machine').classList.remove('anticipation');
    
    // Show toast for wins
    if (payoutResult.isWin) {
      if (payoutResult.winType === 'jackpot') {
        showToast('🎰 JACKPOT! ' + payoutResult.payout.toLocaleString() + ' COINS!', 4000);
      } else {
        showToast('WIN! ' + payoutResult.message + ' +' + payoutResult.payout.toLocaleString(), 3000);
      }
    }
    
    // Update session stats (placeholder for Stage 3)
    updateSessionStats(payoutResult);
  };
  
  // Initialize the slot machine
  SlotMachine.init();
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
