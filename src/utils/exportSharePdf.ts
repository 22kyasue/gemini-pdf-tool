import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { SharePdfDocument } from '../components/SharePdfDocument';
import { exportToPdf } from './pdfExport';
import type { ShareTurn } from './shareImport';

const BASE_WIDTH = 794;

export async function exportSharePdf(
  title: string,
  turns: ShareTurn[],
  platform: string,
  sourceUrl?: string,
): Promise<void> {
  // 1. Create hidden container
  const container = document.createElement('div');
  container.className = 'share-pdf-doc';
  container.style.position = 'absolute';
  container.style.top = '-99999px';
  container.style.left = '-99999px';
  container.style.width = `${BASE_WIDTH}px`;
  container.style.background = '#fff';
  document.body.appendChild(container);

  // 2. Render the Chat2Doc-style document via React
  const root = createRoot(container);
  root.render(
    createElement(SharePdfDocument, { title, turns, platform, sourceUrl }),
  );

  // 3. Wait for React render + layout + code highlighting + mermaid
  await new Promise(r => setTimeout(r, 1500));

  try {
    // 4. Generate the filename
    const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60) || 'Chat';
    const filename = `${safeTitle} - ${platform}`;

    // 5. Run the chunked PDF pipeline with footer
    await exportToPdf(container, filename, null, {
      left: 'Powered by ChatSource',
    });
  } finally {
    // 6. Clean up
    root.unmount();
    container.remove();
  }
}
