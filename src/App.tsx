import { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import {
  FileText, Download, User, Table, Zap,
  GraduationCap, Briefcase,
  Layout, Plus, Trash, Settings, X,
  Sun, Moon, Terminal, Check, FileQuestion,
  Sparkles, Upload, FileDown, Edit3, Eye,
  BookOpen, RefreshCcw
} from 'lucide-react';
import { splitChatWithGemini, enhanceContentWithGemini, generateChatTitle, hasApiKey, getLastApiError, clearLastApiError } from './utils/llmParser';
import type { TokenUsage, ApiFeature } from './utils/llmParser';

// -- Types --
import type { Turn, LLMName } from './types';

interface Source {
  id: string;
  title: string;
  content: string;
  llm: LLMName;
  apiSplitTurns?: Turn[];
  apiSplitRawText?: string;
  apiSplitTokens?: TokenUsage;
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
  const { lang, toggleLang, t } = useTranslation();

  const [sources, setSources] = useState<Source[]>(() => {
    try {
      const saved = localStorage.getItem(LS_SOURCES);
      if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) return parsed; }
    } catch { }
    return [{ id: 'initial', title: 'Main Session', content: SAMPLE, llm: 'Gemini' }];
  });
  const [activeSourceId, setActiveSourceId] = useState<string>(() => {
    return localStorage.getItem(LS_ACTIVE) || sources[0]?.id || 'initial';
  });
  const [pdfTemplate, setPdfTemplate] = useState<'professional' | 'academic' | 'executive'>(() => {
    const saved = localStorage.getItem(LS_TEMPLATE);
    if (saved === 'professional' || saved === 'academic' || saved === 'executive') return saved;
    return 'professional';
  });

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('editor');
  // LLM override removed — selector is now read-only display
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [parseErrorToast, setParseErrorToast] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [googleApiKey, setGoogleApiKey] = useState(() => localStorage.getItem('googleApiKey') || '');
  const [apiTestResult, setApiTestResult] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [apiPassword, setApiPassword] = useState(() => localStorage.getItem('apiPassword') || '');

  // -- API Processing Options --
  const [apiFeatures, setApiFeatures] = useState<Set<ApiFeature>>(() => {
    const saved = localStorage.getItem('apiFeatures');
    if (saved) try { return new Set(JSON.parse(saved)); } catch { }
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

    const push = (level: LogEntry['level'], args: any[]) => {
      const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      if (!text.includes('[Flow]') && !text.includes('[Gemini]')) return;
      const finalLevel = text.includes('SUCCESS') ? 'success' : level;
      setApiLogs(prev => [...prev.slice(-99), { time: ts(), level: finalLevel, msg: text }]);
    };

    console.log = (...args: any[]) => { push('info', args); orig.log.apply(console, args); };
    console.warn = (...args: any[]) => { push('warn', args); orig.warn.apply(console, args); };
    console.error = (...args: any[]) => { push('error', args); orig.error.apply(console, args); };

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

  const commitApiPassword = (val: string) => {
    const trimmed = val.trim();
    setApiPassword(trimmed);
    localStorage.setItem('apiPassword', trimmed);
    clearLastApiError();
    setApiError(null);
  };

  const activeSource = sources.find(s => s.id === activeSourceId) || sources[0];

  const INPUT_CHAR_LIMIT = 500_000;
  const [inputWarning, setInputWarning] = useState<string | null>(null);

  const handleUpdateSourceContent = (val: string) => {
    if (val.length > INPUT_CHAR_LIMIT) {
      setInputWarning(`Input truncated to ${(INPUT_CHAR_LIMIT / 1000).toFixed(0)}K characters to prevent performance issues.`);
      const truncated = val.slice(0, INPUT_CHAR_LIMIT);
      setSources(prev => prev.map(s => s.id === activeSourceId ? { ...s, content: truncated } : s));
      setTimeout(() => setInputWarning(null), 4000);
      return;
    }
    setInputWarning(null);
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
    if (!googleApiKey || !activeSource.content.trim() || activeSource.content.length < 50) return;

    // Auto title if the first 200 characters changed significantly (meaning a new chat was pasted)
    const currentPrefix = activeSource.content.slice(0, 200).trim();
    const lastPrefix = lastTitlePrefixRef.current[activeSourceId];
    const isDefault = activeSource.title === 'Main Session' || activeSource.title === 'New Source';

    if (!lastPrefix) {
      // If we've never stored a prefix for this source in this session, assume it's stable 
      // UNLESS the title is still the default (meaning it's brand new and needs a title)
      if (!isDefault) {
        lastTitlePrefixRef.current[activeSourceId] = currentPrefix;
        return;
      }
    } else if (lastPrefix === currentPrefix) {
      // Prefix hasn't changed, meaning it's the same chat just appended to.
      return;
    }

    // Use a short debounce to wait for user to finish pasting/typing
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
  }, [activeSource.content, activeSource.title, activeSourceId, googleApiKey]);

  const showParseError = useCallback(() => {
    setParseErrorToast(true);
    setTimeout(() => setParseErrorToast(false), 2500);
  }, []);

  const previewRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  _onRenderError.current = showParseError;

  const deferredSources = useDeferredValue(sources);
  const sourceContents = useMemo(() => deferredSources.map(s => s.content).join('\n---\n'), [deferredSources]);

  // ── Direct marker detection ──
  // If the pasted text has clear role markers the regex parser handles well,
  // skip the API entirely (saves tokens). Covers Gemini JP, ChatGPT JP, etc.
  const hasDirectMarkers = useMemo(() => {
    // Gemini Japanese format
    if (/あなたのプロンプト|Gemini の回答|Gemini の返答/.test(sourceContents)) return true;
    // ChatGPT Japanese format  (あなた: + ChatGPT:)
    if (/^あなた[:：]\s*/m.test(sourceContents) && /^ChatGPT[:：]\s*/mi.test(sourceContents)) return true;
    // Claude Japanese format
    if (/^あなた[:：]\s*/m.test(sourceContents) && /^Claude[:：]\s*/mi.test(sourceContents)) return true;
    // English explicit markers (You said: + X said:)
    if (/^You said:?\s*$/mi.test(sourceContents) && /^(ChatGPT|Claude|Gemini) said:?\s*$/mi.test(sourceContents)) return true;
    return false;
  }, [sourceContents]);

  // ── Legacy parser: always runs for all text ──
  const parsed = useMemo(
    () => activeSource.content.trim() ? parseChatLog(activeSource.content) : { turns: [], llm: 'AI' as LLMName },
    [activeSource.content]
  );

  // Turns state is now primarily cached in the Source object to persist across refreshes
  const [isClassifying, setIsClassifying] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState('');
  const apiRequestIdRef = useRef(0);

  // Clear errors when changing tabs or keys
  useEffect(() => {
    setApiError(null);
  }, [activeSourceId, googleApiKey]);

  const WORD_LIMIT_FOR_API = 20_000;

  const triggerApiSplit = useCallback((sourceId: string, rawText: string, strInstructions?: string) => {
    if (!hasApiKey() || !rawText.trim()) return;
    const wordCount = rawText.split(/\s+/).length;
    if (wordCount > WORD_LIMIT_FOR_API) {
      console.log(`[Flow] Large document (${wordCount} words > ${WORD_LIMIT_FOR_API}) → skipping API`);
      return;
    }

    console.log(`[Flow] Triggering API split for source ${sourceId}...`);
    const requestId = ++apiRequestIdRef.current;
    setIsClassifying(true);
    setApiError(null);

    splitChatWithGemini(rawText, apiFeatures, strInstructions).then(result => {
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
      } else {
        const err = getLastApiError();
        if (err) setApiError(err.message);
      }
    }).catch(err => {
      if (requestId !== apiRequestIdRef.current) return;
      console.error("AI split failed:", err);
      setApiError(`Split error: ${err.message}`);
    }).finally(() => {
      if (requestId === apiRequestIdRef.current) setIsClassifying(false);
    });
  }, [apiFeatures]);

  // Handle Automatic logic 
  useEffect(() => {
    if (hasDirectMarkers || !hasApiKey() || !activeSource.content.trim()) return;

    // If completely cleared, wipe cache automatically
    if (activeSource.content.length === 0) {
      if (activeSource.apiSplitTurns) {
        setSources(prev => prev.map(s => s.id === activeSourceId ? { ...s, apiSplitTurns: undefined, apiSplitRawText: undefined } : s));
      }
      return;
    }

    // Auto-trigger if it has never been parsed successfully
    if (!activeSource.apiSplitRawText || !activeSource.apiSplitTurns) {
      const timer = setTimeout(() => triggerApiSplit(activeSourceId, activeSource.content), 500);
      return () => clearTimeout(timer);
    }

    // Auto-trigger if text changed by > 30%
    const oldLen = activeSource.apiSplitRawText.length;
    const newLen = activeSource.content.length;
    const diff = Math.abs(newLen - oldLen) / Math.max(oldLen, 1);

    if (diff >= 0.3) {
      console.log(`[Flow] Text changed by ${Math.round(diff * 100)}% -> Auto-refreshing API split`);
      const timer = setTimeout(() => triggerApiSplit(activeSourceId, activeSource.content), 800);
      return () => clearTimeout(timer);
    }
  }, [activeSource.content, activeSourceId, hasDirectMarkers, googleApiKey, triggerApiSplit]);

  const overrideTurns = activeSource.apiSplitTurns || null;
  const tokenUsage = activeSource.apiSplitTokens || null;
  const splitMethod = hasDirectMarkers ? 'regex' : (overrideTurns ? 'gemini-api' : 'none');

  // ── Gemini-marker chats: user-triggered enhance for code/latex ──
  const [enhanceDismissed, setEnhanceDismissed] = useState(false);
  const enhanceCancelledRef = useRef(false);

  // Reset dismissed state when source changes
  useEffect(() => {
    setEnhanceDismissed(false);
  }, [sourceContents]);

  // Show the enhance prompt when: Gemini markers + API key + any enhance feature enabled + not already enhanced
  const hasAnyEnhanceFeature = apiFeatures.has('format') || apiFeatures.has('tables') || apiFeatures.has('code') || apiFeatures.has('latex');
  const showEnhancePrompt = hasDirectMarkers && hasApiKey() && !overrideTurns && !isClassifying && !enhanceDismissed
    && hasAnyEnhanceFeature
    && parsed.turns.some(t => t.role === 'assistant');

  const handleEnhanceGemini = useCallback(async () => {
    if (!hasDirectMarkers || parsed.turns.length === 0) return;

    enhanceCancelledRef.current = false;
    setIsClassifying(true);
    setApiError(null);
    console.log(`[Flow] User triggered enhancement for ${parsed.turns.length} Gemini turns...`);

    try {
      const assistantTurns = parsed.turns.filter(t => t.role === 'assistant');
      if (assistantTurns.length === 0) {
        setIsClassifying(false);
        return;
      }

      let totalTokens: TokenUsage = { promptTokens: 0, responseTokens: 0, totalTokens: 0 };
      const enhancedMap = new Map<number, string>();

      for (const turn of assistantTurns) {
        if (enhanceCancelledRef.current) {
          console.log('[Flow] Enhancement cancelled by user');
          break;
        }
        console.log(`[Flow] Enhancing turn ${turn.index} (${turn.content.length} chars)...`);
        const result = await enhanceContentWithGemini(turn.content, apiFeatures, customInstructions);
        if (result) {
          enhancedMap.set(turn.index, result.text);
          totalTokens = {
            promptTokens: totalTokens.promptTokens + result.tokens.promptTokens,
            responseTokens: totalTokens.responseTokens + result.tokens.responseTokens,
            totalTokens: totalTokens.totalTokens + result.tokens.totalTokens,
          };
        }
      }

      if (enhancedMap.size > 0 && !enhanceCancelledRef.current) {
        const enhanced: Turn[] = parsed.turns.map(t => {
          const newContent = enhancedMap.get(t.index);
          if (newContent) {
            return { ...t, content: newContent, hasTable: /\|.*\|/.test(newContent) };
          }
          return t;
        });
        setSources(prev => prev.map(s => s.id === activeSourceId ? {
          ...s,
          apiSplitTurns: enhanced,
          apiSplitTokens: totalTokens
        } : s));
        console.log(`[Gemini] SUCCESS — enhanced ${enhancedMap.size} turns, tokens: ${totalTokens.promptTokens} in + ${totalTokens.responseTokens} out = ${totalTokens.totalTokens} total`);
      }
    } catch (err: any) {
      console.error('[Flow] Enhancement failed:', err);
      const apiErr = getLastApiError();
      if (apiErr) setApiError(apiErr.message);
    } finally {
      setIsClassifying(false);
    }
  }, [hasDirectMarkers, parsed.turns, apiFeatures, customInstructions]);

  const handleManualApiRetry = () => {
    if (hasDirectMarkers) {
      handleEnhanceGemini();
    } else {
      triggerApiSplit(activeSourceId, activeSource.content, customInstructions);
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

  // Smart filename: LLM + first user question summary + date
  const exportFilename = useMemo(() => {
    const firstQ = currentTurns.find(t => t.role === 'user');
    const snippet = firstQ
      ? firstQ.content.split('\n')[0].trim().replace(/[^\w\s\-]/g, '').trim().slice(0, 50).trim()
      : '';
    const date = new Date().toISOString().slice(0, 10);
    const llmTag = selectedLLM === 'Other LLM' ? 'AI' : selectedLLM;
    return snippet ? `${llmTag} - ${snippet} (${date})` : `${llmTag} Chat (${date})`;
  }, [currentTurns, selectedLLM]);

  const [pdfError, setPdfError] = useState<string | null>(null);
  const handleExportPdf = async () => {
    setExporting(true);
    setIsPdfExporting(true);
    setPdfError(null);
    // Wait for React to re-render with forceExpand=true on all TurnBlocks.
    // Large documents need more time for the DOM to settle.
    const wordCount = (activeSource.content.match(/\S+/g) || []).length;
    const renderDelay = wordCount > 30000 ? 3000 : wordCount > 15000 ? 2000 : 800;
    await new Promise(r => setTimeout(r, renderDelay));
    // Extra safety: wait for the browser to finish painting
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(undefined))));
    try {
      if (previewRef.current) {
        await exportToPdf(previewRef.current, exportFilename, scrollRef.current);
      }
    } catch (err: any) {
      console.error('[Flow] PDF export failed:', err);
      setPdfError(err?.message || 'PDF generation failed');
      setTimeout(() => setPdfError(null), 5000);
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
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [activeSourceId]);

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
          <div className="brand-text">{t.appTitle} <span className="beta-tag">PRO</span></div>
        </div>

        <div className="header-stats no-print">
          <div className="stat-item"><User size={12} /><span>{currentTurns.filter(t => t.role === 'user').length}</span></div>
          <div className="stat-item"><Table size={12} /><span>{currentTurns.filter(t => t.hasTable).length}</span></div>
        </div>

        <div className="header-actions">
          <div className={`split-method-badge no-print ${splitMethod !== 'none' ? 'active' : ''}`}>
            {splitMethod === 'regex' && t.regexMode}
            {splitMethod === 'gemini-api' && t.geminiApiMode}
            {splitMethod === 'none' && (hasApiKey() ? t.readyMode : t.noApiKeyMode)}
          </div>
          <div className="template-selector no-print">
            <button onClick={() => setPdfTemplate('professional')} className={`template-btn ${pdfTemplate === 'professional' ? 'active' : ''}`} data-tooltip={t.proTemplate} aria-label="Professional template"><Layout size={14} /></button>
            <button onClick={() => setPdfTemplate('academic')} className={`template-btn ${pdfTemplate === 'academic' ? 'active' : ''}`} data-tooltip={t.academicTemplate} aria-label="Academic template"><GraduationCap size={14} /></button>
            <button onClick={() => setPdfTemplate('executive')} className={`template-btn ${pdfTemplate === 'executive' ? 'active' : ''}`} data-tooltip={t.execTemplate} aria-label="Executive template"><Briefcase size={14} /></button>
          </div>
          <button onClick={toggleLang} className="theme-toggle no-print" data-tooltip={lang === 'en' ? t.switchToJapanese : t.switchToEnglish}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{lang === 'en' ? 'JP' : 'EN'}</span>
          </button>
          <button onClick={toggleTheme} className="theme-toggle no-print" data-tooltip={theme === 'dark' ? t.switchToLightMode : t.switchToDarkMode} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={() => setShowConsole(c => !c)} className={`btn btn-ghost no-print ${showConsole ? 'active' : ''}`} data-tooltip={t.apiConsole} aria-label="Toggle API console">
            <Terminal size={15} />
          </button>
          <button onClick={() => { setApiKeyDraft(googleApiKey); setShowSettings(true); }} className="btn btn-ghost no-print" data-tooltip={t.settingsTooltip} aria-label="Open settings">
            <Settings size={15} />
          </button>
          <button onClick={handleExportMarkdown} className="btn btn-ghost no-print" data-tooltip={t.exportMd} aria-label="Export as Markdown">
            <FileDown size={15} />
          </button>
          <button onClick={handleExportJSON} className="btn btn-ghost no-print" data-tooltip={t.exportJson} aria-label="Export as JSON">
            <FileText size={15} />
          </button>
          <button onClick={handleExportHTML} className="btn btn-ghost no-print" data-tooltip={t.exportHtml} aria-label="Export as HTML">
            <Layout size={15} />
          </button>
          <button onClick={handleExportNotebookLM} className="btn btn-ghost no-print" data-tooltip={t.sendToNotebookLM} aria-label="Upload to NotebookLM">
            {isExportingNotebookLM ? <Check size={15} color="#10b981" /> : <BookOpen size={15} />}
          </button>
          <button onClick={handleExportPdf} disabled={exporting} className="btn btn-primary" data-tooltip={t.exportPdf} aria-label="Export PDF">
            <Download size={15} /> {exporting ? 'Generating...' : 'PDF'}
          </button>
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
            <button className="btn btn-ghost upload-btn no-print" onClick={() => fileInputRef.current?.click()} title="Upload text file" aria-label="Upload text file">
              <Upload size={13} />
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.text" onChange={handleFileUpload} style={{ display: 'none' }} />
          </div>
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
          </div>
          <textarea
            className="editor-textarea"
            value={activeSource.content}
            onChange={e => handleUpdateSourceContent(e.target.value)}
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

              {isClassifying && (
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
                      : apiError.includes('No API key') || apiError.includes('configured')
                        ? 'no-key'
                        : 'generic';
                const labels: Record<string, { title: string; cls: string }> = {
                  'rate-limit': { title: 'Rate Limit', cls: 'api-error-banner--rate-limit' },
                  'auth': { title: 'Auth Error', cls: 'api-error-banner--auth' },
                  'network': { title: 'Network Error', cls: 'api-error-banner--network' },
                  'no-key': { title: 'No API Key', cls: 'api-error-banner--no-key' },
                  'generic': { title: 'API Error', cls: '' },
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
                      value={customInstructions}
                      onChange={e => setCustomInstructions(e.target.value)}
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

              {showEnhancePrompt && (
                <div className="enhance-card no-print">
                  <button className="enhance-card-dismiss" onClick={() => setEnhanceDismissed(true)}><X size={14} /></button>
                  <div className="enhance-card-icon"><Sparkles size={20} /></div>
                  <div className="enhance-card-title">{t.enhanceCardTitle}</div>
                  <div className="enhance-card-desc">{t.enhanceCardDesc}</div>
                  <div className="enhance-card-features">
                    {(['format', 'tables', 'code', 'latex'] as ApiFeature[]).map(f => {
                      const labels: Record<string, { name: string; hint: string }> = {
                        format: { name: t.formatting, hint: 'Bold, lists, headings' },
                        tables: { name: t.tables, hint: 'Reconstruct pipe tables' },
                        code: { name: t.code, hint: 'Re-fence with language' },
                        latex: { name: t.latex, hint: 'Restore math delimiters' },
                      };
                      const { name, hint } = labels[f];
                      return (
                        <button
                          key={f}
                          className={`enhance-feature-chip ${apiFeatures.has(f) ? 'active' : ''}`}
                          onClick={() => toggleFeature(f)}
                        >
                          <span className="enhance-feature-check">{apiFeatures.has(f) ? <Check size={10} strokeWidth={3} /> : null}</span>
                          <span className="enhance-feature-name">{name}</span>
                          <span className="enhance-feature-hint">{hint}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="sync-retry-row">
                    <input
                      type="text"
                      placeholder={t.customInstructionsEnhance}
                      value={customInstructions}
                      onChange={e => setCustomInstructions(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleEnhanceGemini(); }}
                      className="instruction-input"
                    />
                    <button className="enhance-card-btn" onClick={handleEnhanceGemini} disabled={!hasAnyEnhanceFeature}>
                      <Sparkles size={14} /> {t.enhanceBtnPrefix} {parsed.turns.filter(t => t.role === 'assistant').length} {parsed.turns.filter(t => t.role === 'assistant').length !== 1 ? t.responsesSuffix : t.responseSuffix}
                    </button>
                  </div>
                </div>
              )}

              {!isClassifying && !apiError && overrideTurns && hasDirectMarkers && (
                <div className="ai-success-banner no-print" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Sparkles size={14} />
                    <span>{t.aiEnhancementApplied}</span>
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
                      value={customInstructions}
                      onChange={e => setCustomInstructions(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleManualApiRetry(); }}
                      className="instruction-input"
                    />
                    <button
                      className="sync-banner-btn"
                      onClick={handleManualApiRetry}
                      title="Enhance formatting with AI"
                    >
                      <RefreshCcw size={14} /> {t.enhanceApi}
                    </button>
                  </div>
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
                    <div className="empty-state-icon">
                      <FileQuestion size={24} />
                    </div>
                    <div className="empty-state-text">No turns detected</div>
                    <div className="empty-state-hint">Paste a chat log in the editor or drop a .txt file</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      {parseErrorToast && <div className="toast-error no-print">⚠ Error</div>}
      {pdfError && <div className="toast-error no-print">⚠ PDF: {pdfError}</div>}
      {inputWarning && <div className="toast-error no-print" style={{ background: '#f59e0b', borderColor: '#d97706' }}>⚠ {inputWarning}</div>}

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
            <span>Generating PDF...</span>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-overlay no-print" onClick={() => setShowSettings(false)} role="dialog" aria-modal="true" aria-label="Settings">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t.settingsTitle}</h3>
              <button className="btn-close" onClick={() => setShowSettings(false)} aria-label="Close settings"><X size={18} /></button>
            </div>
            <div className="settings-body">
              <div className="setting-group" style={{ marginBottom: '20px' }}>
                <label>{t.settingsEnterPassword}</label>
                <div className="api-key-input-wrapper">
                  <input
                    type="password"
                    value={apiPassword}
                    onChange={(e) => setApiPassword(e.target.value)}
                    onBlur={() => commitApiPassword(apiPassword)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitApiPassword(apiPassword); }}
                    placeholder="Enter password..."
                    aria-label="API Password"
                  />
                  {apiPassword === 'kenseiyasue123' && <div className="api-badge" style={{ background: '#10b981', color: '#fff' }}>Unlocked</div>}
                </div>
              </div>

              <div className="setting-group">
                <label>{t.settingsOrProvideKey}</label>
                <div className="api-key-input-wrapper">
                  <input
                    type="password"
                    value={apiKeyDraft}
                    onChange={(e) => setApiKeyDraft(e.target.value)}
                    onBlur={() => commitApiKey(apiKeyDraft)}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitApiKey(apiKeyDraft); }}
                    placeholder="AIza..."
                    aria-label="Google AI API Key"
                    disabled={apiPassword === 'kenseiyasue123'}
                  />
                  <div className="api-badge google-badge">gemini-2.5-flash</div>
                </div>
                <p className="setting-hint">
                  {t.settingsHint}
                  {t.getFreeKey} <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary-500)' }}>Google AI Studio</a>.
                </p>
                {(hasApiKey() || apiPassword === 'kenseiyasue123') && (
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
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => { commitApiKey(apiKeyDraft); commitApiPassword(apiPassword); setShowSettings(false); }}>{t.done}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
