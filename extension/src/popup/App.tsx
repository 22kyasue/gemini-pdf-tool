import { useState, useEffect } from 'react';
import { FileText, Key, ExternalLink } from 'lucide-react';

// ══════════════════════════════════════════════════════════
// POPUP APP — Settings UI
//
// Accessible from the extension icon if you add default_popup
// to the manifest's action field. For the side-panel workflow,
// settings live inside the side panel. This popup acts as a
// standalone settings page for users who prefer it.
// ══════════════════════════════════════════════════════════

export function PopupApp() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(['apiKey'], result => {
      if (result.apiKey) setApiKey(result.apiKey as string);
    });
  }, []);

  const handleSave = () => {
    chrome.storage.sync.set({ apiKey }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  };

  return (
    <div
      style={{
        width: 280,
        fontFamily: 'Inter, sans-serif',
        background: '#0f172a',
        color: '#f1f5f9',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderBottom: '1px solid rgba(99,102,241,0.2)',
        }}
      >
        <FileText size={16} color="#818cf8" />
        <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.04em' }}>
          Gemini PDF Tool
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: 16 }}>
        {/* Open side panel button */}
        <button
          onClick={openSidePanel}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '8px 12px',
            marginBottom: 16,
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <ExternalLink size={13} />
          Open Side Panel
        </button>

        {/* API Key */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Key size={12} color="#94a3b8" />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Gemini API Key
          </span>
        </div>

        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="AIza…"
          style={{
            width: '100%',
            padding: '7px 10px',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 7,
            color: '#f1f5f9',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <button
            onClick={handleSave}
            style={{
              padding: '6px 14px',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#fff',
              border: 'none',
              borderRadius: 7,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Save
          </button>
          {saved && (
            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>
              ✓ Saved
            </span>
          )}
        </div>

        <p style={{ fontSize: 10, color: '#64748b', marginTop: 12, lineHeight: 1.5 }}>
          The API key is stored locally in your browser and never sent to any server other than Google's API.
        </p>
      </div>
    </div>
  );
}
