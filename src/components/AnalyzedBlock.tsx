import { useState } from 'react';
import { User, Bot, ChevronDown, ChevronUp, Merge } from 'lucide-react';
import type { AnalyzedMessage } from '../algorithm';
import { ContentRenderer } from './ContentRenderer';

// ══════════════════════════════════════════════════════════
// ANALYZED BLOCK (new algorithm view)
// Shows confidence badges, intent/topic tags, merge action.
// ══════════════════════════════════════════════════════════

export function AnalyzedBlock({
    msg,
    onRoleToggle,
    onMergeWithPrev,
    isFirst,
}: {
    msg: AnalyzedMessage;
    onRoleToggle: (id: number) => void;
    onMergeWithPrev: (id: number) => void;
    isFirst: boolean;
}) {
    const isUser = msg.role === 'user';
    const [collapsed, setCollapsed] = useState(false);
    const confPercent = Math.round(msg.confidence * 100);
    const confColor = msg.confidence >= 0.8 ? '#22c55e' : msg.confidence >= 0.5 ? '#f59e0b' : '#ef4444';

    return (
        <div
            id={`block-${msg.id}`}
            className={`turn-block ${isUser ? 'turn-user' : 'turn-gemini'}`}
            style={msg.confidence < 0.5 ? { borderLeft: `3px solid ${confColor}` } : undefined}
        >
            {/* Role label + tags + actions */}
            <div className={`turn-label ${isUser ? 'label-user' : 'label-gemini'}`}>
                <button
                    className="role-toggle no-print"
                    onClick={() => onRoleToggle(msg.id)}
                    title="クリックでロールを切替 (User ↔ AI)"
                >
                    {isUser
                        ? <><User size={12} strokeWidth={2.5} /><span>USER</span></>
                        : <><Bot size={12} strokeWidth={2.5} /><span>AI</span></>}
                </button>

                {msg.confidence < 0.8 && (
                    <span className="conf-badge" style={{ color: confColor, borderColor: confColor }}>
                        {confPercent}%
                    </span>
                )}

                {msg.intent.length > 0 && (
                    <span className="tag-group">
                        {msg.intent.map(t => (
                            <span key={t} className={`tag tag-intent tag-${t.toLowerCase()}`}>{t}</span>
                        ))}
                    </span>
                )}

                {msg.topic.length > 0 && (
                    <span className="tag-group">
                        {msg.topic.slice(0, 2).map(t => (
                            <span key={t} className="tag tag-topic">{t}</span>
                        ))}
                    </span>
                )}

                <span className="block-actions no-print">
                    {!isFirst && (
                        <button
                            className="block-action-btn"
                            onClick={() => onMergeWithPrev(msg.id)}
                            title="前のブロックと結合"
                        >
                            <Merge size={10} strokeWidth={2} />
                        </button>
                    )}
                </span>

                <button
                    className="collapse-btn no-print"
                    onClick={() => setCollapsed(v => !v)}
                    title={collapsed ? '展開' : '折りたたむ'}
                >
                    {collapsed ? <ChevronDown size={12} strokeWidth={2} /> : <ChevronUp size={12} strokeWidth={2} />}
                </button>
            </div>

            {/* Body */}
            {!collapsed ? (
                <div className="turn-content">
                    {isUser ? (
                        <p className="user-question">{msg.text}</p>
                    ) : (
                        <div className="markdown-body">
                            <ContentRenderer content={msg.text} />
                        </div>
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
