/**
 * interview.js — Grappie AI Interview Coach
 *
 * Responsibilities:
 *  - Camera + microphone permission request
 *  - Camera stream management (start, stop, face simulation)
 *  - Interview session lifecycle (start, question flow, submit, skip, end)
 *  - AI question generation via OpenRouter
 *  - AI report generation via OpenRouter
 *  - Speech recognition (SpeechRecognition API)
 *  - Speech synthesis (SpeechSynthesis API)
 *  - Report rendering and HTML download
 */

'use strict';

// =============================================================================
// PERMISSIONS — Camera + Microphone
// =============================================================================

/**
 * Request camera and audio in a single getUserMedia call, resulting in
 * exactly ONE browser permission prompt.
 * Pipes the stream to setup page previews and stores it in state.stream
 * for reuse during the interview (no second prompt needed).
 */
async function grantPermissions() {
  const btn = document.getElementById('grant-perm-btn');
  btn.innerHTML = '<span class="loading-spinner"></span> Requesting...';
  btn.disabled  = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    state.stream        = stream;
    state.cameraEnabled = true;

    // Pipe to setup page camera preview
    const camFeed = document.getElementById('camera-feed');
    camFeed.srcObject = stream;
    document.getElementById('camera-overlay').classList.add('hidden');

    // Also pipe to the "granted" panel preview
    document.getElementById('camera-feed-granted').srcObject = stream;

    document.getElementById('perm-request').classList.add('hidden');
    document.getElementById('perm-granted').classList.remove('hidden');
    notify('Camera and microphone access granted');
    startFaceSimulation();
  } catch (e) {
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Grant Camera &amp; Mic Access';
    btn.disabled = false;
    notify('Access denied. Allow camera & mic in browser settings.', 'error', 5000);
  }
}

// =============================================================================
// CAMERA MANAGEMENT
// =============================================================================

/**
 * Fully stop all camera and audio tracks, clear all video srcObjects,
 * and hide the floating camera bubble.
 * Called on interview end, home navigation, or restart.
 */
function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream        = null;
    state.cameraEnabled = false;
  }

  clearInterval(state.metricInterval);
  state.metricInterval = null;

  // Hide floating bubble
  const floatBub = document.getElementById('cam-bubble-float');
  if (floatBub) floatBub.classList.remove('show');

  // Clear srcObject on every video element that may have been using the stream
  ['camera-feed', 'camera-bubble-feed', 'camera-feed-granted', 'cam-float-vid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.srcObject = null;
  });

  const camLeft = document.getElementById('cam-left-wrap');
  if (camLeft) camLeft.classList.add('hidden');
}

// =============================================================================
// FACE SIMULATION (simulated confidence/nervousness/focus metrics)
// =============================================================================

/**
 * Simulate real-time face analysis metrics.
 * In a production app, this would use a face detection model.
 * Here we use a random-walk simulation for UX demonstration.
 */
function startFaceSimulation() {
  clearInterval(state.metricInterval);

  let base = { conf: 65, nerv: 35, focus: 75 };

  state.metricInterval = setInterval(() => {
    base.conf  = clamp(base.conf  + (Math.random() - 0.48) * 4, 40, 95);
    base.nerv  = clamp(base.nerv  + (Math.random() - 0.50) * 6, 15, 80);
    base.focus = clamp(base.focus + (Math.random() - 0.45) * 3, 50, 98);

    state.faceMetrics.confidence  = Math.round(base.conf);
    state.faceMetrics.nervousness = Math.round(base.nerv);
    state.faceMetrics.focus       = Math.round(base.focus);

    updateMetrics();

    // Simulate face detection with a small chance of "no face detected"
    const detected = Math.random() > 0.1;
    ['face-indicator', 'cam-bubble-dot', 'face-indicator-granted'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('detected', detected);
    });
  }, 1500);
}

/** Push current metric values into DOM progress bars and labels. */
function updateMetrics() {
  const { confidence, nervousness, focus } = state.faceMetrics;

  const set = (key, val) => {
    const vEl = document.getElementById(key + '-val');
    const bEl = document.getElementById(key + '-bar');
    if (vEl) vEl.textContent  = val + '%';
    if (bEl) bEl.style.width  = val + '%';
  };

  set('confidence', confidence);
  set('nervous',    nervousness);
  set('focus',      focus);

  const cs = document.getElementById('cam-status-txt');
  if (cs) cs.textContent = state.cameraEnabled ? 'Camera active' : 'Camera not enabled';
}

