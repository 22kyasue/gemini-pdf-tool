import { useEffect, useRef, useState } from 'react';

let mermaidInstance: typeof import('mermaid').default | null = null;
let mermaidLoading: Promise<void> | null = null;

const LIGHT_VARS = {
    primaryColor: '#6366f1',
    primaryTextColor: '#fff',
    primaryBorderColor: '#4f46e5',
    lineColor: '#94a3b8',
    secondaryColor: '#f1f5f9',
    tertiaryColor: '#fff',
};

const DARK_VARS = {
    primaryColor: '#818cf8',
    primaryTextColor: '#f8fafc',
    primaryBorderColor: '#6366f1',
    lineColor: '#64748b',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f172a',
};

function getTheme(): 'light' | 'dark' {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function initMermaid(theme: 'light' | 'dark') {
    if (!mermaidInstance) return;
    mermaidInstance.initialize({
        startOnLoad: false,
        theme: theme === 'dark' ? 'dark' : 'base',
        themeVariables: theme === 'dark' ? DARK_VARS : LIGHT_VARS,
    });
}

function loadMermaid(): Promise<void> {
    if (mermaidInstance) return Promise.resolve();
    if (mermaidLoading) return mermaidLoading;
    mermaidLoading = import('mermaid').then(mod => {
        mermaidInstance = mod.default;
        initMermaid(getTheme());
    });
    return mermaidLoading;
}

export function Mermaid({ chart }: { chart: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(!!mermaidInstance);
    const [error, setError] = useState(false);
    const [theme, setTheme] = useState(getTheme());
    const renderIdRef = useRef(0);

    useEffect(() => {
        if (!mermaidInstance) {
            loadMermaid().then(() => setReady(true)).catch(() => setError(true));
        }
    }, []);

    // Watch for theme changes via MutationObserver on data-theme attribute
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setTheme(getTheme());
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!ready || !ref.current || !mermaidInstance) return;
        // Re-init mermaid with current theme, then render
        initMermaid(theme);
        const id = `mermaid-${++renderIdRef.current}-${Date.now()}`;
        ref.current.removeAttribute('data-processed');
        ref.current.innerHTML = chart;
        ref.current.id = id;
        mermaidInstance.run({ nodes: [ref.current] }).catch(() => {
            setError(true);
        });
    }, [chart, ready, theme]);

    if (error) {
        return <pre className="mermaid-error">{chart}</pre>;
    }

    return (
        <div className="mermaid-container no-print-bg">
            {!ready && <div className="mermaid-loading">Loading diagram...</div>}
            <div ref={ref} className="mermaid" style={{ display: ready ? 'block' : 'none' }}>
                {chart}
            </div>
        </div>
    );
}
