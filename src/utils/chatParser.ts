import type { Turn, LLMName, Role } from '../types';
import { removeJunk } from './junkRemoval';
import { removeTrailingInvitations } from './junkRemoval';
import { normalizeBold, recoverTables, detectHasTable } from './tableRecovery';
import { extractKeyPoints } from './keyPoints';

// ══════════════════════════════════════════════════════════
// SYSTEM 4: UNIVERSAL DIALOGUE PARSER
// Supports Gemini, ChatGPT, Claude, and generic AI formats
// ══════════════════════════════════════════════════════════

const USER_MARKERS: RegExp[] = [
    /^あなたのプロンプト$/,
    /^You$/,
    /^あなた$/,
    /^User$/i,
    /^自分$/,
    /^Human$/i,
    /^Me$/i,
    /^You said:?$/i,
];

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
    /^ChatGPT said:?$/i,
    /^GPT-?[3-9]/i,
    /^o[13]-?mini/i,
    /^OpenAI$/i,
    // Claude variants
    /^Claude$/i,
    /^Claude said:?$/i,
    /^Claude\s+[0-9]/i,
    /^Anthropic$/i,
    // Gemini said format
    /^Gemini said:?$/i,
    // Generic
    /^Assistant$/i,
    /^AI$/i,
    /^AI said:?$/i,
];

export function detectLLM(raw: string): LLMName {
    if (/\bClaude\b/i.test(raw)) return 'Claude';
    if (/\bChatGPT\b|\bGPT-?[3-9]\b|\bopenai\b/i.test(raw)) return 'ChatGPT';
    if (/\bGemini\b/i.test(raw)) return 'Gemini';
    return 'AI';
}

function labelFromLine(line: string): string {
    const t = line.trim().replace(/:$/, '');
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

export function parseChatLog(raw: string): { turns: Turn[]; llm: LLMName } {
    const llm = detectLLM(raw);
    const cleaned = removeJunk(raw);

    type Seg = { role: Role; llmLabel: string; lines: string[] };
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
        return {
            turns: [{ role: 'user', llmLabel: 'USER', content: cleaned, rawContent: cleaned, index: 0, summary: extractSummary(cleaned), hasTable: false, keyPoints: [] }],
            llm,
        };

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
