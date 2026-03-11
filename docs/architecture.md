# Grappie — Architecture

This document explains how Grappie is structured, how data flows through the app, and the key engineering decisions made along the way.

---

## Overview

Grappie is a **single-page application (SPA)** built with plain HTML, CSS, and Vanilla JavaScript. There is no build step, no bundler, and no framework.

The app has four "pages" (actually four `<div class="page">` elements) that are shown/hidden via the `showPage()` routing function:

```
landing  →  setup  →  interview  →  report
```

---

## File Structure & Responsibilities

```
grappie/
├── index.html          All markup — pages, modals, global elements
├── css/styles.css      All styles — design tokens, components, responsive
└── js/
    ├── main.js         State, routing, theme, animations, utilities
    ├── api.js          OpenRouter API communication
    ├── resumeParser.js Resume file handling (PDF, DOCX, TXT)
    ├── timer.js        Countdown and think-time timers
    └── interview.js    Camera, mic, question flow, report generation
```

Scripts are loaded in this order (bottom of `index.html`):

```html
<script src="js/main.js"></script>       <!-- must be first: defines state -->
<script src="js/api.js"></script>
<script src="js/resumeParser.js"></script>
<script src="js/timer.js"></script>
<script src="js/interview.js"></script>  <!-- depends on all others -->
```

---

## Global State

All application state lives in a single `const state = { ... }` object defined in `main.js`. Every module reads from and mutates this object directly — no reactive framework, no pub/sub.

```js
const state = {
  // Setup inputs
  resumeText, apiKey, model,
  interviewType, targetRole, targetCompany,
  duration, roastMode, cameraEnabled,

  // Session state
  questions[], currentQ, answers[], interviewLog[],

  // Timer handles
  timerInterval, thinkInterval,
  totalSeconds, remainingSeconds,

  // Media
  isRecording, recognition, stream,

  // Face metrics (simulated)
  faceMetrics: { confidence, nervousness, focus },
  metricInterval,

  // Master stop flag
  interviewActive,  // ← THE most important field
};
```

### The `interviewActive` Flag

This is the most critical piece of state. It solves a subtle race condition:

**The problem:** `startInterview()` triggers `generateQuestions()` (async, ~3s), then `loadQuestion(0)`. Each question answer calls `loadQuestion(idx+1)` after a 2-second delay via `setTimeout`. If the user clicks "End Interview" mid-question, the pending `setTimeout` will still fire and try to load the next question.

**The solution:**
1. `endInterview()` sets `state.interviewActive = false` **immediately** as its first action
2. Every function that can restart flow (`loadQuestion`, `startMic`, `startTimer`) checks `if (!state.interviewActive) return` before doing anything

---

## Data Flow

### Resume Upload Flow

```
User drops file
  → processFile(file)
    → extractPDF() / extractDOCX() / file.text()
      → state.resumeText = extractedText
        → Preview rendered in DOM
```

All parsing happens in the browser using:
- **pdf.js** (Mozilla) for PDF: iterates pages, joins text items
- **mammoth.js** for DOCX: extracts raw text content
- Native `File.text()` for TXT

The resume text is never uploaded anywhere at this stage.

### API Call Flow

```
callOpenRouter(messages, maxTokens)
  → POST https://openrouter.ai/api/v1/chat/completions
    → Headers: Authorization: Bearer <state.apiKey>
    → Body: { model, messages, max_tokens, temperature }
      → Returns: data.choices[0].message.content (string)
```

The resume text is included inside the prompt string — it's the **only** moment any local data leaves the browser. The text goes to OpenRouter, which forwards it to the selected LLM.

### Interview Session Flow

```
startInterview()
  → showPage('interview')
  → state.interviewActive = true
  → generateQuestions()  ← API call #1: returns JSON array of {q, type}
  → startTimer()
  → loadQuestion(0)
      → speakText(q.q)  ← SpeechSynthesis
      → startThinkTimer()  ← 15s countdown
          → toggleMic()  ← SpeechRecognition starts
  → submitAnswer() / skipQuestion()
      → loadQuestion(currentQ + 1)
          → ... repeat
  → endInterview() (or timer runs out)
      → stopCamera() + stopMic() + stopTimer()
      → generateReport()  ← API call #2: returns {strengths, weaknesses, improvements}
      → renderReport()
```

