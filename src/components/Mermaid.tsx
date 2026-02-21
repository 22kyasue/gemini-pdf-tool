import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
    startOnLoad: true,
    theme: 'base',
    themeVariables: {
        primaryColor: '#6366f1',
        primaryTextColor: '#fff',
        primaryBorderColor: '#4f46e5',
        lineColor: '#94a3b8',
        secondaryColor: '#f1f5f9',
        tertiaryColor: '#fff',
    }
});

export function Mermaid({ chart }: { chart: string }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ref.current) {
            mermaid.contentLoaded();
            // Re-render specifically for this component
            mermaid.init(undefined, ref.current);
        }
    }, [chart]);

    return (
        <div className="mermaid-container no-print-bg">
            <div ref={ref} className="mermaid">
                {chart}
            </div>
        </div>
    );
}
