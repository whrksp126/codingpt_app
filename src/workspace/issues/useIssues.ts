// useIssues.ts — 이슈 사본 스토어(호스트별 orch.issueList) + 훅. 정본은 각 PC 데몬이다(서버는 이슈를 저장하지 않는다).
//  갱신: 화면을 열 때 · 60초 보강 · 데몬 ui_command `orch.changed {reason:'issues'}` · 변이 직후.
import { useSyncExternalStore } from 'react';
import { listIssues, type Issue, type IssueSource } from '../../services/issueService';
import { isIssuesOpen } from './issuesUi';

export type IssueBucket = { issues: Issue[]; sources: IssueSource[]; at: number; error: string | null; loading: boolean };
const buckets = new Map<number, IssueBucket>();
const listeners = new Set<() => void>();
let version = 0;
function emit() { version += 1; listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } }); }
export function subscribeIssues(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function getIssueBucket(host: number | null | undefined): IssueBucket | null { return host == null ? null : buckets.get(Number(host)) || null; }

let cwdsProvider: (host: number) => string[] = () => [];
/** 그 PC 의 워크스페이스 폴더들(외부 이슈를 읽을 저장소) — 셸이 알려 준다. */
export function setIssueCwdsProvider(fn: (host: number) => string[]): void { cwdsProvider = fn; }

export async function refreshIssues(host: number, fresh = false): Promise<void> {
  const h = Number(host);
  if (!Number.isFinite(h) || h <= 0) return;
  const cur = buckets.get(h) || { issues: [], sources: [], at: 0, error: null, loading: false };
  if (cur.loading) return;
  buckets.set(h, { ...cur, loading: true }); emit();
  try {
    const r = await listIssues(h, cwdsProvider(h), fresh);
    buckets.set(h, { issues: Array.isArray(r?.issues) ? r.issues : [], sources: Array.isArray(r?.sources) ? r.sources : [], at: Date.now(), error: null, loading: false });
  } catch (e: any) {
    buckets.set(h, { ...cur, error: String((e && e.code) || 'ERROR'), loading: false });
  }
  emit();
}
/** ui_command orch.changed(reason=issues) — 열려 있을 때만 다시 읽는다(닫혀 있으면 열 때 읽는다). */
export function onIssuesChanged(host: number): void {
  if (isIssuesOpen()) void refreshIssues(host);
  else { const b = buckets.get(Number(host)); if (b) b.at = 0; }
}
/** 받은 이슈 하나를 사본에 곧바로 반영(변이 직후 — 다시 읽기 전에 화면이 먼저 따라간다). */
export function patchIssue(host: number, issue: Issue | null | undefined, removedId?: string): void {
  const b = buckets.get(Number(host));
  if (!b) return;
  let issues = b.issues;
  if (removedId) issues = issues.filter((x) => x.id !== removedId);
  if (issue) issues = issues.some((x) => x.id === issue.id) ? issues.map((x) => (x.id === issue.id ? issue : x)) : [issue, ...issues];
  buckets.set(Number(host), { ...b, issues }); emit();
}
export function resetIssues(): void { buckets.clear(); emit(); }
export function useIssueBucket(host: number | null | undefined): IssueBucket | null {
  useSyncExternalStore(subscribeIssues, () => version);
  return getIssueBucket(host);
}
