// orchUi.ts — 묶음 상세 시트의 열림 상태(모듈 스토어). 여는 쪽 = 사이드바의 묶음·워커 행.
import { useSyncExternalStore } from 'react';

export type OrchFocus = { host: number; runId: string };
let open: OrchFocus | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });

export function openOrchSheet(f: OrchFocus): void { open = f; emit(); }
export function closeOrchSheet(): void { if (open) { open = null; emit(); } }
export function useOrchSheet(): OrchFocus | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => open);
}
