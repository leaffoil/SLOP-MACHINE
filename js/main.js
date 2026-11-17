/**
 * main.js — Stage 1: Navigation & UI Shell
 * No game logic yet. Handles:
 *   - Section switching
 *   - Toast notifications
 *   - Modal dialogs
 *   - Mute button toggle (UI only)
 *   - Placeholder display values
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

// ---- Spin button (placeholder — wired in Stage 2) ----
document.getElementById('spin-btn').addEventListener('click', () => {
  showToast('Spin logic coming in Stage 2!');
});

// ---- Init ----
showSection('game');
showToast('Welcome to Neon Arcade Slots!', 3000);
