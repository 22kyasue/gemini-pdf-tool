import { useState } from 'react';
import { X, LogIn, Mail, Lock } from 'lucide-react';

interface AuthModalProps {
  onClose: () => void;
  onSignInWithGoogle: () => Promise<void>;
  onSignInWithEmail: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
}

export function AuthModal({ onClose, onSignInWithGoogle, onSignInWithEmail, onSignUp }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        await onSignInWithEmail(email, password);
        onClose();
      } else {
        await onSignUp(email, password);
        setSuccess('Check your email to confirm your account!');
      }
    } catch (err) {
      setError((err as Error).message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await onSignInWithGoogle();
      // Google OAuth redirects the page, so no need to close
    } catch (err) {
      setError((err as Error).message || 'Google sign-in failed');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay no-print" onClick={onClose} role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3>{mode === 'signin' ? 'Sign In' : 'Create Account'}</h3>
          <button className="btn-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="settings-body">
          {success ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✉</div>
              <p style={{ fontWeight: 600, color: '#16a34a' }}>{success}</p>
              <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={onClose}>Close</button>
            </div>
          ) : (
            <>
              <button
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: 16, justifyContent: 'center', gap: 8 }}
                onClick={handleGoogle}
                disabled={loading}
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>

              <div style={{ position: 'relative', textAlign: 'center', margin: '8px 0 16px' }}>
                <hr style={{ borderColor: 'var(--border-primary)', margin: 0 }} />
                <span style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  background: 'var(--bg-surface)', padding: '0 10px',
                  fontSize: '0.75rem', color: 'var(--text-tertiary)',
                }}>or</span>
              </div>

              <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.45, pointerEvents: 'none' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    style={{ width: '100%', paddingLeft: 32, boxSizing: 'border-box' }}
                    aria-label="Email"
                  />
                </div>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.45, pointerEvents: 'none' }} />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password (min 6 chars)"
                    required
                    minLength={6}
                    style={{ width: '100%', paddingLeft: 32, boxSizing: 'border-box' }}
                    aria-label="Password"
                  />
                </div>
                {error && <p style={{ color: '#dc2626', fontSize: '0.75rem', margin: 0 }}>{error}</p>}
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center', gap: 6 }}>
                  <LogIn size={14} />
                  {loading ? 'Please wait...' : (mode === 'signin' ? 'Sign In' : 'Create Account')}
                </button>
              </form>

              <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 14 }}>
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.75rem', padding: '0 4px', color: 'var(--color-primary-500)' }}
                  onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
                >
                  {mode === 'signin' ? 'Sign up free' : 'Sign in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
