/**
 * ══════════════════════════════════════════════════════════
 * UNIVERSAL ROLE MARKERS
 * Shared across Legacy and New Algorithm pipelines.
 * ══════════════════════════════════════════════════════════
 */

export const USER_MARKERS: RegExp[] = [
    /^あなたのプロンプト$/,
    /^You$/,
    /^あなた$/,
    /^User$/i,
    /^User:/i,
    /^自分$/,
    /^Human$/i,
    /^Human:/i,
    /^Me$/i,
    /^You said:?\s*$/i,
    /^Sent by you:?\s*$/i,
];

export const ASSISTANT_MARKERS: RegExp[] = [
    // Gemini variants
    /^Gemini$/,
    /^Gemini:/i,
    /^Gemini の回答$/,
    /^Gemini の返答$/,
    /^Gemini\s+の/,
    /^ジェミニ/,
    /^Gemini\s+\d+(\.\d+)?/,
    /^Gemini said:?\s*$/i,

    // ChatGPT variants
    /^ChatGPT$/i,
    /^ChatGPT:/i,
    /^ChatGPT said:?\s*$/i,
    /^GPT-?[3-9]/i,
    /^o[13]-?mini/i,
    /^o[13]-?preview/i,
    /^OpenAI$/i,

    // Claude variants
    /^Claude$/i,
    /^Claude:/i,
    /^Claude said:?\s*$/i,
    /^Claude\s+[0-9]/i,
    /^Anthropic$/i,

    // Generic / Other
    /^Assistant$/i,
    /^Assistant:/i,
    /^AI$/i,
    /^AI:/i,
    /^AI said:?\s*$/i,
    /^Model$/i,
    /^Bot$/i,
    /^Bot:/i,
];
