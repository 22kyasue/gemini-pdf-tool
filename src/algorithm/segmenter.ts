// ══════════════════════════════════════════════════════════
// SEGMENTER — Boundary detection: text → block sequence
// ══════════════════════════════════════════════════════════

import type { SegmentedBlock } from './types';

// ── B-1: Hard boundaries (always split) ─────────────────

/** Horizontal rule line */
const RULE_LINE_RE = /^[\s]*[-_═╌─━]{3,}[\s]*$/;

/** Explicit role header markers (inline or standalone) */
const INLINE_HEADER_RE = /^[\s]*(User|You|あなた|あなたのプロンプト|自分|Human|Me|Assistant|AI|Gemini|ChatGPT|Claude|Bot|Anthropic|OpenAI|Guest|Support|Admin)(\s+(said|の回答|の返答|の))?[:：]\s*/i;

/** Global version for mid-line splitting (anchorless to find markers anywhere) */
const GLOBAL_HEADER_RE = /(?:^|\s)(User|You|あなた|あなたのプロンプト|自分|Human|Me|Assistant|AI|Gemini|ChatGPT|Claude|Bot|Anthropic|OpenAI|Guest|Support|Admin)(\s+(said|の回答|の返答|の))?[:：]\s*/gi;

/** Check if a line starts with a role-marker header */
function startsWithHeader(line: string): boolean {
    const t = line.trim();
    return INLINE_HEADER_RE.test(t);
}

/** Check if a line IS a standalone header */
function isStandaloneHeader(line: string): boolean {
    const t = line.trim();
    // Header only, nothing follows or just whitespace
    const match = t.match(INLINE_HEADER_RE);
    return !!match && match[0].trim() === t;
}

// ── B-2: Soft boundaries (conditional split) ────────────

/** Bullet list start */
const BULLET_START_RE = /^[\s]*[-*•◦▸▹]\s/;

/** Numbered list start */
const NUMBERED_LIST_RE = /^[\s]*\d+[.．)]\s/;

/** Markdown heading */
const MD_HEADING_RE = /^#{1,6}\s/;

/** Japanese-style heading */
const JP_HEADING_RE = /^[【「『〈《]|^[◆■●▶★☆▷►◇□△▽]\s/;

/** URL-only line */
const URL_ONLY_RE = /^\s*https?:\/\/\S+\s*$/;

/** Command-only line */
const COMMAND_RE = /^\s*(npm|npx|git|cd|brew|pip|yarn|pnpm|sudo|curl|wget|docker|kubectl|make|cmake)\s/;

/** File path line */
const FILE_PATH_RE = /^\s*([A-Z]:\\|\/Users\/|~\/|\.\/|\.\.\/)[\S]+/;

/** Question-only line (short line ending with ？ or ?) */
const QUESTION_ONLY_RE = /^.{1,80}[？?]\s*$/;

/** Check if a block contains structural content (likely AI) */
function hasStructuralContent(lines: string[]): boolean {
    return lines.some(l => {
        const t = l.trim();
        return MD_HEADING_RE.test(t) || BULLET_START_RE.test(t) || NUMBERED_LIST_RE.test(t) ||
            t.startsWith('```') || /^\|.+\|$/.test(t);
    });
}


// ── B-2: Soft boundaries (conditional split) ────────────

/** Line ending with a particle/comma/colon (sentence is incomplete) */
const INCOMPLETE_LINE_RE = /[、，,：:は|が|を|に|で|と|も|の|へ|から|まで|より]\s*$/;

/**
 * Segment normalized text into blocks.
 *
 * Strategy:
 * 1. Split on hard boundaries first
 * 2. Within each hard-segment, apply soft boundaries
 * 3. Apply merge rules to fix over-segmentation
 */
