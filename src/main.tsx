import { StrictMode, Component } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/** Top-level error boundary — prevents white screen on unhandled exceptions */
class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Unhandled error:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: '2rem', fontFamily: 'Inter, system-ui, sans-serif',
          background: '#f8fafc', color: '#1e293b',
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#64748b', marginBottom: '1rem', maxWidth: '400px', textAlign: 'center' }}>
            An unexpected error occurred. Your drafts are saved in localStorage.
          </p>
          <pre style={{
            padding: '1rem', background: '#1e293b', color: '#f87171', borderRadius: '8px',
            fontSize: '0.75rem', maxWidth: '600px', overflow: 'auto', marginBottom: '1rem',
          }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); }}
            style={{
              padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none',
              borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)

// Register service worker for PWA offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/gemini-pdf-tool/sw.js').catch(() => {});
  });
}
