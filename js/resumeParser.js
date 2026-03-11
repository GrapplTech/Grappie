/**
 * resumeParser.js — Grappie AI Interview Coach
 *
 * Responsibilities:
 *  - File upload handling (click and drag-and-drop)
 *  - Text extraction from PDF (via pdf.js), DOCX (via mammoth.js), and TXT
 *  - Resume preview display
 *
 * Dependencies (loaded via CDN in index.html):
 *  - pdf.js  v3.11.174  — https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
 *  - mammoth v1.6.0     — https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js
 *
 * Privacy note: all file processing happens in the browser. The file content
 * is never uploaded to any server — only the extracted plain text is sent to
 * OpenRouter as part of the prompt.
 */

'use strict';

// =============================================================================
// DRAG-AND-DROP HANDLERS
// =============================================================================

function dragOver(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.add('drag-over');
}

function dragLeave() {
  document.getElementById('upload-zone').classList.remove('drag-over');
}

function dropFile(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag-over');
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
}

// =============================================================================
// FILE INPUT HANDLER
// =============================================================================

async function handleFileUpload(e) {
  const f = e.target.files[0];
  if (f) await processFile(f);
}

// =============================================================================
// MAIN FILE PROCESSOR
// =============================================================================

/**
 * Dispatch to the correct extractor based on file extension, then update UI.
 * @param {File} file
 */
async function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let text = '';

  try {
    if (ext === 'txt')       text = await file.text();
    else if (ext === 'pdf')  text = await extractPDF(file);
    else if (ext === 'docx') text = await extractDOCX(file);
    else {
      notify('Use PDF, DOCX, or TXT.', 'error');
      return;
    }

    if (!text || text.trim().length < 50) {
      notify('Not enough text in file.', 'error');
      return;
    }

    state.resumeText = text.trim();

    // Show truncated preview (first 1200 chars)
    document.getElementById('resume-preview').textContent =
      text.trim().slice(0, 1200) + (text.length > 1200 ? '\n\n[...truncated]' : '');
    document.getElementById('resume-preview-wrap').classList.remove('hidden');

    // Update upload zone to show success state
    document.getElementById('upload-zone').innerHTML =
      `<div class="upload-zone-icon" style="background:var(--green-light);color:var(--green)">` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` +
      `</div><div class="upload-zone-text"><strong>${file.name}</strong> uploaded</div>`;

    notify('Resume loaded!');
  } catch (err) {
    notify('Error reading file: ' + err.message, 'error');
  }
}

// =============================================================================
// EXTRACTORS
// =============================================================================

/**
 * Extract plain text from a PDF file using pdf.js.
 * Each page's text items are joined with spaces; pages separated by newlines.
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractPDF(file) {
  // pdf.js exposes itself under a namespaced global
  const lib = window['pdfjs-dist/build/pdf'];
  lib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(x => x.str).join(' ') + '\n';
  }

  return text;
}

/**
 * Extract plain text from a DOCX file using mammoth.js.
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractDOCX(file) {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

// =============================================================================
// CLEAR RESUME
// =============================================================================

/** Reset resume state and restore the default upload zone UI. */
function clearResume() {
  state.resumeText = '';
  document.getElementById('resume-preview-wrap').classList.add('hidden');
  document.getElementById('upload-zone').innerHTML =
    `<div class="upload-zone-icon">` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>` +
    `</div>` +
    `<div class="upload-zone-text"><strong>Click to upload</strong> or drag and drop</div>` +
    `<div class="upload-zone-text" style="margin-top:2px">PDF, DOCX, TXT — up to 10 MB</div>`;
  document.getElementById('file-input').value = '';
}
