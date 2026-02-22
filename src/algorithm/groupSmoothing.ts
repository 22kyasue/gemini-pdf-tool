// ══════════════════════════════════════════════════════════
// GROUP SMOOTHING — Propagate representative tags within groups
// ══════════════════════════════════════════════════════════

import type { AnalyzedMessage, SemanticGroup, IntentTag } from './types';

/**
 * Smooth labels within semantic groups.
 *
 * For each group:
 * 1. Compute representative (majority) tags for intent, artifact, topic
 * 2. Propagate representative tags to messages with empty/weak labels
 * 3. Detect Q→ANSWER patterns within groups
 *
 * This reduces isolated label noise and improves consistency.
 */
export function smoothGroups(
    messages: AnalyzedMessage[],
    groups: SemanticGroup[]
): AnalyzedMessage[] {
    const result = messages.map(msg => ({ ...msg })); // shallow copy

    for (const group of groups) {
        const [start, end] = group.span;
        const groupMessages = result.slice(start, end + 1);

        // ── Compute representative tags ──

        // Representative topics: those appearing in >= 30% of group messages
        const topicCounts: Record<string, number> = {};
        for (const msg of groupMessages) {
            for (const t of msg.topic) {
                topicCounts[t] = (topicCounts[t] || 0) + 1;
            }
        }
        const groupSize = groupMessages.length;
        const representativeTopics = Object.entries(topicCounts)
            .filter(([, count]) => count / groupSize >= 0.3)
            .sort((a, b) => b[1] - a[1])
            .map(([topic]) => topic);

        // Representative intents
        const intentCounts: Record<string, number> = {};
        for (const msg of groupMessages) {
            for (const i of msg.intent) {
                intentCounts[i] = (intentCounts[i] || 0) + 1;
            }
        }

        // Representative artifacts
        const artifactCounts: Record<string, number> = {};
        for (const msg of groupMessages) {
            for (const a of msg.artifact) {
                artifactCounts[a] = (artifactCounts[a] || 0) + 1;
            }
        }

        // ── Propagation: fill in empty labels with group representatives ──

        for (let i = start; i <= end; i++) {
            const msg = result[i];

            // Propagate topics to messages with no topics
            if (msg.topic.length === 0 && representativeTopics.length > 0) {
                msg.topic = [...representativeTopics];
            }

            // Add group's majority topic to messages that have different topics
            // (gentle smoothing — add, don't replace)
            if (msg.topic.length > 0 && representativeTopics.length > 0) {
                for (const rt of representativeTopics) {
                    if (!msg.topic.includes(rt)) {
                        msg.topic.push(rt);
                    }
                }
            }
        }

        // ── Pattern detection: Q → ANSWER pairs ──
        // If a group starts with Q (question) from user, followed by a long AI response,
        // ensure the AI response has appropriate intent

        for (let i = start; i < end; i++) {
            const curr = result[i];
            const next = result[i + 1];

            // Q followed by long AI response → ensure next has INFO or PLAN intent
            if (
                curr.role === 'user' &&
                curr.intent.includes('Q' as IntentTag) &&
                next.role === 'ai' &&
                next.text.length > 100
            ) {
                if (!next.intent.includes('INFO' as IntentTag) && !next.intent.includes('PLAN' as IntentTag)) {
                    next.intent.push('INFO' as IntentTag);
                }
            }

            // ERROR followed by AI response → the AI response is likely a fix/explanation
            if (
                curr.role === 'user' &&
                curr.intent.includes('ERROR' as IntentTag) &&
                next.role === 'ai'
            ) {
                // Add BUG topic if not present
                if (!next.topic.includes('BUG')) {
                    next.topic.push('BUG');
                }
            }
        }

        // ── Group-level artifact smoothing ──
        // If LOG appears in >= 50% of group messages, tag group as debug-oriented
        const logCount = artifactCounts['LOG'] || 0;
        if (logCount / groupSize >= 0.5) {
            for (let i = start; i <= end; i++) {
                if (!result[i].topic.includes('BUG')) {
                    result[i].topic.push('BUG');
                }
            }
        }

        // Assign semanticGroupId
        for (let i = start; i <= end; i++) {
            result[i].semanticGroupId = group.id;
        }
    }

    return result;
}
