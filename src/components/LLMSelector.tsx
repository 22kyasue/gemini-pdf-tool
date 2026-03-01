import { Search, Sparkles, MessageSquare, Brain, Bot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';

// ══════════════════════════════════════════════════════════
// LLM SELECTOR — Read-only display of detected LLM
// ══════════════════════════════════════════════════════════

export type SimpleLLM = 'Gemini' | 'ChatGPT' | 'Claude' | 'Other LLM';

const LLM_CHIPS: { value: SimpleLLM; label: string; Icon: LucideIcon }[] = [
    { value: 'Gemini', label: 'Gemini', Icon: Sparkles },
    { value: 'ChatGPT', label: 'ChatGPT', Icon: MessageSquare },
    { value: 'Claude', label: 'Claude', Icon: Brain },
    { value: 'Other LLM', label: 'Other LLM', Icon: Bot },
];

export function LLMSelector({ detected }: { detected: SimpleLLM }) {
    const { t } = useTranslation();
    return (
        <div className="llm-selector">
            <div className="llm-detect-info">
                <Search size={12} strokeWidth={2} />
                <span>{t.detected} <strong>{detected}</strong></span>
            </div>
            <div className="llm-chips">
                {LLM_CHIPS.map(chip => (
                    <div
                        key={chip.label}
                        className={`llm-chip ${detected === chip.value ? 'llm-chip-active' : ''}`}
                    >
                        <span className="llm-chip-icon"><chip.Icon size={12} strokeWidth={2.5} /></span>
                        {chip.label}
                    </div>
                ))}
            </div>
        </div>
    );
}
