import type { Turn } from '../types';

// ══════════════════════════════════════════════════════════
// UTILITY: NotebookLM Markdown Builder
// Creates clean ### User: / ### Gemini: labelled Markdown
// with GFM pipe tables and no junk/invitation text.
// ══════════════════════════════════════════════════════════
export function buildNotebookLMMarkdown(turns: Turn[]): string {
    return turns.map((t: Turn) => {
        const label = t.role === 'user' ? '### User:' : `### ${t.llmLabel}:`;
        const body = t.content
            .replace(/<table[\s\S]*?<\/table>/gi, (match) => {
                // Convert HTML table back to GFM pipe table
                const rows: string[][] = [];
                const thRe = /<th[^>]*>(.*?)<\/th>/gi;
                const tdRe = /<td[^>]*>(.*?)<\/td>/gi;
                const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let trMatch;
                while ((trMatch = trRe.exec(match)) !== null) {
                    const cells: string[] = [];
                    const cellContent = trMatch[1];
                    let cell;
                    const thIter = new RegExp(thRe.source, 'gi');
                    while ((cell = thIter.exec(cellContent)) !== null) cells.push(cell[1].trim());
                    if (cells.length === 0) {
                        const tdIter = new RegExp(tdRe.source, 'gi');
                        while ((cell = tdIter.exec(cellContent)) !== null) cells.push(cell[1].trim());
                    }
                    if (cells.length > 0) rows.push(cells);
                }
                if (rows.length === 0) return '';
                const sep = rows[0].map(() => '---');
                const fmt = (r: string[]) => '| ' + r.join(' | ') + ' |';
                return [fmt(rows[0]), fmt(sep), ...rows.slice(1).map(fmt)].join('\n');
            })
            .replace(/<[^>]+>/g, ''); // strip any remaining HTML
        return `${label}\n\n${body.trim()}`;
    }).join('\n\n---\n\n');
}