// =============================================================================
// START INTERVIEW
// =============================================================================

/**
 * Validate prerequisites, navigate to interview page, generate questions,
 * and kick off the timer + first question.
 */
async function startInterview() {
  if (!state.resumeText) { notify('Please upload your resume first', 'error'); return; }
  if (!state.apiKey)     { notify('Please validate your API key first', 'error'); return; }
  if (!state.stream)     { notify('Please grant camera and microphone access first', 'error'); return; }

  state.targetRole    = document.getElementById('target-role').value.trim();
  state.targetCompany = document.getElementById('target-company').value.trim();

  showPage('interview');
  state.interviewActive = true;
  state.currentQ        = 0;
  state.answers         = [];
  state.interviewLog    = [];

  // Animate loading progress bar (fake progress for UX)
  let prog = 0;
  const progBar = document.getElementById('loading-progress');
  const progInt = setInterval(() => {
    prog = Math.min(prog + Math.random() * 10, 88);
    progBar.style.width = prog + '%';
  }, 400);

  try {
    await generateQuestions();

    clearInterval(progInt);
    progBar.style.width = '100%';
    await sleep(300);

    // Reveal interview UI
    document.getElementById('loading-interview').classList.add('hidden');
    document.getElementById('interview-ui').classList.remove('hidden');

    // Pipe camera stream to floating bubble
    const cbVid = document.getElementById('cam-float-vid');
    if (cbVid && state.stream) {
      cbVid.srcObject = state.stream;
      document.getElementById('cam-bubble-float').classList.add('show');
    }

    // Pipe camera stream to left sidebar panel
    const camFeed = document.getElementById('camera-bubble-feed');
    if (camFeed && state.stream) {
      camFeed.srcObject = state.stream;
      document.getElementById('cam-left-wrap').classList.remove('hidden');
      const cs = document.getElementById('cam-status-txt');
      if (cs) cs.textContent = 'Camera active';
    }

    if (state.roastMode) document.getElementById('roast-badge-wrap').classList.remove('hidden');

    startTimer();
    loadQuestion(0);
  } catch (err) {
    clearInterval(progInt);
    state.interviewActive = false;
    notify('Error: ' + err.message, 'error');
    showPage('setup');
  }
}

// =============================================================================
// QUESTION GENERATION
// =============================================================================

/**
 * Build a prompt and call OpenRouter to generate 8 tailored interview questions.
 * Falls back to a static question bank if the API call fails or returns invalid JSON.
 */
async function generateQuestions() {
  // Question breakdown varies by interview type
  const typePrompts = {
    Technical:
      '- 3 Technical/coding/system-design questions\n' +
      '- 2 Project deep-dive questions\n' +
      '- 1 Problem-solving question\n' +
      '- 1 Architecture/design decision question\n' +
      '- 1 Debugging/troubleshooting scenario',
    HR:
      '- 2 Self-introduction/background questions\n' +
      '- 2 Motivation and career goals questions\n' +
      '- 2 Culture fit and values questions\n' +
      '- 1 Salary/expectations question\n' +
      '- 1 Strengths and weaknesses question',
    Behavioural:
      '- 4 STAR method situational questions (tell me about a time...)\n' +
      '- 2 Leadership/teamwork questions\n' +
      '- 1 Conflict resolution question\n' +
      '- 1 Failure/learning question',
    Mixed:
      '- 2 Technical questions\n' +
      '- 2 Behavioural STAR questions\n' +
      '- 2 Project questions\n' +
      '- 1 HR/motivation question\n' +
      '- 1 Problem-solving question',
  };

  const roastNote  = state.roastMode
    ? '\nInclude light roasting humor about resume clichés in a Gen-Z style, but stay constructive.'
    : '';
  const roleNote    = state.targetRole    ? `\nTarget Role: ${state.targetRole}`    : '';
  const companyNote = state.targetCompany
    ? `\nTarget Company: ${state.targetCompany} — tailor questions to their known culture, values, and tech stack.`
    : '';

  const prompt =
    `You are Grappie, a sharp AI interviewer. Analyze this resume and generate exactly 8 interview questions for a ${state.interviewType} interview.\n` +
    `${roleNote}${companyNote}\n` +
    `RESUME:\n${state.resumeText.slice(0, 3000)}\n\n` +
    `Question breakdown:\n${typePrompts[state.interviewType] || typePrompts.Mixed}\n` +
    `${roastNote}\n\n` +
    `Return ONLY a JSON array (no markdown, no extra text):\n` +
    `[{"q":"question text","type":"${state.interviewType}"},...]`;

  const response = await callOpenRouter([{ role: 'user', content: prompt }], 1400);
  const cleaned  = response.trim().replace(/```json\n?/g, '').replace(/```/g, '');
  const match    = cleaned.match(/\[[\s\S]*\]/);

  try {
    state.questions = match ? JSON.parse(match[0]) : JSON.parse(cleaned);
  } catch (e) {
    state.questions = generateFallbackQuestions();
  }
}

