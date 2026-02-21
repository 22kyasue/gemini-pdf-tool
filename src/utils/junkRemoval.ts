// ══════════════════════════════════════════════════════════
// SYSTEM 1: JUNK REMOVAL
// ══════════════════════════════════════════════════════════

const JUNK_EXACT = new Set([
    '回答案を表示する', '回答案を表示', '他の回答案を表示', '他の回答案',
    '他の回答', 'コピー', 'Copy', 'いいね', 'よくない',
    'Good response', 'Bad response', 'Share', 'Report', 'Retry',
    'もう一度生成', '音声で聞く', '編集', 'Edit message', 'Regenerate',
    'Show more', 'Show less', '回答を評価', '回答を共有',
    // ChatGPT-specific junk
    'Like', 'Dislike', 'Memory updated', 'Memory updated.',
    'Read aloud', 'Search the web', 'Create image',
]);

// Junk that can appear ANYWHERE mid-block (YouTube stubs, bare URLs, cite tags)
const INLINE_JUNK_LINE_RE: RegExp[] = [
    /^\s*https?:\/\//,
    /^\s*www\.\S/,
    /\[cite:\s*\d/,
    /回の視聴/,
    /Are So Expensive/i,
    /^\s*(Business Insider|Forbes|Bloomberg|TechCrunch|Wired)\s*[·•\-–]/i,
    /^\s*\[\d+\]\s*\S/,
    // ChatGPT noise
    /^Thought for \d+ seconds?$/i,
    /^Searched \d+ sites?$/i,
    /^Analyzing/i,
];

export function removeJunk(text: string): string {
    return text
        .split('\n')
        .filter(line => {
            const t = line.trim();
            if (!t) return true;
            if (JUNK_EXACT.has(t)) return false;
            if (/^\d+\s*\/\s*\d+$/.test(t)) return false;
            if (/^draft\s+\d+$/i.test(t)) return false;
            if (/^[👍👎🔊📋✏️🔄⋮…]{1,4}$/.test(t)) return false;
            if (INLINE_JUNK_LINE_RE.some(r => r.test(t))) return false;
            return true;
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ══════════════════════════════════════════════════════════
// SYSTEM 1b: TRAILING INVITATION REMOVAL
// ══════════════════════════════════════════════════════════
const INVITATION_RE: RegExp[] = [
    // Japanese next-step lures
    /次[はに]、/,
    /しましょうか[？?]/,
    /ませんか[？?]/,
    /どうでしょうか[？?]/,
    /いかがでしょうか[？?]/,
    /興味はありますか[？?]/,
    /詳しく(知り|説明|お伝え|解説)/,
    /について(詳しく|解説|お伝え)/,
    /〜について詳しく/,
    /ご質問があれば/,
    /お気軽に(お申し|ご連絡|ご質問)/,
    /動画では.{0,30}解説されています/,
    // Broad ？-ending invitation sentences
    /^.{0,60}[？?]$/,
    // Media stub lines
    /YouTube/i,
    /Business Insider/i,
    /Are So Expensive/i,
    /\[cite:\s*\d/,
    /回の視聴/,
    /^\s*Sources?:\s*$/i,
    /^\s*参考文献/,
    /^\s*\[\d+\]/,
    /^\s*https?:\/\//,
    /^\s*www\./,
];

export function removeTrailingInvitations(text: string): string {
    const lines = text.split('\n');

    // Pass 1: line-by-line backwards scan
    let cutAt = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
        const t = lines[i].trim();
        if (t === '') { cutAt = i; continue; }
        if (INVITATION_RE.some(r => r.test(t))) { cutAt = i; }
        else break;
    }
    const pass1 = lines.slice(0, cutAt).join('\n').trim();

    // Pass 2: paragraph-level scan — drop trailing paragraphs where EVERY line matches
    const paras = pass1.split(/\n\n+/);
    while (paras.length > 0) {
        const last = paras[paras.length - 1].trim();
        const lastLines = last.split('\n').filter(l => l.trim());
        if (lastLines.length > 0 && lastLines.every(l => INVITATION_RE.some(r => r.test(l.trim())))) {
            paras.pop();
        } else break;
    }
    const pass2 = paras.join('\n\n').trim();

    // Pass 3: sentence-level scan
    const SENTENCE_SEP = /(?<=[。？！?!])\s*/;
    const paraList = pass2.split(/\n\n+/);
    if (paraList.length > 0) {
        const lastPara = paraList[paraList.length - 1];
        if (!lastPara.includes('\n')) {
            const sentences = lastPara.split(SENTENCE_SEP).filter(s => s.trim());
            while (sentences.length > 0) {
                const s = sentences[sentences.length - 1].trim();
                if (INVITATION_RE.some(r => r.test(s))) sentences.pop();
                else break;
            }
            if (sentences.length > 0) {
                paraList[paraList.length - 1] = sentences.join('');
            } else {
                paraList.pop();
            }
        }
    }
    return paraList.join('\n\n').trim();
}
