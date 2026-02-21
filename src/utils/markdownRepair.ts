/**
 * ══════════════════════════════════════════════════════════
 * SYSTEM 1c: MARKDOWN REPAIR & INTEGRITY
 * Ensures structural markup (fences, bold) is always closed.
 * ══════════════════════════════════════════════════════════
 */

export function repairMarkdown(text: string): string {
    let repaired = text;

    // 1. Fix unclosed code fences (```)
    const fences = (repaired.match(/```/g) || []).length;
    if (fences % 2 !== 0) {
        repaired += '\n```';
    }

    // 2. Fix unclosed bold (** or __)
    // Simple greedy approach: count occurrences and appends if odd
    const doubleStar = (repaired.match(/\*\*/g) || []).length;
    if (doubleStar % 2 !== 0) {
        // If there's an odd number, we check if the last one is at the end of a sentence
        // or just append it to the end of the text.
        repaired += '**';
    }

    // 3. Fix unclosed inline code (`)
    // Skip this if there are no backticks or if it's already part of a fence
    const singleBacktick = (repaired.replace(/```[\s\S]*?```/g, '').match(/`/g) || []).length;
    if (singleBacktick % 2 !== 0) {
        repaired += '`';
    }

    return repaired;
}

/**
 * ══════════════════════════════════════════════════════════
 * SYSTEM 1d: CITATION BEAUTIFICATION
 * Converts [cite:X] or [X] into professional superscripts.
 * ══════════════════════════════════════════════════════════
 */
export function beautifyCitations(text: string): string {
    // 1. Handle Gemini style [cite:1], [cite: 2]
    // Convert to <sup class="citation">1</sup>
    let processed = text.replace(/\[cite:\s*(\d+)\]/gi, (_match, num) => {
        return `<sup class="cit-badge">${num}</sup>`;
    });

    // 2. Handle generic style [1], [2] at end of sentences
    // Careful not to match typical [ ] markers in code or lists
    // Only match [digits] if they follow a word or punctuation without a space
    processed = processed.replace(/(\w|[。？！?!])\[(\d+)\]/g, (_match, prev, num) => {
        return `${prev}<sup class="cit-badge">${num}</sup>`;
    });

    return processed;
}
