import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  FileText, Download, User, Table, Zap,
  List, BookOpen, GraduationCap, Briefcase,
  Layout, Plus, Trash, RotateCw, Settings, X
} from 'lucide-react';
import { generateNarrativeTOCWithGemini } from './utils/llmParser';

// -- Types --
import type { LLMName } from './types';

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
import { ChapterDivider } from './components/ChapterDivider';
import { PdfPrintHeader } from './components/PdfPrintHeader';
import { _onRenderError } from './components/ErrorBoundary';

// -- New algorithm pipeline --
import { analyzeConversation } from './algorithm';
import type { AnalysisResult, AnalyzedMessage, SemanticGroup } from './algorithm';
import { detectLLMWithConfidence } from './algorithm/llmDetector';
import type { LLMType } from './algorithm/llmDetector';
import { addRoleCorrection, getStoreStats, clearStore } from './algorithm/correctionStore';
import { recomputeWeights } from './algorithm/weightUpdater';

// -- Drag and Drop --
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableAnalyzedBlock } from './components/SortableAnalyzedBlock';

const SAMPLE = `User: How to stay young?
AI: Eat healthy and sleep well. [1]
User: More details.
AI: Antioxidants are great. [2]`;

export default function App() {
  const [sources, setSources] = useState<Source[]>([
    { id: 'initial', title: 'Main Session', content: SAMPLE, llm: 'Gemini' }
  ]);
  const [activeSourceId, setActiveSourceId] = useState<string>('initial');
  const [useNewAlgo, setUseNewAlgo] = useState(true);
  const [pdfTemplate, setPdfTemplate] = useState<'professional' | 'academic' | 'executive'>('professional');
  const [llmOverride, setLlmOverride] = useState<LLMType | null>(null);
  const [showIndex, setShowIndex] = useState(true);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [parseErrorToast, setParseErrorToast] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiApiKey') || '');
  const [cerebrasApiKey, setCerebrasApiKey] = useState(() => localStorage.getItem('cerebrasApiKey') || '');
  const [anthropicApiKey, setAnthropicApiKey] = useState(() => localStorage.getItem('anthropicApiKey') || '');

  // Tracking for AI-processed results (survive re-renders)
  const [aiResults, setAiResults] = useState<Record<number, {
    cleanedText?: string | null;
    recoveredText?: string | null;
    keyPoints?: string[] | null;
    summary?: string | null;
    tried?: Record<string, boolean>;
  }>>({});

  const setAiResult = useCallback((id: number, key: string, val: any) => {
    setAiResults(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [key]: val,
        tried: { ...prev[id]?.tried, [key]: true }
      }
    }));
  }, []);

  const handleSaveApiKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem('geminiApiKey', val);
  };

  const handleSaveCerebrasApiKey = (val: string) => {
    setCerebrasApiKey(val);
    localStorage.setItem('cerebrasApiKey', val);
  };

  const handleSaveAnthropicApiKey = (val: string) => {
    setAnthropicApiKey(val);
    localStorage.setItem('anthropicApiKey', val);
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

  const analysis: AnalysisResult | null = useMemo(
    () => useNewAlgo && sources.some(s => s.content.trim())
      ? analyzeConversation(sources.map(s => s.content))
      : null,
    [sources, useNewAlgo]
  );

  const { turns } = useMemo(
    () => activeSource.content.trim() ? parseChatLog(activeSource.content) : { turns: [], llm: 'AI' as LLMName },
    [activeSource.content]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [editedMessages, setEditedMessages] = useState<AnalyzedMessage[] | null>(null);
  const [editedGroups, setEditedGroups] = useState<SemanticGroup[] | null>(null);
  const [narrativeTOC, setNarrativeTOC] = useState<string | null>(null);

  useEffect(() => {
    if (analysis) {
      setEditedMessages(analysis.messages);
      setEditedGroups(analysis.semanticGroups);

      // Generate Narrative TOC
      const outline = analysis.semanticGroups.map(g => {
        const firstMsg = analysis.messages[g.span[0]];
        const topics = Object.keys(g.summaryStats.topics).join(', ');
        return `Segment ${g.id + 1} (Topics: ${topics}): ${firstMsg.text.slice(0, 100)}...`;
      }).join('\n');

      generateNarrativeTOCWithGemini(outline).then(res => {
        if (res) setNarrativeTOC(res);
      });
    }
  }, [analysis]);

  const handleUpdateTopics = useCallback((id: number, topics: string[]) => {
    setEditedMessages(prev => prev ? prev.map(m => m.id === id ? { ...m, topic: topics } : m) : null);
  }, []);

  const handleUpdateGroupSummary = useCallback((id: number, summary: string) => {
    setEditedGroups(prev => prev ? prev.map(g => g.id === id ? { ...g, customSummary: summary } : g) : null);
  }, []);

  const handleUpdateMessageText = useCallback((id: number, text: string) => {
    setEditedMessages(prev => prev ? prev.map(m => m.id === id ? { ...m, text } : m) : null);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setEditedMessages((items) => {
        if (!items) return items;
        const oldIdx = items.findIndex(m => m.id === active.id);
        const newIdx = items.findIndex(m => m.id === over.id);
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  };

  const currentMessages = editedMessages ?? analysis?.messages ?? [];
  const learningStats = getStoreStats();

  const handleRoleToggle = useCallback((id: number) => {
    setEditedMessages(prev => {
      if (!prev) return prev;
      return prev.map(m => {
        if (m.id !== id) return m;
        const newRole = m.role === 'user' ? 'ai' as const : 'user' as const;
        addRoleCorrection({
          timestamp: Date.now(),
          textSnippet: m.text.slice(0, 100),
          originalRole: m.role,
          correctedRole: newRole,
          activeFeatures: [],
          charCount: m.text.length,
          originalConfidence: m.confidence
        });
        recomputeWeights();
        return { ...m, role: newRole, confidence: 1.0 };
      });
    });
  }, []);

  const handleMergeWithPrev = useCallback((id: number) => {
    setEditedMessages(prev => {
      if (!prev) return prev;
      const idx = prev.findIndex(m => m.id === id);
      if (idx <= 0) return prev;
      const target = prev[idx];
      const prevMsg = prev[idx - 1];
      const merged: AnalyzedMessage = {
        ...prevMsg,
        text: prevMsg.text + '\n\n' + target.text,
        confidence: Math.min(prevMsg.confidence, target.confidence),
        intent: Array.from(new Set([...prevMsg.intent, ...target.intent])),
        topic: Array.from(new Set([...prevMsg.topic, ...target.topic])),
        artifact: Array.from(new Set([...prevMsg.artifact, ...target.artifact]))
      };
      const result = [...prev];
      result.splice(idx - 1, 2, merged);
      return result;
    });
  }, []);

  const activeLLMDetection = useMemo(() => detectLLMWithConfidence(activeSource.content), [activeSource.content]);
  const selectedLLM = llmOverride || activeLLMDetection.llm;

  const handleExportPdf = async () => {
    setExporting(true);
    setIsPdfExporting(true);
    await new Promise(r => setTimeout(r, 800)); // wait for layout
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
          <div className="stat-item"><User size={12} /><span>{currentMessages.filter(m => m.role === 'user').length}</span></div>
          <div className="stat-item"><Table size={12} /><span>{currentMessages.filter(m => m.artifact.includes('TABLE')).length}</span></div>
        </div>

        <div className="header-actions">
          <button onClick={() => setUseNewAlgo(!useNewAlgo)} className={`btn ${useNewAlgo ? 'btn-algo-active' : 'btn-ghost'}`}>
            <Zap size={14} /> {useNewAlgo ? 'Algo' : 'Legacy'}
          </button>
          <button onClick={() => setShowIndex(!showIndex)} className={`btn btn-ghost ${showIndex ? 'btn-active' : ''}`}>
            <List size={14} />Index
          </button>
          <div className="template-selector no-print">
            <button onClick={() => setPdfTemplate('professional')} className={`template-btn ${pdfTemplate === 'professional' ? 'active' : ''}`}><Layout size={14} /></button>
            <button onClick={() => setPdfTemplate('academic')} className={`template-btn ${pdfTemplate === 'academic' ? 'active' : ''}`}><GraduationCap size={14} /></button>
            <button onClick={() => setPdfTemplate('executive')} className={`template-btn ${pdfTemplate === 'executive' ? 'active' : ''}`}><Briefcase size={14} /></button>
          </div>
          <button onClick={() => setShowSettings(true)} className="btn btn-ghost no-print" title="Settings">
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
                {useNewAlgo && analysis && (
                  <TableOfContents
                    analysis={analysis}
                    isPdfMode={true}
                    narrative={narrativeTOC || undefined}
                  />
                )}
              </div>

              {useNewAlgo && analysis ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
                  <SortableContext items={currentMessages.map(m => m.id)} strategy={verticalListSortingStrategy}>
                    <div className="messages-list">
                      {currentMessages.map((m, idx) => {
                        const group = analysis.semanticGroups.find(g => g.span[0] === idx);
                        const displayGroup = group ? (editedGroups?.find(eg => eg.id === group.id) || group) : null;
                        return (
                          <div key={m.id}>
                            {displayGroup && (
                              <ChapterDivider
                                group={displayGroup}
                                onUpdateSummary={handleUpdateGroupSummary}
                                sectionText={currentMessages.slice(displayGroup.span[0], displayGroup.span[1] + 1).map(msg => msg.text).join('\n\n')}
                                aiResult={aiResults[1000 + displayGroup.id]}
                                onSetResult={(key, val) => setAiResult(1000 + displayGroup.id, key, val)}
                              />
                            )}
                            <SortableAnalyzedBlock
                              msg={m}
                              onRoleToggle={handleRoleToggle}
                              onMergeWithPrev={handleMergeWithPrev}
                              onUpdateText={handleUpdateMessageText}
                              onUpdateTopics={handleUpdateTopics}
                              aiResult={aiResults[m.id]}
                              onSetResult={(key, val) => setAiResult(m.id, key, val)}
                              isFirst={idx === 0}
                              forceExpand={isPdfExporting}
                            />
                          </div>
                        );
                      })}
                      {learningStats.totalCorrections > 0 && (
                        <div className="learning-stats no-print">
                          <BookOpen size={12} /> Corrections: {learningStats.roleCorrections}
                          <button onClick={() => { clearStore(); setEditedMessages(null); }} className="learning-reset-btn"><RotateCw size={10} /></button>
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="messages-list">
                  {showIndex && <TableOfContents turns={turns} />}
                  {turns.map((t: any) => <TurnBlock key={t.index} turn={t} forceExpand={isPdfExporting} />)}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {parseErrorToast && <div className="toast-error no-print">⚠ Error</div>}

      {showSettings && (
        <div className="modal-overlay no-print" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>System Settings</h3>
              <button className="btn-close" onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            <div className="settings-body">
              <div className="setting-group">
                <label>Gemini API Key</label>
                <div className="api-key-input-wrapper">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => handleSaveApiKey(e.target.value)}
                    placeholder="Enter your Gemini API Key..."
                  />
                  <div className="api-badge">gemini-2.0-flash</div>
                </div>
                <p className="setting-hint">Used for Smart Table Recovery and advanced content analysis. Key is stored locally in your browser.</p>
              </div>

              <div className="setting-group">
                <label>Fallback API Key (Cerebras/Groq)</label>
                <div className="api-key-input-wrapper">
                  <input
                    type="password"
                    value={cerebrasApiKey}
                    onChange={(e) => handleSaveCerebrasApiKey(e.target.value)}
                    placeholder="Enter secondary API key..."
                  />
                  <div className="api-badge secondary-badge">llama-3.1-8b</div>
                </div>
                <p className="setting-hint">Used as a high-speed fallback when Gemini hits rate limits (15 RPM). Supports OpenAI-compatible APIs.</p>
              </div>

              <div className="setting-group">
                <label>Anthropic API Key (Claude)</label>
                <div className="api-key-input-wrapper">
                  <input
                    type="password"
                    value={anthropicApiKey}
                    onChange={(e) => handleSaveAnthropicApiKey(e.target.value)}
                    placeholder="Enter Anthropic key..."
                  />
                  <div className="api-badge anthropic-badge">claude-3-haiku</div>
                </div>
                <p className="setting-hint">Used for high-precision Table Recovery. Best for complex logic and layout reconstruction.</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowSettings(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
