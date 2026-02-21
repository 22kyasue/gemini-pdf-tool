// ══════════════════════════════════════════════════════════
// POST-PROCESSOR — Final adjustments after sequence optimization
// ══════════════════════════════════════════════════════════

import type { OptimizedBlock, Role } from './types';

import { USER_MARKERS, ASSISTANT_MARKERS } from '../utils/markers';

function isUserMarker(text: string): boolean {
    const t = text.trim();
    return USER_MARKERS.some(r => r.test(t));
}

function isAssistantMarker(text: string): boolean {
    const t = text.trim();
    return ASSISTANT_MARKERS.some(r => r.test(t));
}

/**
 * Check if a block is an explicit role header (1-line marker block).
 * Returns the forced role, or null if not a marker.
 */
function getExplicitRole(block: OptimizedBlock): Role | null {
    const lines = block.text.split('\n').filter(l => l.trim());
    if (lines.length !== 1) return null;
    const line = lines[0].trim();
    if (isUserMarker(line)) return 'user';
    if (isAssistantMarker(line)) return 'ai';
    return null;
}

/**
 * Post-process the optimized block sequence.
 *
 * Steps:
 * 1. Force explicit marker blocks to their declared role
 * 2. Propagate marker role to next block (marker → content)
 * 3. Absorb isolated blocks (single block between same-role blocks)
 * 4. Merge consecutive same-role short blocks
 * 5. Remove marker-only blocks (they are metadata, not content)
 */
export function postProcess(blocks: OptimizedBlock[]): OptimizedBlock[] {
    if (blocks.length === 0) return [];

    let result = [...blocks];

    // ── Step 1 & 2: Force explicit markers and propagate ──
    for (let i = 0; i < result.length; i++) {
        const explicitRole = getExplicitRole(result[i]);
        if (explicitRole !== null) {
            // Set this marker block's role
            result[i] = { ...result[i], role: explicitRole, confidence: 1.0 };

            // Propagate: the NEXT block should follow this role
            // For user marker → next block is user content
            // For assistant marker → next block is AI content
            if (i + 1 < result.length) {
                const nextExplicit = getExplicitRole(result[i + 1]);
                if (nextExplicit === null) {
                    // Next block is content, assign the role that follows
                    const contentRole: Role = explicitRole === 'user' ? 'user' : 'ai';
                    result[i + 1] = {
                        ...result[i + 1],
                        role: contentRole,
                        confidence: Math.max(result[i + 1].confidence, 0.95),
                    };
                }
            }
        }
    }

    // ── Step 3: Absorb isolated blocks ──
    // If block[i] has a different role from block[i-1] and block[i+1],
    // and those two have the same role, and block[i]'s confidence is low,
    // absorb it into the surrounding role.
    for (let i = 1; i < result.length - 1; i++) {
        const prev = result[i - 1];
        const curr = result[i];
        const next = result[i + 1];

        if (
            prev.role === next.role &&
            curr.role !== prev.role &&
            curr.confidence < 0.5
        ) {
            result[i] = { ...curr, role: prev.role, confidence: curr.confidence * 0.8 };
        }
    }

    // ── Step 4: Merge consecutive same-role short blocks ──
    const merged: OptimizedBlock[] = [result[0]];
    for (let i = 1; i < result.length; i++) {
        const prev = merged[merged.length - 1];
        const curr = result[i];

        // Merge if same role, both short, and no explicit markers
        const prevIsShort = prev.features.charCount < 80;
        const currIsShort = curr.features.charCount < 80;
        const sameRole = prev.role === curr.role;
        const neitherIsMarker = getExplicitRole(prev) === null && getExplicitRole(curr) === null;

        if (sameRole && prevIsShort && currIsShort && neitherIsMarker) {
            // Merge curr into prev
            merged[merged.length - 1] = {
                ...prev,
                text: prev.text + '\n' + curr.text,
                endLine: curr.endLine,
                confidence: Math.min(prev.confidence, curr.confidence),
            };
        } else {
            merged.push(curr);
        }
    }

    // ── Step 5: Remove marker-only blocks ──
    const cleaned = merged.filter(block => {
        const explicit = getExplicitRole(block);
        if (explicit === null) return true; // not a marker, keep
        const lines = block.text.split('\n').filter(l => l.trim());
        return lines.length > 1; // Keep only if it has content beyond the marker
    });

    // ── Step 6: Semantic Deduplication (The "Gemini Echo" Fix) ──
    const deduplicated: OptimizedBlock[] = [];
    for (let i = 0; i < cleaned.length; i++) {
        const curr = cleaned[i];
        if (deduplicated.length === 0) {
            deduplicated.push(curr);
            continue;
        }

        const prev = deduplicated[deduplicated.length - 1];

        // Check if current is a near-duplicate of previous (Gemini echo)
        const t1 = prev.text.trim();
        const t2 = curr.text.trim();
        const isNearDuplicate = t1 === t2 || (t1.length > 10 && (t1.includes(t2) || t2.includes(t1)));

        if (isNearDuplicate && prev.role === curr.role) {
            if (curr.confidence > prev.confidence) {
                deduplicated[deduplicated.length - 1] = curr;
            }
        } else {
            deduplicated.push(curr);
        }
    }

    // Re-index
    return deduplicated.map((block, idx) => ({
        ...block,
        id: idx,
    }));
}
