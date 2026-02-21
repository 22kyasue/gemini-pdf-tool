

// ══════════════════════════════════════════════════════════
// SIMPLIFIED CLAUDE PIPELINE
// Hardcoded for direct diagnosis and stability.
// ══════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = "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";

/**
 * Universal execution via Claude 3.5 Haiku
 * Direct fetch implementation to skip standard SDK overhead for now.
 */
async function executeWithClaude(prompt: string, systemPrompt?: string): Promise<string | null> {
    console.log("Claude Pipeline Starting... [Task: " + (systemPrompt?.slice(0, 30) || "General") + "]");

    try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "dangerously-allow-browser": "true"
            },
            body: JSON.stringify({
                model: "claude-3-5-haiku-latest",
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: "user", content: prompt }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 403 || errorText.includes('CORS')) {
                console.error("Claude API Blocked: Direct browser calls to Anthropic are typically blocked by CORS. Please use Gemini or a proxy for client-side calls.");
            } else {
                console.error("Claude API Error:", response.status, errorText);
            }
            return null;
        }

        const data = await response.json();
        console.log("Claude Response Received:", data);

        const text = data.content?.[0]?.text?.trim();
        return text ? `<!-- cl-restored -->\n${text}` : null;
    } catch (error) {
        console.error("Critical Claude Pipeline Failure:", error);
        return null;
    }
}

/**
 * Entry Points (Simplified to use the direct Claude pipeline)
 */

export async function recoverTableWithGemini(rawText: string): Promise<string | null> {
    const systemPrompt = "You are a layout expert. Reconstruct the provided unstructured data into a valid Markdown table. Infer headers if missing. Output ONLY the Markdown table, no conversational text.";
    return executeWithClaude(rawText, systemPrompt);
}

export async function extractKeyPointsWithGemini(rawText: string): Promise<string | null> {
    const systemPrompt = "Analyze the provided AI response text. Extract the 3 most important core conclusions or takeaways. Output ONLY a valid Markdown bulleted list with a maximum of 3 items.";
    return executeWithClaude(rawText, systemPrompt);
}

export async function removeNoiseWithGemini(rawText: string): Promise<string | null> {
    const systemPrompt = "Professional editor mode. Remove conversational filler and final questions. Preserve factual body. Cleaned text ONLY.";
    return executeWithClaude(rawText, systemPrompt);
}

export async function generateSectionSummaryWithGemini(sectionText: string): Promise<string | null> {
    const systemPrompt = "Professional executive summarizer. 1-2 sentences max. Focus on core conclusion. Summary ONLY.";
    return executeWithClaude(sectionText.slice(0, 5000), systemPrompt);
}

export async function generateNarrativeTOCWithGemini(outline: string): Promise<string | null> {
    const systemPrompt = "Generate a 'Narrative Table of Contents' (e.g. 1 -> 2 -> 3). Concise flow description ONLY.";
    return executeWithClaude(outline, systemPrompt);
}
