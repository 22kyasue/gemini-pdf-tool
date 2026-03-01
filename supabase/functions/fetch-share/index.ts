// Supabase Edge Function: fetch-share
// Fetches ChatGPT/Gemini share link pages server-side (bypasses CORS),
// parses conversation turns from SSR HTML, returns structured data.
// Deploy: supabase functions deploy fetch-share

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Domain allowlist
const ALLOWED_DOMAINS = [
  'chatgpt.com',
  'chat.openai.com',
  'gemini.google.com',
  'g.co',
];

const CLAUDE_DOMAINS = ['claude.ai'];

const RATE_LIMIT_SECONDS = 10;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'missing_auth', message: 'Missing authorization header' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const anonKey = req.headers.get('apikey')
      ?? Deno.env.get('SUPABASE_ANON_KEY')
      ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
      },
    });
    if (!userRes.ok) {
      return json({ error: 'invalid_token', message: 'Invalid or expired token' }, 401);
    }
    const user = await userRes.json() as { id: string };
    if (!user?.id) {
      return json({ error: 'invalid_token', message: 'Invalid or expired token' }, 401);
    }

    // ── Parse request ─────────────────────────────────────────
    const body = await req.json() as {
      url?: string;
      browser_headers?: Record<string, string>;
    };
    const url = body.url?.trim();
    const browserHeaders = body.browser_headers ?? {};
    if (!url) {
      return json({ error: 'missing_url', message: 'URL is required' }, 400);
    }

    // ── Validate URL domain ──────────────────────────────────
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return json({ error: 'invalid_url', message: 'Invalid URL format' }, 400);
    }

    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    // Claude detection
    if (CLAUDE_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      return json({
        error: 'claude_unsupported',
        message: 'Claude share links cannot be imported — Claude uses client-side rendering which requires a browser to load. Please copy-paste the conversation text instead.',
      }, 422);
    }

    // Domain allowlist check
    const domainAllowed = ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
    if (!domainAllowed) {
      return json({
        error: 'unsupported_domain',
        message: `Domain "${hostname}" is not supported. Supported: ChatGPT, Gemini.`,
      }, 400);
    }

    // ── Rate limit (10s cooldown) ────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('share_last_fetched_at')
      .eq('id', user.id)
      .single();

    if (profile?.share_last_fetched_at) {
      const lastFetch = new Date(profile.share_last_fetched_at as string).getTime();
      const elapsed = (Date.now() - lastFetch) / 1000;
      if (elapsed < RATE_LIMIT_SECONDS) {
        const wait = Math.ceil(RATE_LIMIT_SECONDS - elapsed);
        return json({
          error: 'rate_limited',
          message: `Please wait ${wait} seconds before fetching another link.`,
          retryAfter: wait,
        }, 429);
      }
    }

    // Update last fetched timestamp
    await supabase
      .from('profiles')
      .update({ share_last_fetched_at: new Date().toISOString() })
      .eq('id', user.id);

    // ── Fetch the page ──────────────────────────────────────
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // Use the client's real browser headers if available, with sensible defaults
    const userAgent = browserHeaders['User-Agent']
      || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const acceptLang = browserHeaders['Accept-Language'] || 'en-US,en;q=0.9';

    let pageRes: Response;
    try {
      pageRes = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': acceptLang,
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (err) {
      clearTimeout(timeout);
      const msg = (err as Error).name === 'AbortError' ? 'Request timed out (15s)' : 'Failed to fetch the page';
      return json({ error: 'fetch_failed', message: msg }, 502);
    }
    clearTimeout(timeout);

    if (!pageRes.ok) {
      return json({
        error: 'fetch_failed',
        message: `Page returned HTTP ${pageRes.status}. The link may be expired or private.`,
      }, 502);
    }

    const html = await pageRes.text();

    // ── Detect platform and parse ───────────────────────────
    const platform = detectPlatform(hostname);

    let result: ParseResult;
    if (platform === 'chatgpt') {
      result = parseChatGPT(html);

      // Fallback: if HTML parsing failed, try ChatGPT's backend API
      if (!result.turns.length) {
        const shareId = extractChatGPTShareId(url);
        if (shareId) {
          const apiResult = await fetchChatGPTApi(shareId, userAgent);
          if (apiResult && apiResult.turns.length) {
            result = apiResult;
          }
        }
      }
    } else if (platform === 'gemini') {
      result = parseGemini(html);
    } else {
      return json({ error: 'parse_failed', message: 'Could not determine platform' }, 500);
    }

    if (!result.turns.length) {
      // Debug: return page info to help diagnose parsing failures
      const hasNextData = html.includes('__NEXT_DATA__');
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1].trim() : '(no title)';
      const htmlSnippet = html.slice(0, 500).replace(/</g, '&lt;');
      return json({
        error: 'parse_failed',
        message: `Could not extract conversation from the page. The page structure may have changed.`,
        debug: {
          platform,
          pageTitle,
          htmlLength: html.length,
          hasNextData,
          snippet: htmlSnippet,
        },
      }, 422);
    }

    return json({
      platform: result.platform,
      title: result.title,
      turns: result.turns,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json({ error: 'internal', message }, 500);
  }
});

