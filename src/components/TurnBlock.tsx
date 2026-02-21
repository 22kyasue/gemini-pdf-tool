import { useState } from 'react';
import { User, Bot, ChevronDown, ChevronUp } from 'lucide-react';
import type { Turn } from '../types';
import { ContentRenderer } from './ContentRenderer';

// ══════════════════════════════════════════════════════════
// TURN BLOCK
// Single collapsible dialogue card.
// forceExpand overrides collapsed state during PDF export.
// ══════════════════════════════════════════════════════════

export function TurnBlock({ turn, forceExpand = false }: { turn: Turn; forceExpand?: boolean }) {
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
                    ? <><User size={12} strokeWidth={2.5} /><span>USER</span></>
                    : <><Bot size={12} strokeWidth={2.5} /><span>{turn.llmLabel}</span></>}
                {!isUser && (
                    <button
                        className="collapse-btn no-print"
                        onClick={() => setCollapsed(v => !v)}
                        title={collapsed ? '展開' : '折りたたむ'}
                    >
                        {collapsed ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronUp size={12} strokeWidth={2} />}
                    </button>
                )}
            </div>

            {/* Card body — forceExpand overrides collapsed state during PDF export */}
            {(!collapsed || forceExpand) ? (
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
                <div className="collapsed-hint no-print" onClick={() => setCollapsed(false)}>
                    クリックして展開…
                </div>
            )}
        </div>
    );
}
