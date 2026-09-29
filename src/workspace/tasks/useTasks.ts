// useTasks.ts — 작업 목록 스토어(호스트별 task.list) + 현황판 모델 훅.
//
// 데이터 흐름(설계 §3.4):
//  · 정본은 각 PC 데몬의 tasks.json 이다. 서버는 작업을 저장하지 않는다 → 호스트마다 task.list 를 부른다.
//  · 라이브 갱신 = 데몬 ui_command `tasks.changed {host, taskIds, reason}` → 그 host 만 300ms 디바운스 재조회.
//  · 보강 폴링 = 현황판이 보이는 동안 60s, runner_status online 전이·채널 재연결 시 즉시(+ caps 재조회).
//  · 라이브 상태(입력 대기/작업 중)는 여기서 저장하지 않는다 — agentStateStore·승인 목록을 모델이 겹친다.
//
// 모듈 스토어(React 밖)인 이유: UiCommandBridge·WorkspaceShellContext(runner_status)·사이드바 배지·
//  현황판이 같은 목록을 본다. 컴포넌트 수명에 묶으면 현황판을 닫는 순간 사이드바 카운트가 사라진다.

import { useMemo, useSyncExternalStore } from 'react';
import taskService, { type TaskLite, type GhStatusLite, TaskRpcError } from '../../services/taskService';
import agentStateStore, { subscribeAgentState, getAgentStateVersion } from '../../services/agentStateStore';
import { buildTasksModel, type ModelInput, type ModelOutput, type LiveState } from './tasksModel';
import type { WorkspaceMeta } from '../../services/workspaceService';
import type { ApprovalRow } from '../../services/approvalService';
import type { AccountDevice } from '../../services/daemonService';

export interface HostBucket {
  host: number;
  items: TaskLite[];
  gh: GhStatusLite | null;
  loading: boolean;
  /** 마지막 조회 실패 code(성공하면 null). 목록은 직전 값을 유지한다(모름을 빈 목록으로 바꾸지 않는다). */
  error: string | null;
  loadedAt: number;
}

const buckets = new Map<number, HostBucket>();
const listeners = new Set<() => void>();
let version = 0;
const dismissedOps = new Set<string>();