/**
 * Static fallback question bank used when the API call fails.
 * Organized by interview type.
 * @returns {Array<{q: string, type: string}>}
 */
function generateFallbackQuestions() {
  const byType = {
    Technical: [
      { q: "Walk me through the most technically complex project you've built.", type: "Technical" },
      { q: "How would you design a URL shortening service like bit.ly at scale?", type: "System Design" },
      { q: "Explain a time you optimized a slow query or system bottleneck.", type: "Technical" },
      { q: "What's your approach to debugging a production issue you've never seen before?", type: "Problem Solving" },
      { q: "Describe the architecture of your most recent project.", type: "Architecture" },
      { q: "How do you ensure code quality in a fast-moving team?", type: "Technical" },
      { q: "What's the hardest technical decision you've had to make and why?", type: "Technical" },
      { q: "How do you stay current with new technologies?", type: "Technical" },
    ],
    HR: [
      { q: "Tell me about yourself and your career journey.", type: "HR" },
      { q: "Why are you looking for a new opportunity right now?", type: "HR" },
      { q: "Where do you see yourself in 3-5 years?", type: "HR" },
      { q: "What's your greatest professional strength?", type: "HR" },
      { q: "What do you know about our company and why do you want to work here?", type: "HR" },
      { q: "How do you handle work pressure and tight deadlines?", type: "HR" },
      { q: "What are your salary expectations?", type: "HR" },
      { q: "Do you prefer working independently or as part of a team?", type: "HR" },
    ],
    Behavioural: [
      { q: "Tell me about a time you led a project that didn't go as planned.", type: "Behavioural" },
      { q: "Describe a situation where you had to deal with a difficult colleague.", type: "Behavioural" },
      { q: "Tell me about a time you failed and what you learned from it.", type: "Behavioural" },
      { q: "Give an example of when you went above and beyond at work.", type: "Behavioural" },
      { q: "Describe a time you had to learn a new skill quickly under pressure.", type: "Behavioural" },
      { q: "Tell me about a conflict with your manager and how you resolved it.", type: "Behavioural" },
      { q: "Describe your biggest professional achievement.", type: "Behavioural" },
      { q: "Tell me about a time you had to make a decision with incomplete information.", type: "Behavioural" },
    ],
  };
  return byType[state.interviewType] || byType.Technical;
}

// =============================================================================
// INTERVIEW QUESTION FLOW
// =============================================================================

/**
 * Load and display question at the given index.
 * Checks interviewActive before proceeding to prevent loading after end.
 * @param {number} idx
 */
function loadQuestion(idx) {
  // CRITICAL: guard against async calls arriving after interview ended
  if (!state.interviewActive) return;
  if (idx >= state.questions.length) { endInterview(); return; }

  state.currentQ = idx;
  const q = state.questions[idx];

  document.getElementById('q-number').textContent   = `Question ${idx + 1} of ${state.questions.length}`;
  document.getElementById('q-text').textContent     = q.q;
  document.getElementById('q-type').textContent     = q.type;
  document.getElementById('q-progress').textContent = `${idx + 1} / ${state.questions.length}`;

  clearTranscript();
  speakText(q.q);
  setGrappieTalking(true);

  // Show question in Grappie's left-panel bubble
  const qBubble = document.getElementById('grappie-q-bubble');
  if (qBubble) { qBubble.textContent = q.q; qBubble.classList.add('visible'); }

  const comments = [
    "Think carefully before answering.",
    "This is where most candidates struggle.",
    "Show me what you've got.",
    "Be specific — I dislike vague answers.",
    "Deep breath. You've got this.",
    "Your resume mentioned this area.",
    "I'm listening carefully.",
    "Impress me.",
  ];
  document.getElementById('grappie-comment').textContent = comments[idx % comments.length];

  startThinkTimer();
}