### Microphone Restart Prevention

`SpeechRecognition.onend` fires whenever recognition stops — including when `.stop()` is called intentionally. Without a guard, this would restart recording indefinitely.

The pattern used:

```js
function stopMic() {
  state.isRecording = false;  // ← set BEFORE calling .stop()
  state.recognition.stop();
}

recognition.onend = () => {
  // Both checks required:
  // - isRecording: was this an intentional stop?
  // - interviewActive: is the interview still running?
  if (state.isRecording && state.interviewActive) {
    recognition.start();
  }
};
```

---

## CSS Architecture

All styles live in `css/styles.css`. No CSS modules, no preprocessor.

### Design Tokens

Every colour, shadow, radius, and transition is a CSS custom property on `:root`. Dark mode is implemented by overriding these tokens on `[data-theme="dark"]`:

```css
:root {
  --blue: #1a6bff;
  --bg: #ffffff;
  /* ... */
}
[data-theme="dark"] {
  --blue: #4f8eff;
  --bg: #0c0e18;
  /* ... */
}
```

This means dark mode is essentially free — no class toggling on individual elements.

### Responsive Breakpoints

| Breakpoint | What changes |
|---|---|
| `820px` | Interview layout switches from 2-col grid to stacked |
| `768px` | Features strip switches from 4-col to 2-col; sidebar cards hide |
| `680px` | Setup grid collapses to 1-col |
| `600px` | Floating camera bubble shrinks |
| `480px` | Question text font size decreases |
| `420px` | Features strip collapses to 1-col |

---

## Camera & Microphone Design

**One permission prompt.** `grantPermissions()` calls `getUserMedia({video: true, audio: true})` a single time. The returned `MediaStream` is stored as `state.stream` and reused throughout the session:

- Setup page preview → `camera-feed.srcObject = stream`
- Interview left panel → `camera-bubble-feed.srcObject = stream`
- Floating bubble → `cam-float-vid.srcObject = stream`
- Microphone → `SpeechRecognition` uses the existing audio permission

When the interview ends, `stopCamera()` calls `.stop()` on every track and nulls all `srcObject` references, properly releasing the hardware.

---

## Face Analysis (Simulated)

Real face detection (e.g. via MediaPipe FaceMesh) is on the roadmap. Currently, `startFaceSimulation()` runs a random-walk simulation to demonstrate the UX:

```js
base.conf = clamp(base.conf + (Math.random() - 0.48) * 4, 40, 95);
```

The slight negative bias (`-0.48` instead of `-0.5`) means confidence tends to drift upward slightly, which feels more realistic than a perfectly random walk.

---

## Report Download

The downloaded report is a self-contained HTML file generated entirely in-browser using `Blob` + `URL.createObjectURL`. No server involved.

One tricky implementation detail: the report HTML contains a `<style>` tag. If that string is built inside a JavaScript template literal in the source file, the browser's HTML parser can misinterpret `</style>` inside the string and close the script's parent `<style>` block prematurely. The fix is to split the closing tag:

```js
const t1 = '<st', t2 = 'yle>';
const html = '...' + t1 + t2 + styleCSS + '</' + 'style>...';
```

---

## External Dependencies (CDN)

| Library | Version | Purpose | CDN |
|---|---|---|---|
| pdf.js | 3.11.174 | PDF text extraction | cdnjs |
| mammoth.js | 1.6.0 | DOCX text extraction | cdnjs |
| Google Fonts | — | Bricolage Grotesque + Poppins | fonts.googleapis.com |

All other functionality uses browser-native APIs: SpeechRecognition, SpeechSynthesis, MediaDevices, Blob, URL, fetch.
