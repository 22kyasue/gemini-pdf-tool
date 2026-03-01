// ══════════════════════════════════════════════════════════
// EXTENSION MESSAGE PROTOCOL
// Defines the typed message contract between:
//   - Content script  (reads DOM from Gemini/ChatGPT pages)
//   - Side panel      (sends CAPTURE_REQUEST, receives results)
// ══════════════════════════════════════════════════════════

export interface RawTurn {
  role: 'user' | 'assistant';
  text: string;
}

export type ExtMessage =
  | { type: 'CAPTURE_REQUEST' }
  | { type: 'CAPTURE_RESULT'; turns: RawTurn[]; site: 'gemini' | 'chatgpt' }
  | { type: 'CAPTURE_ERROR'; message: string };
