// ══════════════════════════════════════════════════════════
// SEQUENCE OPTIMIZER — Viterbi/DP for role sequence optimization
// ══════════════════════════════════════════════════════════

import type { ScoredBlock, OptimizedBlock, Role } from './types';

/**
 * Transition cost matrix.
 *
 * The cost represents how "unnatural" a transition is.
 * Lower cost = more natural transition.
 */
interface TransitionParams {
    /** Cost of User → AI transition (natural, low) */
    userToAi: number;
    /** Cost of AI → User transition (natural, low) */
    aiToUser: number;
    /** Base cost of User → User (depends on text length) */
    userToUserBase: number;
    /** Base cost of AI → AI (depends on text length) */
    aiToAiBase: number;
}

const DEFAULT_PARAMS: TransitionParams = {
    userToAi: 0.1,
    aiToUser: 0.1,
    userToUserBase: 0.3,
    aiToAiBase: 0.3,
};

/**
 * Compute transition cost between two states, considering the current block's features.
 */
function transitionCost(
    fromRole: Role,
    toRole: Role,
    block: ScoredBlock,
    prevBlock: ScoredBlock | null,
    params: TransitionParams
): number {
    const charCount = block.features.charCount;

    if (fromRole === 'user' && toRole === 'ai') {
        let cost = params.userToAi;
        // Bonus: if previous block was a question, AI should follow
        if (prevBlock?.features.hasQuestion) cost -= 0.3;
        // Bonus: if previous block had an error keyword, AI should respond
        if (prevBlock?.features.hasErrorKeyword) cost -= 0.2;
        // Bonus: if previous block had an imperative, AI should respond
        if (prevBlock?.features.hasImperativeForm) cost -= 0.2;
        return Math.max(cost, -0.5);
    }

    if (fromRole === 'ai' && toRole === 'user') {
        const cost = params.aiToUser;
        // After AI response, user following up is natural
        return cost;
    }

    if (fromRole === 'user' && toRole === 'user') {
        // Short text → user consecutive messages are common (low cost)
        // Long text → user writing long text consecutively is unusual (high cost)
        if (charCount < 50) return params.userToUserBase * 0.5;
        if (charCount < 100) return params.userToUserBase;
        return params.userToUserBase * 2.5;
    }

    if (fromRole === 'ai' && toRole === 'ai') {
        // Long text → AI continuing with long text is natural (low cost)
        // Short text → AI writing short text consecutively is unusual (high cost)
        if (charCount > 200) return params.aiToAiBase * 0.5;
        if (charCount > 100) return params.aiToAiBase;
        return params.aiToAiBase * 2.5;
    }

    return 0;
}

/**
 * Emission cost: how well the local score matches the proposed role.
 * Lower = better match.
 */
function emissionCost(block: ScoredBlock, role: Role): number {
    // pAi is the local probability of being AI (0..1)
    if (role === 'ai') {
        return -Math.log(Math.max(block.pAi, 0.001));
    } else {
        return -Math.log(Math.max(1 - block.pAi, 0.001));
    }
}

/**
 * Viterbi algorithm for finding the optimal role sequence.
 *
 * States: 'user', 'ai'
 * Observations: local pAi scores
 * Transitions: context-dependent costs
 */
export function optimizeSequence(
    blocks: ScoredBlock[],
    params: TransitionParams = DEFAULT_PARAMS
): OptimizedBlock[] {
    if (blocks.length === 0) return [];

    const states: Role[] = ['user', 'ai'];
    const n = blocks.length;

    // dp[i][s] = minimum total cost to assign state s to block i
    const dp: number[][] = Array.from({ length: n }, () => [0, 0]);
    // backtrack[i][s] = which state at i-1 led to minimum cost at (i, s)
    const backtrack: number[][] = Array.from({ length: n }, () => [0, 0]);

    // ── Initialize first block ──
    for (let s = 0; s < states.length; s++) {
        dp[0][s] = emissionCost(blocks[0], states[s]);
        // Prior: slightly favor starting with 'user'
        if (states[s] === 'ai') dp[0][s] += 0.5;
    }

    // ── Forward pass ──
    for (let i = 1; i < n; i++) {
        for (let s = 0; s < states.length; s++) {
            let bestCost = Infinity;
            let bestPrev = 0;

            for (let p = 0; p < states.length; p++) {
                const tCost = transitionCost(states[p], states[s], blocks[i], blocks[i - 1], params);
                const totalCost = dp[i - 1][p] + tCost + emissionCost(blocks[i], states[s]);

                if (totalCost < bestCost) {
                    bestCost = totalCost;
                    bestPrev = p;
                }
            }

            dp[i][s] = bestCost;
            backtrack[i][s] = bestPrev;
        }
    }

    // ── Backtrack to find optimal sequence ──
    const optimalStates: number[] = new Array(n);

    // Find best final state
    let bestFinal = 0;
    if (dp[n - 1][1] < dp[n - 1][0]) bestFinal = 1;
    optimalStates[n - 1] = bestFinal;

    for (let i = n - 2; i >= 0; i--) {
        optimalStates[i] = backtrack[i + 1][optimalStates[i + 1]];
    }

    // ── Build result ──
    return blocks.map((block, i) => {
        const role = states[optimalStates[i]];

        // Confidence: combine local confidence with sequence context
        // If Viterbi agrees with local score, boost confidence
        // If they disagree, reduce confidence
        const viterbiAgreesWithLocal =
            (role === 'ai' && block.pAi > 0.5) ||
            (role === 'user' && block.pAi <= 0.5);

        const confidence = viterbiAgreesWithLocal
            ? Math.min(block.localConfidence * 1.2, 1.0)
            : block.localConfidence * 0.6;

        return {
            ...block,
            role,
            confidence: Math.round(confidence * 100) / 100,
        };
    });
}
