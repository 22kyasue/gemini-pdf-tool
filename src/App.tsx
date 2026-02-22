import { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import {
  FileText, Download, User, Table, Zap,
  GraduationCap, Briefcase,
  Layout, Plus, Trash, Settings, X,
  Sun, Moon, Terminal
} from 'lucide-react';
import { splitChatWithGemini, hasApiKey, getLastApiError, clearLastApiError } from './utils/llmParser';

// -- Types --
import type { Turn, LLMName } from './types';

interface Source {
  id: string;
  title: string;
  content: string;
  llm: LLMName;
}

// -- Utils --
import { parseChatLog } from './utils/chatParser';
import { exportToPdf } from './utils/pdfExport';

// -- Components --
import { TurnBlock } from './components/TurnBlock';
import { TableOfContents } from './components/TableOfContents';
import { LLMSelector } from './components/LLMSelector';
import { PdfPrintHeader } from './components/PdfPrintHeader';
import { _onRenderError } from './components/ErrorBoundary';

// -- LLM Detection --
import { detectLLMWithConfidence } from './algorithm/llmDetector';
import type { LLMType } from './algorithm/llmDetector';

const SAMPLE = `あなたのプロンプト
Gemini, can you analyze the Q3 growth projection for our green tech sector? I need a breakdown of the efficiency gains.

Gemini の回答
Certainly. Based on the current trajectory, the Green Tech sector is showing a significant vertical scale-up. Here is the efficiency distribution across our core divisions:

| Division | Efficiency Gain | R&D Investment | Status |
| :--- | :---: | :---: | :--- |
| Solar Dynamics | +24.5% | $4.2M | 🟢 Optimal |
| Wind Systems | +18.2% | $3.1M | 🟡 Monitoring |
| Hydro Grid | +12.8% | $1.8M | 🔵 Expanding |

The data indicates a strong correlation between R&D spending and efficiency spikes. Notably, the **Solar Dynamics** division has outperformed expectations by 4.2% due to the new silicon-carbide layering process.

あなたのプロンプト
What's the narrative flow of these results?

Gemini の回答
The narrative follows a "Investment -> Innovation -> Efficiency" cycle.
1. **Capital Injection**: Targeted R&D funding (+$9.1M total).
2. **Technical Breakthrough**: Implementation of Next-Gen semiconductors.
3. **Market Lead**: Achieving a 20%+ gain in primary energy conversion.

This confirms our 2026 sustainability targets are achievable ahead of schedule.`;

export default function App() {
  const [sources, setSources] = useState<Source[]>([
    { id: 'initial', title: 'Main Session', content: SAMPLE, llm: 'Gemini' }
  ]);
  const [activeSourceId, setActiveSourceId] = useState<string>('initial');
  const [pdfTemplate, setPdfTemplate] = useState<'professional' | 'academic' | 'executive'>('professional');
  const [llmOverride, setLlmOverride] = useState<LLMType | null>(null);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [parseErrorToast, setParseErrorToast] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem('googleApiKey') || '');
  const [apiTestResult, setApiTestResult] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

  // -- API Console Logs --
  interface LogEntry { time: string; level: 'info' | 'warn' | 'error' | 'success'; msg: string; }
  const [apiLogs, setApiLogs] = useState<LogEntry[]>([]);
  const logScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    const ts = () => new Date().toLocaleTimeString('ja-JP', { hour12: false });

    const push = (level: LogEntry['level'], args: any[]) => {
      const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      if (!text.includes('[Flow]') && !text.includes('[Gemini]')) return;
      const finalLevel = text.includes('SUCCESS') ? 'success' : level;
      setApiLogs(prev => [...prev.slice(-99), { time: ts(), level: finalLevel, msg: text }]);
    };

    console.log = (...args) => { push('info', args); origLog.apply(console, args); };
    console.warn = (...args) => { push('warn', args); origWarn.apply(console, args); };
    console.error = (...args) => { push('error', args); origError.apply(console, args); };

    return () => { console.log = origLog; console.warn = origWarn; console.error = origError; };
  }, []);

  useEffect(() => {
    if (logScrollRef.current) logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
  }, [apiLogs]);

  // -- Theme --
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // Separate draft (live typing) from committed key (saved on blur/Done)
  const [apiKeyDraft, setApiKeyDraft] = useState(googleApiKey);

  const commitApiKey = (val: string) => {
    const trimmed = val.trim();
    setGoogleApiKey(trimmed);
    localStorage.setItem('googleApiKey', trimmed);
    clearLastApiError();
    setApiError(null);
    lastAiSplitRef.current = '';
  };

  const activeSource = sources.find(s => s.id === activeSourceId) || sources[0];

  const handleUpdateSourceContent = (val: string) => {
    setSources(prev => prev.map(s => s.id === activeSourceId ? { ...s, content: val } : s));
  };

  const handleAddSource = () => {
    const id = Math.random().toString(36).slice(2, 9);
    setSources(prev => [...prev, { id, title: 'New Source', content: '', llm: 'AI' }]);
    setActiveSourceId(id);
  };

  const handleDeleteSource = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sources.length <= 1) return;
    setSources(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (activeSourceId === id) setActiveSourceId(filtered[0].id);
      return filtered;
    });
  };

  const handleUpdateTitle = (id: string, title: string) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  };

  const showParseError = useCallback(() => {
    setParseErrorToast(true);
    setTimeout(() => setParseErrorToast(false), 2500);
  }, []);

  const previewRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  _onRenderError.current = showParseError;

  const deferredSources = useDeferredValue(sources);
  const sourceContents = useMemo(() => deferredSources.map(s => s.content).join('\n---\n'), [deferredSources]);

  // ── Gemini marker detection ──
  const hasGeminiMarkers = useMemo(() => {
    return /あなたのプロンプト|Gemini の回答|Gemini の返答/i.test(sourceContents);
  }, [sourceContents]);

  // ── Legacy parser: always runs for all text ──
  const parsed = useMemo(
    () => activeSource.content.trim() ? parseChatLog(activeSource.content) : { turns: [], llm: 'AI' as LLMName },
    [activeSource.content]
  );

  // Turns state: starts from legacy parser, can be overridden by Gemini API
  const [overrideTurns, setOverrideTurns] = useState<Turn[] | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [splitMethod, setSplitMethod] = useState<'regex' | 'gemini-api' | 'none'>('none');
  const lastAiSplitRef = useRef<string>('');

  // Reset override when source text changes or API key changes
  useEffect(() => {
    setOverrideTurns(null);
    setApiError(null);
    lastAiSplitRef.current = '';
    if (hasGeminiMarkers) {
      setSplitMethod('regex');
    } else {
      setSplitMethod('none');
    }
  }, [sourceContents, hasGeminiMarkers, googleApiKey]);

  // ── Gemini API for non-Gemini chats ──
  useEffect(() => {
    if (hasGeminiMarkers) { console.log('[Flow] Gemini markers found → regex only, no API'); return; }
    const rawText = deferredSources.map(s => s.content).join('\n---\n').trim();
    if (!rawText) { console.log('[Flow] Empty text → skip API'); return; }
    if (!hasApiKey()) { console.log('[Flow] No API key → skip API'); return; }
    if (rawText === lastAiSplitRef.current) { console.log('[Flow] Same text as last call → skip API'); return; }

    console.log(`[Flow] Non-Gemini text detected (${rawText.length} chars), scheduling API call in 1.5s...`);

    const timer = setTimeout(() => {
      console.log('[Flow] Timer fired → calling splitChatWithGemini...');
      lastAiSplitRef.current = rawText;
      setIsClassifying(true);
      setApiError(null);

      splitChatWithGemini(rawText).then(aiMessages => {
        if (aiMessages && aiMessages.length > 0) {
          // Convert AISplitMessage[] to Turn[]
          const converted: Turn[] = aiMessages.map((msg, i) => ({
            role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
            llmLabel: msg.role === 'user' ? 'USER' : 'AI',
            content: msg.content,
            rawContent: msg.content,
            index: i,
            summary: msg.role === 'user' ? `Q${i + 1}. ${msg.content.split('\n')[0]?.trim().slice(0, 24) || ''}` : '',
            hasTable: /\|.*\|/.test(msg.content),
            keyPoints: [],
          }));
          setOverrideTurns(converted);
          setApiError(null);
          setSplitMethod('gemini-api');
        } else {
          const err = getLastApiError();
          if (err) setApiError(err.message);
          setSplitMethod('none');
        }
      }).catch(err => {
        console.error("AI split failed:", err);
        setApiError(`AI分割エラー: ${err.message}`);
        setSplitMethod('none');
      }).finally(() => {
        setIsClassifying(false);
      });
    }, 1500);

    return () => clearTimeout(timer);
  }, [sourceContents, hasGeminiMarkers, googleApiKey]);

  // Final turns: API override or legacy parser
  const currentTurns = overrideTurns ?? parsed.turns;

  const activeLLMDetection = useMemo(() => detectLLMWithConfidence(activeSource.content), [activeSource.content]);
  const selectedLLM = llmOverride || activeLLMDetection.llm;

  const handleExportPdf = async () => {
    setExporting(true);
    setIsPdfExporting(true);
    await new Promise(r => setTimeout(r, 800));
    try {
      if (previewRef.current) {
        await exportToPdf(previewRef.current, activeSource.title, scrollRef.current);
      }
    } finally {
      setIsPdfExporting(false);
      setExporting(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo"><FileText size={20} /></div>
          <div className="brand-text">GEMINI PDF TOOL <span className="beta-tag">PRO</span></div>
        </div>

        <div className="header-stats no-print">
          <div className="stat-item"><User size={12} /><span>{currentTurns.filter(t => t.role === 'user').length}</span></div>
          <div className="stat-item"><Table size={12} /><span>{currentTurns.filter(t => t.hasTable).length}</span></div>
        </div>

        <div className="header-actions">
          <div className={`split-method-badge no-print ${splitMethod !== 'none' ? 'active' : ''}`}>
            {splitMethod === 'regex' && 'Regex'}
            {splitMethod === 'gemini-api' && 'Gemini API'}
            {splitMethod === 'none' && (hasApiKey() ? 'Ready' : 'No API Key')}
          </div>
          <div className="template-selector no-print">
            <button onClick={() => setPdfTemplate('professional')} className={`template-btn ${pdfTemplate === 'professional' ? 'active' : ''}`}><Layout size={14} /></button>
            <button onClick={() => setPdfTemplate('academic')} className={`template-btn ${pdfTemplate === 'academic' ? 'active' : ''}`}><GraduationCap size={14} /></button>
            <button onClick={() => setPdfTemplate('executive')} className={`template-btn ${pdfTemplate === 'executive' ? 'active' : ''}`}><Briefcase size={14} /></button>
          </div>
          <button onClick={toggleTheme} className="theme-toggle no-print" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={() => setShowConsole(c => !c)} className={`btn btn-ghost no-print ${showConsole ? 'active' : ''}`} title="API Console">
            <Terminal size={15} />
          </button>
          <button onClick={() => { setApiKeyDraft(googleApiKey); setShowSettings(true); }} className="btn btn-ghost no-print" title="Settings">
            <Settings size={15} />
          </button>
          <button onClick={handleExportPdf} disabled={exporting} className="btn btn-primary">
            <Download size={15} /> {exporting ? 'Generating...' : 'PDF'}
          </button>
        </div>
      </header>

      <main className="app-main">
        <aside className="source-sidebar no-print">
          <div className="sidebar-header">
            <span>SOURCES ({sources.length})</span>
            <button onClick={handleAddSource} className="add-source-btn">
              <Plus size={14} />
            </button>
          </div>
          <div className="sources-list">
            {sources.map(s => (
              <div
                key={s.id}
                className={`source-card ${s.id === activeSourceId ? 'active' : ''}`}
                onClick={() => setActiveSourceId(s.id)}
              >
                <div className="source-info">
                  <input
                    className="source-title-input"
                    value={s.title}
                    onChange={(e) => handleUpdateTitle(s.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button onClick={(e) => handleDeleteSource(s.id, e)} className="delete-btn">
                    <Trash size={12} />
                  </button>
                </div>
                <div className="source-meta">
                  {s.content.length} chars
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="panel panel-left">
          <div className="panel-header">
            <span className="panel-title">EDITOR: {activeSource.title}</span>
          </div>
          <LLMSelector
            detected={activeLLMDetection.llm}
            selected={selectedLLM}
            confidence={activeLLMDetection.confidence}
            onSelect={setLlmOverride}
          />
          <textarea
            className="raw-input"
            value={activeSource.content}
            onChange={e => handleUpdateSourceContent(e.target.value)}
            placeholder="Paste log here..."
            spellCheck={false}
          />
        </section>

        <section className="panel panel-right">
          <div className="panel-header">
            <span className="panel-title">PREVIEW</span>
          </div>
          <div className="preview-scroll" ref={scrollRef}>
            <div className={`preview-page theme-${pdfTemplate}`} ref={previewRef}>
              <PdfPrintHeader llm={selectedLLM} />
              <div className="pdf-toc-container">
                <TableOfContents turns={currentTurns} isPdfMode={true} />
              </div>

              {isClassifying && (
                <div className="classifying-banner no-print">
                  <Zap size={14} className="animate-pulse" />
                  <span>Gemini API でUser/AIを判定中...</span>
                </div>
              )}

              {apiError && !isClassifying && (() => {
                const errType = apiError.includes('429') || apiError.includes('レート制限')
                  ? 'rate-limit'
                  : apiError.includes('401') || apiError.includes('403') || apiError.includes('認証')
                  ? 'auth'
                  : apiError.includes('ネットワーク') || apiError.includes('接続')
                  ? 'network'
                  : apiError.includes('APIキーが設定') || apiError.includes('設定されていません')
                  ? 'no-key'
                  : 'generic';
                const labels: Record<string, { title: string; cls: string }> = {
                  'rate-limit': { title: 'レート制限', cls: 'api-error-banner--rate-limit' },
                  'auth':       { title: '認証エラー', cls: 'api-error-banner--auth' },
                  'network':    { title: 'ネットワークエラー', cls: 'api-error-banner--network' },
                  'no-key':     { title: 'APIキー未設定', cls: 'api-error-banner--no-key' },
                  'generic':    { title: 'AI分割エラー', cls: '' },
                };
                const { title, cls } = labels[errType];
                return (
                  <div className={`api-error-banner ${cls} no-print`}>
                    <span className="api-error-icon">!</span>
                    <div className="api-error-body">
                      <strong>{title}</strong>
                      <span>{apiError}</span>
                    </div>
                    <button className="api-error-dismiss" onClick={() => setApiError(null)}>
                      <X size={14} />
                    </button>
                  </div>
                );
              })()}

              {!isClassifying && !apiError && splitMethod === 'gemini-api' && (
                <div className="ai-success-banner no-print">
                  <Zap size={14} />
                  <span>Gemini API でUser/AIを自動分割しました</span>
                </div>
              )}

              {currentTurns.length > 0 ? (
                <div className="messages-list">
                  {currentTurns.map(turn => (
                    <TurnBlock key={turn.index} turn={turn} forceExpand={isPdfExporting} />
                  ))}
                </div>
              ) : !isClassifying && sourceContents.trim() ? (
                <div className="messages-list">
                  <div className="empty-state no-print">
                    テキストを左に貼り付けてください。
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      {parseErrorToast && <div className="toast-error no-print">⚠ Error</div>}

      {showConsole && (
        <div className="api-console no-print">
          <div className="api-console-header">
            <Terminal size={14} />
            <span>API Console</span>
            <button onClick={() => setApiLogs([])} className="api-console-clear">Clear</button>
            <button onClick={() => setShowConsole(false)} className="api-console-close"><X size={14} /></button>
          </div>
          <div className="api-console-body" ref={logScrollRef}>
            {apiLogs.length === 0 && (
              <div className="api-console-empty">No API activity yet. Paste non-Gemini text to trigger.</div>
            )}
            {apiLogs.map((log, i) => (
              <div key={i} className={`api-console-line api-console-${log.level}`}>
                <span className="api-console-time">{log.time}</span>
                <span className="api-console-msg">{log.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-overlay no-print" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>System Settings</h3>
              <button className="btn-close" onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            <div className="settings-body">
              <div className="setting-group">
                <label>Google AI API Key (Gemini)</label>
                <div className="api-key-input-wrapper">
                  <input
                    type="password"
                    value={apiKeyDraft}
                    onChange={(e) => setApiKeyDraft(e.target.value)}
                    onBlur={() => commitApiKey(apiKeyDraft)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitApiKey(apiKeyDraft); }}
                    placeholder="AIza..."
                  />
                  <div className="api-badge google-badge">gemini-2.5-flash</div>
                </div>
                <p className="setting-hint">
                  ChatGPT/Claude等のチャットログを正確にUser/AIに分割するために必須です。
                  キーは <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{color: 'var(--color-primary-500)'}}>Google AI Studio</a> で無料で発行できます。
                </p>
                {hasApiKey() && (
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px'}}>
                    <button
                      className="btn btn-ghost"
                      style={{fontSize: '0.75rem', padding: '4px 12px'}}
                      disabled={apiTestResult === 'testing'}
                      onClick={async () => {
                        setApiTestResult('testing');
                        try {
                          const result = await splitChatWithGemini('User: Hello\nAI: Hi there!');
                          setApiTestResult(result && result.length > 0 ? 'ok' : 'fail');
                        } catch {
                          setApiTestResult('fail');
                        }
                      }}
                    >
                      {apiTestResult === 'testing' ? 'Testing...' : 'Test API Key'}
                    </button>
                    {apiTestResult === 'ok' && <span style={{color: '#16a34a', fontSize: '0.75rem', fontWeight: 600}}>API OK</span>}
                    {apiTestResult === 'fail' && <span style={{color: '#dc2626', fontSize: '0.75rem', fontWeight: 600}}>{getLastApiError()?.message || 'Failed'}</span>}
                  </div>
                )}
                {apiError && (
                  <p className="setting-hint" style={{color: '#dc2626', fontWeight: 600}}>{apiError}</p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => { commitApiKey(apiKeyDraft); setShowSettings(false); }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
