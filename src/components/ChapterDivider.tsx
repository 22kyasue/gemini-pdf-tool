import { useState, useEffect } from 'react';
import { Zap, Edit3, Check, X, Loader2 } from 'lucide-react';
import type { SemanticGroup } from '../algorithm/types';
import { generateSectionSummaryWithGemini } from '../utils/llmParser';

// ══════════════════════════════════════════════════════════
// CHAPTER DIVIDER
// Renders a professional boundary between semantic groups.
// Includes Executive Section Summaries (LLM-powered).
// ══════════════════════════════════════════════════════════

export function ChapterDivider({
    group,
    onUpdateSummary,
    sectionText,
    aiResult,
    onSetResult,
    hasApiKey: _hasApiKey,
    aiEnabled,
}: {
    group: SemanticGroup;
    onUpdateSummary: (id: number, summary: string) => void;
    sectionText: string;
    aiResult?: { summary?: string | null; tried?: Record<string, boolean> };
    onSetResult: (key: string, val: any) => void;
    hasApiKey: boolean;
    aiEnabled: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [tempSummary, setTempSummary] = useState(group.customSummary || '');
    const topics = Object.keys(group.summaryStats.topics).slice(0, 3);

    const hasAttempted = aiResult?.tried?.summary;

    useEffect(() => {
        if (!aiEnabled) return;
        // Auto-generate summary if not present and section has content
        if (!group.customSummary && !isGenerating && sectionText.length > 100 && !hasAttempted) {
            const runGeneration = async () => {
                setIsGenerating(true);
                onSetResult('summary', null); // mark as attempted
                try {
                    const result = await generateSectionSummaryWithGemini(sectionText);
                    if (result) {
                        onUpdateSummary(group.id, result);
                        setTempSummary(result);
                        onSetResult('summary', result);
                    }
                } catch (e) {
                    console.error("Section Summary Trace Failure:", e);
                } finally {
                    setIsGenerating(false);
                }
            };
            runGeneration();
        }
    }, [group.id, group.customSummary, isGenerating, sectionText, onUpdateSummary, hasAttempted, onSetResult, aiEnabled]);

    const handleSave = () => {
        onUpdateSummary(group.id, tempSummary);
        setIsEditing(false);
    };

    return (
        <div className="chapter-divider-container no-print-break">
            <div className="chapter-divider">
                <div className="chapter-line"></div>
                <div className="chapter-badge">
                    <Zap size={10} strokeWidth={3} className="text-amber-500" />
                    <span>SECTION {group.id + 1}: {topics.join(' / ') || 'DISCUSSION'}</span>
                    <button className="chapter-edit-btn no-print" onClick={() => setIsEditing(!isEditing)}>
                        <Edit3 size={10} />
                    </button>
                </div>
                <div className="chapter-line"></div>
            </div>

            {(group.customSummary || isEditing || isGenerating) && (
                <div className="chapter-notes">
                    <div className="notes-header">
                        <span className="notes-label">EXECUTIVE SUMMARY</span>
                        {isEditing && (
                            <div className="notes-actions">
                                <button onClick={handleSave} className="note-btn note-save"><Check size={10} /></button>
                                <button onClick={() => setIsEditing(false)} className="note-btn note-cancel"><X size={10} /></button>
                            </div>
                        )}
                    </div>
                    {isGenerating ? (
                        <div className="summary-skeleton">
                            <Loader2 size={12} className="animate-spin text-amber-600" />
                            <div className="skeleton-line" style={{ width: '90%', height: '10px' }}></div>
                        </div>
                    ) : isEditing ? (
                        <textarea
                            className="notes-input"
                            value={tempSummary}
                            onChange={(e) => setTempSummary(e.target.value)}
                            placeholder="このセクションのサマリーやメモを入力..."
                            rows={2}
                        />
                    ) : (
                        <div className="notes-content">{group.customSummary}</div>
                    )}
                </div>
            )}
        </div>
    );
}
