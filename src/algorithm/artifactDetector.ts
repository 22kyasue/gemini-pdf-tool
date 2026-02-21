// ══════════════════════════════════════════════════════════
// ARTIFACT DETECTOR — Detect content type (CODE, LOG, etc.)
// ══════════════════════════════════════════════════════════

import type { ArtifactTag } from './types';

/**
 * Artifact detection rules.
 * Each rule checks for a specific artifact type.
 * A block can have multiple artifact tags (multi-label).
 */
interface ArtifactRule {
    tag: ArtifactTag;
    /** Quick check patterns (any match → tag applies) */
    patterns: RegExp[];
    /** Optional: block-level validator for more complex checks */
    validate?: (text: string, lines: string[]) => boolean;
}

const ARTIFACT_RULES: ArtifactRule[] = [
    {
        tag: 'CODE',
        patterns: [
            /```/,                               // fenced code block
            /^\s{4}\S/m,                         // 4-space indented code
        ],
        validate: (_text, lines) => {
            // Also detect command-line entries
            const commandLineRe = /^\s*(npm|npx|git|cd|brew|pip|pip3|yarn|pnpm|sudo|curl|wget|docker|kubectl|make|cmake|cargo|go\s+\w+|python|python3|node|ruby|java\s+-)/;
            if (lines.some(l => commandLineRe.test(l))) return true;

            // Detect code-like patterns: function calls, imports, variable assignments
            const codeLikeRe = /^(import|export|const|let|var|function|class|interface|type|enum|def|fn|pub|async|await|return|if|else|for|while|switch|case)\s/;
            const codeLines = lines.filter(l => codeLikeRe.test(l.trim()));
            if (codeLines.length >= 2) return true;

            return false;
        },
    },
    {
        tag: 'LOG',
        patterns: [
            /^\s*>\s/m,                          // blockquote log style (with following content)
            /^\d{4}[-/]\d{2}[-/]\d{2}/m,        // timestamp
            /\d{2}:\d{2}:\d{2}/,                // time format
            /^\s*at\s+\S+\s*\(/m,               // stack trace "at ..."
            /\b(ERROR|WARN|INFO|DEBUG|FATAL):/,  // log level prefix
            /^\s*#\d+\s+0x[0-9a-f]+/m,          // native stack frame
        ],
        validate: (_text, lines) => {
            // Multiple consecutive lines starting with > indicate a log block
            let consecutiveQuotes = 0;
            for (const l of lines) {
                if (/^\s*>/.test(l)) {
                    consecutiveQuotes++;
                    if (consecutiveQuotes >= 3) return true;
                } else {
                    consecutiveQuotes = 0;
                }
            }
            return false;
        },
    },
    {
        tag: 'PATH',
        patterns: [
            /[A-Z]:\\/,                          // Windows path
            /\/Users\/\S+/,                      // macOS path
            /~\/\S+/,                            // Unix home path
            /\.\/\S+\.\w+/,                      // Relative path with extension
            /\.\.\//,                            // Parent relative path
        ],
    },
    {
        tag: 'LINK',
        patterns: [
            /https?:\/\/\S+/,
        ],
    },
    {
        tag: 'TABLE',
        patterns: [
            /\|.*\|.*\|/,                        // Pipe table
            /^\s*\|[-:]+\|/m,                    // Table separator row
        ],
        validate: (_text, lines) => {
            // Tab-separated data (2+ columns, 2+ rows)
            const tsvLines = lines.filter(l => l.includes('\t') && l.split('\t').length >= 2);
            if (tsvLines.length >= 2) return true;
            return false;
        },
    },
    {
        tag: 'DOC',
        patterns: [],
        validate: (text, lines) => {
            // Document: has markdown headings + substantial paragraphs
            const hasHeading = /^#{1,6}\s/m.test(text);
            const hasParagraph = lines.some(l => l.trim().length > 100);
            return hasHeading && hasParagraph && text.length > 200;
        },
    },
    {
        tag: 'IMAGE_REF',
        patterns: [
            /<<ImageDisplayed>>/,
            /\[画像\]/,
            /!\[.*?\]\(.*?\)/,                  // Markdown image
            /\[image\]/i,
            /<<image>>/i,
        ],
    },
    {
        tag: 'CONFLICT',
        patterns: [
            /しかしながら/i,
            /一方で/i,
            /矛盾/i,
            /対立/i,
            /\bHowever\b/i,
            /\bBut actually\b/i,
            /\bOn the other hand\b/i,
            /\bContradicting\b/i,
            /\bIn contrast\b/i,
            /\bDivergence\b/i,
        ],
        validate: (text) => {
            // High intensity contradiction markers
            const intensityMarkers = [
                "実際には", "正しくは", "誤解", "間違い",
                "Wait,", "Actually,", "Correction:", "Incorrect"
            ];
            return intensityMarkers.some(m => text.includes(m));
        }
    },
];

/**
 * Detect artifact types in a text block.
 * Returns array of matching ArtifactTags (multi-label).
 */
export function detectArtifacts(text: string): ArtifactTag[] {
    const lines = text.split('\n');
    const artifacts: ArtifactTag[] = [];

    for (const rule of ARTIFACT_RULES) {
        // Check pattern matches
        const patternMatch = rule.patterns.some(p => p.test(text));

        // Check validator
        const validatorMatch = rule.validate ? rule.validate(text, lines) : false;

        if (patternMatch || validatorMatch) {
            artifacts.push(rule.tag);
        }
    }

    return artifacts;
}
