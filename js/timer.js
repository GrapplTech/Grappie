/**
 * timer.js — Grappie AI Interview Coach
 *
 * Responsibilities:
 *  - Interview countdown timer (start, stop, display update)
 *  - Per-question think-time timer (15-second countdown before mic opens)
 */

'use strict';

// =============================================================================
// INTERVIEW COUNTDOWN TIMER
// =============================================================================

/**
 * Start the main interview countdown from state.duration minutes.
 * Ends the interview automatically when time reaches zero.
 */
function startTimer() {
  state.totalSeconds     = state.duration * 60;
  state.remainingSeconds = state.totalSeconds;
  updateTimerDisplay();

  state.timerInterval = setInterval(() => {
    // Bail out if interview was stopped externally
    if (!state.interviewActive) { stopTimer(); return; }

    state.remainingSeconds--;
    updateTimerDisplay();

    if (state.remainingSeconds <= 0) {
      stopTimer();
      endInterview();
    }
  }, 1000);
}

/** Clear the interval; safe to call multiple times. */
function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

/**
 * Refresh the timer display elements.
 * Adds the "urgent" class and red color when less than 60 seconds remain.
 */
function updateTimerDisplay() {
  const m = Math.floor(state.remainingSeconds / 60);
  const s = state.remainingSeconds % 60;

  const display = document.getElementById('timer-display');
  if (display) {
    display.textContent = `${m}:${String(s).padStart(2, '0')}`;
    display.classList.toggle('urgent', state.remainingSeconds < 60);
  }

  // Progress bar width as percentage of total time
  const progress = document.getElementById('timer-progress');
  if (progress) {
    progress.style.width = (state.remainingSeconds / state.totalSeconds * 100) + '%';
  }
}

// =============================================================================
// PER-QUESTION THINK TIMER
// =============================================================================

/**
 * Start a 15-second think timer for the current question.
 * When it reaches zero, the microphone opens automatically
 * (provided the interview is still active).
 */
function startThinkTimer() {
  clearInterval(state.thinkInterval);
  let secs = 15;

  const thinkEl = document.getElementById('think-timer');
  thinkEl.classList.remove('hidden');
  document.getElementById('think-count').textContent = secs;

  state.thinkInterval = setInterval(() => {
    secs--;
    document.getElementById('think-count').textContent = secs;

    if (secs <= 0) {
      clearInterval(state.thinkInterval);
      thinkEl.classList.add('hidden');
      // Auto-start mic only if interview is still running
      if (state.interviewActive && !state.isRecording) toggleMic();
    }
  }, 1000);
}
