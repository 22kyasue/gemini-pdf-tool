import { useState, useRef, useMemo, useCallback } from 'react';
import { FileText, Download, Trash2, User, Table, Clipboard, Check, Zap, List, BookOpen, RotateCcw, Undo2, Redo2 } from 'lucide-react';

// ── Types ──
import type { Turn, LLMName } from './types';

// ── Utils ──
import { parseChatLog } from './utils/chatParser';
import { buildNotebookLMMarkdown } from './utils/notebookLM';
import { exportToPdf } from './utils/pdfExport';

// ── Components ──
import { TurnBlock } from './components/TurnBlock';
import { TableOfContents } from './components/TableOfContents';
import { LLMSelector } from './components/LLMSelector';
import { AnalyzedBlock } from './components/AnalyzedBlock';
import { _onRenderError } from './components/ErrorBoundary';

// ── Hooks ──
import { useTextHistory } from './hooks/useTextHistory';

// ── New algorithm pipeline ──
import { analyzeConversation } from './algorithm';
import type { AnalysisResult, AnalyzedMessage } from './algorithm';
import { detectLLMWithConfidence } from './algorithm/llmDetector';
import type { LLMType } from './algorithm/llmDetector';
import { addRoleCorrection, getStoreStats, clearStore } from './algorithm/correctionStore';
import { recomputeWeights } from './algorithm/weightUpdater';

// ══════════════════════════════════════════════════════════
// SAMPLE DATA
// ══════════════════════════════════════════════════════════
const SAMPLE = `アンチエイジングに最も効果的な栄養素と、その摂取方法を年齢別に教えてください。
あなたのプロンプト
アンチエイジングに最も効果的な栄養素と、その摂取方法を年齢別に教えてください。
Gemini の回答
## 年齢別アンチエイジング栄養素ガイド

| 年代 | 優先栄養素 | 主な効果 | 摂取方法 |
|------|-----------|---------|---------|
| 20代 | ビタミンC・コラーゲン | 酸化ダメージ防止 | 200mg/日、食後 |
| 30代 | CoQ10・ビタミンE | 細胞エネルギー産生維持 | 100mg/日、脂溶性なので食中 |
| 40代 | NMN・レスベラトロール | NAD+前駆体、サーチュイン活性 | 250mg/日、空腹時 |
| 50代以上 | NMN・マグネシウム | 代謝維持・睡眠改善 | 500mg/日、就寝1時間前 |

1. ビタミンCは最も手軽で効果の高い出発点
2. 30〜40代はCoQ10による代謝サポートが不可欠
3. 50代以降はNMNなどNAD+前駆体への投資が最優先

あなたのプロンプト
睡眠の質がアンチエイジングに与える影響と、具体的な改善方法を教えてください。
Gemini の回答
## 睡眠とアンチエイジングの深い関係

| 睡眠フェーズ | 主な修復活動 | 不足時の影響 |
|------------|-----------|-----------|
| 深睡眠（N3） | 成長ホルモン分泌・細胞修復 | 肌荒れ・筋力低下 |
| REM睡眠 | 記憶整理・情動調整 | 認知機能低下 |
| 全体 | コルチゾール抑制 | 炎症促進・老化加速 |

### 改善の3ステップ

1. **就寝2時間前**：スマートフォン・液晶画面を遮断
2. **室温18〜20℃**：体温低下を促進し入眠を早める
3. **マグネシウム補給**：就寝30分前に300mg摂取

**睡眠の質**こそが最も費用対効果の高いアンチエイジング投資です。7〜9時間の質の高い睡眠は、いかなるサプリメントよりも強力な老化防止効果を持ちます。`;