export function segment(normalizedText: string): SegmentedBlock[] {
    const lines = normalizedText.split('\n');
    const rawBlocks: { lines: string[]; startLine: number; boundaryType: 'hard' | 'soft' | 'initial' }[] = [];

    let currentLines: string[] = [];
    let currentStart = 0;
    let currentBoundaryType: 'hard' | 'soft' | 'initial' = 'initial';

    function flushBlock() {
        if (currentLines.length > 0) {
            rawBlocks.push({
                lines: [...currentLines],
                startLine: currentStart,
                boundaryType: currentBoundaryType,
            });
        }
        currentLines = [];
    }

    let consecutiveBlankCount = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // ── Blank line handling ──
        if (trimmed === '') {
            consecutiveBlankCount++;

            // Hard boundary: 2+ consecutive blank lines
            if (consecutiveBlankCount >= 2) {
                flushBlock();
                currentStart = i + 1;
                currentBoundaryType = 'hard';
            }
            // Soft boundary: single blank line AND current block is short + non-structural
            // This handles marker-less pastes (e.g. Claude web) where a short user question
            // is followed by a blank line and then the AI's long response
            else if (consecutiveBlankCount === 1 && currentLines.length > 0) {
                const accum = currentLines.join('\n').trim();
                if (accum.length > 0 && accum.length < 120 && !hasStructuralContent(currentLines)) {
                    flushBlock();
                    currentStart = i + 1;
                    currentBoundaryType = 'soft';
                }
            }
            continue;
        }

        // Reset blank counter on non-blank line
        const wasBlank = consecutiveBlankCount > 0;
        consecutiveBlankCount = 0;

        // ── Hard boundary: rule line (---) ──
        if (RULE_LINE_RE.test(trimmed)) {
            flushBlock();
            currentStart = i + 1;
            currentBoundaryType = 'hard';
            continue;
        }

        // ── Hard boundary: explicit role header (standalone or inline) ──
        // Support mid-line splitting if multiple markers exist on one line
        const headerMatches = [...line.matchAll(GLOBAL_HEADER_RE)];
        if (headerMatches.length > 1) {
            flushBlock();
            headerMatches.forEach((match, mIdx) => {
                const start = match.index!;
                const end = headerMatches[mIdx + 1]?.index ?? line.length;
                const subLine = line.slice(start, end).trim();
                if (subLine) {
                    rawBlocks.push({
                        lines: [subLine],
                        startLine: i,
                        boundaryType: 'hard'
                    });
                }
            });
            currentStart = i + 1;
            continue;
        }

        if (startsWithHeader(line)) {
            flushBlock();

            if (isStandaloneHeader(line)) {
                // Standalone header becomes its own block
                rawBlocks.push({
                    lines: [line],
                    startLine: i,
                    boundaryType: 'hard',
                });
                currentStart = i + 1;
            } else {
                // Inline header starts a new block but includes the content
                currentStart = i;
                currentLines.push(line);
            }

            currentBoundaryType = 'hard';
            continue;
        }

        // ── Soft boundary: question-only line after blank ──
        // This is the primary user-AI separator for marker-less text
        const isQuestionStart = wasBlank && QUESTION_ONLY_RE.test(trimmed) && trimmed.length <= 80;

        // ── Soft boundary: short user-like line after blank + current block has structure ──
        const currentText = currentLines.join('\n').trim();
        const isShortAfterLong = wasBlank && trimmed.length < 60 &&
            !MD_HEADING_RE.test(trimmed) && !BULLET_START_RE.test(trimmed) &&
            !NUMBERED_LIST_RE.test(trimmed) && !trimmed.startsWith('```') &&
            currentText.length > 100;

        // ── Soft boundary: standalone URL/command/filepath ──
        const isStandalone = wasBlank && (
            URL_ONLY_RE.test(trimmed) ||
            COMMAND_RE.test(trimmed) ||
            FILE_PATH_RE.test(trimmed)
        );

        // NOTE: Markdown headings (##) are NOT treated as soft boundaries anymore.
        // They are part of AI response structure, not role-change signals.
        // The old behavior over-segmented AI responses at every heading.

        if (isQuestionStart || isShortAfterLong || isStandalone) {
            flushBlock();
            currentStart = i;
            currentBoundaryType = 'soft';
        }

        currentLines.push(line);
    }

    // Flush remaining
    flushBlock();

    // ── Apply merge rules (B-3) ──
    const merged = applyMergeRules(rawBlocks);

    // ── Convert to SegmentedBlock ──
    return merged.map((block, idx) => ({
        id: idx,
        text: block.lines.join('\n').trim(),
        startLine: block.startLine,
        endLine: block.startLine + block.lines.length - 1,
        boundaryType: block.boundaryType,
    })).filter(b => b.text.length > 0);
}


