import { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText, Download, Camera, Settings, X, RefreshCcw, Bot,
} from 'lucide-react';
import type { Turn } from '@shared/types';
import { TurnBlock } from '@shared/components/TurnBlock';
import { exportToPdf } from '@shared/utils/pdfExport';
import type { ExtMessage, RawTurn } from '../shared/messages';

// ── Helpers ────────────────────────────────────────────────

/** Convert lightweight DOM-extracted turns into full Turn objects. */
function rawTurnsToTurns(rawTurns: RawTurn[], site: 'gemini' | 'chatgpt'): Turn[] {
  const llmLabel = site === 'gemini' ? 'Gemini' : 'ChatGPT';
  let qIdx = 0;
  return rawTurns.map((raw, index) => {
    const isAssistant = raw.role === 'assistant';
    const summary = raw.role === 'user'
      ? `Q${++qIdx}. ${raw.text.slice(0, 28)}${raw.text.length > 28 ? '…' : ''}`
      : '';
    return {
      role: raw.role,
      llmLabel: isAssistant ? llmLabel : 'USER',
      content: raw.text,
      rawContent: raw.text,
      index,
      summary,
      hasTable: isAssistant ? /\|.+\|/.test(raw.text) : false,
      keyPoints: [],
    };
  });
}

// ── Types ──────────────────────────────────────────────────

type View = 'preview' | 'settings';

// ── Component ──────────────────────────────────────────────