/** Clear transcript area and reset placeholder text. */
function clearTranscript() {
  document.getElementById('transcript-placeholder').style.display = 'inline';
  document.getElementById('transcript-text').style.display        = 'none';
  document.getElementById('transcript-text').textContent          = '';
  document.getElementById('transcript-area').classList.remove('recording-active');
}

/**
 * Submit the current answer, log it, and advance to next question.
 */
async function submitAnswer() {
  const answer = document.getElementById('transcript-text').textContent.trim();
  if (!answer) { notify('Please speak your answer first', 'error'); return; }
  if (!state.interviewActive) return;

  stopMic();
  clearInterval(state.thinkInterval);
  document.getElementById('think-timer').classList.add('hidden');

  state.answers.push(answer);
  state.interviewLog.push({
    question: state.questions[state.currentQ].q,
    type:     state.questions[state.currentQ].type,
    answer,
  });

  const reactions = [
    "Noted. Moving on.",
    "Interesting perspective.",
    "Could use more detail, but okay.",
    "Sounded confident.",
    "Let's go deeper next time.",
    "Good. Next.",
    "Not bad. Not perfect either.",
    "I appreciate the specificity.",
  ];
  document.getElementById('grappie-comment').textContent =
    reactions[Math.floor(Math.random() * reactions.length)];

  const qBubble = document.getElementById('grappie-q-bubble');
  if (qBubble) qBubble.classList.remove('visible');
  setGrappieTalking(false);

  setTimeout(() => {
    if (state.interviewActive) loadQuestion(state.currentQ + 1);
  }, 2000);
}

/**
 * Skip the current question, recording it as skipped.
 */
function skipQuestion() {
  if (!state.interviewActive) return;

  stopMic();
  clearInterval(state.thinkInterval);
  document.getElementById('think-timer').classList.add('hidden');

  state.answers.push('[Skipped]');
  state.interviewLog.push({
    question: state.questions[state.currentQ]?.q   || '',
    type:     state.questions[state.currentQ]?.type || '',
    answer:   '[Skipped]',
  });

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  loadQuestion(state.currentQ + 1);
}

/** Re-read the current question aloud and reset the think timer. */
function repeatQuestion() {
  if (state.questions[state.currentQ]) speakText(state.questions[state.currentQ].q);
  startThinkTimer();
}

// =============================================================================
// MICROPHONE (SpeechRecognition)
// =============================================================================

/** Toggle mic on/off. No-op if interview has ended. */
function toggleMic() {
  if (!state.interviewActive) return;
  state.isRecording ? stopMic() : startMic();
}

/**
 * Start continuous SpeechRecognition.
 * Reuses the audio track from the existing permission grant — no new dialog.
 */
function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR)                       { notify('Speech recognition needs Chrome or Edge', 'error'); return; }
  if (!state.interviewActive)    return;

  state.recognition = new SR();
  state.recognition.continuous      = true;
  state.recognition.interimResults  = true;
  state.recognition.lang            = 'en-US';

  state.recognition.onresult = (e) => {
    if (!state.interviewActive) { state.recognition.stop(); return; }
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
    }
    if (final) {
      document.getElementById('transcript-text').textContent += final;
      document.getElementById('transcript-placeholder').style.display = 'none';
      document.getElementById('transcript-text').style.display        = 'inline';
    }
  };

  state.recognition.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') notify('Mic error: ' + e.error, 'error');
  };

  /**
   * Restart recognition when it ends unexpectedly (browser continuous mode
   * sometimes stops silently). Only restarts if isRecording is still true
   * AND the interview is still active.
   *
   * IMPORTANT: stopMic() sets isRecording = false BEFORE calling .stop(),
   * so this handler won't restart after an intentional stop.
   */
  state.recognition.onend = () => {
    if (state.isRecording && state.interviewActive) {
      try { state.recognition.start(); } catch (e) {}
    }
  };

  try {
    state.recognition.start();
  } catch (e) {
    notify('Could not start mic: ' + e.message, 'error');
    return;
  }

  state.isRecording = true;

  // Update mic button UI
  const micBtn = document.getElementById('mic-btn');
  micBtn.classList.add('recording');
  micBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>';

  document.getElementById('mic-ring-1').style.display = 'block';
  document.getElementById('mic-ring-2').style.display = 'block';
  document.getElementById('mic-status').textContent   = 'Recording';
  document.getElementById('mic-status').classList.add('live');
  document.getElementById('mic-label').textContent    = 'Recording...';
  document.getElementById('transcript-area').classList.add('recording-active');
}

