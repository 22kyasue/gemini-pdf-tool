import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect, useDeferredValue } from 'react';
import {
  FileText, Download, User, Table, Zap,
  GraduationCap,
  Layout, Plus, Trash, Settings, X,
  Sun, Moon, Terminal, Check, FileQuestion,
  Sparkles, Upload, FileDown, Edit3, Eye,
  BookOpen, RefreshCcw, ChevronDown, LogIn, LogOut, Crown, Loader, Key, Link2
} from 'lucide-react';
import { splitChatWithGemini, enhanceContentWithGemini, generateChatTitle, hasApiKey, hasOwnApiKey, getLastApiError, clearLastApiError } from './utils/llmParser';
import { toast } from './hooks/useToast';
import { ToastContainer } from './components/ToastContainer';
import type { TokenUsage, ApiFeature } from './utils/llmParser';

// -- Types --
import type { Turn, LLMName, EnhanceMessage } from './types';

interface Source {
  id: string;
  title: string;
  content: string;
  llm: LLMName;
  apiSplitTurns?: Turn[];
  apiSplitRawText?: string;
  apiSplitTokens?: TokenUsage;
  enhanceHistory?: EnhanceMessage[];
  enhanceCount?: number;
}

// -- Utils --
import { parseChatLog } from './utils/chatParser';
import { exportToPdf } from './utils/pdfExport';

// -- Components --
import { TurnBlock } from './components/TurnBlock';
import { TableOfContents } from './components/TableOfContents';
import { LLMSelector } from './components/LLMSelector';
import type { SimpleLLM } from './components/LLMSelector';
import { PdfPrintHeader } from './components/PdfPrintHeader';
import { _onRenderError } from './components/ErrorBoundary';
import { useTranslation } from './hooks/useTranslation';
import { useAuth } from './hooks/useAuth';
import { useUsage, FREE_CALL_LIMIT, FREE_WORD_LIMIT, ANON_CALL_LIMIT, ANON_WORD_LIMIT } from './hooks/useUsage';
import { AuthModal } from './components/AuthModal';
import { UpgradeModal } from './components/UpgradeModal';
import { SignInPromptModal } from './components/SignInPromptModal';
import { EnhanceThread } from './components/EnhanceThread';
import { ShareLinkBar } from './components/ShareLinkBar';
import { ConvertPage } from './components/ConvertPage';
import { looksLikeShareUrl } from './utils/shareImport';
import { exportSharePdf } from './utils/exportSharePdf';

// -- Markdown export utility --
function generateMarkdown(turns: Turn[], llm: string): string {
  const lines: string[] = [`# ${llm} Dialogue Archive\n`, `Exported: ${new Date().toLocaleString('en-US')}\n`, '---\n'];
  for (const turn of turns) {
    lines.push(turn.role === 'user' ? '## User\n' : `## ${turn.llmLabel || 'AI'}\n`);
    lines.push(turn.content + '\n');
    lines.push('---\n');
  }
  return lines.join('\n');
}

// -- localStorage keys --
const LS_SOURCES = 'draft_sources';
const LS_ACTIVE = 'draft_activeSourceId';
const LS_TEMPLATE = 'draft_pdfTemplate';

// One-time cleanup: remove the old revoked API key from localStorage
const OLD_REVOKED_KEY = 'AIzaSyBIOqIAjDuOJ-2pyJ2T6KDsmB7xCx13EhE';
if (localStorage.getItem('googleApiKey') === OLD_REVOKED_KEY) {
  localStorage.removeItem('googleApiKey');
}

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

