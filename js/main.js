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

  // Stage 5: refresh machine/mission state when navigating (handles date change)
  if (window.Progression && window.Progression.state) {
    window.Progression.updateUI();
  }
}

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    playUiClick();
    showSection(btn.dataset.section);
  });
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

// ---- Audio controls ----
const MUTED_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;
const SOUND_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

function audioPreferences() {
  const state = window.Progression && window.Progression.state;
  if (!state) return null;
  if (!state.audio) state.audio = { muted: false, volume: 0.45 };
  return state.audio;
}

function saveAudioPreferences() {
  if (window.Progression && typeof window.Progression.save === 'function') {
    window.Progression.save();
  }
}

function refreshAudioUI() {
  const audio = window.AudioSystem;
  const btn = document.getElementById('mute-btn');
  const slider = document.getElementById('volume-slider');
  const label = document.getElementById('volume-value');
  if (!audio) return;
  if (btn) {
    btn.innerHTML = audio.isMuted() ? MUTED_ICON : SOUND_ICON;
    btn.style.color = audio.isMuted() ? 'var(--red)' : '';
    btn.setAttribute('aria-label', audio.isMuted() ? 'Unmute sound' : 'Mute sound');
    btn.title = audio.isMuted() ? 'Unmute sound' : 'Mute sound';
  }
  if (slider) slider.value = String(Math.round(audio.getVolume() * 100));
  if (label) label.textContent = audio.isMuted() ? 'MUTED' : Math.round(audio.getVolume() * 100) + '%';
}

const muteBtn = document.getElementById('mute-btn');
if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    // The first interaction also unlocks the AudioContext.
    if (window.AudioSystem) {
      window.AudioSystem.unlock();
      const next = !window.AudioSystem.isMuted();
      window.AudioSystem.setMuted(next);
      const prefs = audioPreferences();
      if (prefs) prefs.muted = next;
      saveAudioPreferences();
      refreshAudioUI();
      showToast(next ? 'Sound muted' : 'Sound on');
    }
  });
}

const volumeSlider = document.getElementById('volume-slider');
if (volumeSlider) {
  volumeSlider.addEventListener('input', () => {
    if (!window.AudioSystem) return;
    window.AudioSystem.unlock();
    const volume = Number(volumeSlider.value) / 100;
    window.AudioSystem.setVolume(volume);
    const prefs = audioPreferences();
    if (prefs) {
      prefs.volume = volume;
      if (volume > 0 && window.AudioSystem.isMuted()) {
        window.AudioSystem.setMuted(false);
        prefs.muted = false;
      }
    }
    saveAudioPreferences();
    refreshAudioUI();
  });
  volumeSlider.addEventListener('change', () => {
    if (window.AudioSystem && !window.AudioSystem.isMuted()) {
      window.AudioSystem.buttonClick();
    }
  });
}

