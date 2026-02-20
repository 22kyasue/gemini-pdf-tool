// ══════════════════════════════════════════════════════════
// WEIGHT UPDATER — Learn from user corrections
// ══════════════════════════════════════════════════════════

import { getRoleCorrections, updateWeightDeltas, getWeightDeltas } from './correctionStore';

/**
 * Feature names that map to scorer rules.
 * These correspond to the features checked in roleScorer.ts.
 */
const LEARNABLE_FEATURES = [
    'shortText',        // charCount < 50
    'longText',         // charCount > 200
    'hasQuestion',
    'hasImperativeForm',
    'hasErrorKeyword',
    'hasCodeBlock',
    'hasMarkdownHeading',
    'hasBulletList',
    'hasTable',
    'hasPoliteForm',
    'hasExplanationStructure',
    'hasUrl',
    'hasFilePath',
    'hasCommand',
    'casualSpeech',     // formality < 0.3
] as const;

/**
 * Learning rate for weight updates.
 * Small value = conservative learning (avoids overfitting to a few corrections).
 */
const LEARNING_RATE = 0.15;

/**
 * Maximum absolute delta for any single feature weight.
 * Prevents runaway weights from a small number of biased corrections.
 */
const MAX_DELTA = 3.0;

/**
 * Recompute weight deltas from all stored corrections.
 *
 * Algorithm:
 * For each correction where user changed role:
 *   - If user changed AI→User: active features should lean more toward User
 *     → decrease AI-leaning weights, increase User-leaning weights
 *   - If user changed User→AI: active features should lean more toward AI
 *     → increase AI-leaning weights, decrease User-leaning weights
 *
 * The delta is accumulated across all corrections, weighted by recency.
 */
export function recomputeWeights(): Record<string, number> {
    const corrections = getRoleCorrections();
    if (corrections.length === 0) return {};

    const deltas: Record<string, number> = {};

    // Initialize all deltas to 0
    for (const feat of LEARNABLE_FEATURES) {
        deltas[feat] = 0;
    }

    // Process corrections from oldest to newest
    const now = Date.now();
    for (const correction of corrections) {
        if (correction.originalRole === correction.correctedRole) continue;

        // Recency weight: recent corrections matter more
        const ageMs = now - correction.timestamp;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const recencyWeight = Math.exp(-ageDays / 30); // half-life of ~30 days

        // Direction: +1 means "this feature should push more toward AI"
        //            -1 means "this feature should push more toward User"
        const direction = correction.correctedRole === 'ai' ? 1 : -1;

        // Update deltas for each active feature
        for (const feat of correction.activeFeatures) {
            if (feat in deltas) {
                deltas[feat] += direction * LEARNING_RATE * recencyWeight;
            }
        }
    }

    // Clamp deltas
    for (const feat of Object.keys(deltas)) {
        deltas[feat] = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, deltas[feat]));
    }

    // Remove near-zero deltas (< 0.01) to keep the store clean
    for (const feat of Object.keys(deltas)) {
        if (Math.abs(deltas[feat]) < 0.01) {
            delete deltas[feat];
        }
    }

    // Persist
    updateWeightDeltas(deltas);
    return deltas;
}

/**
 * Get the current weight delta for a specific feature.
 * Returns 0 if no delta has been learned.
 */
export function getFeatureDelta(feature: string): number {
    const deltas = getWeightDeltas();
    return deltas[feature] ?? 0;
}

/**
 * Get all current weight deltas.
 */
export function getAllDeltas(): Record<string, number> {
    return getWeightDeltas();
}

/**
 * Determine which features are "active" for a given block.
 * Used when recording a correction so we know which features to adjust.
 */
export function extractActiveFeatures(block: {
    text: string;
    features: {
        charCount: number;
        hasQuestion: boolean;
        hasImperativeForm: boolean;
        hasErrorKeyword: boolean;
        hasCodeBlock: boolean;
        hasMarkdownHeading: boolean;
        hasBulletList: boolean;
        hasTable: boolean;
        hasPoliteForm: boolean;
        hasExplanationStructure: boolean;
        hasUrl: boolean;
        hasFilePath: boolean;
        hasCommand: boolean;
        formality: number;
    };
}): string[] {
    const active: string[] = [];
    const f = block.features;

    if (f.charCount < 50) active.push('shortText');
    if (f.charCount > 200) active.push('longText');
    if (f.hasQuestion) active.push('hasQuestion');
    if (f.hasImperativeForm) active.push('hasImperativeForm');
    if (f.hasErrorKeyword) active.push('hasErrorKeyword');
    if (f.hasCodeBlock) active.push('hasCodeBlock');
    if (f.hasMarkdownHeading) active.push('hasMarkdownHeading');
    if (f.hasBulletList) active.push('hasBulletList');
    if (f.hasTable) active.push('hasTable');
    if (f.hasPoliteForm) active.push('hasPoliteForm');
    if (f.hasExplanationStructure) active.push('hasExplanationStructure');
    if (f.hasUrl) active.push('hasUrl');
    if (f.hasFilePath) active.push('hasFilePath');
    if (f.hasCommand) active.push('hasCommand');
    if (f.formality < 0.3) active.push('casualSpeech');

    return active;
}
