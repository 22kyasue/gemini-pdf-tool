// ══════════════════════════════════════════════════════════
// CONTENT SCRIPT
//
// Injected into gemini.google.com and chatgpt.com.
// Listens for CAPTURE_REQUEST messages from the side panel,
// reads the conversation DOM, and responds with RawTurn[].
// ══════════════════════════════════════════════════════════

import type { ExtMessage, RawTurn } from '../shared/messages';

// ── Gemini DOM Reader ──────────────────────────────────────
function extractFromGemini(): RawTurn[] {
  const turns: RawTurn[] = [];

  // Gemini renders each exchange as <user-query> / <model-response> custom elements
  const elements = document.querySelectorAll('user-query, model-response');

  elements.forEach(el => {
    const tag = el.tagName.toLowerCase();
    const role: 'user' | 'assistant' = tag === 'user-query' ? 'user' : 'assistant';

    // Try to extract the markdown text — Gemini wraps it in various class names
    const textEl =
      el.querySelector('.markdown') ??
      el.querySelector('.model-response-text') ??
      el.querySelector('[class*="markdown"]') ??
      el.querySelector('[class*="content"]');

    const text = (textEl as HTMLElement | null)?.innerText ?? (el as HTMLElement).innerText ?? '';

    if (text.trim()) {
      turns.push({ role, text: text.trim() });
    }
  });

  // Fallback: some Gemini versions use [data-message-id] containers
  if (turns.length === 0) {
    document.querySelectorAll('[data-message-id]').forEach(el => {
      const isUser = el.closest('user-query') !== null || el.getAttribute('data-participant-role') === 'human';
      const role: 'user' | 'assistant' = isUser ? 'user' : 'assistant';
      const text = (el as HTMLElement).innerText ?? '';
      if (text.trim()) turns.push({ role, text: text.trim() });
    });
  }

  return turns;
}

// ── ChatGPT DOM Reader ─────────────────────────────────────
function extractFromChatGPT(): RawTurn[] {
  const turns: RawTurn[] = [];

  const elements = document.querySelectorAll('[data-message-author-role]');

  elements.forEach(el => {
    const role = el.getAttribute('data-message-author-role');
    if (role !== 'user' && role !== 'assistant') return;

    // ChatGPT wraps response content in .markdown or .prose
    const textEl =
      el.querySelector('.markdown') ??
      el.querySelector('[class*="markdown"]') ??
      el.querySelector('.prose') ??
      el;

    const text = (textEl as HTMLElement | null)?.innerText ?? '';

    if (text.trim()) {
      turns.push({
        role: role as 'user' | 'assistant',
        text: text.trim(),
      });
    }
  });

  return turns;
}

// ── Site Detection ─────────────────────────────────────────
function detectSite(): 'gemini' | 'chatgpt' | null {
  const hostname = window.location.hostname;
  if (hostname.includes('gemini.google.com')) return 'gemini';
  if (hostname.includes('chatgpt.com')) return 'chatgpt';
  return null;
}

// ── Message Listener ───────────────────────────────────────
chrome.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
  if (message.type !== 'CAPTURE_REQUEST') return;

  try {
    const site = detectSite();

    if (!site) {
      sendResponse({
        type: 'CAPTURE_ERROR',
        message: 'Unsupported site. Please open gemini.google.com or chatgpt.com.',
      } satisfies ExtMessage);
      return true;
    }

    const turns: RawTurn[] =
      site === 'gemini' ? extractFromGemini() : extractFromChatGPT();

    if (turns.length === 0) {
      sendResponse({
        type: 'CAPTURE_ERROR',
        message: 'No conversation found on this page. Start a chat and try again.',
      } satisfies ExtMessage);
      return true;
    }

    sendResponse({
      type: 'CAPTURE_RESULT',
      turns,
      site,
    } satisfies ExtMessage);
  } catch (err) {
    sendResponse({
      type: 'CAPTURE_ERROR',
      message: `Extraction failed: ${String(err)}`,
    } satisfies ExtMessage);
  }

  // Return true to keep the message channel open for async sendResponse
  return true;
});