// One-time unlock on the first user gesture anywhere in the document.
function installAudioUnlock() {
  if (document._audioUnlockInstalled) return;
  document._audioUnlockInstalled = true;
  const unlock = () => {
    if (window.AudioSystem) window.AudioSystem.unlock();
    refreshAudioUI();
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
}
installAudioUnlock();

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

/** Play a subtle UI click, unlocking audio on the first interaction. */
function playUiClick() {
  if (!window.AudioSystem) return;
  window.AudioSystem.unlock();
  window.AudioSystem.buttonClick();
}

// ---- Slot Machine Integration ----
function initSlotMachine() {
  // Ensure SlotMachine is available
  if (!window.SlotMachine) {
    console.error('SlotMachine not loaded!');
    return;
  }
  
  // Wire spin button with economy integration (Stage 3)
  document.getElementById('spin-btn').addEventListener('click', () => {
    playUiClick();
    handleSpinClick();
  });
  
  // Wire STOP button
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.addEventListener('click', handleStopClick);
  }
  
  // Wire bet controls (single handler per control). Wrap in an arrow so the
  // handler runs on click, not at wiring time (the control id is captured).
  ['bet-up', 'bet-down', 'bet-min', 'bet-max'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        if (!btn.disabled) playUiClick();
        handleBetControlClick(id);
      });
    }
  });
  BetControls.bindUI();
  
  // ---- Machine Selection ----
  // Handle machine card clicks. switchMachine validates the lock state.
  document.querySelectorAll('.machine-card').forEach(card => {
    card.addEventListener('click', () => {
      const machineId = card.dataset.machine;
      if (machineId) {
        playUiClick();
        SlotMachine.switchMachine(machineId);
      }
    });
  });
  
  // Set up callbacks
  SlotMachine.onSpinStart = (outcome, payoutResult) => {
    if (payoutResult.winType === 'jackpot') {
      document.getElementById('slot-machine').classList.add('anticipation');
    }
    if (window.AudioSystem) window.AudioSystem.spinStart();
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
    // Audio follows the real left-to-right reel stop events
    if (window.AudioSystem) window.AudioSystem.reelStop(reelIndex);
  };
  
  SlotMachine.onSpinComplete = (payoutResult, spinSerial) => {
    document.getElementById('slot-machine').classList.remove('anticipation');

    // Exactly one result sound: jackpot wins never also fire the win sound.
    if (window.AudioSystem) {
      if (payoutResult.isWin) {
        if (payoutResult.winType === 'jackpot') window.AudioSystem.jackpot();
        else window.AudioSystem.win();
      } else {
        window.AudioSystem.loss();
      }
      window.AudioSystem.stopReel(); // safety: loop must not outlive the spin
    }

    // Stage 4: progression events (XP, levels, achievements, collections)
    if (window.Progression) {
      window.Progression.onSpinComplete(payoutResult, SlotMachine.lastOutcome, spinSerial);
    }

    if (payoutResult.isWin) {
      if (payoutResult.winType === 'jackpot') {
        showToast('JACKPOT! ' + payoutResult.payout.toLocaleString() + ' COINS!', 4000);
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
  
  // Refresh bet-control lock/disabled state whenever a spin starts or ends
  SlotMachine.onSpinStateChange = () => {
    if (typeof BetControls !== 'undefined') BetControls.updateUI();
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

  // Initialize betting controls (display, boundaries, increment indicator)
  BetControls.updateUI();

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
  playUiClick();
  // Stop both the current spin and the auto-spin workflow
  if (autoSpinActive) stopAutoSpin('Auto-spin stopped');
  SlotMachine.stopAllReels();
}

/**
 * BetControls — owns the configurable +/- increment and bet-boundary UI.
 * The increment is stored in Progression.state so it uses the existing
 * LocalStorage save system; no separate persistence is created here.
 * Actual bet limits always come from Economy (MIN_BET / MAX_BET).
 */
const BetControls = {
  DEFAULT_INCREMENT: 10,
  _bound: false,

  /** Positive integer validation. Returns a number, or null when invalid. */
  normalizeIncrement(value) {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
    return n;
  },

  getIncrement() {
    const state = window.Progression && window.Progression.state;
    const value = state ? state.betIncrement : this.DEFAULT_INCREMENT;
    return this.normalizeIncrement(value) || this.DEFAULT_INCREMENT;
  },

  /** Set the increment without changing the current bet. */
  setIncrement(value) {
    const normalized = this.normalizeIncrement(value);
    if (normalized === null) {
      this._markCustomInvalid(true);
      showToast('Increment must be a positive whole number', 2200);
      return false;
    }
    this._markCustomInvalid(false);
    if (window.Progression && window.Progression.state) {
      window.Progression.state.betIncrement = normalized;
      window.Progression.save();
    }
    this.updateUI();
    return true;
  },

  _markCustomInvalid(invalid) {
    const input = document.getElementById('increment-custom');
    if (input && input.classList) input.classList.toggle('invalid', Boolean(invalid));
  },

  /** True when bet changes must be blocked (spin or auto-spin in progress). */
  isLocked() {
    return SlotMachine.isSpinning ||
      (window.Economy && window.Economy.hasPendingSpin()) ||
      autoSpinActive;
  },

  /** Refresh bet display, boundary disabled states and increment indicator. */
  updateUI() {
    const min = window.Economy ? window.Economy.MIN_BET : 10;
    const max = window.Economy ? window.Economy.MAX_BET : 100;
    const bet = SlotMachine.currentBet;
    const locked = this.isLocked();

    const setDisabled = (id, disabled) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = Boolean(disabled);
    };
    setDisabled('bet-min', locked || bet <= min);
    setDisabled('bet-max', locked || bet >= max);
    setDisabled('bet-down', locked || bet <= min);
    setDisabled('bet-up', locked || bet >= max);

    const amount = document.getElementById('bet-amount');
    if (amount) amount.textContent = bet;

    const inc = this.getIncrement();
    const current = document.getElementById('increment-current');
    if (current) current.textContent = inc;
    document.querySelectorAll('.increment-btn[data-increment]').forEach(btn => {
      const isActive = Number(btn.dataset.increment) === inc;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  },

  /** Bind increment preset, custom input and apply listeners exactly once. */
  bindUI() {
    if (this._bound) return;
    this._bound = true;

    document.querySelectorAll('.increment-btn[data-increment]').forEach(btn => {
      btn.addEventListener('click', () => {
        playUiClick();
        this.setIncrement(btn.dataset.increment);
      });
    });

    const applyBtn = document.getElementById('increment-apply');
    if (applyBtn) applyBtn.addEventListener('click', () => {
      playUiClick();
      const input = document.getElementById('increment-custom');
      this.setIncrement(input ? input.value : '');
    });

    const input = document.getElementById('increment-custom');
    if (input) {
      const commit = () => {
        if (input.value === '') { this._markCustomInvalid(true); return; }
        this.setIncrement(input.value);
      };
      input.addEventListener('change', commit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
      });
    }
  }
};

function handleBetControlClick(controlId) {
  if (BetControls.isLocked()) {
    return; // Block bet changes during spin, pending transaction or auto-spin
  }

  const min = window.Economy ? window.Economy.MIN_BET : 10;
  const max = window.Economy ? window.Economy.MAX_BET : 100;
  const currentBet = SlotMachine.currentBet;
  const increment = BetControls.getIncrement();
  let newBet;

  switch (controlId) {
    case 'bet-up':
      newBet = Math.min(max, currentBet + increment);
      break;
    case 'bet-down':
      newBet = Math.max(min, currentBet - increment);
      break;
    case 'bet-min':
      newBet = min; // MIN/MAX ignore the increment and use real limits
      break;
    case 'bet-max':
      newBet = max;
      break;
    default:
      return;
  }

  if (window.Economy) {
    newBet = window.Economy.clampBet(newBet);
  }
  newBet = Math.max(min, Math.min(max, Math.floor(newBet)));

  SlotMachine.setBet(newBet);
  BetControls.updateUI();
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
  if (window.AudioSystem) window.AudioSystem.buttonClick();
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
  if (typeof BetControls !== 'undefined') BetControls.updateUI();
}

function stopAutoSpin(message) {
  if (autoSpinTimer) {
    clearInterval(autoSpinTimer);
    autoSpinTimer = null;
  }
  autoSpinActive = false;
  autoSpinsRemaining = 0;
  // Mid-spin STOP is handled by SlotMachine.stopAllReels(); here we only make
  // sure no continuous loop survives if auto-spin ends between spins.
  if (window.AudioSystem && !SlotMachine.isSpinning) window.AudioSystem.stopReel();
  updateAutoStopUI();
  if (typeof BetControls !== 'undefined') BetControls.updateUI();
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
  autoBtn.addEventListener('click', () => {
    playUiClick();
    startAutoSpin();
  });
}

// Wire up auto +/- buttons
const autoUp = document.getElementById('auto-up');
const autoDown = document.getElementById('auto-down');
const autoAmount = document.getElementById('auto-amount');

if (autoUp) {
  autoUp.addEventListener('click', () => {
    playUiClick();
    if (autoAmount) {
      const val = Math.min(50, parseInt(autoAmount.textContent) + 5);
      autoAmount.textContent = val;
      autoSpinsRemaining = val;
    }
  });
}
if (autoDown) {
  autoDown.addEventListener('click', () => {
    playUiClick();
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

// Expose for tests / other modules (same pattern as game-logic.js exports)
if (typeof window !== 'undefined') {
  window.BetControls = BetControls;
}
