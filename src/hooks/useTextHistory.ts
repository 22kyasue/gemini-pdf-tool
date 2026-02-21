import { useState, useCallback, useRef } from 'react';

/**
 * useTextHistory — Undo/Redo stack for a textarea string value.
 *
 * - Keeps up to MAX_HISTORY snapshots (oldest entries are discarded).
 * - `set(val)` pushes a new snapshot and advances the cursor.
 * - `undo()` / `redo()` move the cursor without touching the stack.
 *
 * Fix: cursor is stored in a ref so the `set` callback always reads
 * the latest value and never suffers from stale-closure bugs.
 */

const MAX_HISTORY = 50;

export function useTextHistory(initial: string) {
    // Store history in a ref so `set` always reads the latest array
    const historyRef = useRef<string[]>([initial]);
    const cursorRef = useRef(0);

    // Re-render trigger — we flip this to force a re-render when state changes
    const [, rerender] = useState(0);
    const forceUpdate = useCallback(() => rerender(n => n + 1), []);

    /** Current value at cursor position */
    const value = historyRef.current[cursorRef.current];

    /**
     * Push a new value.
     * Discards any "redo" entries beyond the current cursor.
     */
    const set = useCallback((val: string) => {
        const cursor = cursorRef.current;
        const history = historyRef.current;

        // Trim the redo tail
        const trimmed = history.slice(0, cursor + 1);
        const next = [...trimmed, val];

        // Cap at MAX_HISTORY
        const capped = next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
        historyRef.current = capped;
        cursorRef.current = capped.length - 1;
        forceUpdate();
    }, [forceUpdate]);

    const undo = useCallback(() => {
        if (cursorRef.current > 0) {
            cursorRef.current -= 1;
            forceUpdate();
        }
    }, [forceUpdate]);

    const redo = useCallback(() => {
        if (cursorRef.current < historyRef.current.length - 1) {
            cursorRef.current += 1;
            forceUpdate();
        }
    }, [forceUpdate]);

    const canUndo = cursorRef.current > 0;
    const canRedo = cursorRef.current < historyRef.current.length - 1;

    return { value, set, undo, redo, canUndo, canRedo };
}
