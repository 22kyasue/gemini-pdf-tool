import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  FileText, Download, User, Table, Zap,
  List, BookOpen, GraduationCap, Briefcase,
  Layout, Plus, Trash, RotateCw
} from 'lucide-react';

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

  useEffect(() => {
    if (analysis) {
      setEditedMessages(analysis.messages);
      setEditedGroups(analysis.semanticGroups);
    }
  }, [analysis]);

  const handleUpdateTopics = useCallback((id: number, topics: string[]) => {
    setEditedMessages(prev => prev ? prev.map(m => m.id === id ? { ...m, topic: topics } : m) : null);
  }, []);

  const handleUpdateGroupSummary = useCallback((id: number, summary: string) => {
    setEditedGroups(prev => prev ? prev.map(g => g.id === id ? { ...g, customSummary: summary } : g) : null);
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
  const [learningStatsTick, setLearningStatsTick] = useState(0);

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
    setLearningStatsTick(n => n + 1);
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
        intent: [...new Set([...prevMsg.intent, ...target.intent])],
        topic: [...new Set([...prevMsg.topic, ...target.topic])],
        artifact: [...new Set([...prevMsg.artifact, ...target.artifact])]
      };
      const result = [...prev];
      result.splice(idx - 1, 2, merged);
      return result;
    });
  }, []);

  const handleUpdateMessageText = useCallback((id: number, text: string) => {
    setEditedMessages(prev => prev ? prev.map(m => m.id === id ? { ...m, text } : m) : null);
  }, []);

  const learningStats = useMemo(() => getStoreStats(), [learningStatsTick]);

  const activeLLMDetection = useMemo(() => activeSource.content.trim()
    ? detectLLMWithConfidence(activeSource.content)
    : { llm: 'Unknown' as LLMType, confidence: 0, scores: {} as any },
    [activeSource.content]
  );

  const selectedLLM = llmOverride ?? activeLLMDetection.llm;

  const stats = useMemo(() => {
    const msgs = useNewAlgo && analysis ? analysis.messages : turns;
    return {
      user: msgs.filter((m: any) => m.role === 'user').length,
      tables: msgs.filter((m: any) => (m.role === 'ai' || m.role === 'assistant') && (/\|/.test(m.text || m.rawContent) || /<table/i.test(m.text || m.rawContent))).length,
      blocks: msgs.length
    };
  }, [useNewAlgo, analysis, turns]);

  const handleExportPdf = async () => {
    if (!previewRef.current) return;
    setIsPdfExporting(true);
    setExporting(true);
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await exportToPdf(previewRef.current, 'Synthesis_Archive.pdf', scrollRef.current);
    } finally {
      setExporting(false);
      setIsPdfExporting(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <FileText size={20} />
          <div>
            <strong>LLM Synthesis Tool</strong>
            <span className="header-sub">Unified Multi-Log Studio</span>
          </div>
        </div>
        <div className="header-stats">
          <span className="stat"><User size={12} />{stats.user} msgs</span>
          <span className="stat"><Table size={12} />{stats.tables} tables</span>
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
          <div className="source-list">
            {sources.map(s => (
              <div
                key={s.id}
                className={`source-item ${activeSourceId === s.id ? 'active' : ''}`}
                onClick={() => setActiveSourceId(s.id)}
              >
                <div className="source-header">
                  <input
                    type="text"
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
                {useNewAlgo && analysis && <TableOfContents analysis={analysis} isPdfMode={true} />}
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
                            {displayGroup && <ChapterDivider group={displayGroup} onUpdateSummary={handleUpdateGroupSummary} />}
                            <SortableAnalyzedBlock
                              msg={m}
                              onRoleToggle={handleRoleToggle}
                              onMergeWithPrev={handleMergeWithPrev}
                              onUpdateText={handleUpdateMessageText}
                              onUpdateTopics={handleUpdateTopics}
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
    </div>
  );
}
