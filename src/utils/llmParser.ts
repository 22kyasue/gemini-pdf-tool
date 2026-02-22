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
function getApiKey(): string | null {
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

/** Structured error from API calls */
export interface ApiError {
    code: number;
    message: string;
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
    const err = error as any;
    const status = err?.status ?? err?.response?.status ?? err?.errorDetails?.[0]?.status ?? 0;
    console.log(`[Gemini] Error inspection: status=${status}, err.status=${err?.status}, err.httpCode=${err?.httpCode}, err.code=${err?.code}, constructor=${err?.constructor?.name}`);
    return status;
}

/**
 * Low-level: send a prompt to Gemini and get raw text back.
 * Retries only on 503 (overload). 429 (rate limit) fails immediately to preserve quota.
 */
async function callGemini(prompt: string, systemPrompt: string, _maxTokens = 4096): Promise<string | null> {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.log('[Gemini] No API key set — skipping');
        _lastApiError = { code: 0, message: "APIキーが設定されていません。Settings からキーを入力してください。" };
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

            console.log(`[Gemini] SUCCESS — response length: ${text?.length ?? 0} chars`);
            _lastApiError = null;
            return text?.trim() || null;
        } catch (error: unknown) {
            lastError = error;
            const status = getErrorStatus(error);
            const errObj = error as any;
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
                message = `リクエストエラー (400): ${(error as any).message || '不明なリクエストエラー'}`;
            } else if (status === 401 || status === 403) {
                message = `認証エラー (${status}): APIキーが無効です。Google AI Studio で新しいキーを発行してください。`;
            } else if (status === 429) {
                message = `レート制限 (429): 無料枠の上限です。1分ほど待ってからもう一度お試しください。`;
            } else if (status === 503) {
                message = `API過負荷 (503): Google AI APIが一時的に混雑しています。`;
            } else if (status) {
                message = `APIエラー (${status}): ${(error as any).message || '不明なエラー'}`;
            } else {
                message = `ネットワークエラー: API に接続できません。インターネット接続を確認してください。`;
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

const SPLIT_SYSTEM_PROMPT = `You are a highly accurate chat log parser. The user will provide raw, messy text copied from a chat interface (like ChatGPT, Gemini, or Claude).

Your ONLY job is to semantically determine where the human user speaks and where the AI assistant speaks.

Rules:
- Identify each distinct message in the conversation
- Preserve the EXACT original text of each message (do not summarize or modify)
- Remove UI junk (like "Copy", "Good response", "回答案を表示", "Memory updated", etc.) but keep all real content
- If you see explicit markers like "User:", "You said:", "ChatGPT said:", "Gemini の回答", etc., use them as boundaries and REMOVE the marker text from the content
- If there are no explicit markers, use context clues: questions/requests = user, detailed answers/explanations = AI

Return ONLY a valid JSON array with this exact schema:
[{"role":"user","content":"..."},{"role":"ai","content":"..."}]

No markdown formatting, no \`\`\`json blocks, no explanations. ONLY the raw JSON array.`;

/**
 * PRIMARY FUNCTION: Split raw chat text into user/AI messages using Gemini.
 * This is the core of the app — send text, get structured conversation back.
 */
export async function splitChatWithGemini(rawText: string): Promise<AISplitMessage[] | null> {
    if (!getApiKey()) {
        _lastApiError = { code: 0, message: "APIキーが設定されていません。Settings からキーを入力してください。" };
        return null;
    }
    if (!rawText.trim()) return null;

    // Truncate very long texts (Gemini 2.0 Flash has 1M token context, but keep reasonable)
    const truncated = rawText.slice(0, 100000);

    try {
        const result = await callGemini(truncated, SPLIT_SYSTEM_PROMPT, 8192);
        if (!result) return null;

        // Extract JSON array from response (handle potential wrapping)
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.error("Gemini did not return valid JSON array:", result.slice(0, 200));
            return null;
        }

        const parsed = JSON.parse(jsonMatch[0]) as any[];
        if (!Array.isArray(parsed) || parsed.length === 0) return null;

        // Validate and normalize
        return parsed
            .filter(item => item && typeof item.content === 'string' && item.content.trim())
            .map(item => ({
                role: item.role === 'user' ? 'user' as const : 'ai' as const,
                content: item.content.trim(),
            }));
    } catch (error) {
        console.error("Chat splitting failed:", error);
        return null;
    }
}

/**
 * Check if the API key is configured and available.
 * Checks localStorage (Settings) first, then .env.
 */
export function hasApiKey(): boolean {
    return !!getApiKey();
}

// ══════════════════════════════════════════════════════════
// OPTIONAL: AI-enhanced features (table recovery, etc.)
// These are secondary — the splitting above is the core.
// ══════════════════════════════════════════════════════════

export async function recoverTableWithGemini(rawText: string): Promise<string | null> {
    try {
        return await callGemini(rawText, "You are a layout expert. Reconstruct the provided unstructured data into a valid Markdown table. Infer headers if missing. Output ONLY the Markdown table, no conversational text.");
    } catch { return null; }
}

export async function extractKeyPointsWithGemini(rawText: string): Promise<string | null> {
    try {
        return await callGemini(rawText, "Analyze the provided AI response text. Extract the 3 most important core conclusions or takeaways. Output ONLY a valid Markdown bulleted list with a maximum of 3 items.");
    } catch { return null; }
}

export async function removeNoiseWithGemini(rawText: string): Promise<string | null> {
    try {
        return await callGemini(rawText, "Professional editor mode. Remove conversational filler and final questions. Preserve factual body. Cleaned text ONLY.");
    } catch { return null; }
}

export async function generateSectionSummaryWithGemini(sectionText: string): Promise<string | null> {
    try {
        return await callGemini(sectionText.slice(0, 10000), "Professional executive summarizer. 1-2 sentences max. Focus on core conclusion. Summary ONLY.");
    } catch { return null; }
}

export async function generateNarrativeTOCWithGemini(outline: string): Promise<string | null> {
    try {
        return await callGemini(outline, "Generate a 'Narrative Table of Contents' (e.g. 1 -> 2 -> 3). Concise flow description ONLY.");
    } catch { return null; }
}
