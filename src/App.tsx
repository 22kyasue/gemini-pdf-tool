import { useState, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import html2pdf from 'html2pdf.js';
import { FileText, Download, Trash2, User, Bot, List, Table, Clipboard, Check, ChevronDown, ChevronUp } from 'lucide-react';

// ══════════════════════════════════════════════════════════
// ERROR BOUNDARY — silently swallows component render errors
// so malformed content never crashes the preview
// ══════════════════════════════════════════════════════════
import { Component } from 'react';
import type { ReactNode } from 'react';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return null; // silent — no crash UI shown
    return this.props.children;
  }
}


// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════
type Role = 'user' | 'assistant';
type LLMName = 'Gemini' | 'ChatGPT' | 'Claude' | 'AI';
interface Turn {
  role: Role;
  llmLabel: string;       // resolved assistant name, e.g. 'Claude', 'ChatGPT'
  content: string;
  rawContent: string;
  index: number;
  summary: string;
  hasTable: boolean;
  keyPoints: string[];
}

// ══════════════════════════════════════════════════════════
// SYSTEM 1: JUNK REMOVAL
// ══════════════════════════════════════════════════════════
const JUNK_EXACT = new Set([
  '回答案を表示する', '回答案を表示', '他の回答案を表示', '他の回答案',
  '他の回答', 'コピー', 'Copy', 'いいね', 'よくない',
  'Good response', 'Bad response', 'Share', 'Report', 'Retry',
  'もう一度生成', '音声で聞く', '編集', 'Edit message', 'Regenerate',
  'Show more', 'Show less', '回答を評価', '回答を共有',
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
];

function removeJunk(text: string): string {
  return text
    .split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return true;
      if (JUNK_EXACT.has(t)) return false;
      if (/^\d+\s*\/\s*\d+$/.test(t)) return false;
      if (/^draft\s+\d+$/i.test(t)) return false;
      if (/^[👍👎🔊📋✏️🔄⋮…]{1,4}$/.test(t)) return false;
      if (INLINE_JUNK_LINE_RE.some(r => r.test(t))) return false;  // ← mid-block junk
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
  /^.{0,60}[？?]$/,               // any short line ending in ？ is likely an invitation
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

function removeTrailingInvitations(text: string): string {
  const lines = text.split('\n');
  // ── Pass 1: line-by-line backwards scan ──────────────────
  let cutAt = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t === '') { cutAt = i; continue; }
    if (INVITATION_RE.some(r => r.test(t))) { cutAt = i; }
    else break;
  }
  const pass1 = lines.slice(0, cutAt).join('\n').trim();

  // ── Pass 2: paragraph-level scan ─────────────────────────
  // Drop trailing paragraphs where EVERY line matches an invitation
  const paras = pass1.split(/\n\n+/);
  while (paras.length > 0) {
    const last = paras[paras.length - 1].trim();
    const lastLines = last.split('\n').filter(l => l.trim());
    if (lastLines.length > 0 && lastLines.every(l => INVITATION_RE.some(r => r.test(l.trim())))) {
      paras.pop();
    } else break;
  }
  const pass2 = paras.join('\n\n').trim();

  // ── Pass 3: sentence-level scan ──────────────────────────
  // Handles "...正当な文。次は〜しましょうか？" where the invitation
  // is the LAST SENTENCE of an otherwise clean paragraph.
  // Sentence delimiters: 。? ？ ! ！ followed by optional whitespace
  const SENTENCE_SEP = /(?<=[。？！?!])\s*/;
  const paraList = pass2.split(/\n\n+/);
  if (paraList.length > 0) {
    const lastPara = paraList[paraList.length - 1];
    // Only process single-line or short paragraphs (multi-sentence blocks)
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
        paraList.pop(); // whole last para was invitations
      }
    }
  }
  return paraList.join('\n\n').trim();
}



// ══════════════════════════════════════════════════════════
// SYSTEM 2: KEY POINTS EXTRACTOR

