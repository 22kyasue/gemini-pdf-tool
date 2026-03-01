import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { SharePdfDocument } from '../components/SharePdfDocument';
import { exportToPdf } from './pdfExport';
import type { PdfOutlineEntry } from './pdfExport';
import type { ShareTurn } from './shareImport';

// Page geometry constants (must match exportToPdf)
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 15;
const PRINTABLE_WIDTH_MM = A4_HEIGHT_MM - MARGIN_MM * 2; // unused but for clarity
const BASE_WIDTH = 794;
const CONTENT_MM_PER_PAGE = A4_HEIGHT_MM - MARGIN_MM * 2; // 267mm of content per page
const MM_PER_PX = (210 - MARGIN_MM * 2) / BASE_WIDTH;     // 180mm / 794px ≈ 0.2267

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
    // 4. Build PDF outline from measured DOM positions
    const outline: PdfOutlineEntry[] = [];
    const children = Array.from(container.children) as HTMLElement[];
    let cumPx = 0;
    let turnIdx = 0;

    for (const child of children) {
      if (child.classList.contains('share-pdf-turn')) {
        const blockMm = cumPx * MM_PER_PX;
        const page = Math.floor(blockMm / CONTENT_MM_PER_PAGE) + 1;
        const turn = turns[turnIdx];
        if (turn) {
          const role = turn.role === 'user' ? 'You' : platform;
          const preview = turn.content.slice(0, 50).replace(/\n/g, ' ');
          outline.push({
            title: `${role}: ${preview}${turn.content.length > 50 ? '...' : ''}`,
            pageNumber: page,
          });
        }
        turnIdx++;
      }
      cumPx += child.offsetHeight || 100;
    }

    // 5. Generate the filename
    const safeTitle = title.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60) || 'Chat';
    const filename = `${safeTitle} - ${platform}`;

    // 6. Run the existing chunked PDF pipeline with footer + outline
    await exportToPdf(container, filename, null, {
      left: 'Powered by ChatSource',
    }, outline);
  } finally {
    // 7. Clean up
    root.unmount();
    container.remove();
  }
}
