import { useState, useCallback, useEffect, useRef } from 'react';
import { X, Zap, CheckCircle, Loader, ArrowLeft } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { supabase } from '../lib/supabase';
import { FREE_CALL_LIMIT, FREE_WORD_LIMIT } from '../hooks/useUsage';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string);

interface UpgradeModalProps {
  onClose: () => void;
  onCheckoutComplete: () => void;
  callsUsed: number;
  wordsUsed: number;
  daysUntilReset: number;
  hitLimit?: boolean;
  priceId?: string;
  t: {
    upgradeTitle: string;
    upgradeTitleLimit: string;
    apiCalls: string;
    wordsProcessed: string;
    resetsIn: string;
    days: string;
    proIncludes2: string;
    unlimitedCalls: string;
    unlimitedWords: string;
    priorityProcessing: string;
    allProFeatures: string;
    redirectingCheckout: string;
    upgradeToPro: string;
    priceDiscount: string;
    priceOriginal: string;
    stripeNote: string;
    paymentSuccess: string;
    paymentActivating: string;
    paymentThankYou: string;
    upgradeByokHint: string;
    enterInSettings: string;
    forUnlimitedUse: string;
  };
}

export function UpgradeModal({ onClose, onCheckoutComplete, callsUsed, wordsUsed, daysUntilReset, hitLimit, priceId: priceIdOverride, t }: UpgradeModalProps) {
  const [view, setView] = useState<'info' | 'checkout' | 'activating'>('info');
  const [error, setError] = useState<string | null>(null);
  const prefetchedSecret = useRef<Promise<string> | null>(null);

  // Pre-fetch the client secret as soon as the modal opens
  useEffect(() => {
    prefetchedSecret.current = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const priceId = priceIdOverride || import.meta.env.VITE_STRIPE_PRICE_ID as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ priceId, embedded: true }),
      });

      const data = await res.json() as { clientSecret?: string; error?: string };
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || 'Failed to start checkout');
      }
      return data.clientSecret;
    })();
  }, []);

  const fetchClientSecret = useCallback(() => {
    return prefetchedSecret.current!;
  }, []);

  const callsPct = Math.min((callsUsed / FREE_CALL_LIMIT) * 100, 100);
  const wordsPct = Math.min((wordsUsed / FREE_WORD_LIMIT) * 100, 100);

  return (
    <div className="modal-overlay no-print" onClick={view === 'info' ? onClose : view === 'checkout' ? onClose : undefined} role="dialog" aria-modal="true" aria-label="Upgrade to Pro">
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: view === 'checkout' ? 540 : 440, transition: 'max-width 0.2s' }}
      >
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {view === 'checkout' && (
              <button
                onClick={() => setView('info')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}
                aria-label="Back"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <Zap size={18} style={{ color: view === 'activating' ? '#10b981' : '#f59e0b' }} />
            {view === 'activating' ? t.paymentSuccess : hitLimit ? t.upgradeTitleLimit : t.upgradeTitle}
          </h3>
          {view !== 'activating' && (
            <button className="btn-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          )}
        </div>
        <div className="settings-body">

          {view === 'activating' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px', gap: 16, textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '1.5rem',
              }}>
                &#10003;
              </div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t.paymentSuccess}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                {t.paymentActivating}
              </div>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem', margin: 0 }}>
                {t.paymentThankYou}
              </p>
            </div>
          ) : view === 'checkout' ? (
            <div style={{ minHeight: 320 }}>
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ fetchClientSecret, onComplete: () => { setView('activating'); onCheckoutComplete(); } }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          ) : (
            <>
              {/* Usage bars */}
              <div style={{ background: 'var(--bg-surface-secondary)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                    <span>{t.apiCalls}</span>
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
                    <span>{t.wordsProcessed}</span>
                    <span style={{ fontWeight: 700, color: wordsUsed >= FREE_WORD_LIMIT ? '#dc2626' : 'var(--text-secondary)' }}>
                      {(wordsUsed / 1000).toFixed(1)}k / {FREE_WORD_LIMIT / 1000}k
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border-primary)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${wordsPct}%`, background: wordsPct >= 100 ? '#dc2626' : 'var(--color-primary-500)', borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 6 }}>
                  {t.resetsIn} {daysUntilReset} {t.days}
                </div>
              </div>

              {/* Feature list */}
              <p style={{ fontWeight: 600, marginBottom: 10, fontSize: '0.9rem' }}>{t.proIncludes2}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[t.unlimitedCalls, t.unlimitedWords, t.priorityProcessing, t.allProFeatures].map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                    <CheckCircle size={16} style={{ color: '#10b981', flexShrink: 0 }} /> {f}
                  </li>
                ))}
              </ul>

              {error && <p style={{ color: '#dc2626', fontSize: '0.75rem', marginBottom: 12 }}>{error}</p>}

              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', gap: 8, padding: '12px', fontSize: '1rem' }}
                onClick={() => { setError(null); setView('checkout'); }}
              >
                <Zap size={16} />
                <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.85rem' }}>{t.priceOriginal}</span>
                {t.upgradeToPro}
                <span style={{
                  background: '#dc2626', color: '#fff', fontSize: '0.65rem', fontWeight: 700,
                  padding: '2px 6px', borderRadius: 4, marginLeft: 2,
                }}>
                  {t.priceDiscount}
                </span>
              </button>
              <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 8 }}>
                {t.stripeNote}
              </p>

              <hr style={{ borderColor: 'var(--border-primary)', margin: '16px 0 12px' }} />
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {t.upgradeByokHint}{' '}
                <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '0 4px', color: 'var(--color-primary-500)' }} onClick={onClose}>
                  {t.enterInSettings}
                </button>{' '}
                {t.forUnlimitedUse}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