/**
 * Stop SpeechRecognition.
 *
 * CRITICAL ORDER: isRecording must be set to false BEFORE calling .stop()
 * to prevent the onend handler from immediately restarting recognition.
 */
function stopMic() {
  state.isRecording = false; // ← Must come BEFORE recognition.stop()

  if (state.recognition) {
    try { state.recognition.stop(); } catch (e) {}
    state.recognition = null;
  }

  const micBtn = document.getElementById('mic-btn');
  if (micBtn) {
    micBtn.classList.remove('recording');
    micBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
      '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
      '<line x1="12" y1="19" x2="12" y2="23"/>' +
      '<line x1="8" y1="23" x2="16" y2="23"/>' +
      '</svg>';
  }

  ['mic-ring-1', 'mic-ring-2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const ms = document.getElementById('mic-status');
  if (ms) { ms.textContent = 'Waiting'; ms.classList.remove('live'); }

  const ml = document.getElementById('mic-label');
  if (ml) ml.textContent = 'Start Speaking';

  const ta = document.getElementById('transcript-area');
  if (ta) ta.classList.remove('recording-active');
}

// =============================================================================
// SPEECH SYNTHESIS
// =============================================================================

/**
 * Speak the given text using the Web Speech API.
 * Prefers Google US English voice if available.
 * @param {string} text
 */
function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utter    = new SpeechSynthesisUtterance(text);
  utter.rate     = 0.95;
  utter.pitch    = 1.05;
  utter.volume   = 0.9;

  const voices = window.speechSynthesis.getVoices();
  const pref   =
    voices.find(v => v.name.includes('Google') && v.lang === 'en-US') ||
    voices.find(v => v.lang === 'en-US') ||
    voices[0];
  if (pref) utter.voice = pref;

  utter.onstart = () => setGrappieTalking(true);
  utter.onend   = () => setGrappieTalking(false);

  window.speechSynthesis.speak(utter);
}

// Warm up the voices list asynchronously
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => {};

// =============================================================================
// END INTERVIEW
// =============================================================================

/**
 * Terminate the interview: stop all processes, compute scores,
 * navigate to report page, and trigger AI report generation.
 */
