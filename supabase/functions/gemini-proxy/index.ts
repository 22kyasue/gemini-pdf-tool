// Supabase Edge Function: gemini-proxy
// Proxies Gemini API calls with JWT auth + free-tier usage enforcement.
// Deploy: supabase functions deploy gemini-proxy

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.24.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FREE_CALL_LIMIT = 10;
const FREE_WORD_LIMIT = 50_000;
const USAGE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ANON_CALL_LIMIT = 1;
const ANON_WORD_LIMIT = 10_000;
const MODEL = 'gemini-2.5-flash';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify JWT by calling Supabase auth REST endpoint directly
    const userRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
    });
    if (!userRes.ok) {
      return json({ error: 'Invalid or expired token' }, 401);
    }
    const user = await userRes.json() as { id: string; email?: string; is_anonymous?: boolean };
    if (!user?.id) {
      return json({ error: 'Invalid or expired token' }, 401);
    }

    // ── Parse request ─────────────────────────────────────────
    interface RequestBody {
      operation: 'split' | 'enhance' | 'title';
      text: string;
      features?: string[];
      customInstructions?: string;
      wordCount?: number;
    }
    const body = await req.json() as RequestBody;
    const { operation, text, features = [], customInstructions, wordCount = 0 } = body;

    if (!text?.trim()) {
      return json({ error: 'text is required' }, 400);
    }

    // ── Fetch profile + enforce limits ────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan, api_calls_used, words_used, usage_period_start')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return json({ error: 'User profile not found' }, 404);
    }

    // Weekly auto-reset for free users
    if (profile.plan === 'free') {
      const periodStart = profile.usage_period_start
        ? new Date(profile.usage_period_start as string).getTime()
        : 0;
      if (Date.now() - periodStart >= USAGE_PERIOD_MS) {
        profile.api_calls_used = 0;
        profile.words_used = 0;
        await supabase
          .from('profiles')
          .update({
            api_calls_used: 0,
            words_used: 0,
            usage_period_start: new Date().toISOString(),
          })
          .eq('id', user.id);
      }
    }

    // title calls are free — don't count against quota
    if (operation !== 'title' && profile.plan === 'free') {
      const isAnon = !!user.is_anonymous;
      const callLimit = isAnon ? ANON_CALL_LIMIT : FREE_CALL_LIMIT;
      const wordLimit = isAnon ? ANON_WORD_LIMIT : FREE_WORD_LIMIT;

      if (profile.api_calls_used >= callLimit) {
        return json({
          error: 'limit_exceeded',
          reason: 'calls',
          callsUsed: profile.api_calls_used,
          callsLimit: callLimit,
          wordsUsed: profile.words_used,
          wordsLimit: wordLimit,
          plan: 'free',
          isAnonymous: isAnon,
        }, 429);
      }
      if (profile.words_used + wordCount > wordLimit) {
        return json({
          error: 'limit_exceeded',
          reason: 'words',
          callsUsed: profile.api_calls_used,
          callsLimit: callLimit,
          wordsUsed: profile.words_used,
          wordsLimit: wordLimit,
          plan: 'free',
          isAnonymous: isAnon,
        }, 429);
      }
    }

    // ── Call Gemini ───────────────────────────────────────────
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return json({ error: 'Gemini API key not configured on server' }, 500);
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const systemInstruction = buildSystemPrompt(operation, new Set(features), customInstructions);
    const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction });

    const maxLength = operation === 'title' ? 8000 : 100_000;
    const result = await model.generateContent(text.slice(0, maxLength));
    const responseText = result.response.text();
    const usage = result.response.usageMetadata;
    const tokens = {
      promptTokens: usage?.promptTokenCount ?? 0,
      responseTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
    };

    // ── Update usage counters ─────────────────────────────────
    if (operation !== 'title') {
      await supabase
        .from('profiles')
        .update({
          api_calls_used: profile.api_calls_used + 1,
          words_used: profile.words_used + wordCount,
        })
        .eq('id', user.id);
    }

    return json({ text: responseText.trim(), tokens });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return json({ error: message }, 500);
  }
});

// ── System prompt builder ─────────────────────────────────────
function buildSystemPrompt(
  operation: string,
  features: Set<string>,
  customInstructions?: string,
): string {
  if (operation === 'title') {
    return [
      'You are a concise title generator.',
      'Given a chat transcript, generate a short (3-5 word) title summarizing the main topic.',
      'No quotes. No "Title:" prefix. Just the plain title text.',
    ].join(' ');
  }

  if (operation === 'enhance') {
    const lines = [
      'You are a professional markdown formatting restorer.',
      'The user will provide an AI response copied from a rendered chat UI where markdown was stripped.',
      'Restore the following formatting:',
    ];
    if (features.has('format')) lines.push('- **Bold** key terms, restore bullet/numbered lists, restore ## headings');
    if (features.has('tables')) lines.push('- Reconstruct pipe tables: | header | and |---| rows');
    if (features.has('code')) lines.push('- Re-fence code with ```language blocks; inline `backticks` for vars/commands');
    if (features.has('latex')) lines.push('- Restore LaTeX: $inline$ and $$block$$ math');
    if (customInstructions?.trim()) lines.push(`\nUSER INSTRUCTIONS: ${customInstructions.trim()}`);
    lines.push('\nCRITICAL: Do NOT change any text content. ONLY restore markdown. Return enhanced text directly.');
    return lines.join('\n');
  }

  // 'split' operation
  const hasAnyRestore = features.has('format') || features.has('tables') || features.has('code') || features.has('latex');
  const lines = [
    `You are a highly accurate chat log parser${hasAnyRestore ? ' and markdown restorer' : ''}.`,
    'Split the provided raw text into user and AI messages.',
  ];
  if (customInstructions?.trim()) lines.push(`USER SPECIFIC INSTRUCTIONS: "${customInstructions.trim()}"`);
  if (hasAnyRestore) {
    lines.push('Also restore markdown formatting that was lost during copy-paste:');
    if (features.has('code')) lines.push('- Re-fence code blocks with ```language');
    if (features.has('tables')) lines.push('- Reconstruct markdown pipe tables');
    if (features.has('format')) lines.push('- Restore **bold**, lists, ## headings');
    if (features.has('latex')) lines.push('- Restore $inline$ and $$block$$ LaTeX');
  }
  lines.push('Return ONLY a valid JSON array: [{"role":"user","content":"..."},{"role":"ai","content":"..."}]');
  lines.push('No markdown fences, no explanations. Raw JSON array only.');
  return lines.join('\n');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