// ── Types ────────────────────────────────────────────────────

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ParseResult {
  platform: string;
  title: string;
  turns: ConversationTurn[];
}

// ── Platform detection ──────────────────────────────────────

function detectPlatform(hostname: string): 'chatgpt' | 'gemini' | null {
  if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) return 'chatgpt';
  if (hostname.includes('gemini.google.com') || hostname.includes('g.co')) return 'gemini';
  return null;
}

// ── ChatGPT parser ──────────────────────────────────────────
// ChatGPT share pages embed conversation data in a <script id="__NEXT_DATA__"> tag.

function parseChatGPT(html: string): ParseResult {
  const turns: ConversationTurn[] = [];
  let title = '';

  // Strategy 0: Try to find JSON data embedded in Next.js chunks or inline scripts
  // ChatGPT sometimes embeds conversation data in script tags other than __NEXT_DATA__
  const jsonDataMatch = html.match(/"linear_conversation"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  if (jsonDataMatch) {
    try {
      const linearConv = JSON.parse(jsonDataMatch[1]);
      if (Array.isArray(linearConv)) {
        for (const node of linearConv) {
          const msg = node?.message;
          if (!msg || !msg.content?.parts) continue;
          const role = msg.author?.role;
          if (role !== 'user' && role !== 'assistant') continue;
          const textParts = msg.content.parts
            .filter((p: unknown) => typeof p === 'string')
            .join('\n');
          if (textParts.trim()) {
            turns.push({ role: role as 'user' | 'assistant', content: textParts.trim() });
          }
        }
      }
    } catch { /* continue to next strategy */ }
    if (turns.length) {
      // Try to get title
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        title = decodeHtmlEntities(titleMatch[1].trim())
          .replace(/^ChatGPT\s*[-–—]\s*/, '');
      }
      return { platform: 'ChatGPT', title, turns };
    }
  }

  // Strategy 1: Extract __NEXT_DATA__ JSON (classic SSR approach)
  const scriptMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    // Strategy 1b: Try to extract from any script tag containing serverResponse
    const anyScript = html.match(/"serverResponse"\s*:\s*\{[\s\S]*?"data"\s*:\s*(\{[\s\S]*?\})\s*\}/);
    if (anyScript) {
      try {
        const shareData = JSON.parse(anyScript[1]);
        title = shareData.title || '';
        const linearConv = shareData.linear_conversation;
        if (Array.isArray(linearConv)) {
          for (const node of linearConv) {
            const msg = node?.message;
            if (!msg || !msg.content?.parts) continue;
            const role = msg.author?.role;
            if (role !== 'user' && role !== 'assistant') continue;
            const textParts = msg.content.parts
              .filter((p: unknown) => typeof p === 'string')
              .join('\n');
            if (textParts.trim()) {
              turns.push({ role: role as 'user' | 'assistant', content: textParts.trim() });
            }
          }
        }
        if (turns.length) return { platform: 'ChatGPT', title, turns };
      } catch { /* continue */ }
    }
    return { platform: 'ChatGPT', title: '', turns: [] };
  }

  try {
    const data = JSON.parse(scriptMatch[1]);

    // Navigate to the conversation data
    const shareData = data?.props?.pageProps?.serverResponse?.data;
    if (!shareData) {
      return { platform: 'ChatGPT', title: '', turns: [] };
    }

    title = shareData.title || '';

    // The mapping object contains all messages; linear_conversation gives the order
    const linearConv = shareData.linear_conversation;
    if (Array.isArray(linearConv)) {
      for (const node of linearConv) {
        const msg = node?.message;
        if (!msg || !msg.content?.parts) continue;
        const role = msg.author?.role;
        if (role !== 'user' && role !== 'assistant') continue;

        const textParts = msg.content.parts
          .filter((p: unknown) => typeof p === 'string')
          .join('\n');

        if (textParts.trim()) {
          turns.push({
            role: role as 'user' | 'assistant',
            content: textParts.trim(),
          });
        }
      }
    }
  } catch {
    // JSON parse failed — try fallback
  }

  // Fallback: try to extract from the mapping tree directly
  if (!turns.length) {
    try {
      const data = JSON.parse(html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1] || '{}');
      const mapping = data?.props?.pageProps?.serverResponse?.data?.mapping;
      if (mapping && typeof mapping === 'object') {
        const collected = traverseMapping(mapping);
        if (collected.length > 0) {
          turns.push(...collected);
          title = title || data?.props?.pageProps?.serverResponse?.data?.title || '';
        }
      }
    } catch {
      // fallback also failed
    }
  }

  return { platform: 'ChatGPT', title, turns };
}

