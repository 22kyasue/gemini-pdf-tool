// ══════════════════════════════════════════════════════════
// INTENT CLASSIFIER — Rule-based intent tag assignment
// ══════════════════════════════════════════════════════════

import type { IntentTag } from './types';

/**
 * Intent rules in priority order.
 * Higher priority rules are checked first; first match wins (primary intent).
 * Secondary intents are also collected (multi-label).
 */
interface IntentRule {
    tag: IntentTag;
    patterns: RegExp[];
    /** Minimum text length for this intent to be considered (optional) */
    minLength?: number;
}

const INTENT_RULES: IntentRule[] = [
    {
        tag: 'ERROR',
        patterns: [
            /\b(error|Error|ERROR)\b/,
            /\b(exception|Exception)\b/,
            /\bnot\s+found\b/i,
            /\b(stack\s*trace|stacktrace)\b/i,
            /\b(undefined|null|NaN)\s+(is\s+not|error)/i,
            /\b(failed|failure|FAIL)\b/,
            /\b(ENOENT|EACCES|EPERM|ETIMEDOUT)\b/,
            /\b(crash|segfault|panic)\b/i,
            /動かない/,
            /落ちる|落ちた/,
            /エラー/,
            /失敗/,
            /無理/,
            /壊れ/,
            /起動しない/,
            /表示されない/,
            /反映されない/,
        ],
    },
    {
        tag: 'CONFIRM',
        patterns: [
            /are you sure/i,
            /合ってる[？?]/,
            /これでいい[？?]/,
            /これで(OK|おk|オッケー)[？?]?/i,
            /確認/,
            /正しい[？?]/,
            /大丈夫[？?]/,
            /問題ない[？?]/,
            /間違ってない[？?]/,
            /\bOK\?\s*$/,
            /\bright\?\s*$/i,
            /\bcorrect\?\s*$/i,
        ],
    },
    {
        tag: 'Q',
        patterns: [
            /[？?]/,
            /\b(how|why|what|where|when|which|who)\b/i,
            /なぜ/,
            /どう(すれば|したら|やって|して)/,
            /何[がをにで]|何です/,
            /どこ[にでがを]/,
            /いつ/,
            /どれ|どちら/,
            /方法/,
            /教えて/,
            /知りたい/,
            /わからない|分からない/,
            /\bcan\s+(I|you|we)\b/i,
            /\bis\s+(it|this|that)\b/i,
        ],
    },
    {
        tag: 'CMD',
        patterns: [
            /[してやつ作直教見出消変送]て([。、！!]|$)/,
            /ください/,
            /してほしい/,
            /してくれ/,
            /お願い/,
            /\bplease\b/i,
            /\b(create|make|build|fix|update|delete|remove|add|change|modify|implement|write|generate)\b/i,
            /作成して/,
            /修正して/,
            /追加して/,
            /変更して/,
            /削除して/,
            /実装して/,
        ],
    },
    {
        tag: 'PLAN',
        patterns: [
            /方針/,
            /設計/,
            /ロードマップ/,
            /段取り/,
            /構成/,
            /アルゴリズム/,
            /計画/,
            /アーキテクチャ/,
            /フロー/,
            /\b(plan|design|architecture|roadmap|strategy|workflow)\b/i,
            /ステップ[をはで]/,
            /手順/,
            /フェーズ/,
        ],
    },
    {
        tag: 'META',
        patterns: [
            /短く/,
            /長く/,
            /次[はにを]/,
            /一旦/,
            /やり直し/,
            /コピペ/,
            /整形/,
            /もういい/,
            /まとめて/,
            /続き/,
            /ありがとう/,
            /了解/,
            /OK$/,
            /おk/i,
            /\b(thanks|thank you|thx|ok|got it|never\s*mind)\b/i,
            /わかった/,
            /りょ/,
        ],
    },
    {
        tag: 'INFO',
        patterns: [], // fallback: no specific pattern, just sufficient length
        minLength: 30,
    },
];

/**
 * Classify the intent(s) of a text block.
 *
 * Returns an array of IntentTags (multi-label).
 * Primary intent is first, secondary intents follow.
 */
export function classifyIntent(text: string): IntentTag[] {
    const intents: IntentTag[] = [];

    for (const rule of INTENT_RULES) {
        // Skip INFO check for now (it's a fallback)
        if (rule.tag === 'INFO') continue;

        // Check minimum length
        if (rule.minLength && text.length < rule.minLength) continue;

        // Check patterns
        if (rule.patterns.some(p => p.test(text))) {
            intents.push(rule.tag);
        }
    }

    // Fallback to INFO if no other intent matched and text is long enough
    if (intents.length === 0 && text.length >= 30) {
        intents.push('INFO');
    }

    // If still empty (very short non-matching text), default to INFO
    if (intents.length === 0) {
        intents.push('INFO');
    }

    return intents;
}