// Simple hash-based route helper
function getRoute(): 'editor' | 'convert' {
  const hash = window.location.hash.replace('#', '').replace(/^\//, '');
  return hash === 'convert' ? 'convert' : 'editor';
}

export default function App() {
  const { lang, toggleLang, t } = useTranslation();
  const [route, setRoute] = useState<'editor' | 'convert'>(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateTo = useCallback((target: 'editor' | 'convert') => {
    window.location.hash = target === 'convert' ? '#/convert' : '#/';
  }, []);

  // -- Auth & Usage --
  const { user, isAnonymous, signInWithGoogle, signInWithEmail, signUp, signOut } = useAuth();
  const { plan, callsUsed, wordsUsed, isOverLimit, daysUntilReset, refresh: refreshUsage } = useUsage(user, isAnonymous);

  // hasApiAccess: true if user has own key OR is signed in
  const hasApiAccess = hasApiKey() || !!user;

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState<false | 'limit' | 'voluntary'>(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [showProSwitchConfirm, setShowProSwitchConfirm] = useState(false);
  const [showShareBar, setShowShareBar] = useState(false);
  const [shareBarInitialUrl, setShareBarInitialUrl] = useState('');
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  // Show upgrade modal immediately if limit is reached and no own key
  useEffect(() => {
    if (isOverLimit && !hasOwnApiKey() && user) {
      // Don't auto-show; let the user trigger it by attempting an action
    }
  }, [isOverLimit, user]);

  const [sources, setSources] = useState<Source[]>(() => {
    try {
      const saved = localStorage.getItem(LS_SOURCES);
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) return parsed; }
    } catch { /* ignore parse errors */ }
    return [{ id: 'initial', title: 'Main Session', content: SAMPLE, llm: 'Gemini' }];
  });
  const [activeSourceId, setActiveSourceId] = useState<string>(() => {
    return localStorage.getItem(LS_ACTIVE) || sources[0]?.id || 'initial';
  });
  const [pdfTemplate, setPdfTemplate] = useState<'professional' | 'academic' | 'cyber'>(() => {
    const saved = localStorage.getItem(LS_TEMPLATE);
    if (saved === 'professional' || saved === 'academic' || saved === 'cyber') return saved;
    return 'professional';
  });

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'account' | 'apikey'>('account');
  const settingsBodyRef = useRef<HTMLDivElement>(null);
  const settingsAccountRef = useRef<HTMLDivElement>(null);
  const settingsApikeyRef = useRef<HTMLDivElement>(null);

  // Capture body height BEFORE React re-renders (in the click handler)
  const settingsFromH = useRef(0);
  const switchSettingsTab = useCallback((tab: 'account' | 'apikey') => {
    if (settingsBodyRef.current) {
      settingsFromH.current = settingsBodyRef.current.offsetHeight;
    }
    setSettingsTab(tab);
  }, []);

  // Animate height after React commits the new DOM
  useLayoutEffect(() => {
    const body = settingsBodyRef.current;
    const fromH = settingsFromH.current;
    if (!body || !fromH) return;
    // body.scrollHeight is now the natural height with the new active panel
    const targetH = body.scrollHeight;
    if (fromH === targetH) { settingsFromH.current = 0; return; }
    // Freeze at old height
    body.style.transition = 'none';
    body.style.height = fromH + 'px';
    body.style.overflow = 'hidden';
    settingsFromH.current = 0;
    // Double-rAF: first commits the frozen frame, second starts the animation
    requestAnimationFrame(() => requestAnimationFrame(() => {
      body.style.transition = 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
      body.style.height = targetH + 'px';
    }));
    const timer = setTimeout(() => {
      body.style.height = '';
      body.style.transition = '';
      body.style.overflow = '';
    }, 370);
    return () => clearTimeout(timer);
  }, [settingsTab]);

  const closeSettings = useCallback(() => {
    setSettingsClosing(true);
    setTimeout(() => { setShowSettings(false); setSettingsClosing(false); }, 200);
  }, []);
  const [showConsole, setShowConsole] = useState(false);
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem('googleApiKey') || '');
  const [apiTestResult, setApiTestResult] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

  // -- API Processing Options --
  const [apiFeatures, setApiFeatures] = useState<Set<ApiFeature>>(() => {
    const saved = localStorage.getItem('apiFeatures');
    if (saved) try { return new Set(JSON.parse(saved)); } catch { /* ignore parse errors */ }
    return new Set<ApiFeature>(['split', 'format', 'tables', 'code']);
  });

  const toggleFeature = (f: ApiFeature) => {
    setApiFeatures(prev => {
      const next = new Set(prev);
      if (f === 'split') return next; // split is always on
      if (next.has(f)) next.delete(f); else next.add(f);
      localStorage.setItem('apiFeatures', JSON.stringify([...next]));
      return next;
    });
  };

  // -- API Console Logs --
  interface LogEntry { time: string; level: 'info' | 'warn' | 'error' | 'success'; msg: string; }
  const [apiLogs, setApiLogs] = useState<LogEntry[]>([]);
  const logScrollRef = useRef<HTMLDivElement>(null);

  // Store original console refs once at module-level to prevent StrictMode double-wrap
  const origConsole = useRef({ log: console.log, warn: console.warn, error: console.error });
  useEffect(() => {
    const orig = origConsole.current;
    const ts = () => new Date().toLocaleTimeString('ja-JP', { hour12: false });

    const push = (level: LogEntry['level'], args: unknown[]) => {
      const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      if (!text.includes('[Flow]') && !text.includes('[Gemini]')) return;
      const finalLevel = text.includes('SUCCESS') ? 'success' : level;
      setApiLogs(prev => [...prev.slice(-99), { time: ts(), level: finalLevel, msg: text }]);
    };

    console.log = (...args: unknown[]) => { push('info', args); orig.log.apply(console, args); };
    console.warn = (...args: unknown[]) => { push('warn', args); orig.warn.apply(console, args); };
    console.error = (...args: unknown[]) => { push('error', args); orig.error.apply(console, args); };

    return () => { console.log = orig.log; console.warn = orig.warn; console.error = orig.error; };
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

  // -- Avatar dropdown: close on outside click --
  useEffect(() => {
    if (!showAvatarMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setShowAvatarMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAvatarMenu]);

  // -- Auto-save drafts --
  useEffect(() => {
    localStorage.setItem(LS_SOURCES, JSON.stringify(sources));
  }, [sources]);
  useEffect(() => {
    localStorage.setItem(LS_ACTIVE, activeSourceId);
  }, [activeSourceId]);
  useEffect(() => {
    localStorage.setItem(LS_TEMPLATE, pdfTemplate);
  }, [pdfTemplate]);

  // -- Drag-and-drop file support --
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md'))) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setSources(prev => prev.map(s => s.id === activeSourceId ? { ...s, content: text } : s));
        toast('success', `File loaded: ${file.name}`);
      };
      reader.readAsText(file);
    }
  }, [activeSourceId]);

  // -- Keyboard shortcuts (use ref to avoid stale closure) --
  const exportPdfRef = useRef<() => void>(() => { });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'p') { e.preventDefault(); exportPdfRef.current(); }
      if (ctrl && e.key === ',') { e.preventDefault(); setShowSettings(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Separate draft (live typing) from committed key (saved on blur/Done)
  const [apiKeyDraft, setApiKeyDraft] = useState(googleApiKey);

  const commitApiKey = (val: string) => {
    const trimmed = val.trim();
    setGoogleApiKey(trimmed);
    localStorage.setItem('googleApiKey', trimmed);
    clearLastApiError();
    setApiError(null);
  };

  const activeSource = sources.find(s => s.id === activeSourceId) || sources[0];

  const INPUT_CHAR_LIMIT = 500_000;

  const handleUpdateSourceContent = (val: string) => {
    if (val.length > INPUT_CHAR_LIMIT) {
      toast('info', `Input truncated to ${(INPUT_CHAR_LIMIT / 1000).toFixed(0)}K characters to prevent performance issues.`);
      const truncated = val.slice(0, INPUT_CHAR_LIMIT);
      setSources(prev => prev.map(s => s.id === activeSourceId ? { ...s, content: truncated } : s));
      return;
    }
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

  // ── Auto-gen Title ──
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTitlePrefixRef = useRef<Record<string, string>>({});

  useEffect(() => {
    // Need either own key or authenticated user for title generation
    if ((!googleApiKey && !user) || !activeSource.content.trim() || activeSource.content.length < 50) return;

    const currentPrefix = activeSource.content.slice(0, 200).trim();
    const lastPrefix = lastTitlePrefixRef.current[activeSourceId];
    const isDefault = activeSource.title === 'Main Session' || activeSource.title === 'New Source';

    if (!lastPrefix) {
      if (!isDefault) {
        lastTitlePrefixRef.current[activeSourceId] = currentPrefix;
        return;
      }
    } else if (lastPrefix === currentPrefix) {
      return;
    }

    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(() => {
      generateChatTitle(activeSource.content).then(newTitle => {
        if (newTitle && newTitle !== 'Main Session' && newTitle !== 'New Source') {
          lastTitlePrefixRef.current[activeSourceId] = currentPrefix;
          handleUpdateTitle(activeSourceId, newTitle);
        }
      });
    }, 1500);

    return () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    };
  }, [activeSource.content, activeSource.title, activeSourceId, googleApiKey, user]);

  const showParseError = useCallback(() => {
    toast('error', 'Render error detected');
  }, []);

  const previewRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  _onRenderError.current = showParseError;

  const deferredSources = useDeferredValue(sources);
  const sourceContents = useMemo(() => deferredSources.map(s => s.content).join('\n---\n'), [deferredSources]);

  // ── Direct marker detection ──
  const hasDirectMarkers = useMemo(() => {
    if (/あなたのプロンプト|Gemini の回答|Gemini の返答/.test(sourceContents)) return true;
    if (/^あなた[:：]\s*/m.test(sourceContents) && /^ChatGPT[:：]\s*/mi.test(sourceContents)) return true;
    if (/^あなた[:：]\s*/m.test(sourceContents) && /^Claude[:：]\s*/mi.test(sourceContents)) return true;
    if (/^You said:?\s*$/mi.test(sourceContents) && /^(ChatGPT|Claude|Gemini) said:?\s*$/mi.test(sourceContents)) return true;
    return false;
  }, [sourceContents]);

  // ── Legacy parser: always runs for all text ──
  const parsed = useMemo(
    () => activeSource.content.trim() ? parseChatLog(activeSource.content) : { turns: [], llm: 'AI' as LLMName },
    [activeSource.content]
  );

  const [isClassifying, setIsClassifying] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [splitInstructions, setSplitInstructions] = useState('');
  const apiRequestIdRef = useRef(0);

  // Clear errors when changing tabs or keys
  useEffect(() => {
    setApiError(null);
  }, [activeSourceId, googleApiKey]);

  const WORD_LIMIT_FOR_API = 20_000;

  const triggerApiSplit = useCallback((sourceId: string, rawText: string, strInstructions?: string) => {
    if (!hasApiAccess || !rawText.trim()) return;

    // Client-side paywall check (no own key + free limit reached)
    if (!hasOwnApiKey() && isOverLimit) {
      if (isAnonymous) {
        setShowSignInPrompt(true);
      } else {
        setShowUpgradeModal('limit');
      }
      return;
    }

    const wordCount = rawText.split(/\s+/).length;
    if (wordCount > WORD_LIMIT_FOR_API) {
      console.log(`[Flow] Large document (${wordCount} words > ${WORD_LIMIT_FOR_API}) → skipping API`);
      return;
    }

    console.log(`[Flow] Triggering API split for source ${sourceId}...`);
    const requestId = ++apiRequestIdRef.current;
    setIsClassifying(true);
    setApiError(null);

    splitChatWithGemini(rawText, apiFeatures, strInstructions, wordCount).then(result => {
      if (requestId !== apiRequestIdRef.current) return;
      if (result && result.messages.length > 0) {
        const converted: Turn[] = result.messages.map((msg, i) => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          llmLabel: msg.role === 'user' ? 'USER' : 'AI',
          content: msg.content,
          rawContent: msg.content,
          index: i,
          summary: msg.role === 'user' ? `Q${i + 1}. ${msg.content.split('\n')[0]?.trim().slice(0, 24) || ''}` : '',
          hasTable: /\|.*\|/.test(msg.content),
          keyPoints: [],
        }));

        setSources(prev => prev.map(s => s.id === sourceId ? {
          ...s,
          apiSplitTurns: converted,
          apiSplitRawText: rawText,
          apiSplitTokens: result.tokens
        } : s));
        setApiError(null);
        if (!hasOwnApiKey()) refreshUsage();
      } else {
        const err = getLastApiError();
        if (err) {
          setApiError(err.message);
          if (err.message.startsWith('ANON_LIMIT_EXCEEDED:')) {
            setShowSignInPrompt(true);
            refreshUsage();
          } else if (err.message.startsWith('LIMIT_EXCEEDED:')) {
            setShowUpgradeModal('limit');
            refreshUsage();
          }
        }
      }
    }).catch(err => {
      if (requestId !== apiRequestIdRef.current) return;
      console.error('[Flow] API split failed:', err);
      setApiError(`Split error: ${err.message}`);
    }).finally(() => {
      if (requestId === apiRequestIdRef.current) setIsClassifying(false);
    });
  }, [apiFeatures, hasApiAccess, isOverLimit, isAnonymous, refreshUsage]);

  // Handle Automatic logic
  const [isAutoSplitPending, setIsAutoSplitPending] = useState(false);
  useEffect(() => {
    if (hasDirectMarkers || !hasApiAccess || !activeSource.content.trim()) {
      setIsAutoSplitPending(false);
      return;
    }

    if (activeSource.content.length === 0) {
      setIsAutoSplitPending(false);
      if (activeSource.apiSplitTurns) {
        setSources(prev => prev.map(s => s.id === activeSourceId ? { ...s, apiSplitTurns: undefined, apiSplitRawText: undefined } : s));
      }
      return;
    }

    if (!activeSource.apiSplitRawText || !activeSource.apiSplitTurns) {
      setIsAutoSplitPending(true);
      const timer = setTimeout(() => { setIsAutoSplitPending(false); triggerApiSplit(activeSourceId, activeSource.content); }, 500);
      return () => { clearTimeout(timer); setIsAutoSplitPending(false); };
    }

    const oldLen = activeSource.apiSplitRawText.length;
    const newLen = activeSource.content.length;
    const diff = Math.abs(newLen - oldLen) / Math.max(oldLen, 1);

    if (diff >= 0.3) {
      setIsAutoSplitPending(true);
      console.log(`[Flow] Text changed by ${Math.round(diff * 100)}% -> Auto-refreshing API split`);
      const timer = setTimeout(() => { setIsAutoSplitPending(false); triggerApiSplit(activeSourceId, activeSource.content); }, 800);
      return () => { clearTimeout(timer); setIsAutoSplitPending(false); };
    }
  }, [activeSource.content, activeSourceId, hasDirectMarkers, hasApiAccess, googleApiKey, user, triggerApiSplit]);

  const overrideTurns = activeSource.apiSplitTurns || null;
  const tokenUsage = activeSource.apiSplitTokens || null;
  const splitMethod = hasDirectMarkers ? 'regex' : (overrideTurns ? 'gemini-api' : 'none');

  // ── Gemini-marker chats: user-triggered enhance for code/latex ──
  const enhanceCancelledRef = useRef(false);

  const hasAnyEnhanceFeature = apiFeatures.has('format') || apiFeatures.has('tables') || apiFeatures.has('code') || apiFeatures.has('latex');

  const handleEnhanceGemini = useCallback(async (instruction?: string) => {
    if (!hasDirectMarkers || parsed.turns.length === 0) return;

    // Client-side paywall check
    if (!hasOwnApiKey() && isOverLimit) {
      if (isAnonymous) {
        setShowSignInPrompt(true);
      } else {
        setShowUpgradeModal('limit');
      }
      return;
    }

    // Push user message to enhance history
    const userMsg: EnhanceMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      text: instruction || t.initialEnhancement,
      timestamp: Date.now(),
    };
    setSources(prev => prev.map(s => s.id === activeSourceId ? {
      ...s,
      enhanceHistory: [...(s.enhanceHistory ?? []), userMsg],
    } : s));

    enhanceCancelledRef.current = false;
    setIsClassifying(true);
    setApiError(null);

    // Use already-enhanced turns if available, otherwise original parsed turns
    const baseTurns = overrideTurns ?? parsed.turns;
    console.log(`[Flow] User triggered enhancement for ${baseTurns.length} turns...`);

    try {
      const assistantTurns = baseTurns.filter(t => t.role === 'assistant');
      if (assistantTurns.length === 0) {
        setIsClassifying(false);
        return;
      }

      let totalTokens: TokenUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0 };
      const enhancedMap = new Map<number, string>();
      let hitLimit = false;

      for (const turn of assistantTurns) {
        if (enhanceCancelledRef.current) {
          console.log('[Flow] Enhancement cancelled by user');
          break;
        }
        console.log(`[Flow] Enhancing turn ${turn.index} (${turn.content.length} chars)...`);
        const wc = turn.content.split(/\s+/).length;
        const result = await enhanceContentWithGemini(turn.content, apiFeatures, instruction, wc);
        if (result) {
          enhancedMap.set(turn.index, result.text);
          totalTokens = {
            promptTokens: totalTokens.promptTokens + result.tokens.promptTokens,
            responseTokens: totalTokens.responseTokens + result.tokens.responseTokens,
            totalTokens: totalTokens.totalTokens + result.tokens.totalTokens,
          };
        } else {
          // Check if we hit the limit mid-loop
          const err = getLastApiError();
          if (err?.message.startsWith('ANON_LIMIT_EXCEEDED:')) {
            hitLimit = true;
            setShowSignInPrompt(true);
            refreshUsage();
            break;
          } else if (err?.message.startsWith('LIMIT_EXCEEDED:')) {
            hitLimit = true;
            setShowUpgradeModal('limit');
            refreshUsage();
            break;
          }
        }
      }

      if (enhancedMap.size > 0) {
        const enhanced: Turn[] = baseTurns.map(t => {
          const newContent = enhancedMap.get(t.index);
          if (newContent) {
            return { ...t, content: newContent, hasTable: /\|.*\|/.test(newContent) };
          }
          return t;
        });
        const featureList = [...apiFeatures].filter(f => f !== 'split');
        const label = enhanceCancelledRef.current
          ? `Partially enhanced ${enhancedMap.size}/${assistantTurns.length} turn${assistantTurns.length !== 1 ? 's' : ''} (cancelled)`
          : hitLimit
            ? `Enhanced ${enhancedMap.size}/${assistantTurns.length} turn${assistantTurns.length !== 1 ? 's' : ''} (limit reached)`
            : `Enhanced ${enhancedMap.size} assistant turn${enhancedMap.size !== 1 ? 's' : ''}`;
        const systemMsg: EnhanceMessage = {
          id: crypto.randomUUID(),
          type: hitLimit ? 'error' : 'system',
          text: label,
          tokens: totalTokens,
          features: featureList,
          timestamp: Date.now(),
        };
        setSources(prev => prev.map(s => s.id === activeSourceId ? {
          ...s,
          apiSplitTurns: enhanced,
          apiSplitTokens: totalTokens,
          enhanceHistory: [...(s.enhanceHistory ?? []), systemMsg],
          enhanceCount: (s.enhanceCount ?? 0) + 1,
        } : s));
        console.log(`[Gemini] SUCCESS — enhanced ${enhancedMap.size} turns, tokens: ${totalTokens.promptTokens} in + ${totalTokens.responseTokens} out = ${totalTokens.totalTokens} total`);
        if (!hasOwnApiKey()) refreshUsage();
      } else if (enhanceCancelledRef.current) {
        const cancelMsg: EnhanceMessage = {
          id: crypto.randomUUID(), type: 'error',
          text: 'Enhancement cancelled before any turns were processed',
          timestamp: Date.now(),
        };
        setSources(prev => prev.map(s => s.id === activeSourceId ? {
          ...s, enhanceHistory: [...(s.enhanceHistory ?? []), cancelMsg],
        } : s));
      }
    } catch (err) {
      console.error('[Flow] Enhancement failed:', err);
      const apiErr = getLastApiError();
      const errorMsg: EnhanceMessage = {
        id: crypto.randomUUID(),
        type: 'error',
        text: apiErr?.message || String(err),
        timestamp: Date.now(),
      };
      setSources(prev => prev.map(s => s.id === activeSourceId ? {
        ...s,
        enhanceHistory: [...(s.enhanceHistory ?? []), errorMsg],
      } : s));
    } finally {
      setIsClassifying(false);
    }
  }, [hasDirectMarkers, parsed.turns, overrideTurns, apiFeatures, isOverLimit, isAnonymous, refreshUsage, activeSourceId]);

  const handleManualApiRetry = () => {
    if (hasDirectMarkers) {
      handleEnhanceGemini();
    } else {
      triggerApiSplit(activeSourceId, activeSource.content, splitInstructions);
    }
  };

  const handleCancelEnhance = useCallback(() => {
    enhanceCancelledRef.current = true;
  }, []);

  // Final turns: API override or legacy parser
  const currentTurns = overrideTurns ?? parsed.turns;

  const detectedLLM: SimpleLLM =
    parsed.llm === 'Gemini' ? 'Gemini' :
      parsed.llm === 'ChatGPT' ? 'ChatGPT' :
        parsed.llm === 'Claude' ? 'Claude' : 'Other LLM';
  const selectedLLM = detectedLLM;

  const exportFilename = useMemo(() => {
    const firstQ = currentTurns.find(t => t.role === 'user');
    const snippet = firstQ
      ? firstQ.content.split('\n')[0].trim().replace(/[^\w\s-]/g, '').trim().slice(0, 50).trim()
      : '';
    const date = new Date().toISOString().slice(0, 10);
    const llmTag = selectedLLM === 'Other LLM' ? 'AI' : selectedLLM;
    return snippet ? `${llmTag} - ${snippet} (${date})` : `${llmTag} Chat (${date})`;
  }, [currentTurns, selectedLLM]);

  const handleExportPdf = async () => {
    setExporting(true);
    setIsPdfExporting(true);
    const wordCount = (activeSource.content.match(/\S+/g) || []).length;
    const renderDelay = wordCount > 30000 ? 3000 : wordCount > 15000 ? 2000 : 800;
    await new Promise(r => setTimeout(r, renderDelay));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(undefined))));
    try {
      if (previewRef.current) {
        await exportToPdf(previewRef.current, exportFilename, scrollRef.current);
      }
    } catch (err) {
      console.error('[Flow] PDF export failed:', err);
      toast('error', err instanceof Error ? err.message : 'PDF generation failed');
    } finally {
      setIsPdfExporting(false);
      setExporting(false);
    }
  };
  exportPdfRef.current = handleExportPdf;

  const [isExportingNotebookLM, setIsExportingNotebookLM] = useState(false);
  const handleExportNotebookLM = useCallback(async () => {
    setIsExportingNotebookLM(true);
    try {
      const md = generateMarkdown(currentTurns, selectedLLM);
      await navigator.clipboard.writeText(md);
      window.open('https://notebooklm.google.com/', '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to copy text to NotebookLM context', err);
    } finally {
      setTimeout(() => setIsExportingNotebookLM(false), 2500);
    }
  }, [currentTurns, selectedLLM]);

  const handleExportMarkdown = useCallback(() => {
    const md = generateMarkdown(currentTurns, selectedLLM);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilename}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentTurns, selectedLLM, exportFilename]);

  const handleExportJSON = useCallback(() => {
    const data = currentTurns.map(t => ({ role: t.role, content: t.content, llmLabel: t.llmLabel, summary: t.summary }));
    const json = JSON.stringify({ llm: selectedLLM, exported: new Date().toISOString(), turns: data }, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilename}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentTurns, selectedLLM, exportFilename]);

  const handleExportHTML = useCallback(() => {
    const turnsHtml = currentTurns.map(t => {
      const roleLabel = t.role === 'user' ? 'USER' : (t.llmLabel || 'AI');
      const bg = t.role === 'user' ? '#eef2ff' : '#f8fafc';
      const border = t.role === 'user' ? '#c7d2fe' : '#e2e8f0';
      const escaped = t.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<div style="margin:16px 0;padding:16px;background:${bg};border:1px solid ${border};border-radius:8px"><strong style="color:#6366f1;font-size:0.75rem;letter-spacing:0.1em">${roleLabel}</strong><pre style="white-space:pre-wrap;margin:8px 0 0;font-family:inherit;font-size:0.9rem">${escaped}</pre></div>`;
    }).join('\n');
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${activeSource.title}</title><style>body{font-family:Inter,system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#1e293b}h1{font-size:1.5rem;color:#6366f1}p.meta{color:#64748b;font-size:0.8rem}</style></head><body><h1>${selectedLLM} Dialogue Archive</h1><p class="meta">Exported: ${new Date().toLocaleString('en-US')}</p><hr>${turnsHtml}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilename}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentTurns, selectedLLM, exportFilename, activeSource.title]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setSources(prev => prev.map(s => s.id === activeSourceId ? { ...s, content: text } : s));
      toast('success', `File loaded: ${file.name}`);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [activeSourceId]);

  // Handle checkout redirect result — retry because the Stripe webhook
  // may not have updated the profile by the time the user is redirected back.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;
    window.history.replaceState({}, '', window.location.pathname);

    let attempts = 0;
    const poll = async () => {
      const currentPlan = await refreshUsage();
      attempts++;
      if (currentPlan === 'pro' || attempts >= 15) return;
      setTimeout(poll, 2000);
    };
    poll();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Convert Page Route ──
  if (route === 'convert') {
    return (
      <>
        <ConvertPage
          t={t}
          lang={lang}
          toggleLang={toggleLang}
          user={user}
          isAnonymous={isAnonymous}
          plan={plan}
          onSignIn={() => setShowAuthModal(true)}
          onSignOut={signOut}
          onNavigateEditor={(title, content, llm) => {
            if (title && content) {
              setSources(prev => prev.map(s => s.id === activeSourceId ? {
                ...s, title, content,
                llm: (llm || 'AI') as import('./types').LLMName,
                apiSplitTurns: undefined,
                apiSplitRawText: undefined,
                enhanceHistory: undefined,
                enhanceCount: undefined,
              } : s));
            }
            navigateTo('editor');
          }}
        />
        <ToastContainer />
        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onGoogleSignIn={signInWithGoogle}
            onEmailSignIn={signInWithEmail}
            onEmailSignUp={signUp}
            t={t}
          />
        )}
      </>
    );
  }

  return (
    <div
      className="app-container"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <header className="app-header">
        <div className="brand">
          <div className="brand-logo"><FileText size={20} /></div>
          <div className="brand-text">{t.appTitle}{plan === 'pro' && <span className="beta-tag">PRO</span>}</div>
        </div>

        <div className="header-actions">
          {/* Convert page link */}
          <div className="header-group">
            <button onClick={() => navigateTo('convert')} className="btn btn-ghost no-print" style={{ fontSize: '0.8rem', gap: 5, fontWeight: 600 }} data-tooltip={t.convertToPdf || 'Convert to PDF'}>
              <Link2 size={14} /> <span className="desktop-only">{t.convertToPdf || 'Convert'}</span>
            </button>
          </div>
          {/* Group 1: Login/avatar + Settings */}
          <div className="header-group">
            {user && !isAnonymous ? (
              <div className="avatar-menu-wrapper" ref={avatarMenuRef}>
                <button
                  className={`user-avatar no-print${plan === 'pro' ? ' user-avatar--pro' : ''}`}
                  onClick={() => setShowAvatarMenu(v => !v)}
                  aria-label="Account menu"
                  aria-expanded={showAvatarMenu}
                >
                  {user.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="" className="user-avatar-img" referrerPolicy="no-referrer" />
                  ) : (
                    (user.email?.[0] ?? 'U').toUpperCase()
                  )}
                  {plan === 'pro' && <span className="user-avatar-pro-badge"><Crown size={8} /></span>}
                </button>
                {showAvatarMenu && (
                  <div className="avatar-dropdown">
                    <div className="avatar-dropdown-header">
                      <div className="avatar-dropdown-photo">
                        {user.user_metadata?.avatar_url ? (
                          <img src={user.user_metadata.avatar_url} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <span>{(user.email?.[0] ?? 'U').toUpperCase()}</span>
                        )}
                      </div>
                      <div>
                        <div className="avatar-dropdown-email">{user.user_metadata?.full_name || user.email}</div>
                        <div className="avatar-dropdown-plan">
                          {plan === 'pro'
                            ? <><Crown size={12} style={{ color: '#f59e0b' }} /> {t.proPlan}</>
                            : <>{t.freePlan}</>
                          }
                        </div>
                      </div>
                    </div>
                    <hr className="avatar-dropdown-divider" />
                    <button className="avatar-dropdown-item" onClick={() => { setShowAvatarMenu(false); setApiKeyDraft(googleApiKey); setSettingsTab('account'); setShowSettings(true); }}>
                      <Settings size={13} /> {t.settingsTitle.replace(/ v[\d.]+/, '')}
                    </button>
                    <button className="avatar-dropdown-item avatar-dropdown-signout" onClick={() => { setShowAvatarMenu(false); signOut(); }}>
                      <LogOut size={13} /> {t.signOut}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="btn btn-ghost no-print"
                style={{ fontSize: '0.8rem', gap: 5, fontWeight: 600 }}
                onClick={() => setShowAuthModal(true)}
                aria-label="Sign in"
              >
                <LogIn size={14} /> {t.signIn}
              </button>
            )}
            <button onClick={() => { setApiKeyDraft(googleApiKey); setSettingsTab('account'); setShowSettings(true); }} className={`btn btn-ghost no-print relative ${!hasApiAccess ? 'btn-attention' : ''}`} data-tooltip={t.settingsTooltip} aria-label="Open settings">
              <Settings size={15} />
              {!hasApiAccess && <span className="attention-dot" />}
            </button>
          </div>

          {/* Group 2: Split badge + Templates */}
          <div className="header-group desktop-only">
            <div className={`split-method-badge no-print ${splitMethod !== 'none' ? 'active' : ''}`}>
              {splitMethod === 'regex' && t.regexMode}
              {splitMethod === 'gemini-api' && t.geminiApiMode}
              {splitMethod === 'none' && (hasApiAccess ? t.readyMode : t.noApiKeyMode)}
            </div>
            <div className="template-selector no-print">
              <button onClick={() => setPdfTemplate('professional')} className={`template-btn ${pdfTemplate === 'professional' ? 'active' : ''}`} data-tooltip={t.proTemplate} aria-label="Professional template"><Layout size={14} /></button>
              <button onClick={() => setPdfTemplate('academic')} className={`template-btn ${pdfTemplate === 'academic' ? 'active' : ''}`} data-tooltip={t.academicTemplate} aria-label="Academic template"><GraduationCap size={14} /></button>
              <button onClick={() => setPdfTemplate('cyber')} className={`template-btn ${pdfTemplate === 'cyber' ? 'active' : ''}`} data-tooltip={t.cyberTemplate} aria-label="Cyber template"><Zap size={14} /></button>
            </div>
          </div>

          {/* Group 3: Lang/theme toggles */}
          <div className="header-group">
            <button onClick={toggleLang} className="theme-toggle no-print" data-tooltip={lang === 'en' ? t.switchToJapanese : t.switchToEnglish}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{lang === 'en' ? 'JP' : 'EN'}</span>
            </button>
            <button onClick={toggleTheme} className="theme-toggle no-print" data-tooltip={theme === 'dark' ? t.switchToLightMode : t.switchToDarkMode} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={() => setShowConsole(c => !c)} className={`btn btn-ghost no-print desktop-only ${showConsole ? 'active' : ''}`} data-tooltip={t.apiConsole} aria-label="Toggle API console">
              <Terminal size={15} />
            </button>
          </div>

          {/* Group 4: Export actions */}
          <div className="header-group">
            <div className="export-dropdown no-print desktop-only">
              <button className="btn btn-ghost" data-tooltip="Export Options" aria-label="Export Menu">
                <Download size={15} /> <ChevronDown size={12} style={{ marginLeft: 2, marginRight: -2, opacity: 0.6 }} />
              </button>
              <div className="export-menu">
                <button onClick={handleExportMarkdown} className="btn btn-ghost" aria-label="Export as Markdown">
                  <FileDown size={14} /> Markdown
                </button>
                <button onClick={handleExportJSON} className="btn btn-ghost" aria-label="Export as JSON">
                  <FileText size={14} /> JSON
                </button>
                <button onClick={handleExportHTML} className="btn btn-ghost" aria-label="Export as HTML">
                  <Layout size={14} /> HTML
                </button>
              </div>
            </div>
            <button onClick={handleExportNotebookLM} className="btn btn-ghost no-print desktop-only" data-tooltip={t.sendToNotebookLM} aria-label="Upload to NotebookLM">
              {isExportingNotebookLM ? <Check size={15} color="#10b981" /> : <BookOpen size={15} />}
            </button>
            <button onClick={handleExportPdf} disabled={exporting} className="btn btn-primary" data-tooltip={t.exportPdf} aria-label="Export PDF">
              <Download size={15} /> {exporting ? t.generating : 'PDF'}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile tab bar */}
      <div className="mobile-tabs no-print">
        <button className={`mobile-tab ${mobileTab === 'editor' ? 'mobile-tab-active' : ''}`} onClick={() => setMobileTab('editor')}>
          <Edit3 size={14} /> Editor
        </button>
        <button className={`mobile-tab ${mobileTab === 'preview' ? 'mobile-tab-active' : ''}`} onClick={() => setMobileTab('preview')}>
          <Eye size={14} /> Preview
          {currentTurns.length > 0 && <span className="mobile-tab-badge">{currentTurns.length}</span>}
        </button>
      </div>

      <main className="app-main">
        <aside className="source-sidebar no-print mobile-hidden-sidebar">
          <div className="sidebar-header">
            <span>{t.sources} ({sources.length})</span>
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
                  <FileText size={10} /> {s.content.length} chars
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className={`panel panel-left ${mobileTab !== 'editor' ? 'mobile-hidden' : ''}`}>
          <div className="panel-header">
            <span className="panel-title">{t.editor}: {activeSource.title}</span>
            {isAutoSplitPending && <Loader size={14} className="auto-split-pending" />}
            <button className="btn btn-ghost upload-btn no-print" onClick={() => fileInputRef.current?.click()} title="Upload text file" aria-label="Upload text file">
              <Upload size={13} />
            </button>
            <button className={`share-import-btn no-print${showShareBar ? ' active' : ''}`} onClick={() => { setShareBarInitialUrl(''); setShowShareBar(v => !v); }} title={t.shareImport} aria-label={t.shareImport}>
              <Link2 size={12} /> <span className="share-import-btn-label">{t.shareImport}</span>
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.text" onChange={handleFileUpload} style={{ display: 'none' }} />
          </div>
          {showShareBar && (
            <ShareLinkBar
              initialUrl={shareBarInitialUrl}
              onImport={(title, text, platform) => {
                const llm = platform === 'ChatGPT' ? 'ChatGPT' : platform === 'Gemini' ? 'Gemini' : 'AI';
                setSources(prev => prev.map(s => s.id === activeSourceId ? {
                  ...s,
                  title,
                  content: text,
                  llm: llm as import('./types').LLMName,
                  apiSplitTurns: undefined,
                  apiSplitRawText: undefined,
                  enhanceHistory: undefined,
                  enhanceCount: undefined,
                } : s));
                setShowShareBar(false);
              }}
              onDirectPdf={async (title, turns, platform, sourceUrl) => {
                setExporting(true);
                toast('info', 'Generating PDF...', 3000);
                try {
                  await exportSharePdf(title, turns, platform, sourceUrl);
                  toast('success', 'PDF downloaded!', 3000);
                } catch (err) {
                  console.error('[SharePDF]', err);
                  toast('error', 'PDF generation failed');
                } finally {
                  setExporting(false);
                }
                setShowShareBar(false);
              }}
              onClose={() => setShowShareBar(false)}
              t={t}
            />
          )}
          <LLMSelector
            detected={detectedLLM}
          />
          <div className="api-features no-print">
            <span className="api-features-label">{t.enhance}</span>
            <button className="api-feature-chip on" disabled title="Always on">
              <Check size={10} strokeWidth={3} /> {t.split}
            </button>

            <button
              className={`api-feature-chip ${apiFeatures.has('format') ? 'on' : 'off'}`}
              onClick={() => toggleFeature('format')}
              title="Restore bold, bullets, headings, numbered lists"
            >
              {apiFeatures.has('format') && <Check size={10} strokeWidth={3} />} {t.formatting}
            </button>
            <button
              className={`api-feature-chip ${apiFeatures.has('tables') ? 'on' : 'off'}`}
              onClick={() => toggleFeature('tables')}
              title="Reconstruct markdown tables from flat text"
            >
              {apiFeatures.has('tables') ? <Check size={10} strokeWidth={3} /> : <Table size={10} />} {t.tables}
            </button>
            <button
              className={`api-feature-chip ${apiFeatures.has('code') ? 'on' : 'off'}`}
              onClick={() => toggleFeature('code')}
              title="Re-fence code blocks with language detection"
            >
              {apiFeatures.has('code') ? <Check size={10} strokeWidth={3} /> : <>{'\u003C\u003E'}</>} {t.code}
            </button>
            <button
              className={`api-feature-chip ${apiFeatures.has('latex') ? 'on' : 'off'}`}
              onClick={() => toggleFeature('latex')}
              title="Restore LaTeX math expressions ($inline$ and $$block$$)"
            >
              {apiFeatures.has('latex') ? <Check size={10} strokeWidth={3} /> : <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontWeight: 700 }}>x</span>} {t.latex}
            </button>

            {/* Usage counter for authenticated free-tier users */}
            {user && !hasOwnApiKey() && plan === 'free' && (
              <div className="usage-counter no-print" style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                fontSize: '0.7rem', color: isOverLimit ? '#dc2626' : 'var(--text-tertiary)',
                fontWeight: isOverLimit ? 700 : 400,
              }}>
                <span>{callsUsed}/{isAnonymous ? ANON_CALL_LIMIT : FREE_CALL_LIMIT} {t.calls}</span>
                {isOverLimit
                  ? isAnonymous
                    ? <button className="btn btn-primary" style={{ fontSize: '0.65rem', padding: '2px 8px', gap: 4 }} onClick={() => setShowAuthModal(true)}>
                      <LogIn size={10} /> {t.signInFree}
                    </button>
                    : <button className="btn btn-primary" style={{ fontSize: '0.65rem', padding: '2px 8px', gap: 4 }} onClick={() => setShowUpgradeModal('voluntary')}>
                      <Crown size={10} /> {t.upgrade}
                    </button>
                  : !isAnonymous && <span style={{ opacity: 0.7 }}>· {(wordsUsed / 1000).toFixed(0)}k/{FREE_WORD_LIMIT / 1000}k {t.words}</span>
                }
              </div>
            )}

            {/* Enhance button for direct-marker chats */}
            {hasDirectMarkers && hasApiAccess && !overrideTurns && !isClassifying && hasAnyEnhanceFeature && (
              <button
                className="enhance-btn no-print"
                onClick={() => handleEnhanceGemini()}
              >
                <Sparkles size={12} /> {t.enhanceBtn}
              </button>
            )}
            {hasDirectMarkers && hasApiAccess && !overrideTurns && !isClassifying && hasAnyEnhanceFeature && (
              <div className="enhance-hint no-print">
                <Sparkles size={10} /> <span dangerouslySetInnerHTML={{ __html: t.enhanceHint }} />
              </div>
            )}

            {/* Sign in prompt for anonymous users without own key */}
            {isAnonymous && !hasOwnApiKey() && (
              <button
                className="btn btn-ghost no-print"
                style={{ marginLeft: 'auto', fontSize: '0.7rem', gap: 4, color: 'var(--color-primary-500)' }}
                onClick={() => setShowAuthModal(true)}
              >
                <LogIn size={11} /> {t.signInForMore}
              </button>
            )}
          </div>
          <textarea
            className="editor-textarea"
            value={activeSource.content}
            onChange={e => handleUpdateSourceContent(e.target.value)}
            onPaste={e => {
              const pasted = e.clipboardData.getData('text');
              if (looksLikeShareUrl(pasted)) {
                e.preventDefault();
                setShareBarInitialUrl(pasted.trim());
                setShowShareBar(true);
              }
            }}
            placeholder={t.pasteLogHere}
            spellCheck={false}
          />
        </section>

        <section className={`panel panel-right ${mobileTab !== 'preview' ? 'mobile-hidden' : ''}`}>
          <div className="panel-header">
            <span className="panel-title">{t.preview}</span>
          </div>
          <div className="preview-scroll" ref={scrollRef}>
            <div className={`preview-page theme-${pdfTemplate}`} ref={previewRef}>
              <PdfPrintHeader llm={selectedLLM} />
              <div className="pdf-toc-container">
                <TableOfContents turns={currentTurns} isPdfMode={true} />
              </div>

              {isClassifying && !(hasDirectMarkers && overrideTurns) && (
                <div className="classifying-banner no-print" role="status" aria-live="polite">
                  <Zap size={14} className="animate-pulse" />
                  <span>{t.processingApi}</span>
                  <button className="cancel-enhance-btn" onClick={handleCancelEnhance}>{t.cancel}</button>
                </div>
              )}

              {apiError && !isClassifying && (() => {
                const errType = apiError.includes('429') || apiError.includes('Rate limit')
                  ? 'rate-limit'
                  : apiError.includes('401') || apiError.includes('403') || apiError.includes('Auth')
                    ? 'auth'
                    : apiError.includes('Network') || apiError.includes('connect')
                      ? 'network'
                      : apiError.includes('No API key') || apiError.includes('configured') || apiError.includes('Sign in')
                        ? 'no-key'
                        : 'generic';
                const labels: Record<string, { title: string; cls: string }> = {
                  'rate-limit': { title: t.rateLimitTitle, cls: 'api-error-banner--rate-limit' },
                  'auth': { title: t.authErrorTitle, cls: 'api-error-banner--auth' },
                  'network': { title: t.networkErrorTitle, cls: 'api-error-banner--network' },
                  'no-key': { title: t.signInRequired, cls: 'api-error-banner--no-key' },
                  'generic': { title: t.apiErrorTitle, cls: '' },
                };
                const { title, cls } = labels[errType];
                return (
                  <div className={`api-error-banner ${cls} no-print`} role="alert">
                    <span className="api-error-icon">!</span>
                    <div className="api-error-body">
                      <strong>{title}</strong>
                      <span>{apiError.replace(/^(ANON_)?LIMIT_EXCEEDED: /, '')}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {!hasApiKey() && !user && (
                        <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '3px 10px' }} onClick={() => setShowAuthModal(true)}>
                          <LogIn size={11} /> {t.signIn}
                        </button>
                      )}
                      {plan === 'pro' && hasOwnApiKey() && (
                        <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '3px 10px' }} onClick={() => setShowProSwitchConfirm(true)}>
                          <Crown size={11} /> {t.proSwitchToServer}
                        </button>
                      )}
                      <button className="api-error-dismiss" onClick={() => setApiError(null)}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {!isClassifying && !apiError && splitMethod === 'gemini-api' && (
                <div className="ai-success-banner no-print" role="status" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Zap size={14} />
                    <span>{t.autoSplitSuccess}</span>
                    {tokenUsage && (
                      <span className="token-usage">
                        ({tokenUsage.promptTokens.toLocaleString()} in + {tokenUsage.responseTokens.toLocaleString()} out = {tokenUsage.totalTokens.toLocaleString()} tokens)
                      </span>
                    )}
                  </div>
                  <div className="sync-retry-row">
                    <input
                      type="text"
                      placeholder={t.whatWasIssue}
                      value={splitInstructions}
                      onChange={e => setSplitInstructions(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleManualApiRetry(); }}
                      className="instruction-input"
                    />
                    <button
                      className="sync-banner-btn"
                      onClick={handleManualApiRetry}
                      title="Force API to re-evaluate the current text and generate a fresh split"
                    >
                      <RefreshCcw size={14} /> {t.syncApi}
                    </button>
                  </div>
                </div>
              )}


              {overrideTurns && hasDirectMarkers && (
                <EnhanceThread
                  key={activeSourceId}
                  history={activeSource.enhanceHistory ?? []}
                  enhanceCount={activeSource.enhanceCount ?? 0}
                  activeFeatures={[...apiFeatures].filter(f => f !== 'split')}
                  isEnhancing={isClassifying}
                  onSubmit={(instruction) => handleEnhanceGemini(instruction)}
                  onCancel={handleCancelEnhance}
                  t={t}
                />
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
                    <div className="empty-state-icon">
                      <FileQuestion size={24} />
                    </div>
                    <div className="empty-state-text">{t.noTurnsDetected}</div>
                    <div className="empty-state-hint">{t.noTurnsHint}</div>
                  </div>
                </div>
              ) : !isClassifying ? (
                <div className="messages-list">
                  <div className="welcome-state no-print">
                    <div className="welcome-hero-icon">
                      <FileText size={36} />
                    </div>
                    <h3 className="welcome-title">{t.welcomeTitle}</h3>
                    <p className="welcome-sub">{t.welcomeSub}</p>
                    <div className="welcome-steps">
                      <div className="welcome-step"><span className="welcome-step-num">1</span> {t.welcomeStep1}</div>
                      <span className="welcome-step-arrow">&rarr;</span>
                      <div className="welcome-step"><span className="welcome-step-num">2</span> {t.welcomeStep2}</div>
                      <span className="welcome-step-arrow">&rarr;</span>
                      <div className="welcome-step"><span className="welcome-step-num">3</span> {t.welcomeStep3}</div>
                    </div>
                    <div className="welcome-features">
                      <div className="welcome-feature-card">
                        <Zap size={16} />
                        <div>
                          <strong>{t.welcomeAiFormatting}</strong>
                          <span>{t.welcomeAiFormattingDesc}</span>
                        </div>
                      </div>
                      <div className="welcome-feature-card">
                        <Download size={16} />
                        <div>
                          <strong>{t.welcomeExportReady}</strong>
                          <span>{t.welcomeExportReadyDesc}</span>
                        </div>
                      </div>
                      <div className="welcome-feature-card">
                        <Sparkles size={16} />
                        <div>
                          <strong>{t.welcomeMultiLlm}</strong>
                          <span>{t.welcomeMultiLlmDesc}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      className="welcome-sample-btn"
                      onClick={() => setSources(prev => prev.map(s => s.id === activeSourceId ? { ...s, content: SAMPLE } : s))}
                    >
                      <Sparkles size={13} /> {t.tryWithSample}
                    </button>
                    <p className="welcome-cta" dangerouslySetInnerHTML={{ __html: t.welcomeCta }} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <ToastContainer />

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
              <div className="api-console-empty">{t.noApiActivity}</div>
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

      {/* Drag-and-drop overlay */}
      {isDragging && (
        <div className="drag-overlay no-print">
          <div className="drag-overlay-content">
            <Upload size={40} />
            <span>Drop .txt or .md file here</span>
          </div>
        </div>
      )}

      {/* PDF export spinner overlay */}
      {exporting && (
        <div className="pdf-spinner-overlay no-print" role="status" aria-live="assertive">
          <div className="pdf-spinner-content">
            <div className="pdf-spinner"></div>
            <span>{t.generatingPdf}</span>
          </div>
        </div>
      )}

      {showSettings && (
        <div className={`modal-overlay no-print ${settingsClosing ? 'modal-closing' : ''}`} onClick={closeSettings} role="dialog" aria-modal="true" aria-label="Settings">
          <div className={`modal-content ${settingsClosing ? 'modal-content-closing' : ''}`} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t.settingsTitle}</h3>
              <button className="btn-close" onClick={closeSettings} aria-label="Close settings"><X size={18} /></button>
            </div>

            {/* Settings Tabs */}
            <div className="settings-tabs">
              <button className={`settings-tab ${settingsTab === 'account' ? 'active' : ''}`} onClick={() => switchSettingsTab('account')}>
                <User size={14} /> {t.account}
              </button>
              <button className={`settings-tab ${settingsTab === 'apikey' ? 'active' : ''}`} onClick={() => switchSettingsTab('apikey')}>
                <Key size={14} /> {t.apiKeyTab}
              </button>
            </div>

            <div className="settings-body settings-body-animated" ref={settingsBodyRef}>
              {/* ── Account Tab ── */}
              <div className={`settings-tab-panel ${settingsTab === 'account' ? 'active' : ''}`} ref={settingsAccountRef}>
                  <div className="setting-group" style={{ marginBottom: '20px' }}>
                    <label>{t.account}</label>
                    {user && !isAnonymous ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.email}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            {plan === 'pro'
                              ? <><Crown size={11} style={{ color: '#f59e0b' }} /> {t.proPlan}</>
                              : <>{t.freePlan}</>
                            }
                          </div>
                        </div>
                        <button className="btn btn-ghost" style={{ fontSize: '0.75rem', gap: 4 }} onClick={async () => { await signOut(); closeSettings(); }}>
                          <LogOut size={13} /> {t.signOut}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="setting-hint" style={{ marginBottom: 8 }}>{t.signInHint}</p>
                        <button className="btn btn-primary" style={{ gap: 6 }} onClick={() => { closeSettings(); setShowAuthModal(true); }}>
                          <LogIn size={14} /> {t.signInCreate}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Plan card with usage bars */}
                  {user && !isAnonymous && plan === 'free' && !hasOwnApiKey() && (
                    <div className="setting-group">
                      <label>Plan</label>
                      <div style={{
                        background: 'linear-gradient(135deg, var(--bg-surface-secondary), var(--bg-surface))',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 10,
                        padding: '16px',
                      }}>
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                            <span>{t.apiCalls}</span>
                            <span style={{ fontWeight: 600, color: callsUsed >= FREE_CALL_LIMIT ? '#dc2626' : 'var(--text-secondary)' }}>
                              {callsUsed} / {FREE_CALL_LIMIT}
                            </span>
                          </div>
                          <div style={{ height: 5, background: 'var(--border-primary)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min((callsUsed / FREE_CALL_LIMIT) * 100, 100)}%`, background: callsUsed >= FREE_CALL_LIMIT ? '#dc2626' : 'var(--color-primary-500)', borderRadius: 3, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                            <span>{t.wordsProcessed}</span>
                            <span style={{ fontWeight: 600, color: wordsUsed >= FREE_WORD_LIMIT ? '#dc2626' : 'var(--text-secondary)' }}>
                              {(wordsUsed / 1000).toFixed(1)}k / {FREE_WORD_LIMIT / 1000}k
                            </span>
                          </div>
                          <div style={{ height: 5, background: 'var(--border-primary)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min((wordsUsed / FREE_WORD_LIMIT) * 100, 100)}%`, background: wordsUsed >= FREE_WORD_LIMIT ? '#dc2626' : 'var(--color-primary-500)', borderRadius: 3, transition: 'width 0.3s' }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.68rem', color: 'var(--text-tertiary)', marginBottom: 14 }}>
                          {t.resetsIn} {daysUntilReset} {t.days}
                        </div>

                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
                          <span>{t.proIncludes}</span>
                        </div>

                        <button
                          className="btn btn-primary"
                          style={{ width: '100%', justifyContent: 'center', gap: 6, padding: '10px', fontSize: '0.85rem' }}
                          onClick={() => { closeSettings(); setShowUpgradeModal('voluntary'); }}
                        >
                          <Crown size={14} />
                          <span style={{ textDecoration: 'line-through', opacity: 0.6, fontSize: '0.78rem' }}>{t.priceOriginal}</span>
                          {t.upgradeToPro}
                          <span style={{
                            background: '#dc2626', color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                            padding: '1px 5px', borderRadius: 3, marginLeft: 2,
                          }}>
                            {t.priceDiscount}
                          </span>
                        </button>
                        <p style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 6 }}>
                          {t.stripeNote}
                        </p>
                      </div>
                    </div>
                  )}

                  {user && plan === 'pro' && (
                    <div className="setting-group">
                      <label>Plan</label>
                      <div style={{
                        background: 'linear-gradient(135deg, var(--bg-surface-secondary), var(--bg-surface))',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 10,
                        padding: '16px',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <Crown size={16} style={{ color: '#f59e0b' }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.proUnlimited}</span>
                      </div>
                    </div>
                  )}
              </div>

              {/* ── API Key Tab ── */}
              <div className={`settings-tab-panel ${settingsTab === 'apikey' ? 'active' : ''}`} ref={settingsApikeyRef}>
                {plan === 'pro' && (
                  <div className="setting-group">
                    <div style={{
                      background: 'linear-gradient(135deg, var(--bg-surface-secondary), var(--bg-surface))',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 10, padding: '16px', textAlign: 'center', marginBottom: 4,
                    }}>
                      <Crown size={18} style={{ color: '#f59e0b', marginBottom: 6 }} />
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 4px' }}>{t.proNoKeyNeeded}</p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: 0 }}>{t.proNoKeyHint}</p>
                    </div>
                  </div>
                )}
                <div className="setting-group">
                  {plan === 'pro' && (
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{t.proAdvancedKey}</label>
                  )}
                  {plan !== 'pro' && <label>{t.settingsOrProvideKey}</label>}
                  <div className="api-key-input-wrapper">
                    <input
                      type="password"
                      value={apiKeyDraft}
                      onChange={(e) => setApiKeyDraft(e.target.value)}
                      onBlur={() => commitApiKey(apiKeyDraft)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitApiKey(apiKeyDraft); }}
                      placeholder="AIza..."
                      aria-label="Google AI API Key"
                    />
                    <div className="api-badge google-badge">gemini-2.5-flash</div>
                  </div>
                  {plan === 'pro' && hasApiKey() ? (
                    <p className="setting-hint" style={{ color: '#f59e0b' }}>{t.proKeyOverride}</p>
                  ) : plan !== 'pro' ? (
                    <p className="setting-hint">
                      {t.settingsHint}
                      {t.getFreeKey} <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary-500)' }}>Google AI Studio</a>.
                      {t.ownKeyUnlimited}
                    </p>
                  ) : null}
                  {hasApiKey() && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '0.75rem', padding: '4px 12px' }}
                        disabled={apiTestResult === 'testing'}
                        onClick={async () => {
                          setApiTestResult('testing');
                          try {
                            const result = await splitChatWithGemini('User: Hello\nAI: Hi there!');
                            setApiTestResult(result && result.messages.length > 0 ? 'ok' : 'fail');
                          } catch {
                            setApiTestResult('fail');
                          }
                        }}
                      >
                        {apiTestResult === 'testing' ? t.testing : t.testApiKey}
                      </button>
                      {apiTestResult === 'ok' && <span style={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 600 }}>{t.apiOk}</span>}
                      {apiTestResult === 'fail' && <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600 }}>{getLastApiError()?.message || 'Failed'}</span>}
                    </div>
                  )}
                  {apiError && (
                    <p className="setting-hint" style={{ color: '#dc2626', fontWeight: 600 }}>{apiError}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => { commitApiKey(apiKeyDraft); closeSettings(); }}>{t.done}</button>
            </div>
          </div>
        </div>
      )}

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSignInWithGoogle={signInWithGoogle}
          onSignInWithEmail={signInWithEmail}
          onSignUp={signUp}
          t={t}
        />
      )}

      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          onCheckoutComplete={async () => {
            const poll = async (n: number) => {
              const p = await refreshUsage();
              if (p === 'pro') { setShowUpgradeModal(false); return; }
              if (n >= 15) { setShowUpgradeModal(false); return; }
              setTimeout(() => poll(n + 1), 2000);
            };
            poll(0);
          }}
          hitLimit={showUpgradeModal === 'limit'}
          callsUsed={callsUsed}
          wordsUsed={wordsUsed}
          daysUntilReset={daysUntilReset}
          t={t}
        />
      )}

      {showSignInPrompt && (
        <SignInPromptModal
          onClose={() => setShowSignInPrompt(false)}
          onOpenAuthModal={() => setShowAuthModal(true)}
          t={t}
        />
      )}

      {showProSwitchConfirm && (
        <div className="modal-overlay no-print" onClick={() => setShowProSwitchConfirm(false)} role="dialog" aria-modal="true">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Crown size={18} style={{ color: '#f59e0b' }} />
                {t.proSwitchConfirm}
              </h3>
              <button className="btn-close" onClick={() => setShowProSwitchConfirm(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="settings-body" style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
                {t.proSwitchConfirmDesc}
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowProSwitchConfirm(false)}>
                  {t.proSwitchCancel}
                </button>
                <button className="btn btn-primary" onClick={() => {
                  localStorage.removeItem('googleApiKey');
                  setGoogleApiKey('');
                  setApiError(null);
                  setShowProSwitchConfirm(false);
                  toast('success', t.proNoKeyNeeded);
                }}>
                  <Crown size={14} /> {t.proSwitchYes}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
