import { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, Link2, Loader, AlertCircle, ArrowRight, Download, Zap, Shield, Globe, LogIn, LogOut, Sun, Moon } from 'lucide-react';
import { importShareLink, validateShareUrl, turnsToEditorText, ShareLinkError } from '../utils/shareImport';
import { exportSharePdf } from '../utils/exportSharePdf';
import { toast } from '../hooks/useToast';
import type { User } from '@supabase/supabase-js';

/* ---------- platform logos (inline SVG for zero deps) ---------- */
const ChatGPTLogo = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.05 6.05 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
  </svg>
);

const GeminiLogo = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M12 0C12 0 12 8 8 12C4 16 0 12 0 12C0 12 4 12 8 12C12 12 12 16 12 24C12 24 12 16 16 12C20 8 24 12 24 12C24 12 20 12 16 12C12 12 12 8 12 0Z"/>
  </svg>
);

interface ConvertPageProps {
  t: Record<string, string>;
  lang: string;
  toggleLang: () => void;
  user: User | null;
  isAnonymous: boolean;
  plan: string;
  onSignIn: () => void;
  onSignOut: () => void;
  onNavigateEditor: (title?: string, content?: string, llm?: string) => void;
}

export function ConvertPage({
  t, lang, toggleLang, user, isAnonymous,
  onSignIn, onSignOut, onNavigateEditor,
}: ConvertPageProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const theme = document.documentElement.getAttribute('data-theme') || 'light';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  };

  const handleConvert = useCallback(async (mode: 'editor' | 'pdf') => {
    const target = url.trim();
    if (!target || loading) return;
    setError('');

    const validation = validateShareUrl(target);
    if (!validation.valid) {
      if (validation.error === 'claude_unsupported') {
        setError(t.shareClaudeUnsupported);
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

      if (mode === 'pdf') {
        setExporting(true);
        toast('info', t.generatingPdf || 'Generating PDF...', 3000);
        try {
          await exportSharePdf(title, result.turns, result.platform, target);
          toast('success', 'PDF downloaded!', 3000);
        } catch (err) {
          console.error('[SharePDF]', err);
          toast('error', 'PDF generation failed');
        } finally {
          setExporting(false);
        }
      } else {
        const editorText = turnsToEditorText(result.turns);
        const msg = t.shareSuccess
          .replace('{count}', String(result.turns.length))
          .replace('{platform}', result.platform);
        toast('success', msg, 4000);
        const llm = result.platform === 'ChatGPT' ? 'ChatGPT' : result.platform === 'Gemini' ? 'Gemini' : 'AI';
        onNavigateEditor(title, editorText, llm);
      }
    } catch (err) {
      let msg = 'Failed to import share link';
      if (err instanceof ShareLinkError) {
        if (err.code === 'claude_unsupported') msg = t.shareClaudeUnsupported;
        else if (err.code === 'not_authenticated') msg = t.shareSignInRequired;
        else msg = err.message;
      } else {
        msg = (err as Error).message || msg;
      }
      setError(msg);
      toast('error', msg, 5000);
    } finally {
      setLoading(false);
    }
  }, [url, loading, t, onNavigateEditor]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConvert('pdf');
    }
  };

  return (
    <div className="convert-page">
      {/* ── Header ── */}
      <header className="convert-header">
        <a href="#/" className="convert-brand">
          <div className="brand-logo"><FileText size={20} /></div>
          <span className="brand-text">{t.appTitle}</span>
        </a>
        <div className="convert-header-actions">
          <button className="convert-header-btn" onClick={toggleTheme} title={theme === 'dark' ? t.switchToLightMode : t.switchToDarkMode}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="convert-header-btn" onClick={toggleLang}>
            <Globe size={16} />
            <span>{lang === 'en' ? 'JA' : 'EN'}</span>
          </button>
          {user && !isAnonymous ? (
            <button className="convert-header-btn" onClick={onSignOut}>
              <LogOut size={16} />
              <span>{t.signOut}</span>
            </button>
          ) : (
            <button className="convert-header-btn convert-header-btn--primary" onClick={onSignIn}>
              <LogIn size={16} />
              <span>{t.signIn}</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Hero Section ── */}
      <main className="convert-main">
        <div className="convert-hero">
          <h1 className="convert-hero-title">{t.convertHeroTitle}</h1>
          <p className="convert-hero-sub">{t.convertHeroSub}</p>
        </div>

        {/* ── Converter Card ── */}
        <div className="convert-card">
          <div className="convert-platforms">
            <span className="convert-platform-badge">
              <ChatGPTLogo /> ChatGPT
            </span>
            <span className="convert-platform-badge">
              <GeminiLogo /> Gemini
            </span>
          </div>

          <div className="convert-input-group">
            <Link2 size={18} className="convert-input-icon" />
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={e => { setUrl(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder={t.convertPlaceholder}
              disabled={loading || exporting}
              className="convert-input"
            />
          </div>

          {error && (
            <div className="convert-error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <div className="convert-actions">
            <button
              className="convert-btn convert-btn--primary"
              onClick={() => handleConvert('pdf')}
              disabled={loading || exporting || !url.trim()}
            >
              {loading || exporting ? (
                <><Loader size={16} className="share-spinner" /> {t.shareLoading}</>
              ) : (
                <><Download size={16} /> {t.convertToPdf}</>
              )}
            </button>
            <button
              className="convert-btn convert-btn--secondary"
              onClick={() => handleConvert('editor')}
              disabled={loading || exporting || !url.trim()}
            >
              <ArrowRight size={16} /> {t.convertToEditor}
            </button>
          </div>
        </div>

        {/* ── How It Works ── */}
        <section className="convert-steps">
          <h2 className="convert-section-title">{t.convertHowTitle}</h2>
          <div className="convert-steps-grid">
            <div className="convert-step">
              <div className="convert-step-number">1</div>
              <h3>{t.convertStep1Title}</h3>
              <p>{t.convertStep1Desc}</p>
            </div>
            <div className="convert-step-arrow"><ArrowRight size={20} /></div>
            <div className="convert-step">
              <div className="convert-step-number">2</div>
              <h3>{t.convertStep2Title}</h3>
              <p>{t.convertStep2Desc}</p>
            </div>
            <div className="convert-step-arrow"><ArrowRight size={20} /></div>
            <div className="convert-step">
              <div className="convert-step-number">3</div>
              <h3>{t.convertStep3Title}</h3>
              <p>{t.convertStep3Desc}</p>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="convert-features">
          <h2 className="convert-section-title">{t.convertWhyTitle}</h2>
          <div className="convert-features-grid">
            <div className="convert-feature-card">
              <div className="convert-feature-icon"><Zap size={22} /></div>
              <h3>{t.convertFeature1Title}</h3>
              <p>{t.convertFeature1Desc}</p>
            </div>
            <div className="convert-feature-card">
              <div className="convert-feature-icon"><Download size={22} /></div>
              <h3>{t.convertFeature2Title}</h3>
              <p>{t.convertFeature2Desc}</p>
            </div>
            <div className="convert-feature-card">
              <div className="convert-feature-icon"><Shield size={22} /></div>
              <h3>{t.convertFeature3Title}</h3>
              <p>{t.convertFeature3Desc}</p>
            </div>
          </div>
        </section>

        {/* ── CTA to Editor ── */}
        <section className="convert-cta">
          <p>{t.convertCtaText}</p>
          <button className="convert-btn convert-btn--outline" onClick={() => onNavigateEditor()}>
            {t.convertCtaBtn} <ArrowRight size={16} />
          </button>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="convert-footer">
        <span>ChatSource &copy; {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
