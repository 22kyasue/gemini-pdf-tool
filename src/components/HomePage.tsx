import { useState, useCallback } from 'react';
import { FileText, Globe, Sun, Moon, LogIn, LogOut, ChevronDown, ArrowRight, Link2, ClipboardPaste, Chrome, Code, Shield, FileDown, Monitor, Check, Zap } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface HomePageProps {
  t: Record<string, string>;
  lang: string;
  toggleLang: () => void;
  user: User | null;
  isAnonymous: boolean;
  plan: string;
  onSignIn: () => void;
  onSignOut: () => void;
  onNavigateEditor: () => void;
  onNavigateConvert: () => void;
  onUpgrade: (period: 'monthly' | 'yearly') => void;
}

export function HomePage({
  t, lang, toggleLang, user, isAnonymous,
  onSignIn, onSignOut, onNavigateEditor, onNavigateConvert, onUpgrade,
}: HomePageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const theme = document.documentElement.getAttribute('data-theme') || 'light';

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  };

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const toggleFaq = (i: number) => setOpenFaq(prev => prev === i ? null : i);

  const modes = [
    {
      icon: <Link2 size={28} />,
      tag: t.homeMode1Tag,
      title: t.homeMode1Title,
      desc: t.homeMode1Desc,
      cta: t.homeMode1Cta,
      onClick: onNavigateConvert,
      accent: 'mode-convert',
    },
    {
      icon: <ClipboardPaste size={28} />,
      tag: t.homeMode2Tag,
      title: t.homeMode2Title,
      desc: t.homeMode2Desc,
      cta: t.homeMode2Cta,
      onClick: onNavigateEditor,
      accent: 'mode-editor',
    },
    {
      icon: <Chrome size={28} />,
      tag: t.homeMode3Tag,
      title: t.homeMode3Title,
      desc: t.homeMode3Desc,
      cta: t.homeMode3Cta,
      onClick: () => { /* Chrome extension link — placeholder */ },
      accent: 'mode-extension',
    },
  ];

  const highlights = [
    { icon: <Code size={20} />, title: t.homeHighlight1Title, desc: t.homeHighlight1Desc },
    { icon: <Shield size={20} />, title: t.homeHighlight2Title, desc: t.homeHighlight2Desc },
    { icon: <FileDown size={20} />, title: t.homeHighlight3Title, desc: t.homeHighlight3Desc },
    { icon: <Monitor size={20} />, title: t.homeHighlight4Title, desc: t.homeHighlight4Desc },
  ];

  const faqs = [
    { q: t.homeFaq1Q, a: t.homeFaq1A },
    { q: t.homeFaq2Q, a: t.homeFaq2A },
    { q: t.homeFaq3Q, a: t.homeFaq3A },
    { q: t.homeFaq4Q, a: t.homeFaq4A },
    { q: t.homeFaq5Q, a: t.homeFaq5A },
  ];

  return (
    <div className="home-page">
      {/* ── Header ── */}
      <header className="home-header">
        <div className="home-header-brand">
          <div className="brand-logo"><FileText size={20} /></div>
          <span className="brand-text">{t.appTitle}</span>
        </div>

        <nav className="home-nav">
          <button className="home-nav-link" onClick={() => scrollTo('home-modes')}>{t.homeNavFeatures}</button>
          <button className="home-nav-link" onClick={() => scrollTo('home-pricing')}>{t.homeNavPricing}</button>
          <button className="home-nav-link" onClick={() => scrollTo('home-faq')}>{t.homeNavFaq}</button>
        </nav>

        <div className="home-header-actions">
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

      <main className="home-main">
        {/* ── Hero ── */}
        <section className="home-hero">
          <div className="home-hero-content">
            <h1 className="home-hero-title">{t.homeHeroTitle}</h1>
            <p className="home-hero-sub">{t.homeHeroSub}</p>
            <p className="home-hero-note">{t.homeHeroNote}</p>
            <div className="home-hero-actions">
              <button className="home-btn home-btn--primary" onClick={() => scrollTo('home-modes')}>
                {t.homeHeroCtaStart || 'Get Started'} <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <div className="home-hero-visual">
            <div className="home-mockup">
              <div className="home-mockup-bar">
                <span className="home-mockup-dot" />
                <span className="home-mockup-dot" />
                <span className="home-mockup-dot" />
              </div>
              <div className="home-mockup-body">
                <div className="home-mockup-line home-mockup-line--user" />
                <div className="home-mockup-line home-mockup-line--ai" />
                <div className="home-mockup-line home-mockup-line--ai home-mockup-line--short" />
                <div className="home-mockup-line home-mockup-line--code" />
                <div className="home-mockup-line home-mockup-line--user home-mockup-line--short" />
                <div className="home-mockup-line home-mockup-line--ai" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Three Modes ── */}
        <section className="home-modes" id="home-modes">
          <h2 className="home-section-title">{t.homeModesTitle}</h2>
          <div className="home-modes-grid">
            {modes.map((m, i) => (
              <div className={`home-mode-card ${m.accent}`} key={i}>
                <div className="home-mode-tag">{m.tag}</div>
                <div className="home-mode-icon">{m.icon}</div>
                <h3 className="home-mode-title">{m.title}</h3>
                <p className="home-mode-desc">{m.desc}</p>
                <button className="home-mode-cta" onClick={m.onClick}>
                  {m.cta} <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── Highlights (compact feature strip) ── */}
        <section className="home-highlights" id="home-highlights">
          <h2 className="home-section-title">{t.homeHighlightsTitle}</h2>
          <div className="home-highlights-grid">
            {highlights.map((h, i) => (
              <div className="home-highlight" key={i}>
                <div className="home-highlight-icon">{h.icon}</div>
                <div>
                  <strong>{h.title}</strong>
                  <span>{h.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="home-pricing" id="home-pricing">
          <h2 className="home-section-title">{t.homePricingTitle}</h2>

          {/* Monthly / Yearly toggle */}
          <div className="home-pricing-toggle">
            <button
              className={`home-pricing-toggle-btn${billingPeriod === 'monthly' ? ' active' : ''}`}
              onClick={() => setBillingPeriod('monthly')}
            >
              {t.homePricingMonthly}
            </button>
            <button
              className={`home-pricing-toggle-btn${billingPeriod === 'yearly' ? ' active' : ''}`}
              onClick={() => setBillingPeriod('yearly')}
            >
              {t.homePricingYearly}
              <span className="home-pricing-save">{t.homePricingSave}</span>
            </button>
          </div>

          <div className="home-pricing-grid">
            {/* Free */}
            <div className="home-pricing-card">
              <h3 className="home-pricing-plan">{t.homePricingFreeTitle}</h3>
              <div className="home-pricing-price">
                <span className="home-pricing-amount">{t.homePricingFreePrice}</span>
                <span className="home-pricing-period">{t.homePricingFreePeriod}</span>
              </div>
              <ul className="home-pricing-features">
                {[t.homePricingFreeF1, t.homePricingFreeF2, t.homePricingFreeF3, t.homePricingFreeF4].map(f => (
                  <li key={f}><Check size={15} /> {f}</li>
                ))}
              </ul>
              <button className="home-pricing-cta" onClick={user && !isAnonymous ? onNavigateEditor : onSignIn}>
                {t.homePricingFreeCta}
              </button>
            </div>

            {/* Pro */}
            <div className="home-pricing-card home-pricing-card--pro">
              <div className="home-pricing-badge">POPULAR</div>
              <h3 className="home-pricing-plan">{t.homePricingProTitle}</h3>
              <div className="home-pricing-price">
                {billingPeriod === 'monthly' ? (
                  <>
                    <span className="home-pricing-original">{t.homePricingProOriginal}</span>
                    <span className="home-pricing-amount">{t.homePricingProMonthly}</span>
                    <span className="home-pricing-period">{t.homePricingProMonthlyNote}</span>
                  </>
                ) : (
                  <>
                    <span className="home-pricing-amount">{t.homePricingProYearly}</span>
                    <span className="home-pricing-period">{t.homePricingProYearlyNote}</span>
                  </>
                )}
              </div>
              {billingPeriod === 'yearly' && (
                <p className="home-pricing-yearly-sub">{t.homePricingProYearlySub}</p>
              )}
              <ul className="home-pricing-features">
                {[t.homePricingProF1, t.homePricingProF2, t.homePricingProF3, t.homePricingProF4].map(f => (
                  <li key={f}><Check size={15} /> {f}</li>
                ))}
              </ul>
              <button
                className="home-pricing-cta home-pricing-cta--pro"
                onClick={() => {
                  if (!user || isAnonymous) { onSignIn(); return; }
                  onUpgrade(billingPeriod);
                }}
              >
                <Zap size={15} /> {t.homePricingProCta}
              </button>
            </div>
          </div>

          <p className="home-pricing-byok">{t.homePricingByok}</p>
        </section>

        {/* ── FAQ ── */}
        <section className="home-faq" id="home-faq">
          <h2 className="home-section-title">{t.homeNavFaq}</h2>
          <div className="home-faq-list">
            {faqs.map((faq, i) => (
              <div className={`home-faq-item${openFaq === i ? ' home-faq-item--open' : ''}`} key={i}>
                <button className="home-faq-question" onClick={() => toggleFaq(i)}>
                  <span>{faq.q}</span>
                  <ChevronDown size={18} className="home-faq-chevron" />
                </button>
                <div className="home-faq-answer">
                  <p>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="home-footer-links">
          <a href="#/editor" className="home-footer-link">{t.homeFooterEditor}</a>
          <a href="#/convert" className="home-footer-link">{t.homeFooterConvert}</a>
        </div>
        <span>ChatSource &copy; {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
