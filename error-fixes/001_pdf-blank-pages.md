# #001 — PDF Export Produces Blank Pages

**Date:** 2026-02-21  
**Files affected:** `src/utils/pdfExport.ts`, `src/App.tsx`

---

## Symptom

Clicking **「PDF出力」** downloads a PDF with the correct number of pages, but every page is blank white.

The page count scales proportionally with the amount of text (e.g. ~1,000 words → 3 blank pages, ~20,000 words → 57 blank pages).

---

## Root Cause

`html2pdf.js` uses `html2canvas` internally to "screenshot" the target DOM element onto a canvas, which then becomes the PDF.

**`html2canvas` cannot paint content that is clipped by a scrollable ancestor.**

The DOM structure was:

```
.preview-scroll   ← overflow-y: auto  ← CULPRIT
  └── .preview-page  ← element passed to html2canvas
```

`.preview-scroll` acts like a "window frame" — only content inside the visible scroll viewport is painted. Everything below the fold is clipped and renders as blank pixels.

The page *count* is correct because `html2pdf` correctly reads the `scrollHeight` of `.preview-page`. But the *content* is blank because `html2canvas` only captured the visible slice.

---

## Fix

Before calling `html2pdf`, temporarily override the scroll container's `overflow` to `visible`, then restore it in a `finally` block.

**`src/utils/pdfExport.ts`:**
```ts
export async function exportToPdf(
    element: HTMLElement,
    filename: string,
    scrollContainer?: HTMLElement | null,
): Promise<void> {
    const prevOverflow = scrollContainer?.style.overflow ?? '';
    const prevOverflowY = scrollContainer?.style.overflowY ?? '';
    if (scrollContainer) {
        scrollContainer.style.overflow = 'visible';
        scrollContainer.style.overflowY = 'visible';
    }
    try {
        await html2pdf().set({ ... }).from(element).save();
    } finally {
        if (scrollContainer) {
            scrollContainer.style.overflow = prevOverflow;
            scrollContainer.style.overflowY = prevOverflowY;
        }
    }
}
```

**`src/App.tsx`:**
```ts
// Add ref for the scroll container
const scrollRef = useRef<HTMLDivElement>(null);

// Pass it to exportToPdf
await exportToPdf(previewRef.current, pdfFilename, scrollRef.current);

// Attach ref to .preview-scroll in JSX
<div className="preview-scroll" ref={scrollRef}>
```

---

## Prevention Rule

> **Before any future PDF/canvas export, check: does the target element have a scrollable ancestor?**
>
> Any ancestor with `overflow: auto`, `overflow: hidden`, or `overflow: scroll` will cause `html2canvas` to produce blank output.
>
> If yes → temporarily set that ancestor's overflow to `visible` during the export, then restore it.

The `exportToPdf` utility is now built to handle this correctly — always pass `scrollContainer` when calling it.
