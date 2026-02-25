// ══════════════════════════════════════════════════════════
// GEMINI API — Semantic Chat Splitting & AI Features
// ══════════════════════════════════════════════════════════

import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = "gemini-2.5-flash";

/**
 * Dynamic API key retrieval.
 * Priority: 1) localStorage (user-entered in Settings UI)
 *           2) .env.local (VITE_GOOGLE_API_KEY)
 */
/**
 * Dynamic API key retrieval.
 * Priority: 1) Password override
 *           2) localStorage (user-entered in Settings UI)
 *           3) .env.local (VITE_GOOGLE_API_KEY)
 */
function getApiKey(): string | null {
    if (localStorage.getItem('apiPassword') === 'kenseiyasue123') return 'AIzaSyBIOqIAjDuOJ-2pyJ2T6KDsmB7xCx13EhE';
    const fromSettings = localStorage.getItem('googleApiKey');
    if (fromSettings && fromSettings.trim()) return fromSettings.trim();
    const fromEnv = import.meta.env.VITE_GOOGLE_API_KEY;
    if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
    return null;
}

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

/** Helper: sleep for ms */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Extract HTTP status from SDK errors */
function getErrorStatus(error: unknown): number {
    const err = error as { status?: number; response?: { status?: number }; errorDetails?: Array<{ status?: number }>; httpCode?: number; code?: number; constructor?: { name?: string } };
    const status = err?.status ?? err?.response?.status ?? err?.errorDetails?.[0]?.status ?? 0;
    console.log(`[Gemini] Error inspection: status=${status}, err.status=${err?.status}, err.httpCode=${err?.httpCode}, err.code=${err?.code}, constructor=${err?.constructor?.name}`);
    return status;
}

/**
 * Low-level: send a prompt to Gemini and get raw text back.
 * Retries only on 503 (overload). 429 (rate limit) fails immediately to preserve quota.
 */
async function callGemini(prompt: string, systemPrompt: string): Promise<GeminiResult | null> {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.log('[Gemini] No API key set — skipping');
        _lastApiError = { code: 0, message: "No API key configured. Enter your key in Settings." };
        return null;
    }

    const MAX_RETRIES = 2; // only for 503
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[Gemini] API call attempt ${attempt + 1}/${MAX_RETRIES + 1} — prompt length: ${prompt.length} chars`);
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: MODEL,
                systemInstruction: systemPrompt,
            });
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const usage = result.response.usageMetadata;
            const tokens: TokenUsage = {
                promptTokens: usage?.promptTokenCount ?? 0,
                responseTokens: usage?.candidatesTokenCount ?? 0,
                totalTokens: usage?.totalTokenCount ?? 0,
            };

            console.log(`[Gemini] SUCCESS — tokens: ${tokens.promptTokens} in + ${tokens.responseTokens} out = ${tokens.totalTokens} total`);
            _lastApiError = null;
            return text?.trim() ? { text: text.trim(), tokens } : null;
        } catch (error: unknown) {
            lastError = error;
            const status = getErrorStatus(error);
            const errObj = error as { message?: string; errorDetails?: unknown; response?: { data?: unknown } };
            console.error(`[Gemini] ERROR — status: ${status}, attempt: ${attempt + 1}, message: ${errObj?.message || 'unknown'}, errorDetails: ${JSON.stringify(errObj?.errorDetails || errObj?.response?.data || 'none')}`);

            // 503 only: retry with backoff (server overload is temporary)
            if (status === 503 && attempt < MAX_RETRIES) {
                const delay = Math.pow(2, attempt + 1) * 1000;
                console.warn(`[Gemini] 503 overload, retrying in ${delay / 1000}s...`);
                await sleep(delay);
                continue;
            }

            // Everything else: fail immediately (don't waste quota)
            let message: string;
            if (status === 400) {
                message = `Request error (400): ${(error as Error).message || 'Unknown request error'}`;
            } else if (status === 401 || status === 403) {
                message = `Auth error (${status}): Invalid API key. Generate a new key at Google AI Studio.`;
            } else if (status === 429) {
                message = `Rate limit (429): Free tier quota exceeded. Please wait a minute and try again.`;
            } else if (status === 503) {
                message = `API overloaded (503): Google AI API is temporarily busy.`;
            } else if (status) {
                message = `API error (${status}): ${(error as Error).message || 'Unknown error'}`;
            } else {
                message = `Network error: Cannot connect to API. Check your internet connection.`;
            }
            _lastApiError = { code: status || 0, message };
            return null;
        }
    }

    console.error("[Gemini] max retries exhausted", lastError);
    return null;
}

// ══════════════════════════════════════════════════════════
// CORE: Semantic Chat Splitting
// Send raw text → Gemini splits into user/AI messages
// ══════════════════════════════════════════════════════════

/** Feature flags for API processing */
export type ApiFeature = 'split' | 'format' | 'tables' | 'code' | 'latex';

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
            prompt += `- Mathematical expressions lose their LaTeX delimiters → restore inline math as $expression$ and display/block math as $$expression$$
