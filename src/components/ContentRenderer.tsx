import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { ErrorBoundary, _onRenderError } from './ErrorBoundary';
import { Mermaid } from './Mermaid';
import { CitationBadge } from './CitationBadge';

// ══════════════════════════════════════════════════════════
// CONTENT RENDERER
// Mixed MD + HTML table renderer + Mermaid support.
// Uses rehype-raw so <strong> and smart-table HTML pass through.
// ══════════════════════════════════════════════════════════

/**
 * Sanitizes markdown content to prevent unexpected layout blowup.
 */
function sanitizeContent(md: string): string {
    let sanitized = md;

    // Headings are now handled safely by CSS word-break and max-width.
    // Bracketing them (e.g. [##]) looked unprofessional to users.

    // 1. Escape raw HTML heading tags (<h1> through <h6>).
    // Fixes #003: "<h1>" -> "&lt;h1&gt;"
    sanitized = sanitized.replace(/<(h[1-6])(?:\s[^>]*)?>/gi, '&lt;$1&gt;');
    sanitized = sanitized.replace(/<\/(h[1-6])>/gi, '&lt;/$1&gt;');

    return sanitized;
}

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
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw]}
                                components={{
                                    sup({ node, className, children, ...props }) {
                                        if (className === 'cit-badge') {
                                            return <CitationBadge num={String(children)} />;
                                        }
                                        return <sup className={className} {...props}>{children}</sup>;
                                    },
                                    code({ node, className, children, ...props }) {
                                        const match = /language-(\w+)/.exec(className || '');
                                        const isMermaid = match && match[1] === 'mermaid';
                                        if (isMermaid) {
                                            return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                                        }
                                        return (
                                            <code className={className} {...props}>
                                                {children}
                                            </code>
                                        );
                                    }
                                }}
                            >
                                {sanitizeContent(part)}
                            </ReactMarkdown>
                        </ErrorBoundary>
                    ) : null
                )}
            </>
        </ErrorBoundary>
    );
}
