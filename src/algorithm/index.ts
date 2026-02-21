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

import { normalizeBold, recoverTables } from '../utils/tableRecovery';
import { removeTrailingInvitations } from '../utils/junkRemoval';
import { repairMarkdown, beautifyCitations } from '../utils/markdownRepair';

/**
 * Full analysis pipeline. Supports single or multiple chat log inputs.
 */
export function analyzeConversation(inputs: string | string[]): AnalysisResult {
    const rawInputs = Array.isArray(inputs) ? inputs : [inputs];
    let allProcessedBlocks: any[] = []; // Unified block list

    // ══════════════════════════════════════════════════════
    // Phase 1: Internal Processing (per document)
    // ══════════════════════════════════════════════════════
    rawInputs.forEach((rawText, sourceIdx) => {
        // Step 1 & 2: Normalize and Segment
        const normalized = normalize(rawText);
        const segments = segment(normalized);

        // Step 3-5: Feature extraction & Role scoring (with source context)
        const featured = extractAllFeatures(segments);
        const scored = scoreAllBlocks(featured);
        const optimized = optimizeSequence(scored);

        // Step 6: Post-process
        const processed = postProcess(optimized);

        // Offset IDs and attach source identity
        const blocksWithMeta = processed.map(block => ({
            ...block,
            sourceId: sourceIdx,
            globalId: allProcessedBlocks.length // incremental unique ID
        }));

        allProcessedBlocks = [...allProcessedBlocks, ...blocksWithMeta];
    });

    // ══════════════════════════════════════════════════════
    // Phase 2: Synthesis & Semantic Labeling (unified)
    // ══════════════════════════════════════════════════════

    // Step 7: Convert to AnalyzedMessage with semantic labels
    let messages: AnalyzedMessage[] = allProcessedBlocks.map((block) => {
        // Apply professional formatting (including citations) to ALL messages
        // to ensure manual research markers are always beautified.
        const text = beautifyCitations(
            repairMarkdown(
                normalizeBold(
                    recoverTables(
                        removeTrailingInvitations(block.text)
                    )
                )
            )
        );

        return {
            id: block.globalId,
            sourceId: block.sourceId,
            role: block.role,
            text,
            confidence: block.confidence,
            intent: classifyIntent(text),
            artifact: detectArtifacts(text),
            topic: detectTopics(text),
            semanticGroupId: 0,
        };
    });

    // Step 8: Semantic grouping (cluster related messages)
    const semanticGroups: SemanticGroup[] = groupMessages(messages);

    // Step 9: Smooth labels within groups (propagate representative tags)
    messages = smoothGroups(messages, semanticGroups);

    return { messages, semanticGroups };
}

// Re-export types for convenience
export type { AnalysisResult, AnalyzedMessage, SemanticGroup } from './types';
export type { Role, IntentTag, ArtifactTag } from './types';
