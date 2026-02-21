import { useState } from 'react';
import { Zap, Edit3, Check, X } from 'lucide-react';
import type { SemanticGroup } from '../algorithm/types';

// ══════════════════════════════════════════════════════════
// CHAPTER DIVIDER
// Renders a professional boundary between semantic groups.
// ══════════════════════════════════════════════════════════

export function ChapterDivider({
    group,
    onUpdateSummary
}: {
    group: SemanticGroup;
    onUpdateSummary: (id: number, summary: string) => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [tempSummary, setTempSummary] = useState(group.customSummary || '');
    const topics = Object.keys(group.summaryStats.topics).slice(0, 3);

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

            {(group.customSummary || isEditing) && (
                <div className="chapter-notes">
                    <div className="notes-header">
                        <span className="notes-label">SECTION NOTES</span>
                        {isEditing && (
                            <div className="notes-actions">
                                <button onClick={handleSave} className="note-btn note-save"><Check size={10} /></button>
                                <button onClick={() => setIsEditing(false)} className="note-btn note-cancel"><X size={10} /></button>
                            </div>
                        )}
                    </div>
                    {isEditing ? (
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
