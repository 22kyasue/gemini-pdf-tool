# #003 — Raw HTML Heading Tags Rendered as Structural Headers

**Date:** 2026-02-21  
**File affected:** `src/components/ContentRenderer.tsx`

---

## Symptom

When Gemini includes literal HTML tags like `<h1>` or `<h2>` in its response (common when explaining HTML or UI design), the text inside those tags appears as actual large headers in the PDF output, breaking the visual consistency and layout.

---

## Root Cause

`ContentRenderer.tsx` uses `rehype-raw` to allow certain HTML features (like tables and `<strong>` tags) to pass through the markdown parser. While this is necessary for those features, it also causes the browser to interpret literal `<h1>` tags as structural headers.

Gemini often outputs these tags as part of its technical explanations or descriptions, not with the intent of creating a document header.

---

## Fix

Updated the `sanitizeContent` function in `ContentRenderer.tsx` to escape raw HTML heading tags (`<h1>` through `<h6>`).

```tsx
function sanitizeContent(md: string): string {
    let sanitized = md;
    
    // ... existing list-item heading fix ...

    // 2. Escape raw HTML heading tags (<h1> through <h6>).
    // Fixes #003: "<h1>" -> "&lt;h1&gt;"
    sanitized = sanitized.replace(/<(h[1-6])(?:\s[^>]*)?>/gi, '&lt;$1&gt;');
    sanitized = sanitized.replace(/<\/(h[1-6])>/gi, '&lt;/$1&gt;');

    return sanitized;
}
```

By converting `<` to `&lt;` and `>` to `&gt;`, the tags are rendered as literal text (e.g., `<h1>`) instead of being interpreted as HTML elements.

---

## Prevention Rule

> **Sanitize raw HTML tags when using `rehype-raw` with AI-generated content.**
>
> AI models frequently mix markdown with literal HTML snippets. Any HTML tags that should not affect document structure (like headings) must be escaped before rendering in the `sanitizeContent` pipeline.
