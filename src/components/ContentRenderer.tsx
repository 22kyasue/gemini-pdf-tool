import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { ErrorBoundary, _onRenderError } from './ErrorBoundary';

// ══════════════════════════════════════════════════════════
// CONTENT RENDERER
// Mixed MD + HTML table renderer.
// Uses rehype-raw so <strong> and smart-table HTML pass through.
// ══════════════════════════════════════════════════════════

/**
 * Sanitizes markdown content to prevent unexpected layout blowup.
 */
function sanitizeContent(md: string): string {
    let sanitized = md;

    // 1. Bracket all markdown headings (e.g., "# " -> "[#] ", "## " -> "[##] ").
    // Fixes #004: Prevents "blowup" by making them literal text instead of structural headers.
    // Also covers the previous #002 fix for headings inside list items.
    sanitized = sanitized.replace(/^([ \t]*)(#{1,6})( )/gm, '$1[$2]$3');

    // 2. Escape raw HTML heading tags (<h1> through <h6>).
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
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                {sanitizeContent(part)}
                            </ReactMarkdown>
                        </ErrorBoundary>
                    ) : null
                )}
            </>
        </ErrorBoundary>
    );
}
