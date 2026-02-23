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

    return (
        <div id={`turn-${turn.index}`} className={`turn-block ${isUser ? 'turn-user' : 'turn-gemini'}`}>
            {/* Role label + collapse toggle */}
            <div className={`turn-label ${isUser ? 'label-user' : 'label-gemini'}`}>
                {isUser
                    ? <span className="role-pill role-pill-user"><User size={11} strokeWidth={2.5} />USER</span>
                    : <span className="role-pill role-pill-ai"><Bot size={11} strokeWidth={2.5} />{turn.llmLabel}</span>}
                {!isUser && (
                    <button
                        className="collapse-btn no-print"
                        onClick={() => setCollapsed(v => !v)}
                        title={collapsed ? 'Expand' : 'Collapse'}
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? 'Expand response' : 'Collapse response'}
                    >
                        {collapsed ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronUp size={12} strokeWidth={2} />}
                    </button>
                )}
            </div>

            {/* Card body — forceExpand overrides collapsed state during PDF export */}
            {(!collapsed || forceExpand) ? (
                <div className="turn-content">
                    {!isUser && turn.keyPoints.length > 0 && (
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
                </div>
            ) : (
                <div className="collapsed-hint no-print" onClick={() => setCollapsed(false)}>
                    Click to expand...
                </div>
            )}
        </div>
    );
}
