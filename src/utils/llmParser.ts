// ══════════════════════════════════════════════════════════
// GEMINI API — Semantic Chat Splitting & AI Features
// Dual-path: user's own API key (direct) OR Supabase edge function (proxy)
// ══════════════════════════════════════════════════════════

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Session } from '@supabase/supabase-js';

const MODEL = 'gemini-2.5-flash';

// ── Key / session management ──────────────────────────────────

/** Returns the user's own API key if they've entered one in Settings. */
function getUserApiKey(): string | null {
    const fromSettings = localStorage.getItem('googleApiKey');
    if (fromSettings && fromSettings.trim()) return fromSettings.trim();
    return null;
}

/** Stored Supabase session — set by useAuth hook when auth state changes. */
let _supabaseSession: Session | null = null;

/** Called by useAuth whenever the auth session changes. */
export function setSupabaseSession(session: Session | null): void {
    _supabaseSession = session;
}

/**
 * Returns true if API calls can be made:
 *   - User has entered their own Gemini API key (BYOK), OR
 *   - User is authenticated with Supabase (uses hosted key via edge function)
 */
export function hasApiKey(): boolean {
    return getUserApiKey() !== null || _supabaseSession !== null;
}

/** Returns true only if the user has entered their own Gemini API key (BYOK). */
export function hasOwnApiKey(): boolean {
    return getUserApiKey() !== null;
}

// ── Types ─────────────────────────────────────────────────────

/** Result of AI-based chat splitting */
export interface AISplitMessage {
    role: 'user' | 'ai';
    content: string;
}

/** Token usage from API call */
export interface TokenUsage {
    promptTokens: number;
    responseTokens: number;
    totalTokens: number;
}

/** Structured error from API calls */
export interface ApiError {
    code: number;
    message: string;
}

/** Result with token usage */
interface GeminiResult {
    text: string;
    tokens: TokenUsage;
}

/** Last API error — exposed so the UI can display it */
let _lastApiError: ApiError | null = null;

export function getLastApiError(): ApiError | null {
    return _lastApiError;
}

export function clearLastApiError(): void {
    _lastApiError = null;
}

/** Feature flags for API processing */
export type ApiFeature = 'split' | 'format' | 'tables' | 'code' | 'latex';

/** Helper: sleep for ms */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Extract HTTP status from SDK errors */
function getErrorStatus(error: unknown): number {
    const err = error as { status?: number; response?: { status?: number }; errorDetails?: Array<{ status?: number }>; httpCode?: number; code?: number };
    return err?.status ?? err?.response?.status ?? err?.errorDetails?.[0]?.status ?? 0;
}

// ══════════════════════════════════════════════════════════
// PATH A: Direct Gemini call (user's own API key — BYOK)
// ══════════════════════════════════════════════════════════

