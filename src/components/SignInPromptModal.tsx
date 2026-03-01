import { X, LogIn, Key } from 'lucide-react';

interface SignInPromptModalProps {
  onClose: () => void;
  onOpenAuthModal: () => void;
  t: {
    signInPromptTitle: string;
    signInPromptSub: string;
    signInBenefit1: string;
    signInBenefit2: string;
    signInBenefit3: string;
    signInCreate: string;
    signInPromptByok: string;
  };
}

export function SignInPromptModal({ onClose, onOpenAuthModal, t }: SignInPromptModalProps) {
  return (
    <div className="modal-overlay no-print" onClick={onClose} role="dialog" aria-modal="true" aria-label="Sign in for more">
      <div className="auth-modal-content" onClick={e => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="auth-brand">
          <div className="auth-brand-logo">
            <LogIn size={22} />
          </div>
          <div>
            <h2 className="auth-brand-title">{t.signInPromptTitle}</h2>
            <p className="auth-brand-sub">{t.signInPromptSub}</p>
          </div>
        </div>

        <ul style={{
          listStyle: 'none', padding: 0, margin: '16px 0',
          display: 'flex', flexDirection: 'column', gap: 8,
          fontSize: '0.85rem', color: 'var(--text-secondary)',
        }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#10b981', fontWeight: 700 }}>&#10003;</span> {t.signInBenefit1}
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#10b981', fontWeight: 700 }}>&#10003;</span> {t.signInBenefit2}
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#10b981', fontWeight: 700 }}>&#10003;</span> {t.signInBenefit3}
          </li>
        </ul>

        <button
          className="auth-btn-primary"
          onClick={() => { onClose(); onOpenAuthModal(); }}
          style={{ width: '100%', gap: 8 }}
        >
          <LogIn size={16} /> {t.signInCreate}
        </button>

        <p style={{
          textAlign: 'center', fontSize: '0.75rem',
          color: 'var(--text-tertiary)', marginTop: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          <Key size={11} /> {t.signInPromptByok}
        </p>
      </div>
    </div>
  );
}
