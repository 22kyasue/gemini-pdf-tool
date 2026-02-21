// ══════════════════════════════════════════════════════════
// FEATURE EXTRACTOR — Extract features from each block
// ══════════════════════════════════════════════════════════

import type { SegmentedBlock, BlockFeatures, FeaturedBlock } from './types';

// ── Pattern definitions ─────────────────────────────────

const QUESTION_RE = /[？?]|^(how|why|what|where|when|which|who)\b|なぜ|どう|どこ|いつ|何[がをにで]|どれ|どちら|教えて|どうすれば|方法/im;
const CODE_BLOCK_RE = /```[\s\S]*?```|^( {4}|\t)\S/m;
const CODE_FENCE_RE = /```/;
const MD_HEADING_RE = /^#{1,6}\s/m;
const BULLET_LIST_RE = /^[\s]*[-*•◦]\s|^[\s]*\d+[.．)]\s/m;
const TABLE_RE = /\|.*\|/;
const URL_RE = /https?:\/\/\S+/;
const FILE_PATH_RE = /([A-Z]:\\|\/Users\/|~\/|\.\/)\S+\.\w+/;
const COMMAND_RE = /\b(npm|npx|git|cd|brew|pip|yarn|pnpm|sudo|curl|wget|docker|kubectl|make)\s/;
const ERROR_KW_RE = /\b(error|exception|stack\s*trace|not\s+found|undefined|null|failed|crash|ENOENT|EACCES|segfault)\b|動かない|落ちる|エラー|失敗|無理|壊れ/i;
const JAPANESE_RE = /[\u3040-\u309F\u30A0-\u30FF]/;
const POLITE_RE = /です[。.]?$|ます[。.]?$|ございます|でしょう|いたします/m;
const EXPLANATION_RE = /とは[、。]|つまり|例えば|すなわち|具体的には|言い換えると|以下[のにはで]|まとめると|ポイント[はを]|ステップ/;
const IMPERATIVE_RE = /[しやつ作直教見出消変送]て[。、！!]?$|ください|してほしい|お願い/m;

// Explicit role markers (at start of block)
const USER_MARKER_RE = /^(User|You|あなた|あなたのプロンプト|自分|Human|Me|Guest):/i;
const AI_MARKER_RE = /^(Assistant|AI|Gemini|ChatGPT|Claude|Bot|GPT|Anthropic|OpenAI):/i;

// Casual / emotional patterns (user-leaning)
const CASUAL_RE = /だよ|じゃん|だね|かな[？?]?$|やばい|マジ[でか]|ぽい|わかんない|むり|つらい/m;

// Technical terms for density calculation
const TECH_TERMS_RE = /\b(API|REST|GraphQL|JSON|XML|HTML|CSS|SQL|TypeScript|JavaScript|Python|React|Vue|Angular|Next\.js|Vite|Node|Express|Docker|Kubernetes|AWS|GCP|Azure|Firebase|Supabase|OAuth|JWT|CORS|CRUD|CI\/CD|Git|GitHub|npm|yarn|webpack|ESLint|Prettier)\b/gi;

/**
 * Extract features from a single segmented block.
 */
function extractFeatures(block: SegmentedBlock): BlockFeatures {
    const text = block.text;
    const lines = text.split('\n').filter(l => l.trim());
    const charCount = text.length;
    const lineCount = lines.length;
    const avgLineLength = lineCount > 0 ? charCount / lineCount : 0;

    // Count Japanese chars for ratio
    const jpChars = (text.match(JAPANESE_RE) || []).length;
    const hasJapanese = jpChars > 0;

    // Technical term density
    const techMatches = text.match(TECH_TERMS_RE) || [];
    const wordCount = text.split(/\s+/).length;
    const technicalTermDensity = wordCount > 0 ? techMatches.length / wordCount : 0;

    // Formality score: polite > neutral > casual
    let formality = 0.5; // neutral
    if (POLITE_RE.test(text)) formality += 0.3;
    if (CASUAL_RE.test(text)) formality -= 0.3;
    formality = Math.max(0, Math.min(1, formality));

    // Sentiment: ！？ usage density (excitable = user-leaning)
    const exclamCount = (text.match(/[！!？?]/g) || []).length;
    const sentimentScore = Math.min(exclamCount / Math.max(charCount / 50, 1), 1);

    return {
        charCount,
        lineCount,
        avgLineLength,
        hasQuestion: QUESTION_RE.test(text),
        hasCodeBlock: CODE_BLOCK_RE.test(text) || CODE_FENCE_RE.test(text),
        hasMarkdownHeading: MD_HEADING_RE.test(text),
        hasBulletList: BULLET_LIST_RE.test(text),
        hasTable: TABLE_RE.test(text),
        hasUrl: URL_RE.test(text),
        hasFilePath: FILE_PATH_RE.test(text),
        hasCommand: COMMAND_RE.test(text),
        hasErrorKeyword: ERROR_KW_RE.test(text),
        hasJapanese,
        hasPoliteForm: POLITE_RE.test(text),
        hasExplanationStructure: EXPLANATION_RE.test(text),
        hasImperativeForm: IMPERATIVE_RE.test(text),
        hasUserMarker: USER_MARKER_RE.test(text),
        hasAiMarker: AI_MARKER_RE.test(text),
        sentimentScore,
        technicalTermDensity,
        formality,
    };
}

/**
 * Attach features to all segmented blocks.
 */
export function extractAllFeatures(blocks: SegmentedBlock[]): FeaturedBlock[] {
    return blocks.map(block => ({
        ...block,
        features: extractFeatures(block),
    }));
}