async function callGeminiDirect(prompt: string, systemPrompt: string): Promise<GeminiResult | null> {
    const apiKey = getUserApiKey();
    if (!apiKey) return null;

    const MAX_RETRIES = 2;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[Gemini] Direct call attempt ${attempt + 1}/${MAX_RETRIES + 1} — ${prompt.length} chars`);
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction: systemPrompt });
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const usage = result.response.usageMetadata;
            const tokens: TokenUsage = {
                promptTokens: usage?.promptTokenCount ?? 0,
                responseTokens: usage?.candidatesTokenCount ?? 0,
                totalTokens: usage?.totalTokenCount ?? 0,
            };
            console.log(`[Gemini] SUCCESS — ${tokens.promptTokens}in + ${tokens.responseTokens}out = ${tokens.totalTokens} tokens`);
            _lastApiError = null;
            return text?.trim() ? { text: text.trim(), tokens } : null;
        } catch (error: unknown) {
            lastError = error;
            const status = getErrorStatus(error);
            const errObj = error as { message?: string };
            console.error(`[Gemini] ERROR — status: ${status}, message: ${errObj?.message || 'unknown'}`);

            if (status === 503 && attempt < MAX_RETRIES) {
                const delay = Math.pow(2, attempt + 1) * 1000;
                console.warn(`[Gemini] 503 overload, retrying in ${delay / 1000}s...`);
                await sleep(delay);
                continue;
            }

            let message: string;
            if (status === 400) {
                message = `Request error (400): ${(error as Error).message || 'Unknown request error'}`;
            } else if (status === 401 || status === 403) {
                message = `Auth error (${status}): Invalid API key. Generate a new key at Google AI Studio.`;
            } else if (status === 429) {
                message = `Rate limit (429): Free tier quota exceeded. Please wait and try again.`;
            } else if (status === 503) {
                message = `API overloaded (503): Google AI API is temporarily busy.`;
            } else if (status) {
                message = `API error (${status}): ${(error as Error).message || 'Unknown error'}`;
            } else {
                message = `Network error: Cannot connect to Gemini API. Check your internet connection.`;
            }
            _lastApiError = { code: status || 0, message };
            return null;
        }
    }

    console.error('[Gemini] Max retries exhausted', lastError);
    return null;
}

// ══════════════════════════════════════════════════════════
// PATH B: Supabase edge function proxy (hosted key)
// ══════════════════════════════════════════════════════════

interface ProxyRequestBody {
    operation: 'split' | 'enhance' | 'title';
    text: string;
    features?: string[];
    customInstructions?: string;
    wordCount?: number;
}

interface ProxyResponse {
    text?: string;
    tokens?: TokenUsage;
    error?: string;
    reason?: string;
    callsUsed?: number;
    callsLimit?: number;
    wordsUsed?: number;
    wordsLimit?: number;
    plan?: string;
    isAnonymous?: boolean;
}

async function callGeminiProxy(body: ProxyRequestBody): Promise<GeminiResult | null> {
    if (!_supabaseSession) {
        _lastApiError = { code: 0, message: 'Not authenticated. Sign in to use AI features.' };
        return null;
    }

    const supabaseUrl = (typeof window !== 'undefined'
        ? (window as unknown as Record<string, unknown>).__VITE_SUPABASE_URL__
        : undefined) as string | undefined
        ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);

    if (!supabaseUrl) {
        _lastApiError = { code: 0, message: 'Supabase URL not configured.' };
        return null;
    }

    try {
        console.log(`[Gemini] Proxy call — operation: ${body.operation}, ${body.text.length} chars`);
        const res = await fetch(`${supabaseUrl}/functions/v1/gemini-proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${_supabaseSession.access_token}`,
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            },
            body: JSON.stringify(body),
        });

        const data: ProxyResponse = await res.json().catch(() => ({} as ProxyResponse));

        if (!res.ok) {
            if (data.error === 'limit_exceeded') {
                const reason = data.reason === 'words' ? 'word limit' : 'call limit';
                const prefix = data.isAnonymous ? 'ANON_LIMIT_EXCEEDED' : 'LIMIT_EXCEEDED';
                const cta = data.isAnonymous
                    ? 'Sign in for free to get 10 calls/week.'
                    : 'Upgrade to Pro for unlimited usage.';
                _lastApiError = {
                    code: 429,
                    message: `${prefix}: You've reached your ${reason}. ${cta}`,
                };
                return null;
            }
            _lastApiError = {
                code: res.status,
                message: data.error || `Server error (${res.status})`,
            };
            return null;
        }

        if (!data.text) {
            _lastApiError = { code: 0, message: 'Empty response from server' };
            return null;
        }

        console.log(`[Gemini] Proxy SUCCESS — tokens: ${data.tokens?.totalTokens ?? 'unknown'}`);
        _lastApiError = null;
        return {
            text: data.text,
            tokens: data.tokens ?? { promptTokens: 0, responseTokens: 0, totalTokens: 0 },
        };
    } catch (error) {
        _lastApiError = { code: 0, message: `Network error: ${(error as Error).message}` };
        return null;
    }
}

// ══════════════════════════════════════════════════════════
// System prompt builders (shared logic for direct path)
// ══════════════════════════════════════════════════════════

function buildSystemPrompt(features: Set<ApiFeature>, customInstructions?: string): string {
    const hasFormat = features.has('format');
    const hasTables = features.has('tables');
    const hasCode = features.has('code');
    const hasLatex = features.has('latex');
    const hasAnyRestore = hasFormat || hasTables || hasCode || hasLatex;

    let prompt = `You are a highly accurate chat log parser${hasAnyRestore ? ' and markdown restorer' : ''}. The user will provide raw, messy text copied from a chat interface (like ChatGPT, Gemini, or Claude).

Your job is to determine where the human user speaks and where the AI assistant speaks.${hasAnyRestore ? '\nYou must also RESTORE proper markdown formatting that was lost during copy-paste.' : ''}
`;

    if (customInstructions && customInstructions.trim()) {
        prompt += `\nUSER SPECIFIC INSTRUCTIONS:\nThe user has provided an additional request/instruction for how to parse this output:\n"${customInstructions.trim()}"\nYou MUST follow this instruction carefully while processing the text.\n`;
    }

    if (hasAnyRestore) {
        prompt += `\nWhen text is copied from a rendered chat UI, markdown formatting is stripped. Restore the following:\n`;
        if (hasCode) {
            prompt += `- Code blocks lose their \`\`\` fencing → detect code and re-wrap it in \`\`\`language blocks (detect the language: python, javascript, java, sql, bash, etc.). If unsure, use \`\`\`plaintext\n`;
        }
        if (hasTables) {
            prompt += `- Tables lose their | pipe | format → reconstruct them as proper markdown tables with | header | and |---| separator rows\n`;
        }
        if (hasFormat) {
            prompt += `- Bold text loses ** markers → restore **bold** on key terms and emphasis
- Bullet lists lose their - or * markers → restore as proper markdown lists
- Numbered lists lose formatting → restore as 1. 2. 3.
- Headings lose # markers → restore section headings with appropriate # level\n`;
        }
        if (hasLatex) {
            prompt += `- Mathematical expressions lose their LaTeX delimiters → restore inline math as $expression$ and display/block math as $$expression$$\n`;
        }
    }

    prompt += `
Rules:
- Identify each distinct message in the conversation
- Do NOT summarize or remove real content${hasAnyRestore ? ' — only restore formatting' : ''}
- Remove UI junk (like "Copy", "Good response", "回答案を表示", "Memory updated", "Edit", thumbs up/down text, etc.) but keep all real content
- If you see explicit markers like "User:", "You said:", "ChatGPT said:", "Gemini の回答", etc., use them as boundaries and REMOVE the marker text from the content
- If there are no explicit markers, use context clues: questions/requests = user, detailed answers/explanations = AI

Return ONLY a valid JSON array with this exact schema:
[{"role":"user","content":"..."},{"role":"ai","content":"..."}]

No markdown formatting around the JSON, no \`\`\`json blocks, no explanations. ONLY the raw JSON array.`;

    return prompt;
}

