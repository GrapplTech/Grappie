/**
 * api.js — Grappie AI Interview Coach
 *
 * Responsibilities:
 *  - All communication with the OpenRouter API
 *  - API key validation
 *  - Model selection read-through
 *
 * OpenRouter docs: https://openrouter.ai/docs
 * Used endpoint: POST https://openrouter.ai/api/v1/chat/completions
 */

'use strict';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// =============================================================================
// API KEY VALIDATION
// =============================================================================

/**
 * Validate the entered OpenRouter API key by making a lightweight
 * GET /models request. Updates the UI with the result.
 */
async function validateKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { notify('Please enter an API key', 'error'); return; }

  const btn = document.getElementById('validate-btn');
  btn.innerHTML = '<span class="loading-spinner"></span> Checking...';
  btn.disabled = true;

  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: { 'Authorization': 'Bearer ' + key },
    });

    if (res.ok) {
      state.apiKey = key;
      document.getElementById('key-status').innerHTML =
        '<div class="key-status valid">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
        ' Valid key — ready to start</div>';
      notify('API key validated');
    } else {
      document.getElementById('key-status').innerHTML =
        '<div class="key-status invalid">Invalid key — please check and retry</div>';
      notify('Invalid API key', 'error');
    }
  } catch (e) {
    document.getElementById('key-status').innerHTML =
      '<div class="key-status invalid">Network error</div>';
    notify('Network error', 'error');
  }

  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Validate';
  btn.disabled = false;
}

// =============================================================================
// OPENROUTER CHAT COMPLETIONS
// =============================================================================

/**
 * Send a chat completion request to OpenRouter.
 *
 * @param {Array<{role: string, content: string}>} messages - Conversation history
 * @param {number} maxTokens - Upper token limit for the response
 * @returns {Promise<string>} - The assistant's reply text
 * @throws Will throw if the HTTP response is not OK
 */
async function callOpenRouter(messages, maxTokens = 1000) {
  const model = document.getElementById('model-select').value;

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + state.apiKey,
      // OpenRouter recommends these headers for usage tracking
      'HTTP-Referer': 'https://grappie.app',
      'X-Title': 'Grappie Interview Coach',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}
