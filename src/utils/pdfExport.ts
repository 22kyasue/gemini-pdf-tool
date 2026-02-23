import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// ══════════════════════════════════════════════════════════
// PDF EXPORT UTILITY (CHUNKED ARCHITECTURE)
//
// Converts the entire DOM to a single valid PDF without using 
// the blurry down-scaling fallback or tripping the browser 
// canvas pixel limitations.
//
// HOW IT WORKS:
// 1. We find all top-level child elements (TurnBlocks, etc.)
// 2. We sequentially measure their heights.
// 3. We group elements into sequential "Chunks", ensuring no 
//    chunk exceeds the strict 15,000px safe limit.
// 4. We render each chunk with html2canvas at full 2x scale
// 5. We pipe the canvas data into jsPDF, adding new pages
//    when necessary to seamlessly match the document.
// ══════════════════════════════════════════════════════════

export async function exportToPdf(
    element: HTMLElement,
    rawFilename: string,
    scrollContainer?: HTMLElement | null,
): Promise<void> {
    const filename = rawFilename.endsWith('.pdf') ? rawFilename : `${rawFilename}.pdf`;

    const prevOverflow = scrollContainer?.style.overflow ?? '';
    const prevOverflowY = scrollContainer?.style.overflowY ?? '';
    if (scrollContainer) {
        scrollContainer.style.overflow = 'visible';
        scrollContainer.style.overflowY = 'visible';
    }

    try {
        const BASE_WIDTH = 794;
        const SAFE_HEIGHT_LIMIT = 14000; // max 14k pixel renders at a time
        const A4_HEIGHT_MM = 297;
        const A4_WIDTH_MM = 210;
        const MARGIN_MM = 15;
        const PRINTABLE_WIDTH_MM = A4_WIDTH_MM - (MARGIN_MM * 2);

        // Standard jsPDF instance
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true
        });

        // Collect all chunkable elements, unspooling 'messages-list' to chunk individual turns
        // and safely skipping any '.no-print' widgets like the Enhance button or empty banners
        const blocks: HTMLElement[] = [];
        Array.from(element.children).forEach(child => {
            if (child.classList.contains('no-print')) return;

            if (child.classList.contains('messages-list')) {
                Array.from(child.children).forEach(msgChild => {
                    if (!msgChild.classList.contains('no-print')) {
                        blocks.push(msgChild as HTMLElement);
                    }
                });
            } else {
                blocks.push(child as HTMLElement);
            }
        });

        if (blocks.length === 0) return;

        console.log(`[PDF] Starting chunked render with ${blocks.length} elements...`);

        // Group into sequential chunks
        const chunks: HTMLElement[][] = [];
        let currentChunk: HTMLElement[] = [];
        let currentHeight = 0;

        for (const block of blocks) {
            const blockHeight = block.offsetHeight || 100;

            // If a single child is massive (rare but possible), it gets its own chunk
            if (currentHeight + blockHeight > SAFE_HEIGHT_LIMIT && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [block];
                currentHeight = blockHeight;
            } else {
                currentChunk.push(block);
                currentHeight += blockHeight;
            }
        }
        if (currentChunk.length > 0) chunks.push(currentChunk);

        console.log(`[PDF] Split into ${chunks.length} rendering chunks under 14,000px limit.`);

        let isFirstPageInPdf = true;
        let pdfYOffsetMm = MARGIN_MM;

        // Render each chunk sequentially
        for (let i = 0; i < chunks.length; i++) {
            const chunkBlocks = chunks[i];

            // Create a temporary container for rendering this chunk isolated
            const chunkContainer = document.createElement('div');
            // Duplicate classes from the main element to maintain exact styles
            chunkContainer.className = element.className;
            chunkContainer.style.width = `${BASE_WIDTH}px`;
            chunkContainer.style.position = 'absolute';
            chunkContainer.style.top = '-9999px';
            chunkContainer.style.left = '-9999px';
            chunkContainer.style.background = '#fff';
            // Disable container-level border/shadows so they don't repeat per chunk
            chunkContainer.style.padding = '0';
            chunkContainer.style.minHeight = '0';
            chunkContainer.style.border = 'none';
            chunkContainer.style.boxShadow = 'none';

            // We need a pseudo 'messages-list' inner container to preserve flex gap/styles
            const messagesListContainer = document.createElement('div');
            messagesListContainer.className = 'messages-list';
            let messagesListAdded = false;

            // Temporarily move elements into container
            const placeholders = chunkBlocks.map(el => {
                const placeholder = document.createElement('div');
                placeholder.style.display = 'none';
                el.parentNode?.insertBefore(placeholder, el);

                if (el.classList.contains('turn-block') || el.closest('.messages-list')) {
                    messagesListContainer.appendChild(el);
                    if (!messagesListAdded) {
                        chunkContainer.appendChild(messagesListContainer);
                        messagesListAdded = true;
                    }
                } else {
                    chunkContainer.appendChild(el);
                }

                return { el, placeholder };
            });

            document.body.appendChild(chunkContainer);

            try {
                // Wait for any layout shifts
                await new Promise(r => setTimeout(r, 100));

                const canvas = await html2canvas(chunkContainer, {
                    scale: 2, // Full crisp 2x scale, guaranteed safe because of chunking
                    useCORS: true,
                    backgroundColor: '#fff',
                    logging: false,
                    windowWidth: BASE_WIDTH,
                    // Give extra breath for internal floats
                    height: chunkContainer.scrollHeight + 10,
                });

                // Canvas dimensions in pixels
                const imgData = canvas.toDataURL('image/jpeg', 0.98);
                const pxWidth = canvas.width;
                const pxHeight = canvas.height;

                // Mm mapping
                const imgWidthMm = PRINTABLE_WIDTH_MM;
                const imgHeightMm = (pxHeight * imgWidthMm) / pxWidth;

                let remainingHeightMm = imgHeightMm;
                let chunkSourceYOffsetMm = 0;

                while (remainingHeightMm > 0.1) {
                    // How much space is left on the current physical PDF page?
                    const spaceOnPage = A4_HEIGHT_MM - pdfYOffsetMm - MARGIN_MM;

                    // How much of the chunk image we can draw right now
                    const sliceHeightMm = Math.min(spaceOnPage, remainingHeightMm);

                    if (isFirstPageInPdf) {
                        isFirstPageInPdf = false;
                    } else if (spaceOnPage <= 5) {
                        // Not enough space, make a new page
                        pdf.addPage();
                        pdfYOffsetMm = MARGIN_MM;
                        continue;
                    }

                    // We use jsPDF's clipping mechanics by offsetting the Y negatively
                    pdf.addImage(
                        imgData,
                        'JPEG',
                        MARGIN_MM,
                        pdfYOffsetMm - chunkSourceYOffsetMm,
                        imgWidthMm,
                        imgHeightMm
                    );

                    pdf// A solid white rectangle masks what spills below the current page
                        .setFillColor(255, 255, 255)
                        .rect(0, A4_HEIGHT_MM - MARGIN_MM, A4_WIDTH_MM, MARGIN_MM + 10, 'F');

                    pdf// and another hides the top bleed just in case
                        .rect(0, 0, A4_WIDTH_MM, MARGIN_MM, 'F');

                    chunkSourceYOffsetMm += sliceHeightMm;
                    remainingHeightMm -= sliceHeightMm;
                    pdfYOffsetMm += sliceHeightMm;
                }
            } finally {
                // Return elements to original position
                placeholders.forEach(({ el, placeholder }) => {
                    placeholder.parentNode?.insertBefore(el, placeholder);
                    placeholder.remove();
                });
                chunkContainer.remove();
            }
        }

        console.log(`[PDF] Render complete. Saving ${filename}...`);
        pdf.save(filename);

    } finally {
        if (scrollContainer) {
            scrollContainer.style.overflow = prevOverflow;
            scrollContainer.style.overflowY = prevOverflowY;
        }
    }
}
