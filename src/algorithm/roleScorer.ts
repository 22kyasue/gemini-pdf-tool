// ══════════════════════════════════════════════════════════
// ROLE SCORER — Rule-based scoring for User/AI classification
// ══════════════════════════════════════════════════════════

import type { FeaturedBlock, ScoredBlock } from './types';
import { getWeightDeltas } from './correctionStore';

/**
 * Sigmoid function for confidence mapping.
 */
function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
}

/**
 * Score a single block for User vs AI likelihood.
 *
 * Returns S_user and S_ai additive scores, local probability p_ai,
 * and confidence based on margin and text length.
 *
 * Applies learned weight deltas from user corrections:
 * - Positive delta → feature pushes more toward AI
 * - Negative delta → feature pushes more toward User
 */
function scoreBlock(block: FeaturedBlock, deltas: Record<string, number>): ScoredBlock {
    const f = block.features;
    let scoreUser = 0;
    let scoreAi = 0;

    // Helper: apply delta to the appropriate score
    const applyDelta = (feature: string, baseUser: number, baseAi: number) => {
        const d = deltas[feature] ?? 0;
        // Positive delta → more AI; negative → more User
        if (d > 0) {
            scoreAi += d;
        } else if (d < 0) {
            scoreUser += Math.abs(d);
        }
        scoreUser += baseUser;
        scoreAi += baseAi;
    };

    // ── User-leaning features ──────────────────────────────

    // Short text (< 50 chars) — users tend to write short messages
    if (f.charCount < 50) applyDelta('shortText', 2, 0);
    if (f.charCount < 20) scoreUser += 1; // extra for very short

    // Question form
    if (f.hasQuestion) applyDelta('hasQuestion', 3, 0);

    // Imperative form (して、作って、直して)
    if (f.hasImperativeForm) applyDelta('hasImperativeForm', 2, 0);

    // Error keyword (動かない、落ちる)
    if (f.hasErrorKeyword) applyDelta('hasErrorKeyword', 2, 0);

    // File path or URL standalone (pasting for context)
    if (f.hasFilePath && f.lineCount <= 2) applyDelta('hasFilePath', 1, 0);
    if (f.hasUrl && f.lineCount <= 2) applyDelta('hasUrl', 1, 0);

    // Casual speech style
    if (f.formality < 0.3) applyDelta('casualSpeech', 2, 0);

    // High sentiment (exclamation/question heavy)
    if (f.sentimentScore > 0.3) scoreUser += 1;

    // Command line pasting (user providing context)
    if (f.hasCommand && !f.hasExplanationStructure) applyDelta('hasCommand', 1, 0);

    // ── AI-leaning features ───────────────────────────────

    // Long text (> 200 chars) — AI tends to write long responses
    if (f.charCount > 200) applyDelta('longText', 0, 2);
    if (f.charCount > 500) scoreAi += 1; // extra for very long

    // Markdown heading usage
    if (f.hasMarkdownHeading) applyDelta('hasMarkdownHeading', 0, 3);

    // Bullet/numbered list structure
    if (f.hasBulletList) applyDelta('hasBulletList', 0, 2);

    // Table
    if (f.hasTable) applyDelta('hasTable', 0, 3);

    // Code block (``` fenced)
    if (f.hasCodeBlock) applyDelta('hasCodeBlock', 0, 2);

    // Polite/formal style (です/ます)
    if (f.hasPoliteForm) applyDelta('hasPoliteForm', 0, 1);

    // Explanation structure (「〜とは」「つまり」)
    if (f.hasExplanationStructure) applyDelta('hasExplanationStructure', 0, 2);

    // High technical term density in long text
    if (f.technicalTermDensity > 0.05 && f.charCount > 100) scoreAi += 1;

    // Multiple lines with structure
    if (f.lineCount > 5 && (f.hasBulletList || f.hasMarkdownHeading)) scoreAi += 1;

    // ── Compute local probability and confidence ──────────

    const margin = scoreAi - scoreUser;
    const pAi = sigmoid(margin);

    // Confidence: higher margin = more confident, but short text reduces confidence
    const absMargin = Math.abs(margin);
    const lengthFactor = Math.min(f.charCount / 100, 1.0);
    const localConfidence = sigmoid(absMargin - 1) * lengthFactor;

    return {
        ...block,
        scoreAi,
        scoreUser,
        pAi,
        localConfidence,
    };
}

/**
 * Score all blocks for User vs AI.
 * Loads learned weight deltas from user corrections.
 */
export function scoreAllBlocks(blocks: FeaturedBlock[]): ScoredBlock[] {
    const deltas = getWeightDeltas();
    return blocks.map(b => scoreBlock(b, deltas));
}
