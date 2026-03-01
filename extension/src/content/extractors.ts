// ══════════════════════════════════════════════════════════
// DOM EXTRACTORS — Gemini & ChatGPT conversation scrapers
// ══════════════════════════════════════════════════════════

import type { RawTurn } from '../shared/messages';

// ── Gemini DOM Reader ──────────────────────────────────────
export function extractFromGemini(): RawTurn[] {
  const turns: RawTurn[] = [];

  const elements = document.querySelectorAll('user-query, model-response');

  elements.forEach(el => {
    const tag = el.tagName.toLowerCase();
    const role: 'user' | 'assistant' = tag === 'user-query' ? 'user' : 'assistant';

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
export function extractFromChatGPT(): RawTurn[] {
  const turns: RawTurn[] = [];

  const elements = document.querySelectorAll('[data-message-author-role]');

  elements.forEach(el => {
    const role = el.getAttribute('data-message-author-role');
    if (role !== 'user' && role !== 'assistant') return;

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

  // Fallback 1: article[data-testid^="conversation-turn-"] containers
  if (turns.length === 0) {
    const articles = document.querySelectorAll('article[data-testid^="conversation-turn-"]');
    articles.forEach(article => {
      const authorEl = article.querySelector('[data-message-author-role]');
      const role = authorEl?.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant') return;

      const textEl =
        article.querySelector('.markdown') ??
        article.querySelector('[class*="markdown"]') ??
        article.querySelector('.prose') ??
        article;

      const text = (textEl as HTMLElement).innerText ?? '';
      if (text.trim()) {
        turns.push({ role: role as 'user' | 'assistant', text: text.trim() });
      }
    });
  }

  // Fallback 2: generic turn containers
  if (turns.length === 0) {
    const containers = document.querySelectorAll('[class*="ConversationItem"], [class*="chat-message"], [class*="turn"]');
    let turnIndex = 0;
    containers.forEach(el => {
      const text = (el as HTMLElement).innerText ?? '';
      if (text.trim()) {
        turns.push({
          role: turnIndex % 2 === 0 ? 'user' : 'assistant',
          text: text.trim(),
        });
        turnIndex++;
      }
    });
  }

  return turns;
}

// ── Site Detection ─────────────────────────────────────────
export function detectSite(): 'gemini' | 'chatgpt' | null {
  const hostname = window.location.hostname;
  if (hostname.includes('gemini.google.com')) return 'gemini';
  if (hostname.includes('chatgpt.com')) return 'chatgpt';
  return null;
}
