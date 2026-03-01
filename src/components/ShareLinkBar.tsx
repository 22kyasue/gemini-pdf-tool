import { useState, useRef, useEffect, useCallback } from 'react';
import { Link2, X, Loader, AlertCircle, FileDown } from 'lucide-react';
import { importShareLink, validateShareUrl, turnsToEditorText, ShareLinkError } from '../utils/shareImport';
import type { ShareTurn } from '../utils/shareImport';
import { toast } from '../hooks/useToast';

interface ShareLinkBarProps {
  initialUrl?: string;
  onImport: (title: string, text: string, platform: string) => void;
  onDirectPdf: (title: string, turns: ShareTurn[], platform: string, sourceUrl: string) => void;
  onClose: () => void;
  t: {
    sharePlaceholder: string;
    shareLoad: string;
    shareLoading: string;
    shareSuccess: string;
    shareClaudeUnsupported: string;
    shareUnsupportedDomain: string;
    shareInvalidUrl: string;
    shareSignInRequired: string;
  };
}

export function ShareLinkBar({ initialUrl, onImport, onDirectPdf, onClose, t }: ShareLinkBarProps) {
  const [url, setUrl] = useState(initialUrl || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // If initialUrl is provided and non-empty, auto-submit
  useEffect(() => {
    if (initialUrl?.trim()) {
      handleLoad(initialUrl.trim(), false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoad = useCallback(async (urlToLoad?: string, directPdf = false) => {
    const target = (urlToLoad || url).trim();
    if (!target || loading) return;
    setError('');

    // Client-side validation
    const validation = validateShareUrl(target);
    if (!validation.valid) {
      if (validation.error === 'claude_unsupported') {
        setError(t.shareClaudeUnsupported);
        toast('info', t.shareClaudeUnsupported, 5000);
      } else if (validation.error === 'unsupported_domain') {
        setError(t.shareUnsupportedDomain);
      } else {
        setError(t.shareInvalidUrl);
      }
      return;
    }

    setLoading(true);
    try {
      const result = await importShareLink(target);
      const title = result.title || 'Imported Chat';

      if (directPdf) {
        onDirectPdf(title, result.turns, result.platform, target);
      } else {
        const editorText = turnsToEditorText(result.turns);
        const msg = t.shareSuccess
          .replace('{count}', String(result.turns.length))
          .replace('{platform}', result.platform);
        toast('success', msg, 4000);
        onImport(title, editorText, result.platform);
      }
    } catch (err) {
      let msg = 'Failed to import share link';
      if (err instanceof ShareLinkError) {
        if (err.code === 'claude_unsupported') {
          msg = t.shareClaudeUnsupported;
          toast('info', msg, 5000);
        } else if (err.code === 'not_authenticated') {
          msg = t.shareSignInRequired;
          toast('error', msg, 5000);
        } else {
          msg = err.message;
          toast('error', msg, 6000);
        }
      } else {
        msg = (err as Error).message || msg;
        toast('error', msg, 5000);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [url, loading, onImport, onDirectPdf, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLoad();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="share-link-bar-wrapper no-print">
      <div className="share-link-bar">
        <Link2 size={14} className="share-link-icon" />
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
          placeholder={t.sharePlaceholder}
          disabled={loading}
        />
        <button
          className="share-load-btn"
          onClick={() => handleLoad(undefined, false)}
          disabled={loading || !url.trim()}
        >
          {loading ? (
            <>
              <Loader size={12} className="share-spinner" />
              {t.shareLoading}
            </>
          ) : (
            t.shareLoad
          )}
        </button>
        <button
          className="share-pdf-btn"
          onClick={() => handleLoad(undefined, true)}
          disabled={loading || !url.trim()}
          title="Download PDF directly"
        >
          <FileDown size={13} />
          PDF
        </button>
        <button
          className="share-close-btn"
          onClick={onClose}
          disabled={loading}
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
      {error && (
        <div className="share-link-error">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