function buildEnhanceSystemPrompt(features: Set<ApiFeature>, customInstructions?: string): string {
    const hasFormat = features.has('format');
    const hasTables = features.has('tables');
    const hasCode = features.has('code');
    const hasLatex = features.has('latex');

    let instructions = '';
    if (hasFormat) {
        instructions += `- Restore **bold** markers on key terms, emphasis, and important phrases
- Restore bullet lists with proper - or * markers and consistent indentation
- Restore numbered lists as 1. 2. 3. with proper formatting
- Restore section headings with appropriate ## or ### levels
- Ensure proper paragraph spacing (blank lines between sections)
`;
    }
    if (hasTables) {
        instructions += `- Reconstruct data that was originally in table format into a SINGLE proper markdown pipe table with | header | and |---| separator rows
- Look for patterns of repeated structured data (rows of label + values) — these are tables, NOT code
- The entire table must be ONE contiguous markdown table block, never split into multiple blocks
- Align columns properly and infer headers if they are present but lost their formatting
`;
    }
    if (hasCode) {
        instructions += `- Detect ACTUAL PROGRAMMING CODE (functions, classes, scripts, shell commands, multi-line code blocks) that lost its fencing, and re-wrap it in \`\`\`language blocks (detect the language: python, javascript, java, sql, bash, html, css, typescript, etc.). If unsure, use \`\`\`plaintext.
- Also restore inline code with \`backticks\` for function names, variables, commands, file paths, etc.
`;
    }
    if (hasLatex) {
        instructions += `- Restore LaTeX delimiters for mathematical expressions: inline math as $expression$ and display/block math as $$expression$$.
- Common patterns: fractions (a/b → $\\frac{a}{b}$), exponents (x^2 → $x^2$), summations (Σ → $\\sum$), Greek letters (α → $\\alpha$), square roots (√x → $\\sqrt{x}$).
`;
    }

    let conflictRules = '';
    if (hasTables && hasCode) {
        conflictRules += `
IMPORTANT — TABLE vs CODE PRIORITY:
- When you see structured rows of data (label + values like O(1), O(n), percentages, numbers, Yes/No), this is TABULAR DATA — reconstruct it as ONE markdown pipe table. Do NOT wrap individual cell values in code fences.
- Only use code fences (\`\`\`language) for actual multi-line programming code (function definitions, scripts, shell commands, etc.)`;
    }
    if (hasTables && hasLatex) {
        conflictRules += `
IMPORTANT — TABLE vs LATEX PRIORITY:
- Mathematical notation inside a table should stay as plain text cell values, NOT be converted to LaTeX $...$ delimiters
- Only restore LaTeX for standalone mathematical expressions in prose paragraphs`;
    }

    return `You are a professional markdown formatting restorer. The user will provide an AI assistant's response that was copied from a rendered chat UI where markdown formatting was stripped.

Your job is to RESTORE the proper markdown formatting to make the text look polished and professional. Specifically:
${instructions}
${customInstructions && customInstructions.trim() ? `\nUSER SPECIFIC INSTRUCTIONS:\nThe user has provided an additional request for how to enhance/format this output:\n"${customInstructions.trim()}"\nYou MUST follow this instruction carefully.\n` : ''}
CRITICAL RULES:
- Do NOT change, summarize, or rephrase any text content — keep every word exactly as-is
- Do NOT add any new content, commentary, or explanations
- ONLY restore markdown formatting (bold, lists, headings, tables, code fences, backticks, LaTeX delimiters)
- Preserve all existing markdown formatting that is already correct
- Return the enhanced text directly, no JSON wrapping, no explanations${conflictRules}`;
}

