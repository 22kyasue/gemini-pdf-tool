// ══════════════════════════════════════════════════════════
// NORMALIZER — Text normalization for conversation logs
// ══════════════════════════════════════════════════════════

/**
 * Junk exact-match set (migrated from App.tsx + extended)
 */
const JUNK_EXACT = new Set([
    // Gemini UI junk
    '回答案を表示する', '回答案を表示', '他の回答案を表示', '他の回答案',
    '他の回答', 'コピー', 'Copy', 'いいね', 'よくない',
    'Good response', 'Bad response', 'Share', 'Report', 'Retry',
    'もう一度生成', '音声で聞く', '編集', 'Edit message', 'Regenerate',
    'Show more', 'Show less', '回答を評価', '回答を共有',
    // ChatGPT-specific junk
    'Like', 'Dislike', 'Memory updated', 'Memory updated.',
    'Read aloud', 'Search the web', 'Create image',
    // Claude-specific junk
    'Copy to clipboard', 'Retry response',
]);

// Junk that can appear ANYWHERE mid-block (YouTube stubs, bare URLs)
const INLINE_JUNK_RE: RegExp[] = [
    /^\s*https?:\/\/\S+\s*$/,            // bare URL line (in junk context)
    /^\s*www\.\S/,
    /回の視聴/,
    /Are So Expensive/i,
    /^\s*(Business Insider|Forbes|Bloomberg|TechCrunch|Wired)\s*[·•\-–]/i,
    /^\s*\[\d+\]\s*\S/,                   // numbered references
    /^Thought for \d+ seconds?$/i,        // ChatGPT thinking
    /^Searched \d+ sites?$/i,             // ChatGPT web search
    /^Analyzing/i,                         // ChatGPT analyzing
    /^\s*\d+\s*\/\s*\d+$/,               // "1/3" page indicators
    /^draft\s+\d+$/i,                     // "Draft 1"
    /^[👍👎🔊📋✏️🔄⋮…]{1,4}$/,            // emoji-only lines
];

/**
 * Normalize raw text for analysis pipeline.
 *
 * Steps:
 * 1. Line ending normalization (CRLF → LF)
 * 2. Unicode NFKC normalization
 * 3. Invisible character removal (ZWSP, BOM, etc.)
 * 4. Full-width space → half-width
 * 5. Junk line removal (exact match + regex)
 * 6. Consecutive blank line compression (3+ → 2)
 */
export function normalize(text: string): string {
    let result = text;

    // 1. Line ending normalization
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 2. Unicode NFKC normalization (normalizes half-width katakana, etc.)
    result = result.normalize('NFKC');

    // 3. Invisible character removal
    result = result.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, '');

    // 4. Full-width space → half-width (but preserve indentation intent)
    result = result.replace(/\u3000/g, ' ');

    // 5. Junk line removal
    result = result
        .split('\n')
        .filter(line => {
            const t = line.trim();
            if (!t) return true; // keep blank lines for segmentation
            if (JUNK_EXACT.has(t)) return false;
            // Relaxed: only strip mid-block junk if the line is extremely short/symbolic
            if (t.length < 5 && INLINE_JUNK_RE.some(r => r.test(t))) return false;
            return true;
        })
        .join('\n');

    // 6. Compress excessive blank lines (3+ → 2)
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim();
}
