/**
 * main.js — Grappie AI Interview Coach
 *
 * Responsibilities:
 *  - App initialization and global state
 *  - Page routing (showPage, goHome, handleRestart)
 *  - Theme toggle (light/dark mode)
 *  - Grappie character animations (eyes, blink, bounce, talking)
 *  - Modal and notification utilities
 *  - Setup option handlers (duration, interview type, roast mode)
 *  - Space bar shortcut for mic toggle
 *
 * Depends on: api.js, interview.js, resumeParser.js, timer.js
 */

'use strict';

// =============================================================================
// GLOBAL STATE
// =============================================================================
// Single source of truth for all application state.
// Mutated directly by the various modules — no framework needed at this scale.
const state = {
  // Setup
  resumeText: '',
  apiKey: '',
  model: 'deepseek/deepseek-chat',
  interviewType: 'Technical',
  targetRole: '',
  targetCompany: '',
  duration: 15,
  roastMode: false,
  cameraEnabled: false,

  // Interview session
  questions: [],
  currentQ: 0,
  answers: [],
  interviewLog: [],

  // Timer handles
  timerInterval: null,
  thinkInterval: null,
  totalSeconds: 0,
  remainingSeconds: 0,

  // Media
  isRecording: false,
  recognition: null,
  stream: null,

  // Face simulation metrics
  faceMetrics: { confidence: 0, nervousness: 0, focus: 0 },
  metricInterval: null,

  /**
   * CRITICAL: Master stop flag.
   * Set to false before stopping everything to prevent background question
   * loading (from async generateQuestions / loadQuestion chain) from
   * restarting after the interview has ended.
   */
  interviewActive: false,
};

// =============================================================================
// THEME TOGGLE
// =============================================================================
let isDark = false;
document.getElementById('theme-toggle').addEventListener('click', () => {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.getElementById('icon-sun').style.display  = isDark ? 'none'  : 'block';
  document.getElementById('icon-moon').style.display = isDark ? 'block' : 'none';
});

// =============================================================================
// PAGE ROUTING
// =============================================================================

/**
 * Navigate to a named page.
 * Shows/hides the floating camera bubble based on interview state.
 * @param {string} name - One of: 'landing' | 'setup' | 'interview' | 'report'
 */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');

  // Show restart button only during active session
  document.getElementById('nav-restart').style.display =
    (name === 'interview' || name === 'report') ? 'flex' : 'none';

  // Show floating camera bubble only during the interview itself
  const cb = document.getElementById('cam-bubble-float');
  if (cb) cb.classList.toggle('show', name === 'interview' && state.cameraEnabled);

  window.scrollTo(0, 0);
}

/**
 * Navigate home, prompting for confirmation if an interview is in progress.
 */
function goHome() {
  const onInterview = document.getElementById('page-interview').classList.contains('active');
  if (onInterview && state.interviewActive) {
    if (!confirm('End the interview and go home?')) return;
  }
  fullStop();
  showPage('landing');
}

/**
 * Restart button handler — resets setup page and navigates there.
 */
function handleRestart() {
  if (confirm('Reset and start over?')) {
    fullStop();
    resetSetupUI();
    showPage('setup');
  }
}

/**
 * Emergency stop — kills ALL active processes.
 * Called before navigating away from the interview page.
 */
function fullStop() {
  state.interviewActive = false; // MUST be first — prevents re-entry
  stopTimer();
  stopMic();
  stopCamera();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  clearInterval(state.metricInterval);
  state.metricInterval = null;

  // Reset interview UI for next session
  document.getElementById('loading-interview').classList.remove('hidden');
  document.getElementById('interview-ui').classList.add('hidden');
  document.getElementById('loading-progress').style.width = '0%';
  const rb = document.getElementById('roast-badge-wrap');
  if (rb) rb.classList.add('hidden');
}

/**
 * Reset the setup page permission UI after ending an interview.
 */
function resetSetupUI() {
  const permReq   = document.getElementById('perm-request');
  const permGrant = document.getElementById('perm-granted');
  if (permReq)   permReq.classList.remove('hidden');
  if (permGrant) permGrant.classList.add('hidden');
  document.getElementById('perm-cam-status').textContent = 'Not granted';
  document.getElementById('perm-mic-status').textContent = 'Not granted';
  document.getElementById('perm-cam-icon').style.color = 'var(--muted)';
  document.getElementById('perm-mic-icon').style.color = 'var(--muted)';
  state.cameraEnabled = false;
  state.stream = null;
}

// =============================================================================
// GRAPPIE CHARACTER ANIMATIONS
// =============================================================================

