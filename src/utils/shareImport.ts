// ══════════════════════════════════════════════════════════
// Share Link Import — Frontend API Client
// Calls the /fetch-share edge function to import conversations
// from ChatGPT/Gemini share links.
// ══════════════════════════════════════════════════════════

import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// ── Session management (same pattern as llmParser.ts) ────────

let _shareSession: Session | null = null;

export function setShareSession(session: Session | null): void {
  _shareSession = session;
}

/** Get a fresh session — the stored snapshot may have an expired access_token. */
async function getFreshSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) _shareSession = session;
  return session ?? _shareSession;
}

// ── Types ────────────────────────────────────────────────────

export interface ShareTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ShareImportResult {
  platform: string;
  title: string;
  turns: ShareTurn[];
}

export interface ShareImportError {
  error: string;
  message: string;
  retryAfter?: number;
}

// ── URL validation ──────────────────────────────────────────

const SHARE_DOMAINS = [
  'chatgpt.com',
  'chat.openai.com',
  'gemini.google.com',
  'g.co',
  'claude.ai',
];

const SHARE_PATH_PATTERNS = [
  /^https?:\/\/(www\.)?chatgpt\.com\/share\//i,
  /^https?:\/\/(www\.)?chat\.openai\.com\/share\//i,
  /^https?:\/\/gemini\.google\.com\/share\//i,
  /^https?:\/\/g\.co\//i,
  /^https?:\/\/(www\.)?claude\.ai\/share\//i,
];

/** Client-side fast validation: is this URL from a supported share domain? */
export function validateShareUrl(url: string): { valid: boolean; platform?: string; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  const hostname = parsed.hostname.replace(/^www\./, '');

  if (hostname === 'claude.ai' || hostname.endsWith('.claude.ai')) {
    return { valid: false, platform: 'Claude', error: 'claude_unsupported' };
  }

  const isAllowed = SHARE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  if (!isAllowed) {
    return { valid: false, error: 'unsupported_domain' };
  }

  if (hostname.includes('chatgpt') || hostname.includes('openai')) {
    return { valid: true, platform: 'ChatGPT' };
  }
  if (hostname.includes('gemini') || hostname === 'g.co') {
    return { valid: true, platform: 'Gemini' };
  }

  return { valid: true };
}

/**
 * Quick heuristic: does this text look like a single share URL?
 * Used for auto-detect when pasting into the textarea.
 */
export function looksLikeShareUrl(text: string): boolean {
  const trimmed = text.trim();
  // Must be a single line, looks like a URL
  if (trimmed.includes('\n') || trimmed.length > 500) return false;
  return SHARE_PATH_PATTERNS.some(p => p.test(trimmed));
}

// ── Import API ──────────────────────────────────────────────

/** Call the /fetch-share edge function to import a share link. */
export async function importShareLink(url: string): Promise<ShareImportResult> {
  const session = await getFreshSession();
  if (!session) {
    throw new ShareLinkError('not_authenticated', 'Sign in to import share links.');
  }

  const supabaseUrl = (typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__VITE_SUPABASE_URL__
    : undefined) as string | undefined
    ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);

  if (!supabaseUrl) {
    throw new ShareLinkError('config_error', 'Supabase URL not configured.');
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/fetch-share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify({
      url: url.trim(),
      browser_headers: {
        'User-Agent': navigator.userAgent,
        'Accept-Language': navigator.language || 'en-US',
        'Platform': navigator.platform || '',
      },
    }),
  });

  const data = await res.json().catch(() => ({ error: 'parse_error', message: 'Invalid response from server' }));

  if (!res.ok) {
    // Log debug info for parse failures
    if (data.debug) {
      console.log('[ShareImport] Parse failed debug:', JSON.stringify(data.debug, null, 2));
    }
    throw new ShareLinkError(
      data.error || 'unknown',
      data.debug
        ? `${data.message} [${data.debug.platform}, title="${data.debug.pageTitle}", ${data.debug.htmlLength} bytes, __NEXT_DATA__=${data.debug.hasNextData}]`
        : (data.message || `Server error (${res.status})`),
      data.retryAfter,
    );
  }

  return data as ShareImportResult;
}

// ── Conversion ──────────────────────────────────────────────

/** Convert parsed turns into the "User:\ncontent\n\nAI:\ncontent" format
 *  that the existing parseChatLog / auto-split pipeline understands. */
export function turnsToEditorText(turns: ShareTurn[]): string {
  return turns
    .map(t => {
      const label = t.role === 'user' ? 'User' : 'AI';
      return `${label}:\n${t.content}`;
    })
    .join('\n\n');
}

// ── Error class ─────────────────────────────────────────────

export class ShareLinkError extends Error {
  code: string;
  retryAfter?: number;

  constructor(code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = 'ShareLinkError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