// ══════════════════════════════════════════════════════════
// PUBLIC API: Chat splitting
// ══════════════════════════════════════════════════════════

export interface SplitResult {
    messages: AISplitMessage[];
    tokens: TokenUsage;
}

export async function splitChatWithGemini(
    rawText: string,
    features?: Set<ApiFeature>,
    customInstructions?: string,
    wordCount?: number,
): Promise<SplitResult | null> {
    if (!rawText.trim()) return null;

    const userKey = getUserApiKey();
    const truncated = rawText.slice(0, 100000);
    const effectiveFeatures = features ?? new Set<ApiFeature>(['split', 'format', 'tables', 'code']);

    let result: GeminiResult | null;

    if (userKey) {
        // Path A: user's own key, call Gemini directly
        const systemPrompt = buildSystemPrompt(effectiveFeatures, customInstructions);
        result = await callGeminiDirect(truncated, systemPrompt);
    } else if (_supabaseSession) {
        // Path B: authenticated user, use proxy
        result = await callGeminiProxy({
            operation: 'split',
            text: truncated,
            features: [...effectiveFeatures],
            customInstructions,
            wordCount: wordCount ?? rawText.split(/\s+/).length,
        });
    } else {
        _lastApiError = { code: 0, message: 'Sign in to use AI features, or enter your own API key in Settings.' };
        return null;
    }

    if (!result) return null;

    try {
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error('[Gemini] Response did not contain a JSON array:', result.text.slice(0, 200));
            return null;
        }

        const parsed = JSON.parse(jsonMatch[0]) as unknown[];
        if (!Array.isArray(parsed) || parsed.length === 0) return null;

        interface RawMessage { role?: unknown; content: string; }
        const isRawMessage = (item: unknown): item is RawMessage =>
            !!item && typeof item === 'object' &&
            typeof (item as Record<string, unknown>).content === 'string' &&
            Boolean((item as RawMessage).content.trim());

        const messages = parsed
            .filter(isRawMessage)
            .map(item => ({
                role: item.role === 'user' ? 'user' as const : 'ai' as const,
                content: item.content.trim(),
            }));

        return { messages, tokens: result.tokens };
    } catch (error) {
        console.error('[Gemini] Failed to parse split response:', error);
        return null;
    }
}

// ══════════════════════════════════════════════════════════
// PUBLIC API: Chat title generation
// ══════════════════════════════════════════════════════════

export async function generateChatTitle(rawText: string): Promise<string | null> {
    if (!hasApiKey() || !rawText.trim()) return null;

    const truncated = rawText.slice(0, 8000);
    const userKey = getUserApiKey();

    let result: GeminiResult | null;

    if (userKey) {
        const systemPrompt = `You are a concise title generator. The user will provide a chat snippet.
Analyze the content and generate a very short, meaningful title (max 4-5 words) summarizing the main topic.
Do not use quotes. Do not include labels like "Title:". Just return the short title text.`;
        result = await callGeminiDirect(truncated, systemPrompt);
    } else {
        // title calls are free — no usage deducted
        result = await callGeminiProxy({ operation: 'title', text: truncated });
    }

    if (result?.text) {
        let clean = result.text.replace(/^["']|["']$/g, '').trim();
        if (clean.length > 50) clean = clean.substring(0, 50) + '...';
        return clean;
    }
    return null;
}

// ══════════════════════════════════════════════════════════
// PUBLIC API: Content enhancement
// ══════════════════════════════════════════════════════════

export async function enhanceContentWithGemini(
    content: string,
    features: Set<ApiFeature>,
    customInstructions?: string,
    wordCount?: number,
): Promise<{ text: string; tokens: TokenUsage } | null> {
    if (!content.trim()) return null;

    const hasFormat = features.has('format');
    const hasTables = features.has('tables');
    const hasCode = features.has('code');
    const hasLatex = features.has('latex');
    if (!hasFormat && !hasTables && !hasCode && !hasLatex) return null;

    const truncated = content.slice(0, 50000);
    const userKey = getUserApiKey();

    let result: GeminiResult | null;

    if (userKey) {
        const systemPrompt = buildEnhanceSystemPrompt(features, customInstructions);
        result = await callGeminiDirect(truncated, systemPrompt);
    } else if (_supabaseSession) {
        result = await callGeminiProxy({
            operation: 'enhance',
            text: truncated,
            features: [...features],
            customInstructions,
            wordCount: wordCount ?? content.split(/\s+/).length,
        });
    } else {
        _lastApiError = { code: 0, message: 'Sign in to use AI features, or enter your own API key in Settings.' };
        return null;
    }

    if (!result) return null;
    return { text: result.text, tokens: result.tokens };
}
