import { useState } from 'react';
import { Search, ExternalLink, ShieldCheck, ShieldAlert, Clock } from 'lucide-react';

// ══════════════════════════════════════════════════════════
// CITATION BADGE & VERIFICATION CARD
// Phase 5: Intelligent Research Integration.
// ══════════════════════════════════════════════════════════

interface CitationMetadata {
    sourceTitle: string;
    url: string;
    date: string;
    reliability: 'high' | 'medium' | 'low';
    snippet: string;
}

// Mock verification data
const MOCK_SOURCES: Record<string, CitationMetadata> = {
    "1": {
        sourceTitle: "Gemini 1.5 Technical Report",
        url: "https://blog.google/technology/ai/google-gemini-next-generation-model-february-2024/",
        date: "2024-02-15",
        reliability: "high",
        snippet: "Gemini 1.5 Pro comes with a standard 128,000 token context window... can scale up to 1 million tokens."
    },
    "2": {
        sourceTitle: "OpenAI GPT-4o Announcement",
        url: "https://openai.com/index/hello-gpt-4o/",
        date: "2024-05-13",
        reliability: "high",
        snippet: "GPT-4o ('o' for 'omni') is a step towards much more natural human-computer interaction."
    }
};

export function CitationBadge({ num }: { num: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const meta = MOCK_SOURCES[num];

    return (
        <span className="cit-container no-print-break">
            <sup
                className={`cit-badge ${isOpen ? 'active' : ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
            >
                {num}
            </sup>

            {isOpen && (
                <div className="cit-card no-print" onClick={(e) => e.stopPropagation()}>
                    <div className="cit-card-header">
                        <div className="flex items-center gap-2">
                            <Search size={12} className="text-indigo-500" />
                            <span className="text-[10px] font-bold tracking-widest text-slate-400">SOURCE VERIFICATION</span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="cit-close-btn">
                            <ShieldCheck size={14} />
                        </button>
                    </div>

                    {meta ? (
                        <div className="cit-card-body">
                            <h4 className="cit-source-title">{meta.sourceTitle}</h4>
                            <p className="cit-snippet">"{meta.snippet}"</p>
                            <div className="cit-meta-footer">
                                <span className="cit-date">
                                    <Clock size={10} /> {meta.date}
                                </span>
                                <span className={`cit-reliability rel-${meta.reliability}`}>
                                    {meta.reliability === 'high' ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}
                                    {meta.reliability.toUpperCase()}
                                </span>
                            </div>
                            <a href={meta.url} target="_blank" rel="noopener noreferrer" className="cit-link">
                                <ExternalLink size={10} /> View Original Source
                            </a>
                        </div>
                    ) : (
                        <div className="cit-card-body p-4 text-center">
                            <p className="text-xs text-slate-500">Source metadata not indexed. Performing deep search...</p>
                            <div className="cit-loader"></div>
                        </div>
                    )}
                </div>
            )}
        </span>
    );
}