// Traverse ChatGPT mapping tree to collect messages in order
function traverseMapping(mapping: Record<string, MappingNode>): ConversationTurn[] {
  interface MappingNode {
    id: string;
    parent?: string;
    children?: string[];
    message?: {
      author?: { role?: string };
      content?: { parts?: unknown[] };
    };
  }

  // Find root (node with no parent or parent not in mapping)
  let rootId: string | null = null;
  for (const [id, node] of Object.entries(mapping)) {
    const n = node as MappingNode;
    if (!n.parent || !(n.parent in mapping)) {
      rootId = id;
      break;
    }
  }

  if (!rootId) return [];

  const turns: ConversationTurn[] = [];
  let currentId: string | null = rootId;

  while (currentId) {
    const node = mapping[currentId] as MappingNode;
    if (!node) break;

    const msg = node.message;
    if (msg?.author?.role && msg.content?.parts) {
      const role = msg.author.role;
      if (role === 'user' || role === 'assistant') {
        const text = msg.content.parts
          .filter((p: unknown) => typeof p === 'string')
          .join('\n')
          .trim();
        if (text) {
          turns.push({ role: role as 'user' | 'assistant', content: text });
        }
      }
    }

    // Follow first child
    currentId = node.children?.[0] ?? null;
  }

  return turns;
}

// ── Gemini parser ───────────────────────────────────────────
// Gemini share pages render conversation in SSR HTML.
// This is fragile and may break when Google changes their markup.

