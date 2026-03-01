// ══════════════════════════════════════════════════════════
// CONTENT SCRIPT — Shadow DOM Bootstrap
//
// Injected into gemini.google.com and chatgpt.com.
// Renders a floating "Export Doc" button and export modal
// inside a shadow DOM to isolate styles from the host page.
// ══════════════════════════════════════════════════════════

import { createRoot } from 'react-dom/client';
import { useState, useCallback, useEffect } from 'react';
import { FloatingButton } from './FloatingButton';
import { ExportModal } from './ExportModal';
import { extractFromGemini, extractFromChatGPT, detectSite } from './extractors';
import type { RawTurn } from '../shared/messages';
import type { ExtMessage } from '../shared/messages';
import contentCss from './content.css?inline';

// ── App Component ──────────────────────────────────────────

function ContentApp() {
  const [visible, setVisible] = useState(true);
  const [modalData, setModalData] = useState<{
    turns: RawTurn[];
    site: 'gemini' | 'chatgpt';
  } | null>(null);

  // Listen for TOGGLE_BUTTON messages from the background script
  useEffect(() => {
    const handler = (message: ExtMessage) => {
      if (message.type === 'TOGGLE_BUTTON') {
        setVisible(v => !v);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const handleButtonClick = useCallback(() => {
    const site = detectSite();
    if (!site) return;

    const turns = site === 'gemini' ? extractFromGemini() : extractFromChatGPT();

    if (turns.length === 0) {
      alert('No conversation found on this page. Start a chat and try again.');
      return;
    }

    setModalData({ turns, site });
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalData(null);
  }, []);

  return (
    <>
      {visible && !modalData && (
        <FloatingButton onClick={handleButtonClick} />
      )}
      {modalData && (
        <ExportModal
          turns={modalData.turns}
          site={modalData.site}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}

// ── Suppress Vite preload errors in extension context ──────
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
});

// ── Shadow DOM Bootstrap ───────────────────────────────────

function bootstrap() {
  // Prevent double-injection
  if (document.getElementById('gemini-pdf-tool-root')) return;

  const host = document.createElement('div');
  host.id = 'gemini-pdf-tool-root';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Inject styles into shadow DOM
  const style = document.createElement('style');
  style.textContent = contentCss;
  shadow.appendChild(style);

  // React mount point
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(<ContentApp />);
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
