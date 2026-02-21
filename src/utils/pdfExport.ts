import html2pdf from 'html2pdf.js';

// ══════════════════════════════════════════════════════════
// PDF EXPORT UTILITY
// Wraps html2pdf.js with the original v1.0.0 settings that
// are proven to produce correct output.
//
// ⚠️  Do NOT add ancestor overflow manipulation, allowTaint,
//     pagebreak options, or clone approaches here — they all
//     cause the output to be 59 blank pages.
//
// html2pdf.js handles overflow:auto containers correctly on
// its own when called directly on the inner content element.
// ══════════════════════════════════════════════════════════

export async function exportToPdf(element: HTMLElement, filename: string): Promise<void> {
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
}