function parseGemini(html: string): ParseResult {
  const turns: ConversationTurn[] = [];
  let title = '';

  // Try to get title from <title> tag
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = decodeHtmlEntities(titleMatch[1].trim());
    // Remove " - Google Gemini" suffix
    title = title.replace(/\s*[-–—]\s*(Google\s+)?Gemini$/i, '').trim();
  }

  // Strategy 1: Look for message-content divs with data-message-author attributes
  const authorBlocks = html.matchAll(/data-message-author-role="(user|model)"[\s\S]*?<div[^>]*class="[^"]*message-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
  for (const m of authorBlocks) {
    const role = m[1] === 'model' ? 'assistant' : 'user';
    const content = stripHtml(m[2]).trim();
    if (content) {
      turns.push({ role: role as 'user' | 'assistant', content });
    }
  }

  // Strategy 2: Look for alternating user/model content blocks
  if (!turns.length) {
    // User prompts
    const userBlocks = [...html.matchAll(/<div[^>]*class="[^"]*user-query[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
    // Model responses
    const modelBlocks = [...html.matchAll(/<div[^>]*class="[^"]*model-response[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];

    const maxLen = Math.max(userBlocks.length, modelBlocks.length);
    for (let i = 0; i < maxLen; i++) {
      if (userBlocks[i]) {
        const content = stripHtml(userBlocks[i][1]).trim();
        if (content) turns.push({ role: 'user', content });
      }
      if (modelBlocks[i]) {
        const content = stripHtml(modelBlocks[i][1]).trim();
        if (content) turns.push({ role: 'assistant', content });
      }
    }
  }

  // Strategy 3: Look for query-text and response-text divs
  if (!turns.length) {
    const queryTexts = [...html.matchAll(/<div[^>]*class="[^"]*query-text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
    const responseTexts = [...html.matchAll(/<div[^>]*class="[^"]*response-container[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];

    const maxLen = Math.max(queryTexts.length, responseTexts.length);
    for (let i = 0; i < maxLen; i++) {
      if (queryTexts[i]) {
        const content = stripHtml(queryTexts[i][1]).trim();
        if (content) turns.push({ role: 'user', content });
      }
      if (responseTexts[i]) {
        const content = stripHtml(responseTexts[i][1]).trim();
        if (content) turns.push({ role: 'assistant', content });
      }
    }
  }

  return { platform: 'Gemini', title, turns };
}

// ── HTML utilities ──────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    // Convert <br> and block elements to newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    // Convert <code> to backticks
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    // Convert <pre> to code blocks
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```')
    // Convert <strong>/<b> to bold
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    // Convert <em>/<i> to italic
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ── ChatGPT API fallback ────────────────────────────────────
// When the share page is CSR (no __NEXT_DATA__), try fetching
// conversation data from ChatGPT's backend API directly.

function extractChatGPTShareId(url: string): string | null {
  // URLs like: https://chatgpt.com/share/69a317c5-2238-8011-91ec-cb95cd2983e1
  // Or: https://chatgpt.com/share/e/69a317c5-2238-8011-91ec-cb95cd2983e1
  const match = url.match(/\/share\/(?:e\/)?([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

async function fetchChatGPTApi(shareId: string, userAgent: string): Promise<ParseResult | null> {
  try {
    // ChatGPT's public share API endpoint
    const apiUrl = `https://chatgpt.com/backend-api/share/${shareId}`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Referer': `https://chatgpt.com/share/${shareId}`,
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const title = data?.title || '';
    const turns: ConversationTurn[] = [];

    // Try linear_conversation first
    const linearConv = data?.linear_conversation;
    if (Array.isArray(linearConv)) {
      for (const node of linearConv) {
        const msg = node?.message;
        if (!msg || !msg.content?.parts) continue;
        const role = msg.author?.role;
        if (role !== 'user' && role !== 'assistant') continue;
        const textParts = msg.content.parts
          .filter((p: unknown) => typeof p === 'string')
          .join('\n');
        if (textParts.trim()) {
          turns.push({ role: role as 'user' | 'assistant', content: textParts.trim() });
        }
      }
    }

    // Try mapping tree if linear_conversation didn't work
    if (!turns.length && data?.mapping) {
      const collected = traverseMapping(data.mapping);
      turns.push(...collected);
    }

    return turns.length ? { platform: 'ChatGPT', title, turns } : null;
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
