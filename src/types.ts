// ══════════════════════════════════════════════════════════
// SHARED TYPES
// ══════════════════════════════════════════════════════════

export type Role = 'user' | 'assistant';
export type LLMName = 'Gemini' | 'ChatGPT' | 'Claude' | 'AI';

export interface Turn {
    role: Role;
    llmLabel: string;       // resolved assistant name, e.g. 'Claude', 'ChatGPT'
    content: string;
    rawContent: string;
    index: number;
    summary: string;
    hasTable: boolean;
    keyPoints: string[];
}

export interface EnhanceMessage {
    id: string;
    type: 'user' | 'system' | 'error';
    text: string;
    tokens?: { promptTokens: number; responseTokens: number; totalTokens: number };
    features?: string[];
    timestamp: number;
}
