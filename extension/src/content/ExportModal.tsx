import { useState, useEffect, useCallback } from 'react';
import { X, FileText, FileCode, FileJson, Table, FileType, LogIn, Crown } from 'lucide-react';
import type { RawTurn } from '../shared/messages';

export type ExportFormat = 'pdf' | 'docx' | 'md' | 'json' | 'csv';

interface ExportModalProps {
  turns: RawTurn[];
  site: 'gemini' | 'chatgpt';
  onClose: () => void;
}

const FORMAT_OPTIONS: { id: ExportFormat; label: string; icon: typeof FileText }[] = [
  { id: 'pdf',  label: 'PDF',  icon: FileText },
  { id: 'docx', label: 'Word', icon: FileType },
  { id: 'md',   label: 'MD',   icon: FileCode },
  { id: 'json', label: 'JSON', icon: FileJson },
  { id: 'csv',  label: 'CSV',  icon: Table },
];

function generateFilename(site: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${site}_export_${date}_${time}`;
}

/** Truncate text for preview */
function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\n/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max) + '…' : oneLine;
}

interface AuthInfo {
  email: string | null;
  userId: string | null;
}

export function ExportModal({ turns, site, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [filename, setFilename] = useState(() => generateFilename(site));
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);

  // Message selection state — default all selected
  const [selected, setSelected] = useState<Set<number>>(() => new Set(turns.map((_, i) => i)));
  const [isPro, setIsPro] = useState(false);
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  // Check auth + plan status from chrome.storage
  useEffect(() => {
    try {
      chrome.storage.local.get(['plan', 'authSession'], (result) => {
        setIsPro(result?.plan === 'pro');
        if (result?.authSession?.userId) {
          setAuth({
            email: result.authSession.email || null,
            userId: result.authSession.userId,
          });
        }
      });
    } catch {
      // storage API unavailable
    }
  }, []);

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const allSelected = selected.size === turns.length;
  const noneSelected = selected.size === 0;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(turns.map((_, i) => i)));
    }
  }, [allSelected, turns]);

  const toggleOne = useCallback((index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleDownload = useCallback(async () => {
    if (loading) return;

    // Get the selected turns (pro can filter, free gets all)
    const exportTurns = isPro
      ? turns.filter((_, i) => selected.has(i))
      : turns;

    if (exportTurns.length === 0) {
      setToast({ message: 'Select at least one message to export.', error: true });
      return;
    }

    setLoading(true);
    try {
      const { runExport } = await import('./exporters');
      await runExport(format, exportTurns, site, filename, isPro ? selected : undefined);
      setToast({ message: `${format.toUpperCase()} downloaded!`, error: false });
      // Close modal after brief delay so user sees the toast
      setTimeout(onClose, 800);
    } catch (err) {
      console.error('[Export error]', err);
      setToast({ message: `Export failed: ${String(err)}`, error: true });
    } finally {
      setLoading(false);
    }
  }, [format, turns, site, filename, loading, onClose, isPro, selected]);

  const siteLabel = site === 'gemini' ? 'Gemini' : 'ChatGPT';

  return (
    <>
      <div className="gpt-export-overlay" onClick={onClose}>
        <div className="gpt-export-modal" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="gpt-modal-header">
            <div className="gpt-modal-title">Export Conversation</div>
            <button className="gpt-modal-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          {/* Auth status */}
          <div className="gpt-auth-bar">
            {auth ? (
              <span className="gpt-auth-email">
                {auth.email || 'Signed in'}
                {isPro && <span className="gpt-auth-pro-badge">PRO</span>}
              </span>
            ) : (
              <button
                className="gpt-auth-signin"
                onClick={() => window.open('https://chatsource.app', '_blank')}
              >
                <LogIn size={12} />
                Sign in at ChatSource
              </button>
            )}
          </div>

          {/* Turn count */}
          <div className="gpt-modal-info">
            <strong>{isPro ? selected.size : turns.length}</strong> of {turns.length} turns from {siteLabel}
          </div>

          <div className="gpt-modal-body">
            {/* Message Selection */}
            <div className="gpt-messages-section">
              <div className="gpt-messages-header">
                <div className="gpt-format-label">Messages</div>
                <button
                  className="gpt-messages-toggle"
                  onClick={toggleAll}
                  disabled={!isPro}
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="gpt-messages-list">
                {turns.map((turn, i) => (
                  <div
                    key={i}
                    className={`gpt-msg-row${!isPro ? ' disabled' : ''}`}
                    onClick={() => isPro && toggleOne(i)}
                  >
                    <input
                      type="checkbox"
                      className="gpt-msg-checkbox"
                      checked={isPro ? selected.has(i) : true}
                      disabled={!isPro}
                      onChange={() => isPro && toggleOne(i)}
                    />
                    <span className={`gpt-msg-role ${turn.role === 'user' ? 'gpt-msg-role-user' : 'gpt-msg-role-assistant'}`}>
                      {turn.role === 'user' ? 'You' : siteLabel.slice(0, 3)}
                    </span>
                    <span className="gpt-msg-text">{truncate(turn.text, 60)}</span>
                  </div>
                ))}
              </div>

              {/* Pro upsell / sign-in prompt for free users */}
              {!isPro && !showSignInPrompt && (
                <div className="gpt-pro-banner">
                  <span className="gpt-pro-badge">PRO</span>
                  <span className="gpt-pro-text">
                    Select individual messages to export.{' '}
                    <button
                      className="gpt-pro-link"
                      onClick={() => {
                        if (!auth) {
                          setShowSignInPrompt(true);
                        } else {
                          window.open('https://chatsource.app/upgrade', '_blank');
                        }
                      }}
                    >
                      Upgrade to Pro
                    </button>
                  </span>
                </div>
              )}

              {!isPro && showSignInPrompt && (
                <div className="gpt-signin-prompt">
                  <Crown size={20} />
                  <div className="gpt-signin-prompt-text">
                    <strong>Sign in to unlock Pro</strong>
                    <p>Create a free account first, then upgrade to select individual messages.</p>
                  </div>
                  <button
                    className="gpt-signin-prompt-btn"
                    onClick={() => window.open('https://chatsource.app', '_blank')}
                  >
                    <LogIn size={14} /> Sign In / Create Account
                  </button>
                </div>
              )}

              {/* Selected count (pro only) */}
              {isPro && (
                <div className="gpt-selected-count">
                  <strong>{selected.size}</strong> of {turns.length} selected
                </div>
              )}
            </div>

            {/* Format Selection */}
            <div>
              <div className="gpt-format-label">Format</div>
              <div className="gpt-format-grid">
                {FORMAT_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      className={`gpt-format-btn${format === opt.id ? ' active' : ''}`}
                      onClick={() => setFormat(opt.id)}
                    >
                      <Icon size={24} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filename */}
            <div className="gpt-filename-group">
              <label className="gpt-filename-label">Filename</label>
              <input
                className="gpt-filename-input"
                type="text"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                placeholder="Enter filename"
              />
            </div>

            {/* Download */}
            <button
              className="gpt-download-btn"
              onClick={handleDownload}
              disabled={loading || !filename.trim() || (isPro && noneSelected)}
            >
              {loading ? (
                <><span className="gpt-spinner" />Exporting…</>
              ) : (
                <>Download Now</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`gpt-toast${toast.error ? ' gpt-toast-error' : ''}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}
