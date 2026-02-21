# Error Fixes Log

This folder documents major bugs encountered during development — root causes, fixes, and prevention rules.
Use this as a reference when developing on other devices or onboarding new contributors.

| # | File | Issue | Date |
|---|------|-------|------|
| 001 | [001_pdf-blank-pages.md](./001_pdf-blank-pages.md) | PDF export produces blank pages (html2canvas clipped by overflow parent) | 2026-02-21 |
| 002 | [002_list-item-heading-blowup.md](./002_list-item-heading-blowup.md) | List items starting with `# ` rendered as giant headings (CommonMark inside list items) | 2026-02-21 |
| 003 | [003_raw-html-heading-blowup.md](./003_raw-html-heading-blowup.md) | Raw HTML tags (h1-6) rendered as structural headings when using rehype-raw | 2026-02-21 |
| 004 | [004_heading_bracketing_and_size.md](./004_heading_bracketing_and_size.md) | Heading "Blowup": Unintended large text; bracket headers as [#] and reduce CSS sizes | 2026-02-21 |
