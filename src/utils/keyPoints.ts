// ══════════════════════════════════════════════════════════
// SYSTEM 2: KEY POINTS EXTRACTOR
// Returns up to 3 concise key points from an LLM response.
// Priority: bold phrases → numbered list → headings → sentences
// ══════════════════════════════════════════════════════════

export function extractKeyPoints(raw: string): string[] {
    const clean = raw.replace(/<[^>]+>/g, '');

    // 1. Short bold phrases **phrase** ≤35 chars
    const boldShort = [...clean.matchAll(/\*\*(.{4,35}?)\*\*/g)]
        .map(m => m[1].trim())
        .filter(s => !s.includes('\n'));
    if (boldShort.length >= 2) return boldShort.slice(0, 3);

    // 2. Numbered list — first clause only (truncate at 。/、/:)
    const numbered = [...clean.matchAll(/^\d+[.．、]\s*(.{8,})/gm)].map(m => {
        const s = m[1].trim();
        const cut = s.search(/[。、：:]/);
        return cut > 0 ? s.slice(0, cut) : s.slice(0, 48);
    });
    if (numbered.length >= 2) return numbered.slice(0, 3);

    // 3. Heading lines
    const headings = [...clean.matchAll(/^#{1,3}\s+(.+)$/gm)].map(m => m[1].trim().slice(0, 48));
    if (headings.length >= 2) return headings.slice(0, 3);

    // 4. Fallback: short sentences
    const sentences = clean
        .split(/[。\n]/)
        .map(s => s.trim().replace(/^[*>#\-–—\d.、]+\s*/, ''))
        .filter(s => s.length >= 10 && s.length <= 80 && !s.startsWith('|') && !s.startsWith('<'));
    return sentences.slice(0, 3);
}