function emit() {
  version += 1;
  listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });
}
export function subscribeTasks(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getTasksVersion(): number { return version; }
export function getBucket(host: number): HostBucket | null { return buckets.get(Number(host)) || null; }
export function allBuckets(): HostBucket[] { return [...buckets.values()]; }

/** 로컬에서 [확인] 으로 지운 실패 op(설계 §5.3 — 사용자가 봤다). 앱 수명 동안만 기억한다. */
export function dismissOp(opId: string | null | undefined): void {
  if (!opId || dismissedOps.has(opId)) return;
  dismissedOps.add(opId);
  emit();
}

// ── tasks.changed 구독(상세 화면이 task.get 을 다시 부르는 데 쓴다) ──
type ChangedListener = (host: number, taskIds: string[], reason: string) => void;
const changedListeners = new Set<ChangedListener>();
export function subscribeTasksChanged(fn: ChangedListener): () => void {
  changedListeners.add(fn);
  return () => { changedListeners.delete(fn); };
}

const inflight = new Map<number, Promise<void>>();
/** 한 호스트의 task.list — 겹치면 진행 중인 것을 공유한다. */
export function refreshHost(host: number): Promise<void> {
  const h = Number(host);
  const cur = inflight.get(h);
  if (cur) return cur;
  const prev = buckets.get(h);
  buckets.set(h, { host: h, items: prev?.items || [], gh: prev?.gh || null, loading: true, error: prev?.error || null, loadedAt: prev?.loadedAt || 0 });
  emit();
  const p = (async () => {
    try {
      const r = await taskService.listTasks(h, {});
      buckets.set(h, {
        host: h,
        items: Array.isArray(r?.items) ? r.items : [],
        gh: r?.caps?.gh || null,
        loading: false,
        error: null,
        loadedAt: Date.now(),
      });
    } catch (e: any) {
      const code = e instanceof TaskRpcError ? e.code : String(e?.code || 'GH_ERROR');
      const b = buckets.get(h);
      buckets.set(h, { host: h, items: b?.items || [], gh: b?.gh || null, loading: false, error: code, loadedAt: b?.loadedAt || 0 });
    } finally {
      inflight.delete(h);
      emit();
    }
  })();
  inflight.set(h, p);
  return p;
}

let refreshAllInflight: Promise<void> | null = null;
/** caps 재조회 → 대상 호스트(붙어 있는 로컬 러너 중 task.v1 광고 또는 caps 모름) 전부 task.list. 오프라인이 된 호스트의 목록은 남겨 둔다(모델이 "PC 오프라인" 으로 접는다). */
export function refreshAllTasks(): Promise<void> {
  if (refreshAllInflight) return refreshAllInflight;
  refreshAllInflight = (async () => {
    try {
      await taskService.refreshHostCaps();
      const hosts: number[] = [];
      // taskService 가 마지막 getStatus 의 로컬 러너를 기억한다 — 그중 task.v1 이 없는 PC 는 부르지 않는다
      //  (구 데몬은 모르는 메서드로 실패할 뿐이지만, 왕복을 아낄 이유가 충분하다: 배너가 이미 사유를 말한다).
      for (const h of knownHostIds()) {
        if (!taskService.isHostConnected(h)) continue;
        if (taskService.hostSupportsTasks(h) === false) continue;
        hosts.push(h);
      }
      await Promise.all(hosts.map((h) => refreshHost(h)));
    } finally {
      refreshAllInflight = null;
    }
  })();
  return refreshAllInflight;
}

// 호스트 id 후보 — 셸이 알려 준 PC 목록(기기 레지스트리). 스토어는 React 밖이라 셸이 주입한다.
let hostIdsProvider: () => number[] = () => [];
export function setTaskHostProvider(fn: () => number[]): void { hostIdsProvider = fn; }
function knownHostIds(): number[] {
  const ids = new Set<number>(hostIdsProvider().filter((n) => Number.isFinite(n)));
  for (const h of taskService.connectedHosts()) ids.add(h);
  for (const h of buckets.keys()) ids.add(h);
  return [...ids];
}

const changedTimers = new Map<number, ReturnType<typeof setTimeout>>();
/** ui_command `tasks.changed` 수신(UiCommandBridge). 300ms 디바운스 후 그 host 재조회 + 상세 구독자 통지. */
export function onTasksChanged(params: { host?: unknown; taskIds?: unknown; reason?: unknown }): void {
  // host:null(데몬 config 에 deviceId 가 아직 없음) → Number(null)=0 이 "유령 호스트 0" 조회가 되던 것을 막는다.
  const raw = params?.host;
  const host = raw == null || raw === '' ? NaN : Number(raw);
  const taskIds = Array.isArray(params?.taskIds) ? params.taskIds.map(String) : [];
  const reason = String(params?.reason || '');
  if (!Number.isFinite(host) || host <= 0) { void refreshAllTasks(); return; }
  const t = changedTimers.get(host);
  if (t) clearTimeout(t);
  changedTimers.set(host, setTimeout(() => {
    changedTimers.delete(host);
    void refreshHost(host);
  }, 300));
  changedListeners.forEach((fn) => { try { fn(host, taskIds, reason); } catch (_) { /* noop */ } });
}

/** runner_status online 전이(WorkspaceShellContext) — caps 가 바뀌었을 수 있다(PC 앱 업데이트). */
export function onHostOnline(host: number): void {
  void taskService.refreshHostCaps().then(() => {
    if (taskService.hostSupportsTasks(host) !== false) void refreshHost(host);
  });
}

/** 테스트·로그아웃용 초기화. */
export function resetTasksStore(): void {
  buckets.clear();
  dismissedOps.clear();
  emit();
}

// ── React 훅 ───────────────────────────────────────────────────────────────
export function useTasksVersion(): number {
  return useSyncExternalStore(subscribeTasks, getTasksVersion);
}

/** 셸 상태 중 모델에 필요한 부분 — WorkspaceShellContext 값에서 그대로 넘긴다. */
export interface ShellSlice {
  devices: AccountDevice[];
  approvals: ApprovalRow[];
  notifications: { read: boolean; cwd?: string | null; win?: number | null }[];
  workspaces: WorkspaceMeta[];
}

/** 현황판 모델 — 스토어·에이전트 상태·caps 중 무엇이 바뀌어도 다시 계산한다. */
export function useTasksModel(shell: ShellSlice): ModelOutput & { now: number } {
  const tv = useTasksVersion();
  const av = useSyncExternalStore(subscribeAgentState, getAgentStateVersion);
  const cv = useSyncExternalStore(taskService.subscribeHostCaps, capsVersionOf);
  return useMemo(() => {
    const now = Date.now();
    const input = buildModelInput(shell, now);
    return { ...buildTasksModel(input), now };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tv, av, cv, shell.devices, shell.approvals, shell.notifications, shell.workspaces]);
}
let capsVer = 0;
taskService.subscribeHostCaps(() => { capsVer += 1; });
function capsVersionOf(): number { return capsVer; }

export function buildModelInput(shell: ShellSlice, now: number): ModelInput {
  const hosts = (shell.devices || [])
    .filter((d) => d && (d as any).role !== 'controller' && (d as any).runnerKind !== 'cloud')
    .map((d) => {
      const id = Number(d.id);
      return {
        id,
        name: String(d.name || ''),
        online: taskService.capsLoaded() ? taskService.isHostConnected(id) : d.online !== false,
        caps: taskService.hostCaps(id) || [],
      };
    })
    .filter((h) => Number.isFinite(h.id));
  const tasks = allBuckets().map((b) => ({ host: b.host, items: b.items }));
  const agentSnaps = agentStateStore.listAgentSnaps(now).map((s) => ({
    host: s.host, cwd: s.cwd, win: s.win, agent: s.agent, state: s.state as LiveState, at: s.at, since: s.since,
  }));
  const approvals = (shell.approvals || [])
    .filter((a) => !a.expired && typeof a.cwd === 'string' && typeof a.win === 'number')
    .map((a) => ({ id: a.id, host: Number(a.hostDeviceId ?? 0) || 0, cwd: a.cwd as string, win: a.win as number, createdAt: a.requestedAt || 0 }));
  // 미읽음 알림은 host 를 싣지 않는다 → 0(모름) 으로 넣으면 모델이 같은 cwd|win 의 run 에 붙인다.
  const unreadMap = new Map<string, { host: number; cwd: string; win: number; count: number }>();
  for (const n of shell.notifications || []) {
    if (n.read || typeof n.cwd !== 'string' || typeof n.win !== 'number') continue;
    const k = `${n.cwd}|${n.win}`;
    const cur = unreadMap.get(k);
    if (cur) cur.count += 1; else unreadMap.set(k, { host: 0, cwd: n.cwd, win: n.win, count: 1 });
  }
  const workspaces = (shell.workspaces || [])
    .filter((w) => typeof w.localPath === 'string' && !!w.localPath)
    .map((w) => ({ id: w.id, host: Number(w.hostDeviceId ?? 0) || 0, localPath: w.localPath as string, name: w.name || '' }));
  return {
    now, hosts, tasks, agentSnaps, approvals, unread: [...unreadMap.values()],
    // 폴백 터미널 목록은 모바일이 호스트 전체 풀을 들고 있지 않아 비워 둔다(설계 §5.1 — 없으면 [] 가 계약).
    terminalsFallback: [],
    workspaces,
    dismissedOps: [...dismissedOps],
  };
}

/** 작업 하나 찾기(딥링크·알림) — host 를 모르면 전 호스트에서. */
export function findTask(taskId: string, host?: number | null): { host: number; task: TaskLite } | null {
  if (host != null) {
    const b = buckets.get(Number(host));
    const t = b?.items.find((x) => x.id === taskId);
    if (t) return { host: Number(host), task: t };
  }
  for (const b of buckets.values()) {
    const t = b.items.find((x) => x.id === taskId);
    if (t) return { host: b.host, task: t };
  }
  return null;
}
/** 터미널 좌표로 run 찾기(인앱 알림 행은 deeplink 를 싣지 않는다 — cwd/win 만 있다). */
export function findRunByTerminal(cwd: string, win: number | null | undefined): { host: number; task: TaskLite; runId: string } | null {
  for (const b of buckets.values()) {
    for (const t of b.items) {
      const r = t.runs.find((x) => x.cwd === cwd && (win == null || x.tid === win));
      if (r) return { host: b.host, task: t, runId: r.id };
    }
  }
  return null;
}

/**
 * 비동기 op 의 마감을 기다린다(설계 §2.9 "비동기 op 공통 규칙") — 변이 RPC 는 `{accepted, opId}` 만 즉시
 *  돌려주고, 결과는 `run.lastOp`(같은 opId) 로 온다. tasks.changed reason:'op' → task.list 재조회로 들어오는
 *  것을 스토어 구독으로 본다. 알림 채널이 끊겨 통지를 놓쳐도 끝나게 5초마다 그 host 를 직접 재조회한다.
 *  @returns 마감된 lastOp, 시간 초과면 null(호출부는 "확인 중…" 뒤 task.get 으로 확인한다).
 */
export function waitForOp(host: number, taskId: string, runId: string, opId: string, timeoutMs = 6 * 60 * 1000): Promise<import('../../services/taskService').RunLastOp | null> {
  return new Promise((resolve) => {
    let done = false;
    const check = () => {
      if (done) return;
      const t = findTask(taskId, host)?.task;
      const r = t?.runs.find((x) => x.id === runId);
      const lo = r?.lastOp;
      if (lo && lo.opId === opId && (!r?.op || r.op.opId !== opId)) finish(lo);
    };
    const finish = (v: import('../../services/taskService').RunLastOp | null) => {
      if (done) return;
      done = true;
      off();
      clearInterval(poll);
      clearTimeout(timer);
      resolve(v);
    };
    const off = subscribeTasks(check);
    const poll = setInterval(() => { void refreshHost(host); }, 5000);
    const timer = setTimeout(() => finish(null), timeoutMs);
    check();
  });
}