/**
 * B-3: Merge rules — fix over-segmentation
 */
function applyMergeRules(
    blocks: { lines: string[]; startLine: number; boundaryType: 'hard' | 'soft' | 'initial' }[]
): { lines: string[]; startLine: number; boundaryType: 'hard' | 'soft' | 'initial' }[] {
    if (blocks.length <= 1) return blocks;

    const result: typeof blocks = [blocks[0]];

    for (let i = 1; i < blocks.length; i++) {
        const prev = result[result.length - 1];
        const curr = blocks[i];

        const prevText = prev.lines.join('\n').trim();
        const currText = curr.lines.join('\n').trim();

        // Rule 1: Short text (< 20 chars) consecutive → likely user rapid messages, merge
        if (prevText.length < 20 && currText.length < 20 && curr.boundaryType === 'soft') {
            prev.lines.push('', ...curr.lines);
            continue;
        }

        // Rule 2: "これ見て" / "こちら" / "see this" → next is URL/path → merge
        if (
            prevText.length < 30 &&
            /^(これ|こちら|see|see this|look|check|見て)/i.test(prevText) &&
            (URL_ONLY_RE.test(currText) || FILE_PATH_RE.test(currText))
        ) {
            prev.lines.push('', ...curr.lines);
            continue;
        }

        // Rule 3: Previous line ends with incomplete sentence marker → merge
        const lastPrevLine = prev.lines[prev.lines.length - 1]?.trim() ?? '';
        if (INCOMPLETE_LINE_RE.test(lastPrevLine) && curr.boundaryType === 'soft') {
            prev.lines.push(...curr.lines);
            continue;
        }

        // Rule 4: Both blocks have structural content (headings/lists/code) → likely same AI response
        const prevStructural = hasStructuralContent(prev.lines);
        const currStructural = hasStructuralContent(curr.lines);
        if (prevStructural && currStructural && curr.boundaryType === 'soft') {
            prev.lines.push('', ...curr.lines);
            continue;
        }

        // Rule 5: Previous is long + structural, current starts with heading/list → continuation
        if (prevText.length > 100 && prevStructural && curr.boundaryType === 'soft') {
            const firstCurrLine = curr.lines.find(l => l.trim())?.trim() ?? '';
            if (MD_HEADING_RE.test(firstCurrLine) || BULLET_START_RE.test(firstCurrLine) ||
                NUMBERED_LIST_RE.test(firstCurrLine) || JP_HEADING_RE.test(firstCurrLine)) {
                prev.lines.push('', ...curr.lines);
                continue;
            }
        }

        // Rule 6: Bullet list continuation (same indent level, both are list items)
        const prevIsList = prev.lines.some(l => BULLET_START_RE.test(l) || NUMBERED_LIST_RE.test(l));
        const currIsList = curr.lines.every(l => BULLET_START_RE.test(l.trim()) || NUMBERED_LIST_RE.test(l.trim()) || l.trim() === '');
        if (prevIsList && currIsList && curr.boundaryType === 'soft') {
            prev.lines.push('', ...curr.lines);
            continue;
        }

        result.push(curr);
    }

    return result;
}

