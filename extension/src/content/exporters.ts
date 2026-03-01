// ══════════════════════════════════════════════════════════
// EXPORT FORMAT IMPLEMENTATIONS
//
// PDF extracts the rendered HTML from each conversation turn
// (preserving code blocks, tables, headings, lists) and renders
// it with proper styling via html2canvas + jsPDF for auto-download.
//
// Heavy libs (jspdf, html2canvas, docx) are dynamically
// imported so they only load when the user clicks Download.
// ══════════════════════════════════════════════════════════

import type { RawTurn } from '../shared/messages';
import type { ExportFormat } from './ExportModal';

// ── Helpers ────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadText(content: string, filename: string, mime: string) {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

// ── Markdown Export ────────────────────────────────────────

function exportToMarkdown(turns: RawTurn[], site: string, filename: string) {
  const siteLabel = site === 'gemini' ? 'Gemini' : 'ChatGPT';
  const lines: string[] = [
    `# ${siteLabel} Conversation Export`,
    `> Exported on ${new Date().toLocaleString()} — ${turns.length} turns`,
    '',
    '---',
    '',
  ];

  for (const turn of turns) {
    const roleLabel = turn.role === 'user' ? 'User' : siteLabel;
    lines.push(`## ${roleLabel}`);
    lines.push('');
    lines.push(turn.text);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  downloadText(lines.join('\n'), `${filename}.md`, 'text/markdown');
}

// ── JSON Export ────────────────────────────────────────────

function exportToJson(turns: RawTurn[], site: string, filename: string) {
  const payload = {
    metadata: {
      source: site,
      exportedAt: new Date().toISOString(),
      turnCount: turns.length,
    },
    turns: turns.map((t, i) => ({
      index: i,
      role: t.role,
      text: t.text,
    })),
  };

  downloadText(JSON.stringify(payload, null, 2), `${filename}.json`, 'application/json');
}

// ── CSV Export ─────────────────────────────────────────────

function escapeCsvField(field: string): string {
  if (field.includes('"') || field.includes(',') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function exportToCsv(turns: RawTurn[], _site: string, filename: string) {
  const rows = [
    'index,role,text',
    ...turns.map((t, i) => `${i},${t.role},${escapeCsvField(t.text)}`),
  ];

  downloadText(rows.join('\n'), `${filename}.csv`, 'text/csv');
}

// ── Word (DOCX) Export ─────────────────────────────────────

async function exportToDocx(turns: RawTurn[], site: string, filename: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

  const siteLabel = site === 'gemini' ? 'Gemini' : 'ChatGPT';

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      text: `${siteLabel} Conversation Export`,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Exported on ${new Date().toLocaleString()} — ${turns.length} turns`,
          italics: true,
          color: '666666',
          size: 20,
        }),
      ],
    }),
    new Paragraph({ text: '' }),
  ];

  for (const turn of turns) {
    const roleLabel = turn.role === 'user' ? 'User' : siteLabel;

    children.push(
      new Paragraph({
        text: roleLabel,
        heading: HeadingLevel.HEADING_2,
      }),
    );

    const paras = turn.text.split('\n');
    for (const p of paras) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: p, size: 22 })],
        }),
      );
    }

    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${filename}.docx`);
}

// ── PDF Export ─────────────────────────────────────────────

/**
 * Extract the inner HTML content from a conversation element.
 * Handles both regular DOM and Shadow DOM (Gemini custom elements).
 */
function extractTurnHtml(el: HTMLElement, site: string): { html: string; role: 'user' | 'assistant' } {
  const tag = el.tagName.toLowerCase();

  // Determine role
  let role: 'user' | 'assistant' = 'assistant';
  if (site === 'gemini') {
    role = tag === 'user-query' ? 'user' : 'assistant';
  } else {
    const authorRole = el.getAttribute('data-message-author-role');
    role = authorRole === 'user' ? 'user' : 'assistant';
  }

  // Try to find the content area — check shadow DOM first, then regular DOM
  const root = el.shadowRoot || el;

  const contentEl =
    root.querySelector('.markdown') ??
    root.querySelector('.model-response-text') ??
    root.querySelector('[class*="markdown"]') ??
    root.querySelector('.prose') ??
    root.querySelector('[class*="content"]');

  if (contentEl) {
    return { html: contentEl.innerHTML, role };
  }

  // Fallback: use the element's own innerHTML or innerText
  if (el.shadowRoot) {
    // Shadow DOM but no content selector found — grab everything from shadow
    return { html: el.shadowRoot.innerHTML, role };
  }

  return { html: el.innerHTML, role };
}

/** CSS that styles the extracted HTML content for PDF rendering */
const PDF_CONTENT_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; }

  h1 { font-size: 1.6em; font-weight: 700; color: #111827; margin: 1em 0 0.5em; }
  h2 { font-size: 1.35em; font-weight: 700; color: #111827; margin: 0.9em 0 0.4em; }
  h3 { font-size: 1.15em; font-weight: 600; color: #111827; margin: 0.8em 0 0.3em; }
  h4 { font-size: 1em; font-weight: 600; color: #374151; margin: 0.7em 0 0.3em; }

  p { margin: 0 0 0.75em; }
  ul, ol { margin: 0 0 0.75em; padding-left: 1.5em; }
  li { margin-bottom: 0.3em; }

  pre {
    background: #f6f8fa;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 14px 16px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.5;
    margin: 0.75em 0;
  }
  code {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.9em;
  }
  :not(pre) > code {
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.85em;
    color: #d63384;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.75em 0;
    font-size: 13px;
  }
  th, td {
    border: 1px solid #d1d5db;
    padding: 8px 12px;
    text-align: left;
  }
  th {
    background: #f3f4f6;
    font-weight: 600;
  }

  blockquote {
    border-left: 3px solid #d1d5db;
    margin: 0.75em 0;
    padding: 0.5em 1em;
    color: #6b7280;
    background: #f9fafb;
    border-radius: 0 6px 6px 0;
  }

  img { max-width: 100%; height: auto; border-radius: 8px; }
  a { color: #4f46e5; text-decoration: none; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 1em 0; }

  /* SVG charts / mermaid */
  svg { max-width: 100%; height: auto; }
`;

function buildPdfDocument(
  turns: Array<{ html: string; role: 'user' | 'assistant' }>,
  site: string,
): string {
  const siteLabel = site === 'gemini' ? 'Gemini' : 'ChatGPT';

  let html = `<style>${PDF_CONTENT_CSS}</style>`;

  // Header
  html += `
    <div style="margin-bottom:24px;">
      <h1 style="font-size:22px;font-weight:800;color:#0f172a;margin:0 0 6px;">${siteLabel} Conversation</h1>
      <p style="font-size:13px;color:#64748b;margin:0;">Exported on ${new Date().toLocaleString()} &mdash; ${turns.length} turns</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin-top:16px;"/>
    </div>
  `;

  for (const turn of turns) {
    const isUser = turn.role === 'user';
    const roleLabel = isUser ? 'YOU' : siteLabel.toUpperCase();
    const borderColor = isUser ? '#6366f1' : '#14b8a6';
    const labelBg = isUser ? '#f1f5f9' : '#f0fdf4';
    const pillBg = isUser ? '#e0e7ff' : '#ccfbf1';
    const pillColor = isUser ? '#3730a3' : '#065f46';

    html += `
      <div style="border:1px solid #e2e8f0;border-left:3px solid ${borderColor};border-radius:12px;overflow:hidden;margin-bottom:16px;">
        <div style="padding:10px 16px;background:${labelBg};display:flex;align-items:center;gap:8px;">
          <span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:${pillBg};color:${pillColor};">
            ${roleLabel}
          </span>
        </div>
        <div style="padding:16px;font-size:14px;line-height:1.7;color:#1e293b;word-wrap:break-word;">
          ${turn.html}
        </div>
      </div>
    `;
  }

  return html;
}

/**
 * Find the conversation DOM elements on the page.
 */
function getConversationElements(site: string): HTMLElement[] {
  if (site === 'gemini') {
    const els = document.querySelectorAll('user-query, model-response');
    if (els.length > 0) return Array.from(els) as HTMLElement[];
    return Array.from(document.querySelectorAll('[data-message-id]')) as HTMLElement[];
  }
  // ChatGPT
  const els = document.querySelectorAll('[data-message-author-role]');
  if (els.length > 0) return Array.from(els) as HTMLElement[];
  return Array.from(
    document.querySelectorAll('article[data-testid^="conversation-turn-"]'),
  ) as HTMLElement[];
}

async function exportToPdfFromDom(
  turns: RawTurn[],
  site: string,
  filename: string,
  selectedIndices?: Set<number>,
) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const conversationEls = getConversationElements(site);

  // Extract HTML from each conversation element
  const extractedTurns: Array<{ html: string; role: 'user' | 'assistant' }> = [];
  let turnIdx = 0;
  for (const el of conversationEls) {
    if (selectedIndices && !selectedIndices.has(turnIdx)) {
      turnIdx++;
      continue;
    }
    extractedTurns.push(extractTurnHtml(el, site));
    turnIdx++;
  }

  if (extractedTurns.length === 0) {
    // Fallback: use the text from RawTurn
    for (const turn of turns) {
      const escaped = turn.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');
      extractedTurns.push({ html: escaped, role: turn.role });
    }
  }

  // Build the full HTML document
  const docHtml = buildPdfDocument(extractedTurns, site);

  // Create off-screen container
  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;left:-9999px;top:0;width:794px;background:#fff;padding:32px 24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1e293b;line-height:1.7;';
  container.innerHTML = docHtml;
  document.body.appendChild(container);

  // Wait for layout + any images
  await new Promise(r => setTimeout(r, 300));

  try {
    const SAFE_HEIGHT = 14000;
    const totalHeight = container.scrollHeight;

    const canvasChunks: HTMLCanvasElement[] = [];

    if (totalHeight <= SAFE_HEIGHT) {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794,
      });
      canvasChunks.push(canvas);
    } else {
      // Chunk by moving children into temporary containers
      const allChildren = Array.from(container.children) as HTMLElement[];
      let tempContainer: HTMLDivElement | null = null;
      let currentHeight = 0;

      for (const child of allChildren) {
        const h = child.offsetHeight || 100;

        if (!tempContainer || (currentHeight + h > SAFE_HEIGHT && currentHeight > 0)) {
          if (tempContainer) {
            const canvas = await html2canvas(tempContainer, {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: '#ffffff',
              windowWidth: 794,
            });
            canvasChunks.push(canvas);
            tempContainer.remove();
          }

          tempContainer = document.createElement('div');
          tempContainer.style.cssText =
            'position:absolute;left:-9999px;top:0;width:794px;background:#fff;padding:0 24px;font-family:system-ui,-apple-system,sans-serif;color:#1e293b;line-height:1.7;';
          document.body.appendChild(tempContainer);
          currentHeight = 0;
        }

        tempContainer.appendChild(child);
        currentHeight += h;
      }

      if (tempContainer && tempContainer.children.length > 0) {
        const canvas = await html2canvas(tempContainer, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 794,
        });
        canvasChunks.push(canvas);
        tempContainer.remove();
      }
    }

    // Build PDF from canvas chunks
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;

    const pdf = new jsPDF('p', 'mm', 'a4');
    let isFirstPage = true;
    let yOffset = margin;

    for (const canvas of canvasChunks) {
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgHeight = (canvas.height * contentWidth) / canvas.width;
      let remaining = imgHeight;
      let sourceY = 0;

      while (remaining > 0.1) {
        if (!isFirstPage && yOffset >= pageHeight - margin - 5) {
          pdf.addPage();
          yOffset = margin;
        }
        isFirstPage = false;

        const space = pageHeight - yOffset - margin;
        const slice = Math.min(space, remaining);

        pdf.addImage(imgData, 'JPEG', margin, yOffset - sourceY, contentWidth, imgHeight);

        // Mask overflow
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, pageHeight - margin, pageWidth, margin + 10, 'F');
        pdf.rect(0, 0, pageWidth, margin, 'F');

        sourceY += slice;
        remaining -= slice;
        yOffset += slice;

        if (remaining > 0.1) {
          pdf.addPage();
          yOffset = margin;
        }
      }
    }

    // Footer
    const totalPages = pdf.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text('Powered by ChatSource', margin, pageHeight - 8);
      const pageLabel = `Page ${p} of ${totalPages}`;
      pdf.text(pageLabel, pageWidth - margin - pdf.getTextWidth(pageLabel), pageHeight - 8);
    }

    pdf.save(`${filename}.pdf`);
  } finally {
    container.remove();
  }
}

// ── Main Entry Point ───────────────────────────────────────

export async function runExport(
  format: ExportFormat,
  turns: RawTurn[],
  site: string,
  filename: string,
  selectedIndices?: Set<number>,
) {
  switch (format) {
    case 'md':
      exportToMarkdown(turns, site, filename);
      break;
    case 'json':
      exportToJson(turns, site, filename);
      break;
    case 'csv':
      exportToCsv(turns, site, filename);
      break;
    case 'docx':
      await exportToDocx(turns, site, filename);
      break;
    case 'pdf':
      await exportToPdfFromDom(turns, site, filename, selectedIndices);
      break;
  }
}
