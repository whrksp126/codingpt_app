// issuesUi.ts — Tasks(이슈) 장소의 열림 상태(모듈 스토어). 여는 쪽 = 사이드바의 Tasks 행. 진행 현황·자동화와 같은 급의 "장소" 다.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });
export function subscribeIssuesUi(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function isIssuesOpen(): boolean { return open; }
let backFn: (() => boolean) | null = null;
/** 하드웨어 뒤로 — 열려 있는 동안 화면이 등록한다(상세면 목록으로, 목록이면 워크스페이스로). */
export function setIssuesBackHandler(fn: (() => boolean) | null): void { backFn = fn; }
export function handleIssuesBack(): boolean { return open && backFn ? backFn() : false; }
export function openIssues(): void { if (!open) { open = true; emit(); } }
export function closeIssues(): void { if (open) { open = false; emit(); } }
export function useIssuesOpen(): boolean { return useSyncExternalStore(subscribeIssuesUi, isIssuesOpen); }