async function endInterview() {
  if (!state.interviewActive) return; // Prevent double-trigger

  state.interviewActive = false; // Stop everything immediately
  stopTimer();
  stopMic();
  clearInterval(state.thinkInterval);
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  clearInterval(state.metricInterval);
  state.metricInterval = null;
  stopCamera();

  showPage('report');

  // --- Score computation ---
  const totalQ        = state.questions.length;
  const answered      = state.interviewLog.filter(l => l.answer !== '[Skipped]').length;
  const completionRate = answered / Math.max(totalQ, 1);

  const answeredLogs = state.interviewLog.filter(l => l.answer !== '[Skipped]');
  const avgLen       = answeredLogs.length
    ? answeredLogs.reduce((s, l) => s + l.answer.split(' ').length, 0) / answeredLogs.length
    : 0;
  const answerDepth  = Math.min(avgLen / 80, 1);

  const conf  = state.faceMetrics.confidence  > 0 ? state.faceMetrics.confidence  : Math.floor(45 + Math.random() * 20);
  const nerv  = state.faceMetrics.nervousness > 0 ? state.faceMetrics.nervousness : Math.floor(35 + Math.random() * 30);
  const focus = state.faceMetrics.focus       > 0 ? state.faceMetrics.focus       : Math.floor(50 + Math.random() * 20);

  // Weighted formula: completion + depth + face metrics
  const overall = Math.min(99, Math.round(
    completionRate * 40 +
    answerDepth    * 25 +
    (conf  / 100)  * 15 +
    (focus / 100)  * 10 +
    ((100 - nerv) / 100) * 10
  ));
  const comm = Math.min(99, Math.round(completionRate * 50 + answerDepth * 50));
  const tech = Math.min(99, Math.round(answerDepth * 60 + completionRate * 40));

  // Render score cards
  document.getElementById('score-grid').innerHTML = [
    [overall + '%', 'Overall Score'],
    [conf    + '%', 'Confidence'],
    [comm    + '%', 'Communication'],
    [tech    + '%', 'Technical Depth'],
    [nerv    + '%', 'Nervousness'],
    [answered + '/' + totalQ, 'Questions Done'],
  ].map(([num, lbl]) =>
    `<div class="score-card"><div class="score-num">${num}</div><div class="score-lbl">${lbl}</div></div>`
  ).join('');

  const typeLabel = state.interviewType ? ` · ${state.interviewType} Interview` : '';
  const roleLabel = state.targetRole    ? ` · ${state.targetRole}`              : '';
  document.getElementById('report-subtitle').textContent =
    `${answered} of ${totalQ} answered · Score: ${overall}%${typeLabel}${roleLabel}`;

  try {
    await generateReport(overall, conf, nerv, focus, comm, tech);
  } catch (e) {
    generateFallbackReport();
  }
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

/**
 * Ask the AI to analyze the interview log and produce structured feedback.
 * @param {number} overall, conf, nerv, focus, comm, tech — score values
 */
async function generateReport(overall, conf, nerv, focus, comm, tech) {
  const answeredLogs = state.interviewLog.filter(l => l.answer !== '[Skipped]');
  const logText      = answeredLogs
    .map((l, i) => `Q${i + 1} [${l.type}]: ${l.question}\nA: ${l.answer}`)
    .join('\n\n');

  const roastNote = state.roastMode
    ? 'Include witty Gen-Z commentary in weaknesses. Sharp but constructive.'
    : '';
  const ctxNote = [
    state.interviewType ? `Interview Type: ${state.interviewType}` : '',
    state.targetRole    ? `Target Role: ${state.targetRole}`        : '',
    state.targetCompany ? `Target Company: ${state.targetCompany}`  : '',
  ].filter(Boolean).join('\n');

  const prompt =
    `You are Grappie, an AI interview coach. Generate a detailed performance report.\n\n` +
    `CONTEXT:\n${ctxNote}\n\n` +
    `RESUME:\n${state.resumeText.slice(0, 1500)}\n\n` +
    `INTERVIEW LOG:\n${logText.slice(0, 2000)}\n\n` +
    `SCORES: Overall=${overall}%, Confidence=${conf}%, Communication=${comm}%, Technical=${tech}%, Nervousness=${nerv}%\n` +
    `${roastNote}\n\n` +
    `Return ONLY valid JSON (no markdown):\n` +
    `{"strengths":["s1","s2","s3"],"weaknesses":["w1","w2","w3"],"improvements":["i1","i2","i3","i4"]}`;

  const response = await callOpenRouter([{ role: 'user', content: prompt }], 900);
  const cleaned  = response.trim().replace(/```json\n?/g, '').replace(/```/g, '');
  const match    = cleaned.match(/\{[\s\S]*\}/);

  try {
    renderReport(JSON.parse(match ? match[0] : cleaned));
  } catch (e) {
    generateFallbackReport();
  }
}

/** Static fallback report used when AI report generation fails. */
function generateFallbackReport() {
  renderReport({
    strengths: [
      "Clear presentation of technical skills and experience",
      "Good variety of projects demonstrating practical knowledge",
      "Consistent career progression visible in timeline",
    ],
    weaknesses: [
      "Answers lacked specific metrics and quantifiable results",
      "Some responses were too generic and needed more depth",
      "Preparation for behavioral questions could be stronger",
    ],
    improvements: [
      "Add concrete numbers to achievements (e.g. 30% faster, 10k users)",
      "Prepare the STAR method for all behavioral questions",
      "Practice explaining technical decisions clearly and concisely",
      "Research common interview questions for your specific target role",
    ],
  });
}

/**
 * Populate the report page DOM with AI-generated feedback and Q&A recap.
 * @param {{ strengths: string[], weaknesses: string[], improvements: string[] }} data
 */
function renderReport(data) {
  document.getElementById('report-loading').classList.add('hidden');
  document.getElementById('report-content').classList.remove('hidden');

  const checkSVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const warnSVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const arrowSVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>';

  document.getElementById('strengths-list').innerHTML = data.strengths.map(s =>
    `<li class="feedback-item strength"><div class="fi-icon fi-green">${checkSVG}</div><span>${s}</span></li>`
  ).join('');

  document.getElementById('weaknesses-list').innerHTML = data.weaknesses.map(w =>
    `<li class="feedback-item weakness"><div class="fi-icon fi-amber">${warnSVG}</div><span>${w}</span></li>`
  ).join('');

  document.getElementById('improvements-list').innerHTML = data.improvements.map(imp =>
    `<li class="feedback-item improvement"><div class="fi-icon fi-blue">${arrowSVG}</div><span>${imp}</span></li>`
  ).join('');

  document.getElementById('qa-recap').innerHTML = state.interviewLog.map((l, i) => `
    <div class="qa-item">
      <div class="qa-q">Q${i + 1} · ${l.type} — ${l.question}</div>
      <div class="qa-a">${l.answer === '[Skipped]' ? '<em>Skipped</em>' : l.answer}</div>
    </div>`
  ).join('');
}

// =============================================================================
// REPORT DOWNLOAD
// =============================================================================

/**
 * Generate a self-contained HTML report and trigger a browser download.
 *
 * Note: The </style> closing tag is split across concatenation to prevent
 * the browser from prematurely terminating the template literal.
 */
function downloadReport() {
  const scores      = document.getElementById('score-grid').innerHTML;
  const strengths   = document.getElementById('strengths-list').innerHTML;
  const weaknesses  = document.getElementById('weaknesses-list').innerHTML;
  const improvements = document.getElementById('improvements-list').innerHTML;
  const qa          = document.getElementById('qa-recap').innerHTML;

  // Split to avoid the browser closing the style block early
  const t1 = '<st', t2 = 'yle>';
  const styleContent =
    'body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#111}' +
    '.score-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}' +
    '.score-card{border:1px solid #e5e7eb;border-radius:10px;padding:16px;text-align:center}' +
    '.score-num{font-size:2rem;font-weight:800;color:#1a6bff}' +
    '.score-lbl{font-size:.7rem;color:#6b7280;margin-top:4px;text-transform:uppercase}' +
    '.feedback-item{display:flex;gap:10px;padding:12px;margin-bottom:8px;border-radius:8px;border:1px solid #e5e7eb;font-size:.86rem}' +
    '.strength{background:#f0fdf4}.weakness{background:#fffbeb}.improvement{background:#eff6ff}' +
    '.qa-item{border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px}' +
    '.qa-q{font-weight:600;color:#1a6bff;font-size:.83rem;margin-bottom:6px}' +
    '.qa-a{color:#6b7280;font-size:.81rem;line-height:1.7}' +
    'h1,h2{color:#0d0f1a}h2{color:#1a6bff;margin-top:32px}h1{letter-spacing:-.03em}' +
    '@media print{body{margin:0}}';

  const ctxInfo = [
    state.interviewType ? `<p style="color:#6b7280;font-size:.86rem"><strong>Type:</strong> ${state.interviewType}</p>`    : '',
    state.targetRole    ? `<p style="color:#6b7280;font-size:.86rem"><strong>Role:</strong> ${state.targetRole}</p>`        : '',
    state.targetCompany ? `<p style="color:#6b7280;font-size:.86rem"><strong>Company:</strong> ${state.targetCompany}</p>`  : '',
  ].filter(Boolean).join('');

  const content =
    '<!DOCTYPE html><html><head><title>Grappie Interview Report</title>' +
    t1 + t2 + styleContent + '</' + 'style></head><body>' +
    '<h1>Grappie Interview Report</h1>' +
    `<p style="color:#6b7280;font-size:.86rem">Generated ${new Date().toLocaleDateString()}</p>` +
    ctxInfo +
    '<h2>Scores</h2><div class="score-grid">' + scores + '</div>' +
    '<h2>Strengths</h2><ul>'    + strengths    + '</ul>' +
    '<h2>Areas to Improve</h2><ul>' + weaknesses + '</ul>' +
    '<h2>Action Items</h2><ul>' + improvements + '</ul>' +
    '<h2>Transcript</h2>' + qa + '</body></html>';

  const blob = new Blob([content], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'grappie-report.html';
  a.click();
  URL.revokeObjectURL(url);
  notify('Report downloaded');
}