/** Landing page speech bubble messages, rotated every 4.5 seconds */
const bubbleMessages = [
  "Hey, I'm Grappie.",
  "Upload your resume and let's go.",
  "Got your OpenRouter key?",
  "I'm ready when you are.",
  "Your resume better be ready.",
  "I roast resumes too.",
  "Let's get this interview started.",
  "I've seen a lot of resumes. Make yours count.",
  "Nervous? That's fine. I work with that.",
  "BYOK — Bring Your Own Key. Smart.",
];
let bubbleIdx = 0;

function rotateBubble() {
  const bubble = document.getElementById('speech-bubble');
  if (!bubble) return;
  // Show typing dots, then reveal new message after short delay
  bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
  setTimeout(() => {
    bubble.textContent = bubbleMessages[bubbleIdx];
    bubbleIdx = (bubbleIdx + 1) % bubbleMessages.length;
  }, 900);
}
rotateBubble();
setInterval(rotateBubble, 4500);

/** Continuous eye orbit animation — runs on all Grappie instances on the page */
let eyeAngle = 0;
function animateEyes() {
  eyeAngle += 0.018;
  const x = Math.sin(eyeAngle) * 4;
  const y = Math.cos(eyeAngle * 0.7) * 2.5;
  ['pupil-left', 'pupil-right', 'pupil-sm-left', 'pupil-sm-right'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.transform = `translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;
  });
  requestAnimationFrame(animateEyes);
}
animateEyes();

/** Random blink interval — feels natural when not synchronized */
function scheduleBlink() {
  const delay = 2500 + Math.random() * 3000;
  setTimeout(() => {
    ['eye-left', 'eye-right', 'eye-sm-left', 'eye-sm-right'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('blink');
        setTimeout(() => el.classList.remove('blink'), 120);
      }
    });
    scheduleBlink();
  }, delay);
}
scheduleBlink();

/**
 * Toggle Grappie's "talking" CSS animation on all face instances.
 * @param {boolean} talking
 */
function setGrappieTalking(talking) {
  ['grappie-face', 'grappie-sm'].forEach(id => {
    const f = document.getElementById(id);
    if (f) talking ? f.classList.add('talking') : f.classList.remove('talking');
  });
}

// =============================================================================
// MODAL HELPERS
// =============================================================================
function openModal(id)  { document.getElementById(id).classList.add('open');    }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal when clicking the backdrop
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

// =============================================================================
// NOTIFICATIONS
// =============================================================================
let notifTimeout = null;

/**
 * Show a toast notification.
 * @param {string} msg
 * @param {'success'|'error'|'info'} type
 * @param {number} duration - milliseconds before auto-dismiss
 */
function notify(msg, type = 'success', duration = 3200) {
  const n = document.getElementById('notif');
  const icons = { success: '✓', error: '✕', info: 'i' };
  document.getElementById('notif-text').textContent  = msg;
  document.getElementById('notif-icon').textContent  = icons[type] || 'i';
  n.className = 'notif show ' + type;
  clearTimeout(notifTimeout);
  notifTimeout = setTimeout(() => n.classList.remove('show'), duration);
}

// =============================================================================
// SETUP OPTIONS
// =============================================================================

/**
 * Select interview duration. Highlights the active pill.
 * @param {number} mins
 * @param {HTMLElement} el - clicked button
 */
function selectDuration(mins, el) {
  state.duration = mins;
  document.querySelectorAll('.timer-opt').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

/** Human-readable descriptions for each interview type */
const typeDescs = {
  Technical:   'Technical: Coding, system design, and domain-specific problem-solving questions.',
  HR:          'HR Round: Culture fit, motivation, salary, and general professional questions.',
  Behavioural: 'Behavioural: Situation-based STAR method questions about past experiences.',
  Mixed:       'Mixed: A balanced combination of Technical, HR, and Behavioural questions.',
};

/**
 * Select interview type. Updates state and descriptor text.
 * @param {string} type - 'Technical' | 'HR' | 'Behavioural' | 'Mixed'
 * @param {HTMLElement} el - clicked button
 */
function selectType(type, el) {
  state.interviewType = type;
  document.querySelectorAll('.type-pill').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('type-desc').textContent = typeDescs[type] || '';
}

/** Toggle roast mode on/off */
let roastOn = false;
function toggleRoast() {
  roastOn = !roastOn;
  state.roastMode = roastOn;
  document.getElementById('roast-toggle').classList.toggle('on', roastOn);
}

// =============================================================================
// KEYBOARD SHORTCUT — Space bar toggles mic during interview
// =============================================================================
document.addEventListener('keydown', e => {
  if (
    e.code === 'Space' &&
    document.getElementById('page-interview').classList.contains('active') &&
    e.target === document.body
  ) {
    e.preventDefault();
    toggleMic();
  }
});

// =============================================================================
// UTILITY
// =============================================================================
/** Clamp a value between min and max. */
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

/** Promise-based sleep. */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
