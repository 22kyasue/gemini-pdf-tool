import { useState } from 'react';
import { X, Zap, CheckCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FREE_CALL_LIMIT, FREE_WORD_LIMIT } from '../hooks/useUsage';

interface UpgradeModalProps {
  onClose: () => void;
  callsUsed: number;
  wordsUsed: number;
}

export function UpgradeModal({ onClose, callsUsed, wordsUsed }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const priceId = import.meta.env.VITE_STRIPE_PRICE_ID as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || 'Failed to start checkout');

      window.location.href = data.url;
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const callsPct = Math.min((callsUsed / FREE_CALL_LIMIT) * 100, 100);
  const wordsPct = Math.min((wordsUsed / FREE_WORD_LIMIT) * 100, 100);

  return (
    <div className="modal-overlay no-print" onClick={onClose} role="dialog" aria-modal="true" aria-label="Upgrade to Pro">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={18} style={{ color: '#f59e0b' }} /> You've reached the free limit
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="settings-body">

          {/* Usage bars */}
          <div style={{ background: 'var(--bg-surface-secondary)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                <span>API calls</span>
                <span style={{ fontWeight: 700, color: callsUsed >= FREE_CALL_LIMIT ? '#dc2626' : 'var(--text-secondary)' }}>
                  {callsUsed} / {FREE_CALL_LIMIT}
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--border-primary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${callsPct}%`, background: callsPct >= 100 ? '#dc2626' : 'var(--color-primary-500)', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                <span>Words processed</span>
                <span style={{ fontWeight: 700, color: wordsUsed >= FREE_WORD_LIMIT ? '#dc2626' : 'var(--text-secondary)' }}>
                  {(wordsUsed / 1000).toFixed(1)}k / {FREE_WORD_LIMIT / 1000}k
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--border-primary)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${wordsPct}%`, background: wordsPct >= 100 ? '#dc2626' : 'var(--color-primary-500)', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
          </div>

          {/* Feature list */}
          <p style={{ fontWeight: 600, marginBottom: 10, fontSize: '0.9rem' }}>Pro plan includes:</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Unlimited API calls',
              'Unlimited word processing',
              'Priority Gemini processing',
              'All future Pro features',
            ].map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                <CheckCircle size={16} style={{ color: '#10b981', flexShrink: 0 }} /> {f}
              </li>
            ))}
          </ul>

          {error && <p style={{ color: '#dc2626', fontSize: '0.75rem', marginBottom: 12 }}>{error}</p>}

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', gap: 8, padding: '12px', fontSize: '1rem' }}
            onClick={handleUpgrade}
            disabled={loading}
          >
            {loading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={16} />}
            {loading ? 'Redirecting to checkout...' : 'Upgrade to Pro — $7/month'}
          </button>
          <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 8 }}>
            Secure payment via Stripe · Cancel anytime
          </p>

          <hr style={{ borderColor: 'var(--border-primary)', margin: '16px 0 12px' }} />
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            Have your own Gemini API key?{' '}
            <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '0 4px', color: 'var(--color-primary-500)' }} onClick={onClose}>
              Enter it in Settings
            </button>{' '}
            for unlimited use.
          </p>
        </div>
      </div>
    </div>
  );
}
