import { Component } from 'react';
import type { ReactNode } from 'react';

// ══════════════════════════════════════════════════════════
// ERROR BOUNDARY
// Catches rendering errors so malformed content never crashes the preview.
// onError prop is called when an error is caught — use for toast notifications.
// ══════════════════════════════════════════════════════════

/**
 * Module-level ref so top-level components (ContentRenderer)
 * can call App's toast without prop-drilling.
 */
export const _onRenderError: { current: (() => void) | null } = { current: null };

export class ErrorBoundary extends Component<
    { children: ReactNode; onError?: () => void },
    { error: boolean }
> {
    state = { error: false };
    static getDerivedStateFromError() { return { error: true }; }
    componentDidCatch() { this.props.onError?.(); }
    render() {
        if (this.state.error)
            return <div className="render-error-hint">⚠ このブロックの表示に失敗しました</div>;
        return this.props.children;
    }
}
