// ══════════════════════════════════════════════════════════
// SYSTEM 3: SMART TABLE RECONSTRUCTION
// Converts visually-aligned plain-text data into HTML tables.
// ══════════════════════════════════════════════════════════

// Keyword dictionary — ordered longest-first for greedy matching
export const KEYWORD_DICT: string[] = [
    'おすすめの組み合わせ', '推奨される傾向', '代表的なもの', 'ライフスタイル',
    'トレーニング', 'ポイント数', '注意事項', 'おすすめ度', 'アクセス方法',
    'メリット', 'デメリット', '優先度', '期待効果', '主な特徴', '選び方',
    '目安量', 'タイミング', 'カテゴリ', '評価基準', '対象者', '具体例',
    '推奨量', '摂取量', '主な効能', '副作用', '摂取方法', '注意点',
    '年齢層', '年代別', '年代', '年齢', '性別', '世代', '職業',
    '傾向', '特徴', '理由', '根拠', '説明', '詳細', '概要', '備考',
    '推奨', '提案', '種類', 'タイプ', '方法', '手順', '効果', '効能',
    '価格', 'コスト', '費用', '評価', 'スコア', '期間', '頻度',
    '対象', '条件', '項目', '内容', 'ステータス', '優先', '結果', '名前',
    // English
    'Priority', 'Feature', 'Benefit', 'Description', 'Category',
    'Status', 'Rating', 'Score', 'Notes', 'Example', 'Type', 'Name',
].sort((a, b) => b.length - a.length);

/** Greedy keyword segmentation of a line (no separator — e.g. "年齢層推奨される傾向理由") */
function splitByKeywords(line: string): string[] | null {
    const segments: string[] = [];
    let rem = line.trim();
    while (rem.length > 0) {
        const kw = KEYWORD_DICT.find(k => rem.startsWith(k));
        if (kw) { segments.push(kw); rem = rem.slice(kw.length); }
        else return null;
    }
    return segments.length >= 2 ? segments : null;
}

/**
 * Split a line into columns.
 * Priority order:
 *   1. Tab-separated            (strongest physical signal)
 *   2. 2+ consecutive spaces    (visual alignment — Gemini copy-paste tables)
 *   3. Single space between known keywords (e.g. "年齢層 推奨される傾向 理由")
 *   4. Concatenated keywords, no separator at all
 */
export function splitColumns(line: string): string[] {
    const t = line.trim();

    // 1. Tab-separated — strongest signal
    if (t.includes('\t')) {
        const cells = t.split('\t').map(c => c.trim());
        while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
        return cells;
    }

    // 2. Two-or-more consecutive spaces / mixed whitespace runs
    const spaced = t.split(/\s{2,}/).map(c => c.trim()).filter(c => c);
    if (spaced.length >= 2) return spaced;

    // 3. Single space between known keywords (e.g. "年齢層 推奨される傾向 理由")
    const singleSpaceTokens = t.split(' ').map(c => c.trim()).filter(c => c);
    if (
        singleSpaceTokens.length >= 2 &&
        singleSpaceTokens.every(w => KEYWORD_DICT.includes(w))
    ) {
        return singleSpaceTokens;
    }

    // 4. Concatenated keywords with NO separator
    const kw = splitByKeywords(t);
    return kw ?? [t];
}

export function looksLikeTable(lines: string[]): boolean {
    // Need at least 3 lines (header + 2 data rows) to avoid false positives
    if (lines.length < 3) return false;
    // Already a GFM pipe table — let remark-gfm handle it
    if (lines.some(l => l.trim().startsWith('|'))) return false;

    const cols = lines.map(l => splitColumns(l).length);
    const colCount = cols[0];
    if (colCount < 2) return false;
    if (!cols.every(c => c === colCount)) return false;

    // If ALL cells are long natural sentences (≥40 chars), it's prose, not a table
    const allRows = lines.map(l => splitColumns(l));
    const allCellsLong = allRows.every(row => row.every(cell => cell.length >= 40));
    if (allCellsLong) return false;

    // Tab-separated → very strong table signal
    const hasTab = lines.some(l => l.includes('\t'));
    if (hasTab) return true;

    // 2+ space visual alignment in every line → accept
    const has2Space = lines.every(l => /\s{2,}/.test(l));
    if (has2Space) return true;

    // For single-space lines, require at least one header cell to be a known keyword
    const headerCells = splitColumns(lines[0]);
    const hasKnownKeyword = headerCells.some(cell => KEYWORD_DICT.includes(cell.trim()));
    return hasKnownKeyword;
}

export function buildHtmlTable(lines: string[]): string {
    const rows = lines.map(l => splitColumns(l));
    const [header, ...body] = rows;
    const ths = header.map(h => `<th>${h}</th>`).join('');
    const trs = body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n');
    return `<table class="smart-table">\n<thead><tr>${ths}</tr></thead>\n<tbody>${trs}</tbody>\n</table>`;
}

/**
 * Recover tables — skip code fence paragraphs so they are never
 * misidentified as tables.
 */
export function recoverTables(text: string): string {
    return text
        .split(/\n\n+/)
        .map(para => {
            // Skip any paragraph that starts with a code fence
            if (para.trimStart().startsWith('```')) return para;
            const lines = para.split('\n').filter(l => l.trim());
            return looksLikeTable(lines) ? buildHtmlTable(lines) : para;
        })
        .join('\n\n');
}

export function detectHasTable(content: string): boolean {
    return /\|.*\|/.test(content) || /<table/i.test(content);
}

// ══════════════════════════════════════════════════════════
// BOLD NORMALIZER
// Gemini's clipboard copies bold as "** text **" (spaces inside).
// This is invalid Markdown — normalize then convert to <strong>.
//
// Strategy: extract code fences first, process prose, re-join.
// This avoids regex-based split that can corrupt multi-fence texts.
// ══════════════════════════════════════════════════════════
export function normalizeBold(text: string): string {
    // Tokenize: alternate between prose and code fence blocks
    // ``` fences are kept verbatim; inline `code` is preserved by
    // the replacement function below.
    const tokens: { raw: string; isCode: boolean }[] = [];
    const FENCE_RE = /```[\s\S]*?```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    FENCE_RE.lastIndex = 0;
    while ((match = FENCE_RE.exec(text)) !== null) {
        // prose before this fence
        if (match.index > lastIndex) {
            tokens.push({ raw: text.slice(lastIndex, match.index), isCode: false });
        }
        tokens.push({ raw: match[0], isCode: true });
        lastIndex = FENCE_RE.lastIndex;
    }
    // remaining prose after last fence
    if (lastIndex < text.length) {
        tokens.push({ raw: text.slice(lastIndex), isCode: false });
    }

    return tokens.map(tok => {
        if (tok.isCode) return tok.raw; // code fences: pass through unchanged
        // Prose: convert ** ** to <strong>, but preserve inline `code` spans
        return tok.raw.replace(
            /(`[^`\n]+?`)|(\*\*\s*([^*\n]+?)\s*\*\*)/g,
            (_m, inlineCode, _boldFull, inner) => {
                if (inlineCode !== undefined) return inlineCode; // preserve inline code
                const trimmed = (inner ?? '').trim();
                return trimmed ? `<strong>${trimmed}</strong>` : '';
            }
        );
    }).join('');
}