- Common patterns: fractions (a/b → $\\frac{a}{b}$), exponents (x^2 → $x^2$), subscripts (x_i → $x_i$), summations (Σ → $\\sum$), integrals (∫ → $\\int$), Greek letters (α → $\\alpha$), square roots (√x → $\\sqrt{x}$)
- If the original text clearly contained mathematical notation, restore it with proper LaTeX\n`;
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

export interface SplitResult {
    messages: AISplitMessage[];
    tokens: TokenUsage;
}

export async function splitChatWithGemini(rawText: string, features?: Set<ApiFeature>, customInstructions?: string): Promise<SplitResult | null> {
    if (!getApiKey()) {
        _lastApiError = { code: 0, message: "No API key configured. Enter your key in Settings." };
        return null;
    }
    if (!rawText.trim()) return null;

    const truncated = rawText.slice(0, 100000);

    try {
        const systemPrompt = buildSystemPrompt(features ?? new Set(['split', 'format', 'tables', 'code']), customInstructions);
        const result = await callGemini(truncated, systemPrompt);
        if (!result) return null;

        // Extract JSON array from response
        const jsonMatch = result.text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error("Gemini did not return valid JSON array:", result.text.slice(0, 200));
            return null;
        }

        const parsed = JSON.parse(jsonMatch[0]) as unknown[];
        if (!Array.isArray(parsed) || parsed.length === 0) return null;

        interface RawMessage { role?: unknown; content: string; }
        const isRawMessage = (item: unknown): item is RawMessage =>
            !!item && typeof item === 'object' && typeof (item as Record<string, unknown>).content === 'string' && Boolean((item as RawMessage).content.trim());

        const messages = parsed
            .filter(isRawMessage)
            .map(item => ({
                role: item.role === 'user' ? 'user' as const : 'ai' as const,
                content: item.content.trim(),
            }));

        return { messages, tokens: result.tokens };
    } catch (error) {
        console.error("Chat splitting failed:", error);
        return null;
    }
}

// ══════════════════════════════════════════════════════════
// OPTIONAL: AI-enhanced features (table recovery, etc.)
// These are secondary — the splitting above is the core.
// ══════════════════════════════════════════════════════════

/**
 * Generate a short, 3-5 word title for a chat transcript
 */
export async function generateChatTitle(rawText: string): Promise<string | null> {
    if (!getApiKey() || !rawText.trim()) return null;

    const systemPrompt = `You are a concise title generator. The user will provide a chat snippet. 
