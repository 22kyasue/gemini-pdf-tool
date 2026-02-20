// ══════════════════════════════════════════════════════════
// PIPELINE INDEX — Full analysis pipeline (Phase 1 + Phase 2)
//
// Phase 1: normalize → segment → extractFeatures →
//          scoreBlocks → optimizeSequence → postProcess
// Phase 2: classifyIntent → detectArtifacts → detectTopics →
//          groupMessages → smoothGroups
// ══════════════════════════════════════════════════════════

import type { AnalysisResult, AnalyzedMessage, SemanticGroup } from './types';
import { normalize } from './normalizer';
import { segment } from './segmenter';
import { extractAllFeatures } from './featureExtractor';
import { scoreAllBlocks } from './roleScorer';
import { optimizeSequence } from './sequenceOptimizer';
import { postProcess } from './postProcessor';
import { classifyIntent } from './intentClassifier';
import { detectArtifacts } from './artifactDetector';
import { detectTopics } from './topicDictionary';
import { groupMessages } from './semanticGrouping';
import { smoothGroups } from './groupSmoothing';

/**
 * Full analysis pipeline.
 *
 * Phase 1: Role estimation
 *   normalize → segment → features → score → Viterbi → postprocess
 *
 * Phase 2: Semantic labeling
 *   intent → artifact → topic → grouping → smoothing
 */
export function analyzeConversation(rawText: string): AnalysisResult {
    // ══════════════════════════════════════════════════════
    // Phase 1: Role estimation pipeline
    // ══════════════════════════════════════════════════════

    // Step 1: Normalize text
    const normalizedText = normalize(rawText);

    // Step 2: Segment into blocks
    const segmentedBlocks = segment(normalizedText);

    // Step 3: Extract features from each block
    const featuredBlocks = extractAllFeatures(segmentedBlocks);

    // Step 4: Score blocks for User/AI likelihood
    const scoredBlocks = scoreAllBlocks(featuredBlocks);

    // Step 5: Optimize role sequence with Viterbi
    const optimizedBlocks = optimizeSequence(scoredBlocks);

    // Step 6: Post-process (marker forcing, merging, etc.)
    const processedBlocks = postProcess(optimizedBlocks);

    // ══════════════════════════════════════════════════════
    // Phase 2: Semantic labeling pipeline
    // ══════════════════════════════════════════════════════

    // Step 7: Convert to AnalyzedMessage with semantic labels
    let messages: AnalyzedMessage[] = processedBlocks.map((block, idx) => ({
        id: idx,
        role: block.role,
        text: block.text,
        confidence: block.confidence,
        intent: classifyIntent(block.text),
        artifact: detectArtifacts(block.text),
        topic: detectTopics(block.text),
        semanticGroupId: 0, // will be set by grouping
    }));

    // Step 8: Semantic grouping (cluster related messages)
    const semanticGroups: SemanticGroup[] = groupMessages(messages);

    // Step 9: Smooth labels within groups (propagate representative tags)
    messages = smoothGroups(messages, semanticGroups);

    return { messages, semanticGroups };
}

// Re-export types for convenience
export type { AnalysisResult, AnalyzedMessage, SemanticGroup } from './types';
export type { Role, IntentTag, ArtifactTag } from './types';
