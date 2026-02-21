import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { ErrorBoundary, _onRenderError } from './ErrorBoundary';

// ══════════════════════════════════════════════════════════
// CONTENT RENDERER
// Mixed MD + HTML table renderer.
// Uses rehype-raw so <strong> and smart-table HTML pass through.
// ══════════════════════════════════════════════════════════

export function ContentRenderer({ content }: { content: string }) {
    const TABLE_RE = /(<table[\s\S]*?<\/table>)/;
    const handleError = () => _onRenderError.current?.();
    return (
        <ErrorBoundary onError={handleError}>
            <>
                {content.split(TABLE_RE).map((part, i) =>
                    part.startsWith('<table') ? (
                        <div key={i} className="smart-table-wrap" dangerouslySetInnerHTML={{ __html: part }} />
                    ) : part.trim() ? (
                        <ErrorBoundary key={i} onError={handleError}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{part}</ReactMarkdown>
                        </ErrorBoundary>
                    ) : null
                )}
            </>
        </ErrorBoundary>
    );
}
