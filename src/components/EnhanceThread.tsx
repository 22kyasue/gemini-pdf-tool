import { useState, useRef, useEffect } from 'react';
import { Sparkles, User, AlertCircle, Loader, RefreshCcw } from 'lucide-react';
import type { EnhanceMessage } from '../types';
import type { ApiFeature } from '../utils/llmParser';

interface EnhanceThreadProps {
  history: EnhanceMessage[];
  enhanceCount: number;
  activeFeatures: ApiFeature[];
  isEnhancing: boolean;
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
  t: {
    aiEnhancement: string;
    enhancedCount: string;
    enhancing: string;
    cancel: string;
    reEnhancePlaceholder: string;
    reEnhance: string;
    formatting: string;
    tables: string;
    code: string;
    latex: string;
  };
}

export function EnhanceThread({ history, enhanceCount, activeFeatures, isEnhancing, onSubmit, onCancel, t }: EnhanceThreadProps) {
  const [inputValue, setInputValue] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const featureLabel: Record<string, string> = { format: t.formatting, tables: t.tables, code: t.code, latex: t.latex };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, isEnhancing]);

  const handleSubmit = () => {
    const text = inputValue.trim();
    if (!text || isEnhancing) return;
    setInputValue('');
    onSubmit(text);
  };

  return (
    <div className="enhance-thread no-print">
      <div className="enhance-thread-header">
        <Sparkles size={14} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{t.aiEnhancement}</span>
        {enhanceCount > 0 && (
          <span className="enhance-counter">{t.enhancedCount} {enhanceCount}x</span>
        )}
        {activeFeatures.length > 0 && (
          <div className="enhance-thread-chips">
            {activeFeatures.map(f => (
              <span key={f} className="enhance-thread-chip">{featureLabel[f] ?? f}</span>
            ))}
          </div>
        )}
      </div>

      {(history.length > 0 || isEnhancing) && (
        <div className="enhance-thread-messages">
          {history.map(msg => (
            <div key={msg.id} className={`enhance-msg enhance-msg--${msg.type}`}>
              {msg.type === 'user' && <User size={12} style={{ flexShrink: 0, marginTop: 2 }} />}
              {msg.type === 'system' && <Sparkles size={12} style={{ flexShrink: 0, marginTop: 2 }} />}
              {msg.type === 'error' && <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} />}
              <span className="enhance-msg-text">
                {msg.text}
                {msg.tokens && (
                  <span className="enhance-msg-tokens">
                    {' '}({msg.tokens.promptTokens.toLocaleString()} in + {msg.tokens.responseTokens.toLocaleString()} out = {msg.tokens.totalTokens.toLocaleString()} tok)
                  </span>
                )}
              </span>
            </div>
          ))}
          {isEnhancing && (
            <div className="enhance-msg enhance-msg--loading">
              <Loader size={12} className="animate-spin" style={{ flexShrink: 0, marginTop: 2 }} />
              <span className="enhance-msg-text">{t.enhancing}</span>
              <button className="cancel-enhance-btn" onClick={onCancel} style={{ marginLeft: 'auto' }}>{t.cancel}</button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="enhance-thread-input-row">
        <input
          type="text"
          placeholder={t.reEnhancePlaceholder}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          className="instruction-input"
          disabled={isEnhancing}
        />
        <button
          className="sync-banner-btn"
          onClick={handleSubmit}
          disabled={isEnhancing || !inputValue.trim()}
          title="Re-enhance with AI"
        >
          <RefreshCcw size={13} /> {t.reEnhance}
        </button>
      </div>
    </div>
  );
}
