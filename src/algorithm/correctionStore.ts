// ══════════════════════════════════════════════════════════
// CORRECTION STORE — Persist user corrections in localStorage
// ══════════════════════════════════════════════════════════

import type { Role } from './types';

/**
 * A single correction record: what the user changed and the context.
 */
export interface CorrectionRecord {
    /** Timestamp of the correction */
    timestamp: number;
    /** Original text of the block that was corrected */
    textSnippet: string; // first 200 chars for matching
    /** Original role assigned by the algorithm */
    originalRole: Role;
    /** Role the user corrected to */
    correctedRole: Role;
    /** Features that were active on this block (for weight learning) */
    activeFeatures: string[];
    /** Text length of the block */
    charCount: number;
    /** Original confidence of the algorithm */
    originalConfidence: number;
}

/**
 * A block merge/split record.
 */
export interface StructureCorrection {
    timestamp: number;
    type: 'merge' | 'split';
    /** Text snippet of the affected block(s) */
    textSnippets: string[];
}

/**
 * User-added topic keywords.
 */
export interface UserTopicEntry {
    topic: string;
    keywords: string[];
    addedAt: number;
}

/**
 * Full correction store shape.
 */
interface CorrectionStoreData {
    version: number;
    roleCorrections: CorrectionRecord[];
    structureCorrections: StructureCorrection[];
    userTopics: UserTopicEntry[];
    /** Learned weight adjustments (feature → additive delta) */
    weightDeltas: Record<string, number>;
}

const STORAGE_KEY = 'chat-algo-corrections';
const STORE_VERSION = 1;

function getDefaultStore(): CorrectionStoreData {
    return {
        version: STORE_VERSION,
        roleCorrections: [],
        structureCorrections: [],
        userTopics: [],
        weightDeltas: {},
    };
}

/**
 * Load correction store from localStorage.
 */
export function loadStore(): CorrectionStoreData {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return getDefaultStore();
        const parsed = JSON.parse(raw) as CorrectionStoreData;
        if (parsed.version !== STORE_VERSION) return getDefaultStore();
        return parsed;
    } catch {
        return getDefaultStore();
    }
}

/**
 * Save correction store to localStorage.
 */
function saveStore(store: CorrectionStoreData): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
        // localStorage full or unavailable — silently fail
        console.warn('[CorrectionStore] Failed to save to localStorage');
    }
}

// ── Public API ──

/**
 * Record a role correction.
 */
export function addRoleCorrection(correction: CorrectionRecord): void {
    const store = loadStore();
    store.roleCorrections.push(correction);

    // Keep last 500 corrections to prevent unbounded growth
    if (store.roleCorrections.length > 500) {
        store.roleCorrections = store.roleCorrections.slice(-500);
    }

    saveStore(store);
}

/**
 * Record a structure correction (merge/split).
 */
export function addStructureCorrection(correction: StructureCorrection): void {
    const store = loadStore();
    store.structureCorrections.push(correction);

    if (store.structureCorrections.length > 200) {
        store.structureCorrections = store.structureCorrections.slice(-200);
    }

    saveStore(store);
}

/**
 * Add user-defined topic keywords.
 */
export function addUserTopic(topic: string, keywords: string[]): void {
    const store = loadStore();
    const existing = store.userTopics.find(t => t.topic === topic);
    if (existing) {
        // Merge new keywords with existing
        const merged = new Set([...existing.keywords, ...keywords]);
        existing.keywords = [...merged];
        existing.addedAt = Date.now();
    } else {
        store.userTopics.push({ topic, keywords, addedAt: Date.now() });
    }
    saveStore(store);
}

/**
 * Remove a user-defined topic.
 */
export function removeUserTopic(topic: string): void {
    const store = loadStore();
    store.userTopics = store.userTopics.filter(t => t.topic !== topic);
    saveStore(store);
}

/**
 * Get all user-defined topics.
 */
export function getUserTopics(): UserTopicEntry[] {
    return loadStore().userTopics;
}

/**
 * Get all role corrections.
 */
export function getRoleCorrections(): CorrectionRecord[] {
    return loadStore().roleCorrections;
}

/**
 * Update learned weight deltas.
 */
export function updateWeightDeltas(deltas: Record<string, number>): void {
    const store = loadStore();
    store.weightDeltas = { ...store.weightDeltas, ...deltas };
    saveStore(store);
}

/**
 * Get learned weight deltas.
 */
export function getWeightDeltas(): Record<string, number> {
    return loadStore().weightDeltas;
}

/**
 * Clear all correction data.
 */
export function clearStore(): void {
    saveStore(getDefaultStore());
}

/**
 * Get store statistics for UI display.
 */
export function getStoreStats(): {
    totalCorrections: number;
    roleCorrections: number;
    structureCorrections: number;
    userTopics: number;
    learnedFeatures: number;
} {
    const store = loadStore();
    return {
        totalCorrections: store.roleCorrections.length + store.structureCorrections.length,
        roleCorrections: store.roleCorrections.length,
        structureCorrections: store.structureCorrections.length,
        userTopics: store.userTopics.length,
        learnedFeatures: Object.keys(store.weightDeltas).length,
    };
}
