import { GoogleGenerativeAI } from "@google/generative-ai";



// ══════════════════════════════════════════════════════════
// RATE LIMITING & QUEUE SYSTEM
// Optimized for Hybrid Fallback Pipeline
// ══════════════════════════════════════════════════════════

class RequestQueue {
    private queue: (() => Promise<void>)[] = [];
    private processing = false;
    private lastRequestTime = 0;
    private minInterval = 2500; // Faster interval when multiple providers available

    async add<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const now = Date.now();
                    const delay = Math.max(0, this.minInterval - (now - this.lastRequestTime));
                    if (delay > 0) await new Promise(r => setTimeout(r, delay));

                    this.lastRequestTime = Date.now();
                    const result = await fn();
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });
            this.process();
        });
    }

    private async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) await task();
        }
        this.processing = false;
    }
}

const geminiQueue = new RequestQueue();

// ══════════════════════════════════════════════════════════
// HYBRID ROUTER (Anthropic + Gemini + Cerebras)
// ══════════════════════════════════════════════════════════

/**
 * High-Precision Attempt via Anthropic Claude
 */
async function executeWithAnthropic(prompt: string, systemPrompt?: string): Promise<string | null> {
    const key = localStorage.getItem('anthropicApiKey');
    if (!key) return null;

    try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "dangerously-allow-browser": "true" // Note: In production this should be server-side
            },
            body: JSON.stringify({
                model: "claude-3-haiku-20240307",
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: "user", content: prompt }]
            })
        });

        if (!response.ok) throw new Error(`Anthropic HTTP error: ${response.status}`);
        const data = await response.json();
        const text = data.content[0]?.text?.trim();
        return text ? `<!-- cl-restored -->\n${text}` : null;
    } catch (error) {
        console.error("Anthropic Error:", error);
        return null;
    }
}

/**
 * Executes an AI task with automatic fallback routing.
 */
async function executeWithFallback(prompt: string, systemPrompt?: string, forceTask?: 'table' | 'general'): Promise<string | null> {
    const geminiKey = localStorage.getItem('geminiApiKey');
    const fallbackKey = localStorage.getItem('cerebrasApiKey');

    // 0. Specialized Routing: Tables prefer Claude
    if (forceTask === 'table') {
        const claudeResult = await executeWithAnthropic(prompt, systemPrompt);
        if (claudeResult) return claudeResult;
        // else fall back to Gemini
    }

    if (!geminiKey && !fallbackKey) return null;

    // 1. Primary Attempt (Gemini)
    if (geminiKey) {
        try {
            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                systemInstruction: systemPrompt
            });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim();
            if (text) return text;
        } catch (error: any) {
            const isRateLimit = error?.message?.includes('429') || error?.status === 429;
            console.warn(isRateLimit ? "Gemini Rate Limit Hit. Routing to Fallback..." : "Gemini Error, Attempting Fallback...", error);
            // Fall through to fallback
        }
    }

    // 2. Secondary Attempt (Cerebras / OpenAI Compatible)
    if (fallbackKey) {
        try {
            const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${fallbackKey}`
                },
                body: JSON.stringify({
                    model: "llama3.1-8b",
                    messages: [
                        { role: "system", content: systemPrompt || "You are a specialized content extraction assistant. Output ONLY the requested data." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.2
                })
            });

            if (!response.ok) throw new Error(`Fallback HTTP error! status: ${response.status}`);
            const data = await response.json();
            return data.choices?.[0]?.message?.content?.trim() || null;
        } catch (error) {
            console.error("Critical AI Pipeline Failure (Both Providers Failed):", error);
            return null;
        }
    }

    return null;
}

/**
 * Smart Table Recovery Layer
 * Uses Gemini-2.0-Flash to infer and reconstruct broken markdown tables.
 */
export async function recoverTableWithGemini(rawText: string): Promise<string | null> {
    const systemPrompt = "You are a layout expert. Reconstruct the provided unstructured data into a valid Markdown table. Infer headers if missing. Output ONLY the Markdown table, no conversational text.";
    return geminiQueue.add(() => executeWithFallback(rawText, systemPrompt, 'table'));
}

/**
 * Smart Key Points Extraction
 * Distills AI responses into a maximum of 3 core bullet points.
 */
export async function extractKeyPointsWithGemini(rawText: string): Promise<string | null> {
    const systemPrompt = "Analyze the provided AI response text. Extract the 3 most important core conclusions or takeaways. Output ONLY a valid Markdown bulleted list (using '-' or '*') with a maximum of 3 items. Do not include any introductory or concluding remarks.";
    return geminiQueue.add(() => executeWithFallback(rawText, systemPrompt));
}

/**
 * AI-Powered Noise Removal
 * Strips conversational filler and follow-up stubs from AI messages.
 */
export async function removeNoiseWithGemini(rawText: string): Promise<string | null> {
    const systemPrompt = "You are a professional editor. Remove ALL conversational filler, greetings, and closing interactive questions (e.g. 'Let me know if you want more info') from the provided AI response. Preserve ONLY the factual, core information. NEVER summarize; keep the original wording of the factual content. Output the cleaned text ONLY.";
    return geminiQueue.add(() => executeWithFallback(rawText, systemPrompt));
}

/**
 * Executive Section Summary
 * Generates a professional 1-2 sentence summary for a specific discussion block.
 */
export async function generateSectionSummaryWithGemini(sectionText: string): Promise<string | null> {
    const systemPrompt = "Analyze the following section of a chat log. Provide a professional, high-level Executive Summary in 1 or 2 sentences maximum. Focus on the core conclusion or the primary topic discussed. Output ONLY the summary text.";
    return geminiQueue.add(() => executeWithFallback(sectionText.slice(0, 5000), systemPrompt));
}

/**
 * Narrative Table of Contents
 * Generates a logical flow description for the entire document outline.
 */
export async function generateNarrativeTOCWithGemini(outline: string): Promise<string | null> {
    const systemPrompt = "Based on the provided document outline, generate a 'Narrative Table of Contents' that describes the flow of the research or discussion. Example format: '1. Problem Definition → 2. Data Analysis → 3. Final Recommendations'. Keep it concise and professional. Output ONLY the narrative string.";
    return geminiQueue.add(() => executeWithFallback(outline, systemPrompt));
}