// Returns up to 3 concise key points from a Gemini response.
// Priority: numbered list → bold markers → headings → sentences
// ══════════════════════════════════════════════════════════
function extractKeyPoints(raw: string): string[] {
  const clean = raw.replace(/<[^>]+>/g, '');

  // 1. Short bold phrases **phrase** ≤35 chars — perfect for scannable amber box
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


// ══════════════════════════════════════════════════════════
// SYSTEM 3: SMART TABLE RECONSTRUCTION
// ══════════════════════════════════════════════════════════

// Keyword dictionary — ordered longest-first for greedy matching
const KEYWORD_DICT: string[] = [
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

/** Greedy keyword segmentation of a line */
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

/** Split a line into columns (tab / 2+ spaces / single-space keywords / keyword-concat) */
function splitColumns(line: string): string[] {
  const t = line.trim();
  // Tab-separated
  if (t.includes('\t')) {
    const cells = t.split('\t').map(c => c.trim());
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    return cells;
  }
  // 2+ space alignment
  const spaced = t.split(/  +/).map(c => c.trim()).filter(c => c);
  if (spaced.length >= 2) return spaced;
  // Single-space — check if all tokens are known keywords
  const words = t.split(/\s+/);
  if (words.length >= 2 && words.every(w => KEYWORD_DICT.includes(w))) return words;
  // Concatenated keywords (no separator)
  const kw = splitByKeywords(t);
  return kw ?? [t];
}

function looksLikeTable(lines: string[]): boolean {
  if (lines.length < 2) return false;
  if (lines.some(l => l.trim().startsWith('|'))) return false;
  const cols = lines.map(l => splitColumns(l).length);
  return cols[0] >= 2 && cols.every(c => c === cols[0]);
}

function buildHtmlTable(lines: string[]): string {
  const rows = lines.map(l => splitColumns(l));
  const [header, ...body] = rows;
  const ths = header.map(h => `<th>${h}</th>`).join('');
  const trs = body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n');
  return `<table class="smart-table">\n<thead><tr>${ths}</tr></thead>\n<tbody>${trs}</tbody>\n</table>`;
}

function recoverTables(text: string): string {
  return text
    .split(/\n\n+/)
    .map(para => {
      const lines = para.split('\n').filter(l => l.trim());
      return looksLikeTable(lines) ? buildHtmlTable(lines) : para;
    })
    .join('\n\n');
}

function detectHasTable(content: string): boolean {
  return /\|.*\|/.test(content) || /<table/i.test(content);
}

// ══════════════════════════════════════════════════════════
// BOLD NORMALIZER
// Gemini's clipboard copies bold as "** text **" (spaces inside).
// This is invalid Markdown — react-markdown won't parse it.
// Solution: normalize ALL ** ** patterns then convert to <strong> HTML
// so bold ALWAYS renders regardless of whitespace or parser quirks.
// ══════════════════════════════════════════════════════════
function normalizeBold(text: string): string {
  return text.replace(/\*\*\s*([^*\n]+?)\s*\*\*/g, (_match, inner) => {
    const trimmed = inner.trim();
    return trimmed ? `<strong>${trimmed}</strong>` : '';
  });
}

// ══════════════════════════════════════════════════════════
// SYSTEM 4: UNIVERSAL DIALOGUE PARSER
// Supports Gemini, ChatGPT, Claude, and generic AI formats
// ══════════════════════════════════════════════════════════

// --- User-side markers ---
const USER_MARKERS: RegExp[] = [
  /^あなたのプロンプト$/,
  /^You$/,
  /^あなた$/,
  /^User$/i,
  /^自分$/,
  /^Human$/i,
  /^Me$/i,
];

// --- Assistant-side markers ---
const ASSISTANT_MARKERS: RegExp[] = [
  // Gemini variants
  /^Gemini$/,
  /^Gemini の回答$/,
  /^Gemini の返答$/,
  /^Gemini\s+の/,
  /^ジェミニ/,
  /^Gemini\s+\d+(\.\d+)?/,
  // ChatGPT variants
  /^ChatGPT$/i,
  /^GPT-?[3-9]/i,
  /^o[13]-?mini/i,      // OpenAI o1/o3
  /^OpenAI$/i,
  // Claude variants
  /^Claude$/i,
  /^Claude\s+[0-9]/i,
  /^Anthropic$/i,
  // Generic
  /^Assistant$/i,
  /^AI$/i,
];

// --- Detect which LLM service is being pasted ---
function detectLLM(raw: string): LLMName {
  if (/\bClaude\b/i.test(raw)) return 'Claude';
  if (/\bChatGPT\b|\bGPT-?[3-9]\b|\bopenai\b/i.test(raw)) return 'ChatGPT';
  if (/\bGemini\b/i.test(raw)) return 'Gemini';
  return 'AI';
}

// --- Extract LLM label from a specific marker line ---
function labelFromLine(line: string): string {
  const t = line.trim();
  if (/Claude/i.test(t)) return 'Claude';
  if (/ChatGPT|GPT-?[3-9]|OpenAI|o[13]-?mini/i.test(t)) return 'ChatGPT';
  if (/Gemini/i.test(t)) return 'Gemini';
  return 'AI';
}

const isAssistantLine = (l: string) => ASSISTANT_MARKERS.some(r => r.test(l.trim()));
const isUserLine = (l: string) => USER_MARKERS.some(r => r.test(l.trim()));

function extractSummary(content: string, max = 24): string {
  const first = content.split('\n').find(l => l.trim().length > 0) ?? '';
  const clean = first.trim().replace(/^[#*>\-–—]+\s*/, '');
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean || '（質問）';
}

function parseChatLog(raw: string): { turns: Turn[]; llm: LLMName } {
  const llm = detectLLM(raw);
  const cleaned = removeJunk(raw);
  type Seg = { role: Role; llmLabel: string; lines: string[] };  // string to allow 'USER'
  const segs: Seg[] = [];
  let role: Role = 'user';
  let currentLabel: string = llm;
  let buf: string[] = [];

  for (const line of cleaned.split('\n')) {
    if (isAssistantLine(line)) {
      if (buf.join('').trim()) segs.push({ role, llmLabel: currentLabel, lines: [...buf] });
      buf = []; role = 'assistant';
      currentLabel = labelFromLine(line);
    } else if (isUserLine(line)) {
      if (buf.join('').trim()) segs.push({ role, llmLabel: 'USER', lines: [...buf] });
      buf = []; role = 'user'; currentLabel = 'USER';
    } else {
      buf.push(line);
    }
  }
  if (buf.join('').trim()) segs.push({ role, llmLabel: currentLabel, lines: [...buf] });

  if (segs.length === 0)
    return { turns: [{ role: 'user', llmLabel: 'USER', content: cleaned, rawContent: cleaned, index: 0, summary: extractSummary(cleaned), hasTable: false, keyPoints: [] }], llm };

  const turns: Turn[] = [];
  let qIdx = 0;
  for (const seg of segs) {
    const rawContent = seg.lines.join('\n').trim();
    if (!rawContent) continue;
    const isAssistant = seg.role === 'assistant';
    const content = isAssistant
      ? normalizeBold(recoverTables(removeTrailingInvitations(rawContent)))
      : rawContent;
    turns.push({
      role: seg.role,
      llmLabel: seg.llmLabel,
      content,
      rawContent,
      index: turns.length,
      summary: seg.role === 'user' ? `Q${++qIdx}. ${extractSummary(rawContent)}` : '',
      hasTable: isAssistant ? detectHasTable(content) : false,
      keyPoints: isAssistant ? extractKeyPoints(rawContent) : [],
    });
  }
  return { turns, llm };
}

// ══════════════════════════════════════════════════════════
// SAMPLE DATA
// ══════════════════════════════════════════════════════════
const SAMPLE = `アンチエイジングに最も効果的な栄養素と、その摂取方法を年齢別に教えてください。
あなたのプロンプト
アンチエイジングに最も効果的な栄養素と、その摂取方法を年齢別に教えてください。
Gemini の回答
アンチエイジングを支える主要栄養素を年齢別にまとめます。

年代別	推奨サプリ	主な効能	目安量/日
20代	ビタミンC	肌のコラーゲン生成	200mg
30代	コエンザイムQ10	細胞エネルギー産生	100mg
40代	レスベラトロール	抗酸化・細胞保護	150mg
50代+	NMN	NAD+補充・細胞再生	300mg

年齢が上がるほど「細胞レベルの修復」を意識した栄養補給が重要です。20代はUV対策と抗酸化、40代以降はNAD+系が鍵を握ります。

1. ビタミンCは最も手軽で効果の高い出発点
2. 30〜40代はCoQ10による代謝サポートが不可欠
3. 50代以降はNMNなどNAD+前駆体への投資が最優先

あなたのプロンプト
睡眠の質がアンチエイジングに与える影響と、具体的な改善方法を教えてください。
Gemini の回答
## 睡眠とアンチエイジングの深い関係

| 睡眠フェーズ | 主な修復活動 | 不足時の影響 |
|-------------|-------------|-------------|
| 入眠後30分 | 成長ホルモン分泌ピーク | 皮膚再生の低下 |
| 深睡眠（N3） | 細胞・DNA修復 | 老化加速、免疫低下 |
| REM睡眠 | 記憶定着・脳の老廃物除去 | 認知機能低下リスク |

### 改善の3ステップ

1. **就寝2時間前**：スマートフォン・液晶画面を遮断
2. **室温18〜20℃**：体温低下を促進し入眠を早める
3. **マグネシウム補給**：就寝30分前に300mg摂取

**睡眠の質**こそが最も費用対効果の高いアンチエイジング投資です。7〜9時間の質の高い睡眠は、いかなるサプリメントよりも強力な老化防止効果を持ちます。`;

// ══════════════════════════════════════════════════════════
// COMPONENTS
// ══════════════════════════════════════════════════════════

/** Mixed MD + HTML table renderer — uses rehype-raw so <strong> tags pass through */
function ContentRenderer({ content }: { content: string }) {
  const TABLE_RE = /(<table[\s\S]*?<\/table>)/;
  return (
    <ErrorBoundary>
      <>
        {content.split(TABLE_RE).map((part, i) =>
          part.startsWith('<table') ? (
            <div key={i} className="smart-table-wrap" dangerouslySetInnerHTML={{ __html: part }} />
          ) : part.trim() ? (
            <ErrorBoundary key={i}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{part}</ReactMarkdown>
            </ErrorBoundary>
          ) : null
        )}
      </>
    </ErrorBoundary>
  );
}

/** Intelligent TOC with [表あり] badges */
function TableOfContents({ turns }: { turns: Turn[] }) {
  const pairs = turns.reduce<{ user: Turn; assistant: Turn | null }[]>((acc, t, i) => {
    if (t.role === 'user') acc.push({ user: t, assistant: turns[i + 1]?.role === 'assistant' ? turns[i + 1] : null });
    return acc;
  }, []);
  if (pairs.length === 0) return null;

  return (
    <div className="toc-block">
      <div className="toc-header"><List size={13} /><span>小見出し・インデックス</span></div>
      <ol className="toc-list">
        {pairs.map(({ user, assistant }) => (
          <li key={user.index}>
            <a href={`#turn-${user.index}`} className="toc-link">
              <span className="toc-q">{user.summary}</span>
              {assistant?.hasTable && <span className="toc-badge"><Table size={9} />表あり</span>}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Single collapsible dialogue card */
function TurnBlock({ turn }: { turn: Turn }) {
  const isUser = turn.role === 'user';
  const [collapsed, setCollapsed] = useState(false);
  const lines = turn.rawContent.split('\n');
  const firstLine = lines.find(l => l.trim())?.trim() ?? '';
  const bodyText = turn.rawContent.slice(turn.rawContent.indexOf(firstLine) + firstLine.length).trim();

  return (
    <div id={`turn-${turn.index}`} className={`turn-block ${isUser ? 'turn-user' : 'turn-gemini'}`}>
      {/* Role label + collapse toggle */}
      <div className={`turn-label ${isUser ? 'label-user' : 'label-gemini'}`}>
        {isUser
          ? <><User size={11} /><span>USER</span></>
          : <><Bot size={11} /><span>{turn.llmLabel}</span></>}
        {!isUser && (
          <button
            className="collapse-btn no-print"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? '展開' : '折りたたむ'}
          >
            {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
        )}
      </div>

      {/* Card body */}
      {!collapsed ? (
        <div className="turn-content">
          {isUser ? (
            <>
              <p className="user-question">{firstLine}</p>
              {bodyText && <p className="user-body">{bodyText}</p>}
            </>
          ) : (
            <>
              {turn.keyPoints.length > 0 && (
                <div className="keypoints-box">
                  <div className="keypoints-header">📌 Key Points</div>
                  <ul className="keypoints-list">
                    {turn.keyPoints.map((pt, i) => <li key={i}>{pt}</li>)}
                  </ul>
                </div>
              )}
              <div className="markdown-body">
                <ContentRenderer content={turn.content} />
              </div>
            </>
          )}
        </div>
      ) : (
        /* Collapsed placeholder — click to re-expand */
        <div className="collapsed-hint no-print" onClick={() => setCollapsed(false)}>
          クリックして展開…
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════
// UTILITY: NotebookLM Markdown Builder
// Creates clean ### User: / ### Gemini: labelled Markdown
// with GFM pipe tables and no junk/invitation text.
// ══════════════════════════════════════════════════════════
function buildNotebookLMMarkdown(turns: Turn[]): string {
  return turns.map((t: Turn) => {
    const label = t.role === 'user' ? '### User:' : `### ${t.llmLabel}:`;
    // For Gemini, use the processed content (tables already reconstructed)
    // but strip any remaining HTML tags that came from smart-table HTML
    const body = t.content
      .replace(/<table[\s\S]*?<\/table>/gi, (match) => {
        // Convert our HTML table back to GFM pipe table
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
      .replace(/<[^>]+>/g, '');  // strip any remaining HTML
    return `${label}\n\n${body.trim()}`;
  }).join('\n\n---\n\n');
}

// ══════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════
export default function App() {
  const [rawInput, setRawInput] = useState(SAMPLE);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showIndex, setShowIndex] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);

  const { turns, llm } = useMemo(
    () => rawInput.trim() ? parseChatLog(rawInput) : { turns: [], llm: 'AI' as LLMName },
    [rawInput]
  );
  const userCount = turns.filter((t: Turn) => t.role === 'user').length;
  const tableCount = turns.filter((t: Turn) => t.hasTable).length;

  // Auto-named PDF: [LLM]_[YYYYMMDD]_[first question].pdf
  const pdfFilename = useMemo(() => {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const firstQ = turns.find((t: Turn) => t.role === 'user');
    const qSlug = firstQ
      ? firstQ.rawContent.split('\n').find((l: string) => l.trim())?.trim().slice(0, 28).replace(/[\\/:*?"<>|]/g, '') ?? 'archive'
      : 'archive';
    return `${llm}_${date}_${qSlug}.pdf`;
  }, [turns, llm]);

  const handleExportPdf = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      await html2pdf().set({
        margin: [15, 15, 15, 15],  // 15mm all sides
        filename: pdfFilename,
        image: { type: 'jpeg', quality: 0.99 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#fff', logging: false, windowWidth: 794 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(previewRef.current).save();
    } finally {
      setExporting(false);
    }
  };

  const handleCopyNotebookLM = async () => {
    if (turns.length === 0) return;
    const md = buildNotebookLMMarkdown(turns);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <FileText size={18} />
          <div>
            <strong>Gemini 対話アーカイブ</strong>
            <span className="header-sub">Intelligent Archive &amp; PDF Exporter</span>
          </div>
        </div>
        <div className="header-stats">
          <span className="stat"><User size={11} />{userCount}問</span>
          <span className="stat"><Table size={11} />{tableCount}表</span>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowIndex(v => !v)} className={`btn btn-ghost ${showIndex ? 'btn-active' : ''}`}>
            <List size={13} />目次
          </button>
          <button
            onClick={handleCopyNotebookLM}
            disabled={turns.length === 0}
            className={`btn ${copied ? 'btn-copied' : 'btn-nb'}`}
            title="NotebookLM向けにクレンジングしたMarkdownをコピー"
          >
            {copied ? <Check size={13} /> : <Clipboard size={13} />}
            {copied ? 'コピー済み！' : 'NotebookLM用'}
          </button>
          <button onClick={() => setRawInput('')} disabled={!rawInput} className="btn btn-ghost">
            <Trash2 size={13} />クリア
          </button>
          <button onClick={handleExportPdf} disabled={exporting || turns.length === 0} className="btn btn-primary">
            <Download size={14} />
            {exporting ? '生成中…' : 'PDF出力'}
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="panel panel-left">
          <div className="panel-header">
            <span className="panel-title">Geminiチャットを貼り付け</span>
            <span className="panel-hint">{rawInput.split('\n').length}行 / {rawInput.length}文字</span>
          </div>
          <textarea
            className="raw-input"
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            placeholder="GeminiのチャットページでCtrl+A → Ctrl+C → ここにCtrl+V"
            spellCheck={false}
          />
        </section>

        <section className="panel panel-right">
          <div className="panel-header">
            <span className="panel-title">プレビュー（PDF出力内容）</span>
            <span className="panel-hint">{turns.length}ブロック検出</span>
          </div>
          <div className="preview-scroll">
            <div className="preview-page" ref={previewRef}>
              {turns.length === 0
                ? <p className="empty-hint">左にGeminiチャットを貼り付けてください。</p>
                : <>
                  {showIndex && <TableOfContents turns={turns} />}
                  {turns.map(t => <TurnBlock key={t.index} turn={t} />)}
                </>
              }
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