// ══════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════
export default function App() {
  // UX-3: Undo/Redo history for the textarea
  const { value: rawInput, set: setRawInput, undo, redo, canUndo, canRedo } = useTextHistory(SAMPLE);
  const [exporting, setExporting] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showIndex, setShowIndex] = useState(true);
  const [useNewAlgo, setUseNewAlgo] = useState(false);
  const [llmOverride, setLlmOverride] = useState<LLMType | null>(null);
  // UX-2: mobile tab state
  const [mobileTab, setMobileTab] = useState<'input' | 'preview'>('input');
  // UX-4: parse error toast
  const [parseErrorToast, setParseErrorToast] = useState(false);
  const showParseError = useCallback(() => {
    setParseErrorToast(true);
    setTimeout(() => setParseErrorToast(false), 2500);
  }, []);
  const previewRef = useRef<HTMLDivElement>(null);
  // Wire toast callback into the module-level ref so ContentRenderer can call it
  _onRenderError.current = showParseError;

  // Reset LLM override when input changes so auto-detection takes effect
  const prevInputRef = useRef(rawInput);
  if (rawInput !== prevInputRef.current) {
    prevInputRef.current = rawInput;
    if (llmOverride !== null) setLlmOverride(null);
  }

  // ── Legacy pipeline ──
  const { turns, llm } = useMemo(
    () => rawInput.trim() ? parseChatLog(rawInput) : { turns: [], llm: 'AI' as LLMName },
    [rawInput]
  );

  // ── New algorithm pipeline ──
  const analysis: AnalysisResult | null = useMemo(
    () => useNewAlgo && rawInput.trim() ? analyzeConversation(rawInput) : null,
    [rawInput, useNewAlgo]
  );

  // ── Editable messages (for corrections) ──
  const [editedMessages, setEditedMessages] = useState<AnalyzedMessage[] | null>(null);
  const analysisRef = useRef(analysis);
  if (analysis !== analysisRef.current) {
    analysisRef.current = analysis;
    setEditedMessages(analysis?.messages ?? null);
  }
  const currentMessages = editedMessages ?? analysis?.messages ?? [];

  // ── Role toggle handler ──
  const handleRoleToggle = useCallback((id: number) => {
    setEditedMessages(prev => {
      if (!prev) return prev;
      return prev.map(m => {
        if (m.id !== id) return m;
        const newRole = m.role === 'user' ? 'ai' as const : 'user' as const;
        addRoleCorrection({
          timestamp: Date.now(),
          textSnippet: m.text.slice(0, 200),
          originalRole: m.role,
          correctedRole: newRole,
          activeFeatures: [],
          charCount: m.text.length,
          originalConfidence: m.confidence,
        });
        recomputeWeights();
        return { ...m, role: newRole, confidence: 1.0 };
      });
    });
  }, []);

  // ── Merge with previous block handler ──
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
        artifact: [...new Set([...prevMsg.artifact, ...target.artifact])],
      };
      const result = [...prev];
      result.splice(idx - 1, 2, merged);
      return result;
    });
  }, []);

  // ── Learning stats ──
  const learningStats = useMemo(() => getStoreStats(), [editedMessages]);

  // ── LLM detection ──
  const llmDetection = useMemo(
    () => rawInput.trim()
      ? detectLLMWithConfidence(rawInput)
      : { llm: 'Unknown' as LLMType, confidence: 0, scores: {} as Record<LLMType, number> },
    [rawInput]
  );
  const selectedLLM = llmOverride ?? llmDetection.llm;

  const userCount = useNewAlgo && analysis
    ? analysis.messages.filter(m => m.role === 'user').length
    : turns.filter((t: Turn) => t.role === 'user').length;
  const tableCount = turns.filter((t: Turn) => t.hasTable).length;
  const blockCount = useNewAlgo && analysis ? analysis.messages.length : turns.length;

  // ── PDF filename ──
  const pdfFilename = useMemo(() => {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    if (useNewAlgo && analysis) {
      const firstQ = analysis.messages.find(m => m.role === 'user');
      const qSlug = firstQ
        ? firstQ.text.split('\n').find((l: string) => l.trim())?.trim().slice(0, 28).replace(/[\\/:*?"<>|]/g, '') ?? 'archive'
        : 'archive';
      return `${selectedLLM}_${date}_${qSlug}.pdf`;
    }
    const firstQ = turns.find((t: Turn) => t.role === 'user');
    const qSlug = firstQ
      ? firstQ.rawContent.split('\n').find((l: string) => l.trim())?.trim().slice(0, 28).replace(/[\\/:*?"<>|]/g, '') ?? 'archive'
      : 'archive';
    return `${llm}_${date}_${qSlug}.pdf`;
  }, [turns, llm, analysis, useNewAlgo, selectedLLM]);

  // ── PDF export ──
  const handleExportPdf = async () => {
    if (!previewRef.current) return;
    setIsPdfExporting(true);
    setExporting(true);
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await exportToPdf(previewRef.current, pdfFilename);
    } finally {
      setExporting(false);
      setIsPdfExporting(false);
    }
  };

  const handleCopyNotebookLM = async () => {
    if (turns.length === 0) return;
    const md = buildNotebookLMMarkdown(turns);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleExportJSON = () => {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <FileText size={20} strokeWidth={2} />
          <div>
            <strong>LLM 対話アーカイブ</strong>
            <span className="header-sub">Universal Chat Archive &amp; PDF Exporter</span>
          </div>
        </div>
        <div className="header-stats">
          <span className="stat"><User size={12} strokeWidth={2} />{userCount} 問</span>
          <span className="stat"><Table size={12} strokeWidth={2} />{tableCount} 表</span>
        </div>
        <div className="header-actions">
          {/* Algorithm mode toggle */}
          <button
            onClick={() => setUseNewAlgo(v => !v)}
            className={`btn ${useNewAlgo ? 'btn-algo-active' : 'btn-ghost'}`}
            title={useNewAlgo ? 'アルゴリズムモード ON' : 'レガシーモード'}
          >
            <Zap size={14} strokeWidth={2} />
            {useNewAlgo ? 'Algo' : 'Legacy'}
          </button>
          <button onClick={() => setShowIndex(v => !v)} className={`btn btn-ghost ${showIndex ? 'btn-active' : ''}`}>
            <List size={14} strokeWidth={2} />目次
          </button>
          <button
            onClick={handleCopyNotebookLM}
            disabled={turns.length === 0}
            className={`btn ${copied ? 'btn-copied' : 'btn-nb'}`}
            title="NotebookLM向けにクレンジングしたMarkdownをコピー"
          >
            {copied ? <Check size={14} strokeWidth={2.5} /> : <Clipboard size={14} strokeWidth={2} />}
            {copied ? 'コピー済み' : 'NotebookLM用'}
          </button>
          {useNewAlgo && analysis && (
            <button onClick={handleExportJSON} className="btn btn-ghost" title="解析結果をJSONでエクスポート">
              <Download size={14} strokeWidth={2} />JSON
            </button>
          )}
          {/* UX-3: Undo / Redo */}
          <button onClick={undo} disabled={!canUndo} className="btn btn-ghost" title="元に戻す (Undo)">
            <Undo2 size={14} strokeWidth={2} />
          </button>
          <button onClick={redo} disabled={!canRedo} className="btn btn-ghost" title="やり直し (Redo)">
            <Redo2 size={14} strokeWidth={2} />
          </button>
          <button onClick={() => setRawInput('')} disabled={!rawInput} className="btn btn-ghost">
            <Trash2 size={14} strokeWidth={2} />クリア
          </button>
          <button onClick={handleExportPdf} disabled={exporting || blockCount === 0} className="btn btn-primary">
            <Download size={15} strokeWidth={2} />
            {exporting ? '生成中…' : 'PDF出力'}
          </button>
        </div>
      </header>

      {/* UX-2: Mobile tab bar */}
      <div className="mobile-tabs no-print">
        <button
          className={`mobile-tab ${mobileTab === 'input' ? 'mobile-tab-active' : ''}`}
          onClick={() => setMobileTab('input')}
        >
          入力
        </button>
        <button
          className={`mobile-tab ${mobileTab === 'preview' ? 'mobile-tab-active' : ''}`}
          onClick={() => setMobileTab('preview')}
        >
          プレビュー{blockCount > 0 && <span className="mobile-tab-badge">{blockCount}</span>}
        </button>
      </div>

      <main className="app-main">
        <section className={`panel panel-left ${mobileTab !== 'input' ? 'mobile-hidden' : ''}`}>
          <div className="panel-header">
            <span className="panel-title">入力エリア</span>
            <span className="panel-hint">{rawInput.split('\n').length} 行 · {rawInput.length} 文字</span>
          </div>

          <LLMSelector
            detected={llmDetection.llm}
            selected={selectedLLM}
            confidence={llmDetection.confidence}
            onSelect={(llm) => setLlmOverride(llm)}
          />

          <textarea
            className="raw-input"
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            placeholder="Gemini / ChatGPT / Claude のチャットをここに貼り付け&#10;&#10;Ctrl+A → Ctrl+C → Ctrl+V"
            spellCheck={false}
          />
        </section>

        <section className={`panel panel-right ${mobileTab !== 'preview' ? 'mobile-hidden' : ''}`}>
          <div className="panel-header">
            <span className="panel-title">プレビュー</span>
            <span className="panel-hint">
              {blockCount} ブロック
              {useNewAlgo && analysis && ` · ${analysis.semanticGroups.length} グループ`}
            </span>
          </div>
          <div className="preview-scroll">
            <div className="preview-page" ref={previewRef}>
              {/* ── New Algorithm View ── */}
              {useNewAlgo && analysis ? (
                currentMessages.length === 0
                  ? <p className="empty-hint">左にチャットを貼り付けてください。</p>
                  : <>
                    {currentMessages.map((msg, idx) => (
                      <AnalyzedBlock
                        key={msg.id}
                        msg={msg}
                        onRoleToggle={handleRoleToggle}
                        onMergeWithPrev={handleMergeWithPrev}
                        isFirst={idx === 0}
                      />
                    ))}
                    {learningStats.totalCorrections > 0 && (
                      <div className="learning-stats no-print">
                        <BookOpen size={12} strokeWidth={2} />
                        <span>学習済み: {learningStats.roleCorrections}修正 · {learningStats.learnedFeatures}特徴調整</span>
                        <button className="learning-reset-btn" onClick={() => { clearStore(); setEditedMessages(analysis?.messages ?? null); }} title="学習データをリセット">
                          <RotateCcw size={10} strokeWidth={2} />リセット
                        </button>
                      </div>
                    )}
                  </>
              ) : (
                /* ── Legacy View ── */
                turns.length === 0
                  ? <p className="empty-hint">左にチャットを貼り付けてください。</p>
                  : <>
                    {showIndex && <TableOfContents turns={turns} />}
                    {turns.map(t => <TurnBlock key={t.index} turn={t} forceExpand={isPdfExporting} />)}
                  </>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* UX-4: Parse error toast */}
      {parseErrorToast && (
        <div className="toast-error no-print" role="alert">
          ⚠ 一部ブロックのレンダリングに失敗しました
        </div>
      )}
    </div>
  );
}