export function App() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState<'gemini' | 'chatgpt' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<View>('preview');
  const [apiKey, setApiKey] = useState('');
  const [savedBadge, setSavedBadge] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Off-screen container: selected turns rendered at 794 px for PDF export
  const exportRef = useRef<HTMLDivElement>(null);

  // Load persisted API key on mount
  useEffect(() => {
    chrome.storage.sync.get(['apiKey'], (result) => {
      if (result.apiKey) setApiKey(result.apiKey as string);
    });
  }, []);

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Capture ───────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        setError('Cannot access the active tab. Is the side panel open on a chat page?');
        return;
      }

      const response = (await chrome.tabs.sendMessage(
        tab.id,
        { type: 'CAPTURE_REQUEST' } satisfies ExtMessage,
      )) as ExtMessage;

      if (response.type === 'CAPTURE_ERROR') {
        setError(response.message);
        return;
      }

      if (response.type === 'CAPTURE_RESULT') {
        const newTurns = rawTurnsToTurns(response.turns, response.site);
        setTurns(newTurns);
        setSite(response.site);
        setSelected(new Set(newTurns.map(t => t.index)));
        setToast(`Captured ${newTurns.length} turns`);
      }
    } catch {
      setError(
        'Could not connect to the page. Make sure you\'re on gemini.google.com or chatgpt.com and refresh the tab.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // ── PDF Export ────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!exportRef.current || selected.size === 0) return;
    setExporting(true);
    try {
      const siteName = site === 'gemini' ? 'Gemini' : site === 'chatgpt' ? 'ChatGPT' : 'Chat';
      await exportToPdf(exportRef.current, `${siteName}_conversation`);
      setToast('PDF downloaded!');
    } finally {
      setExporting(false);
    }
  }, [exportRef, selected.size, site]);

  // ── Selection helpers ──────────────────────────────────
  const toggleTurn = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(prev =>
      prev.size === turns.length
        ? new Set()
        : new Set(turns.map(t => t.index)),
    );
  };

  // ── Settings save ──────────────────────────────────────
  const saveApiKey = () => {
    chrome.storage.sync.set({ apiKey }, () => {
      setSavedBadge(true);
      setTimeout(() => setSavedBadge(false), 2000);
    });
  };

  const selectedTurns = turns.filter(t => selected.has(t.index));

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="ext-panel">

      {/* ── Header ── */}
      <div className="ext-header">
        <FileText size={15} color="#818cf8" />
        <span className="ext-header-title">Gemini PDF Tool</span>
        <button
          className="ext-settings-btn"
          onClick={() => setView(v => v === 'settings' ? 'preview' : 'settings')}
          title={view === 'settings' ? 'Back to preview' : 'Settings'}
        >
          {view === 'settings' ? <X size={15} /> : <Settings size={15} />}
        </button>
      </div>

      {/* ── Settings view ── */}
      {view === 'settings' ? (
        <div className="ext-settings-panel">
          <div className="ext-settings-section-title">Settings</div>

          <div className="ext-settings-group">
            <label className="ext-settings-label">Gemini API Key</label>
            <span className="ext-settings-hint">
              Used for AI-enhanced parsing (optional). Stored locally in your browser.
            </span>
            <input
              type="password"
              className="ext-settings-input"
              placeholder="AIza…"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveApiKey()}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <button
                className="ext-btn ext-btn-primary"
                style={{ alignSelf: 'flex-start' }}
                onClick={saveApiKey}
              >
                Save
              </button>
              {savedBadge && <span className="ext-save-badge">✓ Saved</span>}
            </div>
          </div>

          <div className="ext-settings-group">
            <label className="ext-settings-label">Supported Sites</label>
            <span className="ext-settings-hint">
              The extension automatically activates on:<br />
              • gemini.google.com<br />
              • chatgpt.com
            </span>
          </div>
        </div>

      ) : (
        <>
          {/* ── Toolbar ── */}
          <div className="ext-toolbar">
            <button
              className="ext-btn ext-btn-primary"
              onClick={handleCapture}
              disabled={loading || exporting}
            >
              {loading ? (
                <><span className="ext-spinner" style={{ width: 12, height: 12 }} />Capturing…</>
              ) : (
                <><Camera size={13} />Capture</>
              )}
            </button>

            {turns.length > 0 && (
              <button
                className="ext-btn ext-btn-icon"
                onClick={handleCapture}
                disabled={loading}
                title="Re-capture conversation"
              >
                <RefreshCcw size={12} />
              </button>
            )}

            {turns.length > 0 && (
              <button
                className="ext-btn ext-btn-primary"
                style={{ marginLeft: 'auto' }}
                onClick={handleExport}
                disabled={exporting || selected.size === 0}
                title={selected.size === 0 ? 'Select at least one turn' : 'Export selected turns to PDF'}
              >
                {exporting ? (
                  <><span className="ext-spinner" style={{ width: 12, height: 12 }} />Exporting…</>
                ) : (
                  <><Download size={13} />PDF ({selected.size})</>
                )}
              </button>
            )}
          </div>

          {/* ── Select-all bar ── */}
          {turns.length > 0 && (
            <div className="ext-select-all-bar">
              <input
                type="checkbox"
                checked={selected.size === turns.length && turns.length > 0}
                onChange={toggleAll}
                title="Select / deselect all"
              />
              <span>{selected.size} / {turns.length} turns selected</span>
              {site && (
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Bot size={10} />
                  {site === 'gemini' ? 'Gemini' : 'ChatGPT'}
                </span>
              )}
            </div>
          )}

          {/* ── Error banner ── */}
          {error && (
            <div className="ext-error">
              {error}
            </div>
          )}

          {/* ── Content area ── */}
          {loading ? (
            <div className="ext-loading">
              <div className="ext-spinner" />
              Reading conversation…
            </div>
          ) : turns.length === 0 && !error ? (
            <div className="ext-empty">
              <div className="ext-empty-icon">
                <FileText size={22} />
              </div>
              <div className="ext-empty-title">No conversation loaded</div>
              <div className="ext-empty-desc">
                Open a chat on <strong>gemini.google.com</strong> or <strong>chatgpt.com</strong>,
                then click <strong>Capture</strong> above.
              </div>
            </div>
          ) : (
            /* ── Turn preview list ── */
            <div className="ext-preview">
              {turns.map(turn => (
                <div
                  key={turn.index}
                  className={`ext-turn-row${selected.has(turn.index) ? '' : ' ext-turn-deselected'}`}
                >
                  <input
                    type="checkbox"
                    className="ext-turn-checkbox"
                    checked={selected.has(turn.index)}
                    onChange={() => toggleTurn(turn.index)}
                    title={selected.has(turn.index) ? 'Exclude from PDF' : 'Include in PDF'}
                  />
                  <div className="ext-turn-block">
                    <TurnBlock turn={turn} forceExpand={false} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Off-screen export container ─────────────────────────────
          Renders only the *selected* turns at full A4 width for PDF.
          Positioned off-screen so it doesn't affect visible layout.  */}
      <div ref={exportRef} className="ext-export-container">
        <div className="messages-list">
          {selectedTurns.map(turn => (
            <TurnBlock key={turn.index} turn={turn} forceExpand={true} />
          ))}
        </div>
      </div>

      {/* ── Toast notification ── */}
      {toast && <div className="ext-toast">{toast}</div>}
    </div>
  );
}
