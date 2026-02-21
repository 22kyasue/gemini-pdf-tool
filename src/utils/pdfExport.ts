import html2pdf from 'html2pdf.js';

// ══════════════════════════════════════════════════════════
// PDF EXPORT UTILITY
// Wraps html2pdf.js with proven settings.
//
// Key: html2canvas cannot paint content inside an overflow:auto
// parent — it clips to the visible viewport, causing blank pages.
// exportToPdf temporarily sets the scroll container to
// overflow:visible before capture and restores it after.
// ══════════════════════════════════════════════════════════

export async function exportToPdf(
    element: HTMLElement,
    filename: string,
    scrollContainer?: HTMLElement | null,
): Promise<void> {
    // html2canvas cannot render content inside an overflow:auto/hidden parent —
    // it clips everything outside the visible viewport, producing blank pages.
    // Temporarily set the scroll container to overflow:visible so all content
    // is visible to html2canvas, then restore it afterwards.
    const prevOverflow = scrollContainer?.style.overflow ?? '';
    const prevOverflowY = scrollContainer?.style.overflowY ?? '';
    if (scrollContainer) {
        scrollContainer.style.overflow = 'visible';
        scrollContainer.style.overflowY = 'visible';
    }
    try {
        await html2pdf().set({
            margin: [15, 15, 15, 15],
            filename,
            html2canvas: {
                scale: 2,
                useCORS: true,
                backgroundColor: '#fff',
                logging: false,
                windowWidth: 794,
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        }).from(element).save();
    } finally {
        if (scrollContainer) {
            scrollContainer.style.overflow = prevOverflow;
            scrollContainer.style.overflowY = prevOverflowY;
        }
    }
}
