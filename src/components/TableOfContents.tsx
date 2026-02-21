import { List, Table } from 'lucide-react';
import type { Turn } from '../types';

// ══════════════════════════════════════════════════════════
// TABLE OF CONTENTS
// Intelligent TOC with [表あり] badges.
// ══════════════════════════════════════════════════════════

export function TableOfContents({ turns }: { turns: Turn[] }) {
    const pairs = turns.reduce<{ user: Turn; assistant: Turn | null }[]>((acc, t, i) => {
        if (t.role === 'user') acc.push({ user: t, assistant: turns[i + 1]?.role === 'assistant' ? turns[i + 1] : null });
        return acc;
    }, []);
    if (pairs.length === 0) return null;

    return (
        <div className="toc-block">
            <div className="toc-header"><List size={14} strokeWidth={2} /><span>目次・インデックス</span></div>
            <ol className="toc-list">
                {pairs.map(({ user, assistant }) => (
                    <li key={user.index}>
                        <a href={`#turn-${user.index}`} className="toc-link">
                            <span className="toc-q">{user.summary}</span>
                            {assistant?.hasTable && <span className="toc-badge"><Table size={10} strokeWidth={2} />表あり</span>}
                        </a>
                    </li>
                ))}
            </ol>
        </div>
    );
}
