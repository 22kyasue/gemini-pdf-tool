import { List, Table, Zap, Search } from 'lucide-react';
import type { Turn } from '../types';
import type { AnalyzedMessage, SemanticGroup } from '../algorithm/types';

// ══════════════════════════════════════════════════════════
// TABLE OF CONTENTS
// Intelligent TOC with [Table] badges.
// Supports Narrative Flow (LLM) and detailed indexing.
// ══════════════════════════════════════════════════════════

export function TableOfContents({
    turns,
    analysis,
    isPdfMode = false,
    narrative
}: {
    turns?: Turn[];
    analysis?: { messages: AnalyzedMessage[]; semanticGroups: SemanticGroup[] };
    isPdfMode?: boolean;
    narrative?: string;
}) {
    const containerClass = `toc-block ${isPdfMode ? 'pdf-only-toc' : 'no-print'}`;
    // ── New Algorithm Mode ──
    if (analysis && analysis.semanticGroups.length > 0) {
        return (
            <div className={containerClass}>
                <div className="toc-header">
                    <Zap size={14} strokeWidth={2.5} className="text-indigo-500" />
                    <span>AI Semantic Index</span>
                </div>

                {narrative && (
                    <div className="narrative-toc">
                        <div className="narrative-header">
                            <Search size={12} className="text-indigo-400" />
                            <span>RESEARCH FLOW</span>
                        </div>
                        <p className="narrative-text">{narrative}</p>
                    </div>
                )}
                <div className="toc-groups">
                    {analysis.semanticGroups.map(group => {
                        const firstMsg = analysis.messages[group.span[0]];
                        const topics = Object.keys(group.summaryStats.topics).slice(0, 3);
                        const hasTable = group.summaryStats.artifacts['TABLE'] > 0;

                        return (
                            <a key={group.id} href={`#block-${firstMsg.id}`} className="toc-link group-link">
                                <div className="toc-q">
                                    <div className="toc-topic-row">
                                        {topics.map(t => <span key={t} className="mini-tag">{t}</span>)}
                                    </div>
                                    <div className="toc-text">
                                        {firstMsg.text.split('\n').find(l => l.trim())?.trim().slice(0, 60)}…
                                    </div>
                                </div>
                                {hasTable && <span className="toc-badge"><Table size={10} strokeWidth={2} />Table</span>}
                            </a>
                        );
                    })}
                </div>
            </div>
        );
    }

    // ── Legacy Mode ──
    if (!turns || turns.length === 0) return null;
    const pairs = turns.reduce<{ user: Turn; assistant: Turn | null }[]>((acc, t, i) => {
        if (t.role === 'user') acc.push({ user: t, assistant: turns[i + 1]?.role === 'assistant' ? turns[i + 1] : null });
        return acc;
    }, []);

    return (
        <div className={containerClass}>
            <div className="toc-header"><List size={14} strokeWidth={2} /><span>Table of Contents</span></div>
            <ol className="toc-list">
                {pairs.map(({ user, assistant }) => (
                    <li key={user.index}>
                        <a href={`#turn-${user.index}`} className="toc-link">
                            <span className="toc-q">{user.summary}</span>
                            {assistant?.hasTable && <span className="toc-badge"><Table size={10} strokeWidth={2} />Table</span>}
                        </a>
                    </li>
                ))}
            </ol>
        </div>
    );
}
