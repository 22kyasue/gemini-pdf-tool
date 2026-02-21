# #002 — List Items Containing `#` Rendered as Giant Headings

**Date:** 2026-02-21  
**File affected:** `src/components/ContentRenderer.tsx`

---

## Symptom

When pasting Gemini output that contains bullet list items describing markdown syntax — e.g.:

```
- # (H1): text-3xl, font-extrabold, border-b-2
- ## (H2): text-xl, font-bold, mt-6, text-indigo-800
- ### (H3): text-lg, font-semibold, text-slate-700
```

…those items are rendered as giant H1/H2/H3 headings inside the bullet list, completely breaking the layout.

---

## Root Cause

The **CommonMark specification** (which `react-markdown` + `remark` follow) explicitly allows ATX headings (`# heading`) to appear inside list items. So:

```markdown
- # foo
```

is valid CommonMark, parsed as: **a list item containing an H1 heading**.

Gemini frequently outputs text like `- # (H1): text-3xl` as a **description/label**, not as an actual heading intent — but the parser has no way to know that. It sees `# ` at the start of list item content and faithfully creates an H1.

---

## Fix

Added a preprocessing function `escapeHeadingsInListItems` in `ContentRenderer.tsx` that runs before content is passed to `ReactMarkdown`.

It escapes `#` that immediately follows a list marker by prepending a backslash:

```
- # (H1): ...   →   - \# (H1): ...
```

In Markdown, `\#` is an escaped character that renders as a literal `#` sign — no heading.

```ts
function escapeHeadingsInListItems(md: string): string {
    return md.replace(/^([ \t]*[-*+] )(#{1,6})( )/gm, '$1\\$2$3');
}
```

This is applied only to the markdown parts of the content (not to raw HTML table segments).

---

## Prevention Rule

> **When using `react-markdown` with AI-generated content, always pre-process the markdown string before rendering.**
>
> AI models (Gemini, ChatGPT, Claude) regularly output markdown that *describes* markdown — e.g. `- # H1 heading` to mean "list item about H1". These patterns are valid CommonMark but produce unintended visual output.
>
> Any future markdown preprocessing should be added to the `escapeHeadingsInListItems` function (or alongside it) in `ContentRenderer.tsx`, keeping all sanitization logic in one place.
