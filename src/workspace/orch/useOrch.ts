// useOrch.ts — 오케스트레이션 사본 스토어(호스트별 orch.list) + 훅.
//
// 데이터 흐름(orchestration-design.md §5):
//  · 정본은 각 PC 데몬이다. 서버는 묶음·워커를 저장하지 않는다 → 호스트마다 orch.list 를 부른다.
//  · 라이브 갱신 = 데몬 ui_command `orch.changed {host, runIds, reason}` → 그 host 만 300ms 디바운스 재조회.
//  · 재연결·호스트 온라인 전이 때 다시 받는다(push 만으로는 한 번 놓치면 영영 빈칸이다).
// 모듈 스토어(React 밖)인 이유: UiCommandBridge·사이드바·pane 탭·시트가 같은 사본을 본다.
import { useSyncExternalStore } from 'react';
import taskService from '../../services/taskService';
import { listOrch, hostSupportsOrch, type OrchSnapshot } from '../../services/orchService';
import { terminalRoles, type TerminalRole } from './orchModel';

const buckets = new Map<number, OrchSnapshot & { at: number }>();
const roleCache = new Map<number, { at: number; roles: Map<string, TerminalRole> }>();
const listeners = new Set<() => void>();
let version = 0;
function emit() { version += 1; listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } }); }
export function subscribeOrch(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function getOrchVersion(): number { return version; }
export function getOrchSnapshot(host: number | null | undefined): (OrchSnapshot & { at: number }) | null {
  return host == null ? null : buckets.get(Number(host)) || null;
}

const inflight = new Map<number, Promise<void>>();
export function refreshOrchHost(host: number): Promise<void> {
  const h = Number(host);
  if (!Number.isFinite(h) || h <= 0) return Promise.resolve();
  const cur = inflight.get(h);
  if (cur) return cur;
  const p = (async () => {
    try {
      const r = await listOrch(h);
      buckets.set(h, { runs: Array.isArray(r?.runs) ? r.runs : [], notes: Array.isArray(r?.notes) ? r.notes : [], at: Date.now() });
      emit();
    } catch (_) {
      // 구 데몬·오프라인 — 마지막으로 본 것을 지우지 않는다(잠깐의 끊김에 행이 깜빡이지 않게).
    } finally {
      inflight.delete(h);
    }
  })();
  inflight.set(h, p);
  return p;
}

let hostIdsProvider: () => number[] = () => [];
export function setOrchHostProvider(fn: () => number[]): void { hostIdsProvider = fn; }
/** 붙어 있는 PC 중 orch.v1 이 **없다고 확인된** 것만 빼고 전부(모름은 시도한다). */
export function refreshAllOrch(): Promise<void> {
  const ids = new Set<number>(hostIdsProvider().filter((n) => Number.isFinite(n)));
  for (const h of taskService.connectedHosts()) ids.add(h);
  const hosts = [...ids].filter((h) => taskService.isHostConnected(h) && hostSupportsOrch(h) !== false);
  return Promise.all(hosts.map((h) => refreshOrchHost(h))).then(() => undefined);
}

const timers = new Map<number, ReturnType<typeof setTimeout>>();
/** ui_command `orch.changed` 수신(UiCommandBridge). */
export function onOrchChanged(params: { host?: unknown }): void {
  const raw = params?.host;
  const host = raw == null || raw === '' ? NaN : Number(raw);
  if (!Number.isFinite(host) || host <= 0) { void refreshAllOrch(); return; }
  const t = timers.get(host);
  if (t) clearTimeout(t);
  timers.set(host, setTimeout(() => { timers.delete(host); void refreshOrchHost(host); }, 300));
}

export function resetOrchStore(): void { buckets.clear(); roleCache.clear(); emit(); }

/** (host, 홈-상대 cwd, 터미널 번호) → 역할. pane 탭이 읽는다. */
export function orchRoleOf(host: number | null | undefined, cwd: string, tid: number | null | undefined): TerminalRole | null {
  if (host == null || typeof tid !== 'number') return null;
  const h = Number(host);
  const b = buckets.get(h);
  if (!b) return null;
  let c = roleCache.get(h);
  if (!c || c.at !== b.at) { c = { at: b.at, roles: terminalRoles(b) }; roleCache.set(h, c); }
  return c.roles.get(`${cwd || ''}\n${tid}`) || null;
}

export function useOrchVersion(): number { return useSyncExternalStore(subscribeOrch, getOrchVersion); }
/** 한 PC 의 사본(없으면 null). */
export function useOrchSnapshot(host: number | null | undefined): (OrchSnapshot & { at: number }) | null {
  useOrchVersion();
  return getOrchSnapshot(host);
}
