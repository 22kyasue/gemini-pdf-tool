import { useState, useRef, useEffect } from 'react';
import { User, Bot, ChevronDown, ChevronUp, Merge, Eraser, X, Plus, ShieldAlert, AlertTriangle, Loader2 } from 'lucide-react';
import type { AnalyzedMessage } from '../algorithm';
import { ContentRenderer } from './ContentRenderer';
import { recoverTableWithGemini, extractKeyPointsWithGemini, removeNoiseWithGemini } from '../utils/llmParser';

// ══════════════════════════════════════════════════════════
// ANALYZED BLOCK (new algorithm view)
// Shows confidence badges, intent/topic tags, merge action.
// Includes Hybrid Processing: Table Recovery, Key Points, Noise Removal.
// ══════════════════════════════════════════════════════════

export function AnalyzedBlock({
    msg,
    onRoleToggle,
    onMergeWithPrev,
    onUpdateText,
    onUpdateTopics,
    isFirst,
    forceExpand = false,
}: {
    msg: AnalyzedMessage;
    onRoleToggle: (id: number) => void;
    onMergeWithPrev: (id: number) => void;
    onUpdateText: (id: number, newText: string) => void;
    onUpdateTopics: (id: number, topics: string[]) => void;
    isFirst: boolean;
    forceExpand?: boolean;
}) {
    const isUser = msg.role === 'user';
    const [collapsed, setCollapsed] = useState(false);
    const [isErasing, setIsErasing] = useState(false);
    const [isEditingTopics, setIsEditingTopics] = useState(false);
    const [newTopic, setNewTopic] = useState('');
    const topicInputRef = useRef<HTMLInputElement>(null);

    // -- Hybrid State (ML/LLM processing) --
    const [isRecovering, setIsRecovering] = useState(false);
    const [recoveredText, setRecoveredText] = useState<string | null>(null);

    const [isExtractingPoints, setIsExtractingPoints] = useState(false);
    const [keyPoints, setKeyPoints] = useState<string[] | null>(null);

    const [isCleaning, setIsCleaning] = useState(false);
    const [cleanedText, setCleanedText] = useState<string | null>(null);

    const confPercent = Math.round(msg.confidence * 100);
    const confColor = msg.confidence >= 0.8 ? '#22c55e' : msg.confidence >= 0.5 ? '#f59e0b' : '#ef4444';
    const hasConflict = msg.artifact.includes('CONFLICT');

    // 1. Table Recovery
    useEffect(() => {
        const text = msg.text;
        const hasMarkdownTable = /\|.*\|/.test(text);
        const looksLikeTable = !hasMarkdownTable && msg.role === 'ai' && (
            text.split('\n').filter(l => l.trim().split(/\s{2,}|\t/).length >= 2).length >= 2
        );

        if (looksLikeTable && !recoveredText && !isRecovering) {
            const runRecovery = async () => {
                setIsRecovering(true);
                const result = await recoverTableWithGemini(text);
                if (result) setRecoveredText(result);
                setIsRecovering(false);
            };
            runRecovery();
        }
    }, [msg.text, msg.role, recoveredText, isRecovering]);

    // 2. Key Points Extraction
    useEffect(() => {
        if (msg.role === 'ai' && !keyPoints && !isExtractingPoints && msg.text.length > 50) {
            const runExtraction = async () => {
                setIsExtractingPoints(true);
                const result = await extractKeyPointsWithGemini(msg.text);
                if (result) {
                    const points = result.split('\n')
                        .map(l => l.replace(/^[-*]\s*/, '').trim())
                        .filter(l => l.length > 0)
                        .slice(0, 3);
                    setKeyPoints(points);
                }
                setIsExtractingPoints(false);
            };
            runExtraction();
        }
    }, [msg.text, msg.role, keyPoints, isExtractingPoints]);

    // 3. Noise Removal (Cleansing)
    useEffect(() => {
        if (msg.role === 'ai' && !cleanedText && !isCleaning && msg.text.length > 30) {
            const runCleansing = async () => {
                setIsCleaning(true);
                const result = await removeNoiseWithGemini(msg.text);
                if (result) setCleanedText(result);
                setIsCleaning(false);
            };
            runCleansing();
        }
    }, [msg.text, msg.role, cleanedText, isCleaning]);

    const handleEraseLine = (lineIndex: number) => {
        const lines = msg.text.split('\n');
        lines.splice(lineIndex, 1);
        onUpdateText(msg.id, lines.join('\n'));
    };

    const handleAddTopic = () => {
        if (!newTopic.trim()) {
            setIsEditingTopics(false);
            return;
        }
        const updated = [...msg.topic, newTopic.trim()];
        onUpdateTopics(msg.id, Array.from(new Set(updated)));
        setNewTopic('');
        setIsEditingTopics(false);
    };

    const removeTopic = (t: string) => {
        onUpdateTopics(msg.id, msg.topic.filter(x => x !== t));
    };

    useEffect(() => {
        if (isEditingTopics) topicInputRef.current?.focus();
    }, [isEditingTopics]);

    return (
        <div
            id={`block-${msg.id}`}
            className={`turn-block ${isUser ? 'turn-user' : 'turn-gemini'} ${isErasing ? 'erasing-mode' : ''} ${hasConflict ? 'has-conflict' : ''}`}
            style={msg.confidence < 0.5 ? { borderLeft: `3px solid ${confColor}` } : undefined}
        >
            {/* Role label + tags + actions */}
            <div className={`turn-label ${isUser ? 'label-user' : 'label-gemini'}`}>
                <button
                    className="role-toggle no-print"
                    onClick={() => onRoleToggle(msg.id)}
                    title="ロール切替"
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

                <span className="tag-group">
                    {msg.intent.map(t => (
                        <span key={t} className={`tag tag-intent tag-${t.toLowerCase()}`}>{t}</span>
                    ))}
                    {msg.artifact.map(t => (
                        <span key={t} className={`tag tag-artifact tag-${t.toLowerCase()}`}>{t}</span>
                    ))}
                </span>

                <span className="tag-group no-print">
                    {msg.topic.map(t => (
                        <span key={t} className="tag tag-topic topic-editable">
                            {t}
                            <button className="topic-remove-btn" onClick={() => removeTopic(t)} tabIndex={-1}>
                                <X size={8} />
                            </button>
                        </span>
                    ))}
                    {isEditingTopics ? (
                        <input
                            ref={topicInputRef}
                            type="text"
                            className="topic-input"
                            value={newTopic}
                            onChange={(e) => setNewTopic(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                            onBlur={handleAddTopic}
                        />
                    ) : (
                        <button className="topic-add-btn" onClick={() => setIsEditingTopics(true)}>
                            <Plus size={10} />
                        </button>
                    )}
                </span>

                <span className="block-actions no-print">
                    <button
                        className={`block-action-btn ${isErasing ? 'active-erase' : ''}`}
                        onClick={() => setIsErasing(!isErasing)}
                        title="消しゴム"
                    >
                        <Eraser size={12} strokeWidth={2} />
                    </button>
                    {!isFirst && (
                        <button
                            className="block-action-btn"
                            onClick={() => onMergeWithPrev(msg.id)}
                            title="結合"
                        >
                            <Merge size={12} strokeWidth={2} />
                        </button>
                    )}
                </span>

                <button
                    className="collapse-btn no-print"
                    onClick={() => setCollapsed(v => !v)}
                >
                    {collapsed ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronUp size={14} strokeWidth={2} />}
                </button>
            </div>

            {/* Body */}
            {(!collapsed || forceExpand) ? (
                <div className="turn-content">
                    {hasConflict && (
                        <div className="divergence-alert">
                            <ShieldAlert size={16} className="text-rose-500" />
                            <p className="text-[11px] font-bold text-rose-700">DIVERGENCE DETECTED</p>
                            <AlertTriangle size={14} className="text-rose-300 ml-auto" />
                        </div>
                    )}

                    {!isUser && (isExtractingPoints || keyPoints) && (
                        <div className="keypoints-box">
                            <div className="keypoints-header">📌 Key Points (AI Summary)</div>
                            {isExtractingPoints ? (
                                <div className="points-skeleton">
                                    <div className="skeleton-line" style={{ width: '80%', marginBottom: '8px' }}></div>
                                    <div className="skeleton-line" style={{ width: '90%', marginBottom: '8px' }}></div>
                                    <div className="skeleton-line" style={{ width: '70%' }}></div>
                                </div>
                            ) : (
                                <ul className="keypoints-list">
                                    {keyPoints?.map((pt, i) => <li key={i}>{pt}</li>)}
                                </ul>
                            )}
                        </div>
                    )}

                    {isRecovering || isCleaning ? (
                        <div className="table-skeleton">
                            <div className="skeleton-overlay">
                                <Loader2 className="animate-spin text-primary-500" size={24} />
                                <span>{isCleaning ? "Cleansing Noise..." : "Recovering Layout..."}</span>
                            </div>
                            <div className="skeleton-line" style={{ width: '100%' }}></div>
                            <div className="skeleton-line" style={{ width: '90%' }}></div>
                            <div className="skeleton-line" style={{ width: '95%' }}></div>
                        </div>
                    ) : isErasing ? (
                        <div className="eraser-preview">
                            {msg.text.split('\n').map((line, idx) => (
                                <div key={idx} className="erase-line" onClick={() => handleEraseLine(idx)}>
                                    <X size={10} className="erase-icon" />
                                    <span>{line || '\u00A0'}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className={isUser ? "user-question" : "markdown-body"}>
                            <ContentRenderer content={cleanedText || recoveredText || msg.text} />
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
