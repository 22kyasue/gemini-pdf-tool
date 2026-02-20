// ══════════════════════════════════════════════════════════
// SEMANTIC GROUPING — Group related messages by topic similarity
// ══════════════════════════════════════════════════════════

import type { AnalyzedMessage, SemanticGroup, SemanticVector, IntentTag } from './types';

/**
 * Extract a lightweight semantic vector from a message.
 * No embeddings — uses keyword extraction and dictionary matching.
 */
function buildSemanticVector(msg: AnalyzedMessage): SemanticVector {
    const text = msg.text.toLowerCase();

    // Extract keywords: split on whitespace and punctuation, normalize
    const rawTokens = text
        .replace(/[^\w\u3040-\u30FF\u4E00-\u9FFF\u3400-\u4DBFa-zA-Z0-9_-]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2);

    const keywords = new Set(rawTokens);

    // Add bigrams for better context
    for (let i = 0; i < rawTokens.length - 1; i++) {
        keywords.add(`${rawTokens[i]}_${rawTokens[i + 1]}`);
    }

    // Important terms: katakana, English technical terms, numbers
    const importantTerms = new Set<string>();
    const katakanaRe = /[\u30A0-\u30FF]{2,}/g;
    const techTermRe = /\b[A-Z][a-zA-Z]*(?:[A-Z][a-z]+)+\b/g; // camelCase/PascalCase
    const allCapsRe = /\b[A-Z]{2,}\b/g; // ACRONYMS

    for (const match of text.matchAll(katakanaRe)) importantTerms.add(match[0]);
    for (const match of msg.text.matchAll(techTermRe)) importantTerms.add(match[0].toLowerCase());
    for (const match of msg.text.matchAll(allCapsRe)) importantTerms.add(match[0].toLowerCase());

    // Entities: URLs, file paths, command names
    const entities = new Set<string>();
    const urlRe = /https?:\/\/[^\s]+/g;
    const pathRe = /([A-Z]:\\|\/Users\/|~\/|\.\/)[^\s]+/g;
    const cmdRe = /\b(npm|git|docker|kubectl|brew|pip|yarn|curl)\b/gi;

    for (const match of msg.text.matchAll(urlRe)) entities.add(match[0]);
    for (const match of msg.text.matchAll(pathRe)) entities.add(match[0]);
    for (const match of msg.text.matchAll(cmdRe)) entities.add(match[0].toLowerCase());

    // Topic tags (already computed in msg.topic)
    const topicTags = new Set(msg.topic);

    return { keywords, importantTerms, entities, topicTags };
}

/**
 * Compute Jaccard similarity between two sets.
 */
function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    for (const item of a) {
        if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
}

/**
 * Compute combined similarity between two semantic vectors.
 * Weighted combination of keyword, important term, entity, and topic similarity.
 */
function computeSimilarity(a: SemanticVector, b: SemanticVector): number {
    const kwSim = jaccard(a.keywords, b.keywords);
    const termSim = jaccard(a.importantTerms, b.importantTerms);
    const entitySim = jaccard(a.entities, b.entities);
    const topicSim = jaccard(a.topicTags, b.topicTags);

    // Weighted combination (topic match is strongest signal)
    return kwSim * 0.25 + termSim * 0.25 + entitySim * 0.2 + topicSim * 0.3;
}

/**
 * Check if a forced boundary should be placed between two messages.
 */
function isForcedBoundary(prev: AnalyzedMessage, curr: AnalyzedMessage): boolean {
    // META intent acts as a boundary (「次」「短く」etc.)
    if (curr.intent.includes('META' as IntentTag)) return true;

    // Major topic shift: prev and curr have completely different topics
    if (prev.topic.length > 0 && curr.topic.length > 0) {
        const overlap = prev.topic.some(t => curr.topic.includes(t));
        if (!overlap) return true;
    }

    // Major artifact type shift (e.g., LOG → PLAN)
    if (prev.artifact.length > 0 && curr.artifact.length > 0) {
        const overlap = prev.artifact.some(a => curr.artifact.includes(a));
        if (!overlap) {
            // Only force boundary for significant artifact changes
            const significantTypes = new Set(['CODE', 'LOG', 'TABLE', 'DOC']);
            const prevHasSig = prev.artifact.some(a => significantTypes.has(a));
            const currHasSig = curr.artifact.some(a => significantTypes.has(a));
            if (prevHasSig && currHasSig) return true;
        }
    }

    return false;
}

/** Similarity threshold for grouping */
const SIMILARITY_THRESHOLD = 0.08;

/**
 * Group messages into semantic groups based on topic similarity.
 *
 * Algorithm:
 * 1. Build semantic vectors for each message
 * 2. Compare adjacent messages
 * 3. If similarity >= threshold and no forced boundary → same group
 * 4. Otherwise → new group
 *
 * Note: Role changes (User→AI) are NOT treated as boundaries,
 * because Q&A pairs naturally share the same topic.
 */
export function groupMessages(messages: AnalyzedMessage[]): SemanticGroup[] {
    if (messages.length === 0) return [];

    // Build semantic vectors
    const vectors = messages.map(buildSemanticVector);

    // Group by adjacent similarity
    const groups: SemanticGroup[] = [];
    let currentGroupStart = 0;

    for (let i = 1; i < messages.length; i++) {
        const sim = computeSimilarity(vectors[i - 1], vectors[i]);
        const forcedBound = isForcedBoundary(messages[i - 1], messages[i]);

        if (forcedBound || sim < SIMILARITY_THRESHOLD) {
            // Close current group
            groups.push(buildGroup(groups.length, currentGroupStart, i - 1, messages));
            currentGroupStart = i;
        }
    }

    // Close final group
    groups.push(buildGroup(groups.length, currentGroupStart, messages.length - 1, messages));

    return groups;
}

/**
 * Build a SemanticGroup from a range of messages.
 */
function buildGroup(
    id: number,
    start: number,
    end: number,
    messages: AnalyzedMessage[]
): SemanticGroup {
    const topics: Record<string, number> = {};
    const intents: Record<string, number> = {};
    const artifacts: Record<string, number> = {};

    for (let i = start; i <= end; i++) {
        const msg = messages[i];
        for (const t of msg.topic) topics[t] = (topics[t] || 0) + 1;
        for (const t of msg.intent) intents[t] = (intents[t] || 0) + 1;
        for (const a of msg.artifact) artifacts[a] = (artifacts[a] || 0) + 1;
    }

    return {
        id,
        span: [start, end],
        summaryStats: { topics, intents, artifacts },
    };
}
