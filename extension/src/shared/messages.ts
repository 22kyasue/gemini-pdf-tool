// ══════════════════════════════════════════════════════════
// EXTENSION MESSAGE PROTOCOL
// ══════════════════════════════════════════════════════════

export interface RawTurn {
  role: 'user' | 'assistant';
  text: string;
}

export type ExtMessage =
  | { type: 'TOGGLE_BUTTON' };
