import { FileText, Globe, Calendar } from 'lucide-react';

// ══════════════════════════════════════════════════════════
// PDF PRINT HEADER
// Only visible in PDF export. Provides executive branding.
// ══════════════════════════════════════════════════════════

export function PdfPrintHeader({ llm }: { llm: string }) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    return (
        <div className="pdf-only-header">
            <div className="pdf-header-top">
                <div className="pdf-brand">
                    <FileText size={24} className="text-indigo-600" />
                    <div className="pdf-brand-text">
                        <div className="pdf-brand-main">CHATSOURCE</div>
                        <div className="pdf-brand-sub">AI Chat Export</div>
                    </div>
                </div>
                <div className="pdf-meta">
                    <div className="pdf-meta-item">
                        <Globe size={10} />
                        <span>Source: {llm}</span>
                    </div>
                    <div className="pdf-meta-item">
                        <Calendar size={10} />
                        <span>Exported: {dateStr}</span>
                    </div>
                </div>
            </div>
            <div className="pdf-header-line"></div>
        </div>
    );
}