Analyze the content and generate a very short, meaningful title (max 4-5 words) summarizing the main topic.
Do not use quotes. Do not include labels like "Title:". Just return the short title text.`;

    // Only need front of the text for a title usually
    const truncated = rawText.slice(0, 8000);

    try {
        const result = await callGemini(truncated, systemPrompt);
        if (result && result.text) {
            // strip quotes just in case
            let clean = result.text.replace(/^["']|["']$/g, '').trim();
            if (clean.length > 50) clean = clean.substring(0, 50) + '...';
            return clean;
        }
    } catch (error) {
        console.error("Title generation failed:", error);
    }
    return null;
}

/**
 * Check if the API key or password is configured and available.
 */
export function hasApiKey(): boolean {
    return getApiKey() !== null;
}

// ══════════════════════════════════════════════════════════
// OPTIONAL: AI-enhanced features (table recovery, etc.)
// These are secondary — the splitting above is the core.
// ══════════════════════════════════════════════════════════

/**
 * Enhance assistant content for Gemini-format chats (regex-parsed).
 * Restores markdown formatting stripped during copy-paste:
 * bold, lists, headings, tables, code fences, LaTeX delimiters.
 * Does NOT re-split — only adds markdown formatting to existing content.
 */
export async function enhanceContentWithGemini(
    content: string,
    features: Set<ApiFeature>,
    customInstructions?: string,
): Promise<{ text: string; tokens: TokenUsage } | null> {
    if (!getApiKey()) return null;
    if (!content.trim()) return null;

    const hasFormat = features.has('format');
    const hasTables = features.has('tables');
    const hasCode = features.has('code');
    const hasLatex = features.has('latex');
    if (!hasFormat && !hasTables && !hasCode && !hasLatex) return null;

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
- Common patterns: fractions (a/b → $\\frac{a}{b}$), exponents (x^2 → $x^2$), subscripts (x_i → $x_i$), summations (Σ → $\\sum$), integrals (∫ → $\\int$), Greek letters (α → $\\alpha$), square roots (√x → $\\sqrt{x}$).
`;
    }

    // Build conflict-resolution rules when multiple features are enabled
    let conflictRules = '';
    if (hasTables && hasCode) {
        conflictRules += `
IMPORTANT — TABLE vs CODE PRIORITY:
- When you see structured rows of data (label + values like O(1), O(n), percentages, numbers, Yes/No), this is TABULAR DATA — reconstruct it as ONE markdown pipe table. Do NOT wrap individual cell values in code fences.
- Only use code fences (\`\`\`language) for actual multi-line programming code (function definitions, scripts, shell commands, etc.)
- Values like O(1), O(n), O(log n), $4.2M, +24.5%, "Yes", "No" inside a table are cell values, NOT code — never wrap them in code blocks
- Short technical terms (O(n), O(1)) inside running text (NOT in a table) may use inline \`backticks\`, but never triple-backtick code blocks`;
    }
    if (hasTables && hasLatex) {
        conflictRules += `
IMPORTANT — TABLE vs LATEX PRIORITY:
- Mathematical notation inside a table (like O(n), x^2) should stay as plain text table cell values, NOT be converted to LaTeX $...$ delimiters
- Only restore LaTeX for standalone mathematical expressions in prose paragraphs`;
    }

    const systemPrompt = `You are a professional markdown formatting restorer. The user will provide an AI assistant's response that was copied from a rendered chat UI where markdown formatting was stripped.

Your job is to RESTORE the proper markdown formatting to make the text look polished and professional. Specifically:
${instructions}
${customInstructions && customInstructions.trim() ? `\nUSER SPECIFIC INSTRUCTIONS:\nThe user has provided an additional request for how to enhance/format this output:\n"${customInstructions.trim()}"\nYou MUST follow this instruction carefully.\n` : ''}
CRITICAL RULES:
- Do NOT change, summarize, or rephrase any text content — keep every word exactly as-is
- Do NOT add any new content, commentary, or explanations
- ONLY restore markdown formatting (bold, lists, headings, tables, code fences, backticks, LaTeX delimiters)
- Preserve all existing markdown formatting that is already correct
- Return the enhanced text directly, no JSON wrapping, no explanations${conflictRules}`;

    const truncated = content.slice(0, 50000);
    const result = await callGemini(truncated, systemPrompt);
    if (!result) return null;
    return { text: result.text, tokens: result.tokens };
}

