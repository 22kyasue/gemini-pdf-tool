# Extension Handoff Notes (2026-03-01)

## Status
Fully implemented and **build verified** — `npm run build` succeeds and generates `extension/dist/`.
The user has not yet loaded it in Chrome.

## How to load
```bash
cd extension
npm install       # already done, skip if node_modules exists
npm run build
# Chrome → chrome://extensions → Enable Developer Mode → Load unpacked → select extension/dist/
```

## Known issues / things to watch

1. **CRXJS beta deprecation** — npm warns that `2.0.0-beta.26` is deprecated in favor of stable `2.0.0`.
   If you hit build issues, try: `npm install @crxjs/vite-plugin@2.0.0 -D`

2. **No extension icons** — intentionally omitted (can't write binary PNG files).
   Chrome shows a gray icon. To add real icons:
   - Create `public/icons/icon16.png`, `icon48.png`, `icon128.png`
   - Add to `manifest.json` under `action.default_icon` and `icons`

3. **Large bundle warning** — build warns about chunks >500kB (mermaid + cytoscape). Expected, not a blocker.

4. **Popup not wired to action** — icon click opens the **side panel**, not the popup.
   The popup exists at `src/popup/App.tsx` but is intentionally excluded from `manifest.json`'s `action`
   (having both a `default_popup` and an `onClicked` listener is mutually exclusive in MV3).
   Settings are accessible via the gear icon inside the side panel.

5. **DOM selectors may need tuning** — Gemini and ChatGPT update their HTML frequently.
   If "Capture" returns 0 turns or an error, open DevTools on the chat page, inspect a message
   element, and update the `querySelectorAll` calls in `src/content/index.ts`.
   - Gemini target: `user-query, model-response` custom elements
   - ChatGPT target: `[data-message-author-role]`

## Next steps for the user
1. Load unpacked in Chrome (see above)
2. Test on `gemini.google.com` — open a chat → click icon → side panel opens → Capture → PDF
3. Test on `chatgpt.com` — same flow
4. If capture fails, update DOM selectors in `src/content/index.ts`

## Architecture summary
- `@shared` alias → `../src` (reuses parent app's components and utils directly)
- PDF export uses a hidden off-screen 794px-wide div so the PDF looks correct regardless of the narrow panel width
- CSS: `sidepanel.css` does `@import '@shared/index.css'` — Vite resolves the alias in CSS imports
- Service worker opens the side panel on icon click; shows "ON" badge on supported pages
