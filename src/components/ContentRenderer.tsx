import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Copy, Check, Sparkles } from 'lucide-react';
import { ErrorBoundary, _onRenderError } from './ErrorBoundary';
import { Mermaid } from './Mermaid';
import { CitationBadge } from './CitationBadge';

// ══════════════════════════════════════════════════════════
// CONTENT RENDERER
// Mixed MD + HTML table renderer + Mermaid support.
// Upgraded Phase 4: Task-Based Hybrid Routing Badges.
// ══════════════════════════════════════════════════════════

/**
 * Copy Button Component for Code Blocks
 */
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className={`copy-btn no-print ${copied ? 'copied' : ''}`}
            title="Copy Code"
        >
            {copied ? <Check size={12} strokeWidth={3} /> : <Copy size={12} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
    );
}

/**
 * Sanitizes markdown content to prevent unexpected layout blowup.
 */
function sanitizeContent(md: string): string {
    let sanitized = md;
    // Remove AI-restored markers from markdown flow
    sanitized = sanitized.replace('<!-- ai-restored -->', '');
    sanitized = sanitized.replace(/<(h[1-6])(?:\s[^>]*)?>/gi, '&lt;$1&gt;');
    sanitized = sanitized.replace(/<\/(h[1-6])>/gi, '&lt;/$1&gt;');
    return sanitized;
}

export function ContentRenderer({ content }: { content: string }) {
    const TABLE_RE = /(<table[\s\S]*?<\/table>)/;
    const isAiRestored = content.includes('<!-- ai-restored -->');
    const handleError = () => _onRenderError.current?.();

    return (
        <ErrorBoundary onError={handleError}>
            <div className="content-render-pass">
                {content.split(TABLE_RE).map((part, i) =>
                    part.startsWith('<table') ? (
                        <div key={i} className="relative group">
                            {isAiRestored && (
                                <div className="ai-restored-badge no-print">
                                    <Sparkles size={10} className="text-amber-400" />
                                    <span>Restored by AI</span>
                                </div>
                            )}
                            <div className="smart-table-wrap" dangerouslySetInnerHTML={{ __html: part }} />
                        </div>
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
                                    code({ node, inline, className, children, ...props }: any) {
                                        const match = /language-(\w+)/.exec(className || '');
                                        const isMermaid = match && match[1] === 'mermaid';

                                        if (isMermaid) {
                                            return <Mermaid chart={String(children).replace(/\n$/, '')} />;
                                        }

                                        // Block Code Rendering
                                        if (!inline) {
                                            return (
                                                <div className="code-block-container group relative my-4">
                                                    <CopyButton text={String(children).replace(/\n$/, '')} />
                                                    <pre className="code-pre">
                                                        <code className={className} {...props}>
                                                            {children}
                                                        </code>
                                                    </pre>
                                                </div>
                                            );
                                        }

                                        // Inline Code Rendering
                                        return (
                                            <code className="inline-code" {...props}>
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
            </div>
        </ErrorBoundary>
    );
}
