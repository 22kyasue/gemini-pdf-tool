import { Search } from 'lucide-react';
import type { LLMType } from '../algorithm/llmDetector';

// ══════════════════════════════════════════════════════════
// LLM SELECTOR COMPONENT
// Displays detected LLM with confidence and chip buttons.
// ══════════════════════════════════════════════════════════

const LLM_OPTIONS: { value: LLMType; label: string; icon: string }[] = [
    { value: 'ChatGPT', label: 'ChatGPT', icon: '🤖' },
    { value: 'Claude', label: 'Claude', icon: '🟠' },
    { value: 'Gemini', label: 'Gemini', icon: '✨' },
    { value: 'Unknown', label: 'Other', icon: '❓' },
];

export function LLMSelector({
    detected,
    selected,
    confidence,
    onSelect,
}: {
    detected: LLMType;
    selected: LLMType;
    confidence: number;
    onSelect: (llm: LLMType) => void;
}) {
    const confPercent = Math.round(confidence * 100);
    const confColor = confidence >= 0.7 ? '#22c55e' : confidence >= 0.4 ? '#f59e0b' : '#ef4444';

    return (
        <div className="llm-selector">
            <div className="llm-detect-info">
                <Search size={12} strokeWidth={2} />
                <span>Detected: <strong>{detected === 'Unknown' ? '不明' : detected}</strong></span>
                <span className="llm-confidence" style={{ color: confColor }}>
                    ({confPercent}%)
                </span>
            </div>
            <div className="llm-chips">
                {LLM_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        className={`llm-chip ${selected === opt.value ? 'llm-chip-active' : ''}`}
                        onClick={() => onSelect(opt.value)}
                    >
                        <span className="llm-chip-icon">{opt.icon}</span>
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
