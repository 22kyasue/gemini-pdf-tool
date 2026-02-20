// ══════════════════════════════════════════════════════════
// LLM DETECTOR — Auto-detect LLM source with confidence
// ══════════════════════════════════════════════════════════

/**
 * Supported LLM types for detection.
 */
export type LLMType = 'ChatGPT' | 'Claude' | 'Gemini' | 'Unknown';

/**
 * Detection result with confidence score.
 */
export interface LLMDetectionResult {
    llm: LLMType;
    confidence: number; // 0.0 ~ 1.0
    scores: Record<LLMType, number>; // raw scores for each LLM
}

/**
 * Detection rule: pattern → which LLM, how strong the signal is.
 */
interface DetectionRule {
    llm: LLMType;
    pattern: RegExp;
    weight: number; // how much this pattern contributes to confidence
}

/**
 * Detection rules ordered by signal strength.
 * Strong markers (explicit role headers) have high weight.
 * Weak markers (behavioral patterns) have low weight.
 */
const DETECTION_RULES: DetectionRule[] = [
    // ── ChatGPT: Strong signals ──
    { llm: 'ChatGPT', pattern: /ChatGPT said:?/i, weight: 10 },
    { llm: 'ChatGPT', pattern: /\bChatGPT\b/i, weight: 8 },
    { llm: 'ChatGPT', pattern: /\bGPT-?4\b/i, weight: 8 },
    { llm: 'ChatGPT', pattern: /\bGPT-?3\.5\b/i, weight: 8 },
    { llm: 'ChatGPT', pattern: /\bo[13]-?mini\b/i, weight: 7 },
    { llm: 'ChatGPT', pattern: /\bOpenAI\b/i, weight: 6 },
    { llm: 'ChatGPT', pattern: /^You said:?\s*$/im, weight: 9 },
    // ChatGPT behavioral markers
    { llm: 'ChatGPT', pattern: /^Thought for \d+ seconds?$/im, weight: 9 },
    { llm: 'ChatGPT', pattern: /^Searched \d+ sites?$/im, weight: 9 },
    { llm: 'ChatGPT', pattern: /^Analyzing/im, weight: 5 },
    { llm: 'ChatGPT', pattern: /Memory updated/i, weight: 7 },

    // ── Claude: Strong signals ──
    { llm: 'Claude', pattern: /Claude said:?/i, weight: 10 },
    { llm: 'Claude', pattern: /\bClaude\b/i, weight: 8 },
    { llm: 'Claude', pattern: /\bClaude\s+\d+(\.\d+)?\b/i, weight: 9 },
    { llm: 'Claude', pattern: /\bAnthropic\b/i, weight: 7 },
    { llm: 'Claude', pattern: /\bHuman:\s*$/im, weight: 8 },
    { llm: 'Claude', pattern: /\bAssistant:\s*$/im, weight: 5 }, // generic but often Claude

    // ── Gemini: Strong signals ──
    { llm: 'Gemini', pattern: /Gemini の回答/, weight: 10 },
    { llm: 'Gemini', pattern: /Gemini の返答/, weight: 10 },
    { llm: 'Gemini', pattern: /Gemini said:?/i, weight: 10 },
    { llm: 'Gemini', pattern: /\bGemini\b/i, weight: 8 },
    { llm: 'Gemini', pattern: /\bGemini\s+\d+(\.\d+)?\b/i, weight: 9 },
    { llm: 'Gemini', pattern: /あなたのプロンプト/, weight: 10 },
    { llm: 'Gemini', pattern: /ジェミニ/, weight: 8 },
    // Gemini behavioral markers
    { llm: 'Gemini', pattern: /回答案を表示/, weight: 8 },
    { llm: 'Gemini', pattern: /他の回答案/, weight: 8 },
];

/**
 * Detect which LLM produced the conversation log.
 *
 * Scores each LLM based on pattern matches weighted by signal strength.
 * Returns the highest-scoring LLM with a confidence value.
 */
export function detectLLMWithConfidence(text: string): LLMDetectionResult {
    const scores: Record<LLMType, number> = {
        'ChatGPT': 0,
        'Claude': 0,
        'Gemini': 0,
        'Unknown': 0,
    };

    // Accumulate scores from all matching rules
    for (const rule of DETECTION_RULES) {
        const matches = text.match(new RegExp(rule.pattern.source, rule.pattern.flags + 'g'));
        if (matches) {
            // Multiple matches boost confidence, but with diminishing returns
            const matchCount = Math.min(matches.length, 5);
            scores[rule.llm] += rule.weight * (1 + Math.log2(matchCount));
        }
    }

    // Find winner
    const entries = Object.entries(scores).filter(([key]) => key !== 'Unknown') as [LLMType, number][];
    entries.sort((a, b) => b[1] - a[1]);

    const topScore = entries[0][1];
    const secondScore = entries[1]?.[1] ?? 0;
    const totalScore = entries.reduce((sum, [, s]) => sum + s, 0);

    // No matches at all → Unknown
    if (topScore === 0) {
        return {
            llm: 'Unknown',
            confidence: 0,
            scores,
        };
    }

    // Confidence based on:
    // 1. Absolute score strength (more matches = more confident)
    // 2. Margin over second place (clear winner = more confident)
    const absoluteConfidence = Math.min(topScore / 20, 1.0); // 20+ points = max
    const marginConfidence = totalScore > 0
        ? (topScore - secondScore) / totalScore
        : 0;

    const confidence = Math.round(
        (absoluteConfidence * 0.6 + marginConfidence * 0.4) * 100
    ) / 100;

    return {
        llm: entries[0][0],
        confidence: Math.min(confidence, 1.0),
        scores,
    };
}
