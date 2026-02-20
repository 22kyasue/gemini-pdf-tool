// ══════════════════════════════════════════════════════════
// TYPES — Shared type definitions for the conversation analysis pipeline
// ══════════════════════════════════════════════════════════

// --- Intent Tags (purpose of an utterance) ---
export type IntentTag =
    | 'Q'       // 質問/疑問
    | 'CMD'     // 指示/依頼
    | 'INFO'    // 情報提示
    | 'CONFIRM' // 確認/再確認
    | 'ERROR'   // エラー報告
    | 'PLAN'    // 計画・設計
    | 'META';   // 会話/作業メタ

// --- Artifact Tags (content type) ---
export type ArtifactTag =
    | 'CODE'      // コード片/疑似コード/コマンド
    | 'LOG'       // コンソールログ/スタックトレース
    | 'PATH'      // ファイルパス
    | 'LINK'      // URL
    | 'TABLE'     // テーブル
    | 'DOC'       // 仕様/文章
    | 'IMAGE_REF'; // 画像参照

// --- Role ---
export type Role = 'user' | 'ai';

// ══════════════════════════════════════════════════════════
// Pipeline intermediate types
// ══════════════════════════════════════════════════════════

/** Raw block after segmentation */
export interface SegmentedBlock {
    id: number;
    text: string;
    startLine: number;
    endLine: number;
    /** Type of boundary that created this block */
    boundaryType: 'hard' | 'soft' | 'initial';
}

/** Feature vector extracted from a block */
export interface BlockFeatures {
    charCount: number;
    lineCount: number;
    avgLineLength: number;
    hasQuestion: boolean;
    hasCodeBlock: boolean;
    hasMarkdownHeading: boolean;
    hasBulletList: boolean;
    hasTable: boolean;
    hasUrl: boolean;
    hasFilePath: boolean;
    hasCommand: boolean;
    hasErrorKeyword: boolean;
    hasJapanese: boolean;
    hasPoliteForm: boolean;
    hasExplanationStructure: boolean;
    hasImperativeForm: boolean;
    sentimentScore: number;
    technicalTermDensity: number;
    formality: number;
}

/** Block with features attached */
export interface FeaturedBlock extends SegmentedBlock {
    features: BlockFeatures;
}

/** Block with role scores */
export interface ScoredBlock extends FeaturedBlock {
    scoreAi: number;
    scoreUser: number;
    /** Local probability of being AI (before sequence optimization) */
    pAi: number;
    /** Confidence based on margin and text length */
    localConfidence: number;
}

/** Block after sequence optimization */
export interface OptimizedBlock extends ScoredBlock {
    role: Role;
    confidence: number;
}

// ══════════════════════════════════════════════════════════
// Final output types
// ══════════════════════════════════════════════════════════

/** Final analyzed message */
export interface AnalyzedMessage {
    id: number;
    role: Role;
    text: string;
    confidence: number;
    intent: IntentTag[];
    artifact: ArtifactTag[];
    topic: string[];
    semanticGroupId: number;
}

/** Semantic group — a cluster of related messages */
export interface SemanticGroup {
    id: number;
    span: [number, number]; // [startMessageId, endMessageId]
    summaryStats: {
        topics: Record<string, number>;
        intents: Record<string, number>;
        artifacts: Record<string, number>;
    };
}

/** Complete analysis result */
export interface AnalysisResult {
    messages: AnalyzedMessage[];
    semanticGroups: SemanticGroup[];
}

// ══════════════════════════════════════════════════════════
// Semantic vector (lightweight representation for grouping)
// ══════════════════════════════════════════════════════════

/** Lightweight semantic representation for a block (no embeddings) */
export interface SemanticVector {
    keywords: Set<string>;        // normalized unigram/bigram
    importantTerms: Set<string>;  // nouns, technical terms
    entities: Set<string>;        // URLs, paths, command names, product names
    topicTags: Set<string>;       // matched topic dictionary tags
}
