// ══════════════════════════════════════════════════════════
// EVALUATION HARNESS — Measure algorithm accuracy
// ══════════════════════════════════════════════════════════
//
// Usage: npx tsx src/algorithm/__tests__/evaluate.ts
//
// Metrics:
//   - Role Accuracy:  % of blocks with correct role assignment
//   - Boundary Score: how close the detected block count is to expected
//   - Overall Score:  weighted combination
//

import { analyzeConversation } from '../index';
import { TEST_CASES, type TestCase, type LabeledMessage } from './fixtures';

interface TestResult {
    id: string;
    name: string;
    detectedCount: number;
    expectedCount: number;
    roleAccuracy: number;
    boundaryScore: number;
    overallScore: number;
    details: string[];
}

/**
 * Compute role accuracy by aligning detected messages with expected.
 *
 * Strategy: We align based on text overlap. For each expected message,
 * find the detected message that contains the most of its text (prefix match).
 */
function computeRoleAccuracy(
    detected: { role: string; text: string }[],
    expected: LabeledMessage[]
): { accuracy: number; details: string[] } {
    if (expected.length === 0) return { accuracy: 1.0, details: [] };
    if (detected.length === 0) return { accuracy: 0, details: ['No blocks detected'] };

    let correct = 0;
    const details: string[] = [];

    for (const exp of expected) {
        // Find best matching detected block by text overlap
        const expSnippet = exp.text.slice(0, 50).toLowerCase();
        let bestMatch: { role: string; text: string } | null = null;
        let bestOverlap = 0;

        for (const det of detected) {
            const detText = det.text.toLowerCase();
            // Check if the expected snippet appears in the detected text
            if (detText.includes(expSnippet)) {
                const overlap = expSnippet.length;
                if (overlap > bestOverlap) {
                    bestOverlap = overlap;
                    bestMatch = det;
                }
            }
        }

        if (!bestMatch) {
            // Fallback: check partial match (first 20 chars)
            const shortSnippet = exp.text.slice(0, 20).toLowerCase();
            for (const det of detected) {
                if (det.text.toLowerCase().includes(shortSnippet)) {
                    bestMatch = det;
                    break;
                }
            }
        }

        if (bestMatch) {
            const normalizedExpRole = exp.role === 'ai' ? 'ai' : 'user';
            const normalizedDetRole = bestMatch.role === 'ai' || bestMatch.role === 'assistant' ? 'ai' : 'user';
            if (normalizedDetRole === normalizedExpRole) {
                correct++;
            } else {
                details.push(`✗ "${exp.text.slice(0, 40)}..." expected=${exp.role} got=${bestMatch.role}`);
            }
        } else {
            details.push(`✗ "${exp.text.slice(0, 40)}..." NOT FOUND in detected blocks`);
        }
    }

    return {
        accuracy: correct / expected.length,
        details,
    };
}

/**
 * Compute boundary score: how close detected block count is to expected.
 * Score = 1.0 - |detected - expected| / max(detected, expected)
 */
function computeBoundaryScore(detected: number, expected: number): number {
    if (expected === 0) return detected === 0 ? 1.0 : 0;
    const diff = Math.abs(detected - expected);
    return Math.max(0, 1.0 - diff / Math.max(detected, expected));
}

/**
 * Run a single test case.
 */
function runTestCase(tc: TestCase): TestResult {
    const result = analyzeConversation(tc.rawText);
    const detected = result.messages;

    const { accuracy, details } = computeRoleAccuracy(
        detected.map(m => ({ role: m.role, text: m.text })),
        tc.expectedMessages
    );

    const boundaryScore = computeBoundaryScore(detected.length, tc.expectedBoundaryCount);

    // Overall: 60% role accuracy + 40% boundary score
    const overallScore = accuracy * 0.6 + boundaryScore * 0.4;

    return {
        id: tc.id,
        name: tc.name,
        detectedCount: detected.length,
        expectedCount: tc.expectedBoundaryCount,
        roleAccuracy: accuracy,
        boundaryScore,
        overallScore,
        details,
    };
}

/**
 * Run all test cases and print report.
 */
function runAll(): void {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  ALGORITHM EVALUATION REPORT');
    console.log('══════════════════════════════════════════════════════════\n');

    const results: TestResult[] = [];

    for (const tc of TEST_CASES) {
        const result = runTestCase(tc);
        results.push(result);

        const roleIcon = result.roleAccuracy >= 0.8 ? '✅' : result.roleAccuracy >= 0.5 ? '⚠️' : '❌';
        const boundIcon = result.boundaryScore >= 0.8 ? '✅' : result.boundaryScore >= 0.5 ? '⚠️' : '❌';

        console.log(`─── ${result.id}: ${result.name} ───`);
        console.log(`  Blocks: ${result.detectedCount} detected / ${result.expectedCount} expected`);
        console.log(`  ${roleIcon} Role Accuracy:  ${(result.roleAccuracy * 100).toFixed(1)}%`);
        console.log(`  ${boundIcon} Boundary Score: ${(result.boundaryScore * 100).toFixed(1)}%`);
        console.log(`  Overall Score:  ${(result.overallScore * 100).toFixed(1)}%`);

        if (result.details.length > 0) {
            for (const d of result.details) {
                console.log(`    ${d}`);
            }
        }
        console.log('');
    }

    // ── Summary ──
    const avgRole = results.reduce((s, r) => s + r.roleAccuracy, 0) / results.length;
    const avgBound = results.reduce((s, r) => s + r.boundaryScore, 0) / results.length;
    const avgOverall = results.reduce((s, r) => s + r.overallScore, 0) / results.length;

    console.log('══════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`  Test Cases:      ${results.length}`);
    console.log(`  Avg Role Acc:    ${(avgRole * 100).toFixed(1)}%`);
    console.log(`  Avg Boundary:    ${(avgBound * 100).toFixed(1)}%`);
    console.log(`  Avg Overall:     ${(avgOverall * 100).toFixed(1)}%`);

    const passCount = results.filter(r => r.overallScore >= 0.7).length;
    console.log(`  Passing (≥70%):  ${passCount}/${results.length}`);
    console.log('══════════════════════════════════════════════════════════\n');
}

// ── Run ──
runAll();
