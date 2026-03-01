import { useSyncExternalStore } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

let nextId = 0;
let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(fn => fn());
}

export function toast(type: ToastType, message: string, duration = 3000) {
  const id = ++nextId;
  toasts = [...toasts, { id, type, message }];
  emit();
  setTimeout(() => dismissToast(id), duration);
}

export function dismissToast(id: number) {
  toasts = toasts.filter(t => t.id !== id);
  emit();
}

function getSnapshot() {
  return toasts;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useToasts() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
