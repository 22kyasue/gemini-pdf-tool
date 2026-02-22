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
    '脂質異常症', '血糖管理', '消化器系', '美容・皮膚', '美容', '皮膚',
    // English
    'Priority', 'Feature', 'Benefit', 'Description', 'Category',
    'Status', 'Rating', 'Score', 'Notes', 'Example', 'Type', 'Name',
].sort((a, b) => b.length - a.length);

/** Greedy keyword segmentation of a line (no separator — e.g. "年齢層推奨される傾向理由") */
function splitByKeywords(line: string): string[] | null {
    const segments: string[] = [];
    let pos = 0;
    const trimmed = line.trim();
    while (pos < trimmed.length) {
        const remaining = trimmed.slice(pos);
        const kw = KEYWORD_DICT.find(k => remaining.startsWith(k));
        if (kw) {
            segments.push(kw);
            pos += kw.length;
        } else {
            return null;
        }
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
 *   5. Fallback: split by any whitespace (greedy)
 */
export function splitColumns(line: string, expectedCount?: number): string[] {
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

    // If we have an expected count, try whitespace split
    if (expectedCount && singleSpaceTokens.length === expectedCount) {
        return singleSpaceTokens;
    }

    if (
        singleSpaceTokens.length >= 2 &&
        singleSpaceTokens.every(w => KEYWORD_DICT.includes(w))
    ) {
        return singleSpaceTokens;
    }

    // 4. Concatenated keywords with NO separator
    const kw = splitByKeywords(t);
    if (kw) return kw;

    // 5. Hard fallback — if it looks like a row but separators are weak
    return singleSpaceTokens;
}

export function looksLikeTable(lines: string[]): boolean {
    // Need at least 2 lines (header + 1 data row)
    if (lines.length < 2) return false;
    // Already a GFM pipe table — let remark-gfm handle it
    if (lines.some(l => l.trim().startsWith('|'))) return false;

    // 1. Detect header
    const firstLine = lines[0];
    const headerCells = splitColumns(firstLine);
    const colCount = headerCells.length;

    if (colCount < 2) return false;

    // Is the header "strong"? (contains keywords)
    const hasKnownKeyword = headerCells.some(cell => KEYWORD_DICT.includes(cell.trim()));

    // 2. Check subsequent lines
    // For subsequent lines, we use splitColumns with expectedCount to be more lenient
    const rows = lines.slice(1).map(l => splitColumns(l, colCount));
    const allMatch = rows.every(r => r.length === colCount);

    if (!allMatch) return false;

    // If ALL cells are long natural sentences (≥50 chars), it's prose, not a table
    const allCellsLong = lines.every(l => splitColumns(l, colCount).every(cell => cell.length >= 50));
    if (allCellsLong) return false;

    // Reliability check: if single-spaced, we MUST have a keyword in the header
    const isSingleSpaced = lines.every(l => !l.includes('\t') && !/\s{2,}/.test(l));
    if (isSingleSpaced && !hasKnownKeyword) return false;

    return true;
}

export function buildHtmlTable(lines: string[]): string {
    const headerCols = splitColumns(lines[0]);
    const colCount = headerCols.length;
    const rows = lines.map(l => splitColumns(l, colCount));

    const [header, ...body] = rows;
    const ths = header.map(h => `<th>${h}</th>`).join('');
    const trs = body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n');
    return `<div class="smart-table-wrap">\n<table class="smart-table">\n<thead><tr>${ths}</tr></thead>\n<tbody>${trs}</tbody>\n</table>\n</div>`;
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
