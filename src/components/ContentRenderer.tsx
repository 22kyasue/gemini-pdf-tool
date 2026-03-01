import { useState, useMemo, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import DOMPurify from 'dompurify';
import { Copy, Check, Sparkles } from 'lucide-react';
import { ErrorBoundary, _onRenderError } from './ErrorBoundary';
import { Mermaid } from './Mermaid';
import { CitationBadge } from './CitationBadge';
import hljs from 'highlight.js/lib/core';

// Register common languages (keeps bundle small)
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import shell from 'highlight.js/lib/languages/shell';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import diff from 'highlight.js/lib/languages/diff';
import plaintext from 'highlight.js/lib/languages/plaintext';

hljs.registerLanguage('python', python);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c', c);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('php', php);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('plaintext', plaintext);

// Friendly display names
const LANG_LABELS: Record<string, string> = {
    python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
    java: 'Java', cpp: 'C++', c: 'C', csharp: 'C#',
    go: 'Go', rust: 'Rust', ruby: 'Ruby', php: 'PHP',
    swift: 'Swift', kotlin: 'Kotlin', sql: 'SQL',
    bash: 'Bash', shell: 'Shell', json: 'JSON',
    xml: 'XML', html: 'HTML', css: 'CSS', yaml: 'YAML',
    markdown: 'Markdown', diff: 'Diff', plaintext: 'Plain Text',
};

// ══════════════════════════════════════════════════════════
// CONTENT RENDERER
// Mixed MD + HTML table renderer + Mermaid + Syntax Highlight
// ══════════════════════════════════════════════════════════

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

/** Highlight code and detect language */
function useHighlight(code: string, lang?: string) {
    return useMemo(() => {
        const trimmed = code.replace(/\n$/, '');
        if (lang && lang !== 'plaintext' && hljs.getLanguage(lang)) {
            try {
                const result = hljs.highlight(trimmed, { language: lang });
                return { html: result.value, language: lang };
            } catch { /* fall through to auto */ }
        }
        // Auto-detect
        try {
            const result = hljs.highlightAuto(trimmed);
            const detected = result.language || 'plaintext';
            // Only trust auto-detection if relevance is high enough
            if (result.relevance < 5) return { html: trimmed, language: 'plaintext' };
            return { html: result.value, language: detected };
        } catch {
            return { html: trimmed, language: 'plaintext' };
        }
    }, [code, lang]);
}

/**
 * Repair broken markdown tables:
 * - Add missing separator row (|---|---|) after header
 * - Fix rows with mismatched column counts by padding
 */
function repairMarkdownTables(md: string): string {
    // Split by double newlines to process paragraph by paragraph
    return md.split(/\n\n+/).map(para => {
        const lines = para.split('\n');
        // Check if this paragraph looks like a pipe table (at least 2 lines with |)
        const pipeLines = lines.filter(l => l.trim().includes('|') && l.trim().split('|').length >= 3);
        if (pipeLines.length < 2) return para;

        // Find the header line (first line with pipes)
        const firstPipeIdx = lines.findIndex(l => l.trim().includes('|') && l.trim().split('|').length >= 3);
        if (firstPipeIdx === -1) return para;

        const headerLine = lines[firstPipeIdx].trim();
        // Count columns from header
        const rawCells = headerLine.split('|');
        if (rawCells[0].trim() === '') rawCells.shift();
        if (rawCells[rawCells.length - 1]?.trim() === '') rawCells.pop();
        const colCount = rawCells.length;
        if (colCount < 2) return para;

        // Check if next line is already a separator
        const nextIdx = firstPipeIdx + 1;
        const nextLine = lines[nextIdx]?.trim() || '';
        const isSeparator = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(nextLine);

        if (!isSeparator) {
            // Insert separator row
            const sep = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
            lines.splice(nextIdx, 0, sep);
        }

        // Ensure header and all rows have leading/trailing pipes
        for (let i = firstPipeIdx; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line.includes('|')) continue;
            if (!line.startsWith('|')) line = '| ' + line;
            if (!line.endsWith('|')) line = line + ' |';
            lines[i] = line;
        }

        return lines.join('\n');
    }).join('\n\n');
}

function sanitizeContent(md: string): string {
    let sanitized = md;
    sanitized = sanitized.replace('<!-- ai-restored -->', '');
    sanitized = sanitized.replace(/<(h[1-6])(?:\s[^>]*)?>/gi, '&lt;$1&gt;');
    sanitized = sanitized.replace(/<\/(h[1-6])>/gi, '&lt;/$1&gt;');
    sanitized = repairMarkdownTables(sanitized);
    return sanitized;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
    const { html, language } = useHighlight(code, lang);
    const label = LANG_LABELS[language] || language?.toUpperCase() || 'Code';

    return (
        <div className="code-block-container group relative my-4">
            <div className="code-block-header">
                <span className="code-lang-label">{label}</span>
                <CopyButton text={code.replace(/\n$/, '')} />
            </div>
            <pre className="code-pre">
                <code
                    className={`hljs language-${language}`}
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            </pre>
        </div>
    );
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
                            <div className="smart-table-wrap" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(part, { ALLOWED_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'strong', 'em', 'br', 'span', 'code'], ALLOWED_ATTR: ['class', 'colspan', 'rowspan'] }) }} />
                        </div>
                    ) : part.trim() ? (
                        <ErrorBoundary key={i} onError={handleError}>
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeRaw, rehypeKatex]}
                                components={{
                                    sup({ node: _node, className, children, ...props }) {
                                        if (className === 'cit-badge') {
                                            return <CitationBadge num={String(children)} />;
                                        }
                                        return <sup className={className} {...props}>{children}</sup>;
                                    },
                                    code({ node: _node, className, children, ...props }: ComponentPropsWithoutRef<'code'> & { node?: unknown }) {
                                        const match = /language-(\w+)/.exec(className || '');
                                        const lang = match?.[1];
                                        const codeStr = String(children).replace(/\n$/, '');

                                        if (lang === 'mermaid') {
                                            return <Mermaid chart={codeStr} />;
                                        }

                                        // Block code: has language tag OR contains newlines (fenced blocks without lang)
                                        if (lang || String(children).includes('\n')) {
                                            return <CodeBlock code={codeStr} lang={lang} />;
                                        }

                                        // Inline code
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
