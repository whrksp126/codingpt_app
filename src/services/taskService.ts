// taskService.ts — Agent Tasks(task.* / git.*) 전송 + 와이어 타입 + 호스트 caps.
//
// 정본 계약: codingpt_daemon/docs/agent-tasks-design.md §3(RPC 표·전송 경로) · §2.13(에러 코드).
//  PC 미러 = codingpt_pc/src/js/tasks-api.js(같은 폴백 규칙·같은 타임아웃 표).
//
// ★ 왜 `sealedFs`/`mayFallbackFor` 를 쓰지 않는가(설계 §3.2, 부록 A3):
//  그 규칙은 봉인 경로의 **모든** 4xx/5xx 를 평문으로 내려보낸다. fs 읽기에는 맞지만 작업 변이에는 틀리다 —
//  봉인 요청이 타임아웃으로 끝났어도 호스트는 이미 실행했을 수 있고, 그 뒤 평문으로 같은 변이를 한 번 더
//  보내면 **이중 실행**(worktree 두 번·머지 두 번)이다. 그래서 여기서는 "봉투가 호스트에 닿지 못했음이
//  구조적으로 확실한" 실패에서만 평문으로 간다. 그 외(타임아웃·5xx·네트워크·도메인 code)는 throw.
//  2차 방어는 데몬의 opId 멱등(같은 opId 재전송 = 재생)이다 — 변이 호출은 항상 opId 를 싣는다.

import { apiRequest } from '../utils/api';
import daemonService from './daemonService';

// ── 와이어 타입(설계 §2.2 / §3.1) ──────────────────────────────────────────
export type TaskState = 'open' | 'merged' | 'closed' | 'failed';
export type RunState = 'creating' | 'launching' | 'running' | 'review_ready' | 'merging' | 'merged' | 'discarded' | 'failed';
export type OpKind = 'commit' | 'push' | 'pr.create' | 'pr.merge' | 'merge.local' | 'discard' | 'reopen' | 'cleanup' | 'fix';

export interface TaskErrorInfo { code: string; message?: string }

export interface PrChecks {
  status: 'none' | 'pending' | 'passing' | 'failing';
  total: number; passed: number; failed: number; pending: number;
  items: { name: string; status: 'pending' | 'passing' | 'failing' | 'skipped'; url?: string }[];
}
export interface PrInfo {
  number: number; url: string; state: 'open' | 'merged' | 'closed'; isDraft: boolean; title: string;
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'; mergeStateStatus: string; reviewDecision: string | null;
  checks: PrChecks; at: number;
}
export type MergeResult =
  | { ok: true; sha: string; cleanup: 'pending' | 'done'; discarded: string[]; discardSkipped: { runId: string; code: string }[] }
  | { ok: false; code: 'MERGE_CONFLICT'; files: string[] };

export interface RunOp { opId: string; kind: OpKind; startedAt: number }
export interface RunLastOp {
  opId: string; kind: OpKind; ok: boolean; code?: string | null; message?: string | null;
  result?: any; at?: number;
}

// ── PR 후속(automation-design.md §4.2) — 데몬 폴러·git.pr.status 가 채운다. 전부 optional(구 데몬엔 없다). ──
export interface FollowupCi {
  status: 'failing' | null;
  headSha?: string | null;
  detectedAt?: number | null;
  dismissedAt?: number | null;
  fixOpId?: string | null;
  failed?: { name: string; url?: string | null; runId?: string | null }[];
  seen?: string[];
}
export interface FollowupComment {
  id: number | string; kind: 'review_comment' | 'review' | 'issue_comment'; author: string; bot?: boolean;
  path?: string | null; line?: number | null; state?: string | null; bodyHead: string; url?: string | null; at?: string | null;
}
export interface FollowupReviews {
  cursor?: string | null;
  detectedAt?: number | null;
  dismissedAt?: number | null;
  fixOpId?: string | null;
  pending?: FollowupComment[];
  overflow?: number;
  seenIds?: (number | string)[];
}
export interface RunFollowup { polledAt?: number | null; ci?: FollowupCi | null; reviews?: FollowupReviews | null }
/** 작업이 어디서 왔나(§4.2) — 자동화가 만든 작업이면 카드에 `자동` 칩. */
export interface TaskOrigin {
  kind: 'dispatch' | 'automation'; planId?: string; automationId?: string; firingId?: string; depth?: number;
}

export interface Run {
  id: string; idx: number; agent: string; branch: string; dir: string; cwd: string;
  baseSha?: string | null; workspaceId: string | null;
  tid: number | null; tsession?: string | null;
  terminalAlive?: boolean; agentGone?: boolean; trustPending?: boolean;
  state: RunState;
  promptMode?: 'arg' | 'paste';
  promptDelivered?: boolean; promptDeliveredAt?: number | null; launchedAt?: number | null;
  copiedFiles?: string[];
  diff: { files: number; additions: number; deletions: number; at: number } | null;
  commits: { ahead: number; at: number } | null;
  dirty?: boolean; pushed?: boolean;
  pr: PrInfo | null;
  op: RunOp | null;
  lastOp: RunLastOp | null;
  lastTurnEndedAt?: number | null; lastActivityAt?: number | null; reviewNotifiedAt?: number | null;
  lastTurnFailed?: boolean;
  error: TaskErrorInfo | null;
  cleanup?: { worktreeRemoved?: boolean; branchDeleted?: boolean; workspaceDeleted?: boolean; recoveryRef?: string; at?: number } | null;
  followup?: RunFollowup | null;
  createdAt: number; updatedAt: number;
}
export type RunLite = Run;

export interface TaskRepo {
  path: string; subdir?: string; common?: string; name: string;
  remoteUrl?: string | null;
  github: { owner: string; repo: string } | null;
}
export interface TaskLite {
  id: string; v?: number; title: string; repo: TaskRepo; base: string; workspaceId: string | null;
  state: TaskState; winnerRunId: string | null; error: TaskErrorInfo | null;
  createdAt: number; updatedAt: number; closedAt: number | null;
  runs: RunLite[];
  origin?: TaskOrigin | null;
}
export interface Task extends TaskLite { prompt: string }

export interface GhStatusLite { gitOk: boolean; ghInstalled: boolean; ghAuthed: boolean }
export interface GhStatus {
  git: { ok: boolean; path: string | null; version: string | null; error?: string };
  gh: { installed: boolean; path: string | null; version: string | null; authenticated: boolean; user: string | null; host: 'github.com'; error?: string };
}
export interface TaskListResult { items: TaskLite[]; caps: { gh: GhStatusLite } }
export interface OpAccepted { accepted: true; opId: string; replay?: true; run: RunLite; lastOp?: RunLastOp | null }
export interface TaskDiffFile {
  path: string; status: 'A' | 'M' | 'D' | 'R' | '?' | 'B'; additions: number; deletions: number;
  binary?: boolean; diffText?: string; truncated?: boolean; omitted?: boolean;
}
export interface TaskDiff {
  taskId: string; runId: string; base: string; baseSha: string; head: string | null; mergeBase: string;
  uncommitted: boolean; files: TaskDiffFile[];
  totals: { files: number; additions: number; deletions: number }; truncatedTotal: boolean;
}
export interface BranchesResult {
  current: string | null; detached: boolean; dirtyCount: number; branches: { name: string }[];
  remoteUrl: string | null; github: { owner: string; repo: string } | null;
}
export interface Dialog { title: string; options: unknown[] }

// ── 타임아웃 표(설계 §3.3 — back 평문 allow-list 값) ────────────────────────
//  클라 HTTP 타임아웃은 이 값 +5s: back 의 TIMEOUT 에러가 먼저 도착해야 "왜 실패했는지"가 code 로 온다.
export const TASK_RPC_TIMEOUTS: Record<string, number> = {
  'task.list': 15000, 'task.get': 15000, 'task.create': 15000, 'task.run.prompt': 20000, 'task.run.trust': 15000,
  'task.run.reopen': 15000, 'task.diff': 30000, 'task.discard': 15000, 'task.delete': 15000,
  'git.branches': 15000, 'git.status': 15000, 'git.commit': 15000, 'git.push': 15000,
  'git.pr.create': 15000, 'git.pr.status': 30000, 'git.pr.merge': 15000, 'git.merge.local': 15000, 'git.gh.status': 15000,
  // PR 후속(automation-design.md §7.1 TASK_RPC_OK 추가 2줄)
  'task.run.fix': 15000, 'task.run.followup.dismiss': 15000,
};
const CLIENT_MARGIN_MS = 5000;

/** 읽기 메서드 — 실패 시 1회 재시도가 허용된다(설계 §3.2). 변이는 절대 자동 재시도하지 않는다. */
export const TASK_READ_METHODS = new Set([
  'task.list', 'task.get', 'task.diff', 'git.status', 'git.pr.status', 'git.branches', 'git.gh.status',
]);

/**
 * 봉인이 **구조적으로 불가**하다는 코드(= 호스트가 요청을 실행하지 않았음이 확실).
 *  back config/e2eeCodes.js SEALED_STRUCTURAL ∪ {E2EE_NO_ENVELOPE, E2EE_BAD_METHOD}(설계 §3.2).
 *  + 앱 e2ee.sealedRpc 가 **보내기 전에** 던지는 코드(status 0): UNSUPPORTED(열쇠·난수 없음), EPOCH_GATED.
 *  + 404/501(서버가 봉인 RPC 자체를 모른다 — 앱이 code 를 'UNSUPPORTED' 로 접는다).
 */
const SEALED_STRUCTURAL = new Set(['E2EE_UNSUPPORTED', 'E2EE_DISABLED', 'E2EE_SCOPE', 'E2EE_NO_KEY', 'E2EE_NO_ENVELOPE', 'E2EE_BAD_METHOD']);
const PRESEND_CODES = new Set(['UNSUPPORTED', 'EPOCH_GATED']);

/** 봉인 실패 → 평문으로 내려가도 되는가(정책 판정 전). 순수 함수 — __tests__/taskService 가 표를 고정한다. */
export function isStructuralSealedFailure(err: { code?: string; status?: number } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const status = typeof err.status === 'number' ? err.status : -1;
  if (SEALED_STRUCTURAL.has(code)) return true;
  if (status === 404 || status === 501) return true;
  if (status === 0 && PRESEND_CODES.has(code)) return true;
  return false;
}

export class TaskRpcError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** 어떤 실패든 TaskRpcError 로 — 화면은 code 만 본다(문구 파싱 금지, 설계 §2.13). */
function toTaskError(e: any, fallbackCode = 'GH_ERROR'): TaskRpcError {
  if (e instanceof TaskRpcError) return e;
  const code = typeof e?.code === 'string' && e.code ? e.code : fallbackCode;
  return new TaskRpcError(String(e?.message || code), code, typeof e?.status === 'number' ? e.status : 0);
}

type E2eeLike = {
  rpcAvailable: (host?: number | null) => boolean;
  gateReason: () => string | null;
  sealedRpc: <T>(method: string, params: Record<string, unknown>, opts?: { hostDeviceId?: number | null; timeoutMs?: number }) => Promise<T>;
  getStatus: () => { policy: string };
};
// 지연 require — daemonService 와 같은 이유(순환 방지)이고, 테스트가 jest.mock 으로 바꿔 끼운다.
function e2eeMod(): E2eeLike {
  return require('./e2ee').default as E2eeLike;
}

/** 평문 라우트 — 작업은 /api/daemon/task, 자동화 번들(auto·dispatch·power)은 /api/daemon/auto(§7.1). */
export type PlainRoute = '/api/daemon/task' | '/api/daemon/auto';

async function plainRpc<T>(method: string, params: Record<string, unknown>, host: number | null, timeoutMs: number, route: PlainRoute = '/api/daemon/task'): Promise<T> {
  const r = await apiRequest<T>(route, {
    method: 'POST',
    body: { method, params, ...(host != null ? { hostDeviceId: host } : {}) },
    timeoutMs: timeoutMs + CLIENT_MARGIN_MS,
    silent: true,
  });
  if (r.success && r.data !== undefined) return r.data as T;
  // code 자리 정본: body.detail.code(apiRequest 가 code 로 올려 준다). 없으면 상태로 추정한다.
  let code = r.code || '';
  if (!code) {
    if (r.status === 409) code = 'DAEMON_OFFLINE';
    else if (r.status === 404) code = 'SERVER_NEEDS_UPDATE';   // 라우트 자체가 없는 구 back
    else if (!r.status) code = /abort/i.test(String(r.error || '')) ? 'TIMEOUT' : 'NETWORK';
    else code = 'GH_ERROR';
  }
  throw new TaskRpcError(String(r.error || r.message || code), code, r.status || 0);
}

async function taskRpcOnce<T>(method: string, params: Record<string, unknown>, host: number | null, timeoutMs: number, route: PlainRoute = '/api/daemon/task'): Promise<T> {
  const e2ee = e2eeMod();
  if (e2ee.rpcAvailable(host)) {
    try {
      return await e2ee.sealedRpc<T>(method, params, { hostDeviceId: host, timeoutMs });
    } catch (e: any) {
      if (!isStructuralSealedFailure(e)) throw toTaskError(e);
      // 구조적 미지원 — 정책이 required 면 평문 금지(다운그레이드 차단).
      if (e2ee.getStatus().policy === 'required') throw toTaskError(e, 'E2EE_REQUIRED');
    }
  } else {
    const gate = e2ee.gateReason();
    if (gate) throw new TaskRpcError(gate, 'E2EE_REQUIRED', 0);
  }
  return plainRpc<T>(method, params, host, timeoutMs, route);
}

/**
 * 작업 RPC 단일 진입점(설계 §3.2). host = 그 PC 의 deviceId(필수 — 작업은 PC 별이다).
 *  · 읽기는 전송 실패(도메인 code 아님)일 때 1회 재시도.
 *  · 변이는 재시도하지 않는다. 호출부는 실패 시 `task.get` 으로 실제 결과를 확인한다(opId 로 재전송 안전).
 */
export async function taskRpc<T = any>(method: string, params: Record<string, unknown>, host: number | null, opts?: { timeoutMs?: number }): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? TASK_RPC_TIMEOUTS[method] ?? 15000;
  try {
    return await taskRpcOnce<T>(method, params, host, timeoutMs);
  } catch (e: any) {
    const err = toTaskError(e);
    if (TASK_READ_METHODS.has(method) && RETRYABLE_TRANSPORT.has(err.code)) {
      return taskRpcOnce<T>(method, params, host, timeoutMs).catch((e2) => { throw toTaskError(e2); });
    }
    throw err;
  }
}

/**
 * 같은 전송 규칙(봉인 우선 · 구조적 미지원에서만 평문 · 읽기만 1회 재시도)을 다른 평문 라우트로 —
 *  automationService.autoRpc 가 쓴다(설계 automation §0-4 "평문 폴백은 taskRpc 규칙 그대로"). 규칙을 두 벌로
 *  복사하면 한쪽만 고쳐지는 갈래가 생긴다 → 구현은 여기 하나.
 */
export async function familyRpc<T = any>(route: PlainRoute, method: string, params: Record<string, unknown>, host: number | null,
  timeoutMs: number, readMethods: Set<string>): Promise<T> {
  try {
    return await taskRpcOnce<T>(method, params, host, timeoutMs, route);
  } catch (e: any) {
    const err = toTaskError(e);
    if (readMethods.has(method) && RETRYABLE_TRANSPORT.has(err.code)) {
      return taskRpcOnce<T>(method, params, host, timeoutMs, route).catch((e2) => { throw toTaskError(e2); });
    }
    throw err;
  }
}
const RETRYABLE_TRANSPORT = new Set(['TIMEOUT', 'NETWORK', 'UNKNOWN', 'DECRYPT_FAILED', 'E2EE_EPOCH_MISMATCH', 'E2EE_RELAY_FAILED', 'E2EE_OPEN_FAILED']);

// ── opId(UUID v4) — 변이 멱등 키(설계 §2.12). crypto 가 없는 RN 런타임이라 Math.random 기반.
//  보안 난수가 필요한 값이 아니다(같은 run 의 최근 20개와 겹치지만 않으면 된다).
export function newOpId(): string {
  const h = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const y = '89ab'[Math.floor(Math.random() * 4)];
  return `${h(8)}-${h(4)}-4${h(3)}-${y}${h(3)}-${h(12)}`;
}

// ── 호스트 caps(설계 §2.3) — 유일한 출처 = GET /api/daemon/status 의 runners[].caps ──
//  runner_status 프레임에는 caps 가 없다 → online 전이마다 재조회한다(PC 앱 업데이트로 caps 가 바뀐다).
const capsByHost = new Map<number, string[]>();
const onlineHosts = new Set<number>();
const capsListeners = new Set<() => void>();
let capsLoadedAt = 0;
let capsInflight: Promise<void> | null = null;
// 서버 능력(GET /status serverCaps) — 게이팅 = 러너 caps ∩ 서버 caps. null = 모름(구 back 은 필드가 없다).
//  ★ 러너 caps 는 데몬 자기신고라 서버 킬스위치(TASKS_ENABLED=0)를 모른다 — 서버 쪽을 여기서 교차한다.
let serverCaps: string[] | null = null;

export function subscribeHostCaps(fn: () => void): () => void {
  capsListeners.add(fn);
  return () => { capsListeners.delete(fn); };
}
function emitCaps() { capsListeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } }); }

/** 그 호스트의 caps. 모름(아직 조회 전·구 back) = null — "없음" 으로 단정하지 않는다. */
export function hostCaps(host: number | null | undefined): string[] | null {
  if (host == null) return null;
  return capsByHost.get(Number(host)) ?? null;
}
/** task.v1 지원 여부 — true/false/null(모름). */
export function hostSupportsTasks(host: number | null | undefined): boolean | null {
  if (serverCaps && !serverCaps.includes('task.v1')) return false; // 서버가 작업 기능을 껐다(킬스위치)
  const c = hostCaps(host);
  return c ? c.includes('task.v1') : null;
}
/** 서버 능력 목록(GET /status serverCaps) — null = 모름(구 back). 자동화 번들 게이팅이 쓴다. */
export function getServerCaps(): string[] | null { return serverCaps; }
/** 그 호스트가 cap 을 광고하는가 ∩ 서버가 그 cap 을 켰는가 — true/false/null(모름). */
export function hostHasCap(host: number | null | undefined, cap: string): boolean | null {
  if (serverCaps && !serverCaps.includes(cap)) return false;
  const c = hostCaps(host);
  return c ? c.includes(cap) : null;
}
/** 서버가 작업 기능을 처리하는가 — true/false/null(모름). */
export function serverSupportsTasks(): boolean | null {
  return serverCaps ? serverCaps.includes('task.v1') : null;
}
/** 마지막 조회에서 붙어 있던 로컬 러너인가(표시·폴링 대상 판단용). */
export function isHostConnected(host: number): boolean { return onlineHosts.has(Number(host)); }
export function capsLoaded(): boolean { return capsLoadedAt > 0; }
/** 마지막 조회에서 붙어 있던 로컬 러너 id 들. */
export function connectedHosts(): number[] { return [...onlineHosts]; }

export async function refreshHostCaps(): Promise<void> {
  if (capsInflight) return capsInflight;
  capsInflight = (async () => {
    try {
      const st = await daemonService.getStatus();
      const sc = (st as any)?.serverCaps;
      if (Array.isArray(sc)) serverCaps = sc.map(String);
      capsByHost.clear();
      onlineHosts.clear();
      for (const r of st.runners || []) {
        if (!r || r.kind !== 'local' || r.deviceId == null) continue;
        const id = Number(r.deviceId);
        onlineHosts.add(id);
        const caps = (r as any).caps;
        capsByHost.set(id, Array.isArray(caps) ? caps.map(String) : []);
      }
      capsLoadedAt = Date.now();
      emitCaps();
    } catch (_) { /* 조회 실패 = 이전 값 유지(모름을 없음으로 바꾸지 않는다) */ }
    finally { capsInflight = null; }
  })();
  return capsInflight;
}

/** 테스트 전용 — caps 캐시 초기화. */
export function _resetHostCapsForTest(): void {
  capsByHost.clear(); onlineHosts.clear(); capsLoadedAt = 0; capsInflight = null; serverCaps = null;
}

// ── 메서드 래퍼 — 화면이 메서드명 문자열을 흩뿌리지 않게 ─────────────────────
export const listTasks = (host: number, params: { includeClosed?: boolean; repo?: string } = {}) =>
  taskRpc<TaskListResult>('task.list', params, host);
export const getTask = (host: number, taskId: string) =>
  taskRpc<{ task: Task }>('task.get', { taskId }, host);
export const createTask = (host: number, p: {
  opId: string; repo: string; base: string; prompt: string; title?: string;
  agents: { id: string; count: number }[]; copyEnv?: boolean; fetch?: boolean; workspaceId?: string | null;
  /** 한 줄 지시로 만든 작업(automation-design.md §3.1 6) — 데몬이 task.origin 으로 저장한다. 구 데몬은 무시. */
  origin?: { kind: 'dispatch'; planId: string };
}) => taskRpc<{ task: TaskLite }>('task.create', p as unknown as Record<string, unknown>, host);
export const resendPrompt = (host: number, taskId: string, runId: string, text?: string) =>
  taskRpc<{ ok: boolean; delivered: boolean }>('task.run.prompt', { taskId, runId, ...(text ? { text } : {}) }, host);
export const trustRun = (host: number, taskId: string, runId: string) =>
  taskRpc<{ ok: boolean; dialog: Dialog | null }>('task.run.trust', { taskId, runId }, host);
export const reopenRun = (host: number, taskId: string, runId: string, opId = newOpId()) =>
  taskRpc<OpAccepted>('task.run.reopen', { opId, taskId, runId }, host);
export const getDiff = (host: number, taskId: string, runId: string, file?: string) =>
  taskRpc<TaskDiff>('task.diff', { taskId, runId, ...(file ? { file } : {}) }, host);
export const discardTask = (host: number, taskId: string, runId?: string | null, force = false, opId = newOpId()) =>
  taskRpc<OpAccepted>('task.discard', { opId, taskId, ...(runId ? { runId } : {}), force }, host);
export const deleteTask = (host: number, taskId: string) =>
  taskRpc<{ ok: boolean }>('task.delete', { taskId }, host);
export const listBranches = (host: number, repo: string) =>
  taskRpc<BranchesResult>('git.branches', { repo }, host);
export const gitStatus = (host: number, taskId: string, runId: string) =>
  taskRpc<any>('git.status', { taskId, runId }, host);
export const commitRun = (host: number, taskId: string, runId: string, message: string, noVerify = false, opId = newOpId()) =>
  taskRpc<OpAccepted>('git.commit', { opId, taskId, runId, message, noVerify }, host);
export const pushRun = (host: number, taskId: string, runId: string, opId = newOpId()) =>
  taskRpc<OpAccepted>('git.push', { opId, taskId, runId }, host);
export const createPr = (host: number, taskId: string, runId: string, p: {
  title: string; body?: string; draft?: boolean; push?: boolean; commitMessage?: string;
}, opId = newOpId()) => taskRpc<OpAccepted>('git.pr.create', { opId, taskId, runId, ...p }, host);
export const prStatus = (host: number, taskId: string, runId: string) =>
  taskRpc<{ pr: PrInfo | null; run: RunLite }>('git.pr.status', { taskId, runId }, host);
export const mergePr = (host: number, taskId: string, runId: string, method: 'merge' | 'squash' | 'rebase', discardOthers = true, force = false, opId = newOpId()) =>
  taskRpc<OpAccepted>('git.pr.merge', { opId, taskId, runId, method, discardOthers, force }, host);
// commitMessage — 미커밋 변경이 있으면 데몬이 먼저 커밋하고 머지한다(git.pr.create 와 같은 규칙).
export const mergeLocal = (host: number, taskId: string, runId: string, method: 'merge' | 'squash' | 'ff', discardOthers = true, opId = newOpId(), commitMessage?: string) =>
  taskRpc<OpAccepted>('git.merge.local', { opId, taskId, runId, method, discardOthers, ...(commitMessage ? { commitMessage } : {}) }, host);
// PR 후속(§4.3) — [고치기] 는 비동기 op(kind 'fix'), [무시] 는 동기.
export type FollowupWhat = 'ci' | 'reviews' | 'both';
export const fixRun = (host: number, taskId: string, runId: string, what: FollowupWhat, opId = newOpId()) =>
  taskRpc<OpAccepted>('task.run.fix', { opId, taskId, runId, what }, host);
export const dismissFollowup = (host: number, taskId: string, runId: string, what: FollowupWhat) =>
  taskRpc<{ ok: boolean }>('task.run.followup.dismiss', { taskId, runId, what }, host);
export const ghStatus = (host: number, refresh = false) =>
  taskRpc<GhStatus>('git.gh.status', refresh ? { refresh: true } : {}, host);

/**
 * run 터미널에 텍스트 입력(리뷰 코멘트 되돌려 보내기, 설계 §6.2) — chat.input.
 *  코멘트에는 파일 경로·코드 조각이 실린다(§10: 서버가 보면 안 되는 내용) → 봉인 우선, 구조적 미지원일 때만
 *  기존 평문 REST(/api/daemon/chat/input)로 내려간다. 규칙은 taskRpc 와 같다(타임아웃 뒤 재전송 금지).
 */
export async function runInput(host: number, cwd: string, tid: number, text: string): Promise<void> {
  const e2ee = e2eeMod();
  const params = { cwd, tid, text, submit: true };
  if (e2ee.rpcAvailable(host)) {
    try { await e2ee.sealedRpc('chat.input', params, { hostDeviceId: host, timeoutMs: 20000 }); return; }
    catch (e: any) {
      if (!isStructuralSealedFailure(e)) throw toTaskError(e);
      if (e2ee.getStatus().policy === 'required') throw toTaskError(e, 'E2EE_REQUIRED');
    }
  } else {
    const gate = e2ee.gateReason();
    if (gate) throw new TaskRpcError(gate, 'E2EE_REQUIRED', 0);
  }
  const chat = require('./chatService') as typeof import('./chatService');
  try { await chat.chatInput({ cwd, tid, text, submit: true, host }); }
  catch (e: any) { throw toTaskError(e, 'GH_ERROR'); }
}

/** 작업 워크스페이스 판정(설계 §4) — 데몬이 등록하는 worktree 워크스페이스는 이 접두다. */
export function isTaskWorkspace(meta: { localPath?: string | null } | null | undefined): boolean {
  return !!meta && typeof meta.localPath === 'string' && /^\.codingpt\/worktrees\//.test(meta.localPath);
}

/** UTF-8 바이트 수(설계 §6.3 — 프롬프트 상한은 문자 수가 아니라 바이트). TextEncoder 없는 런타임 대비. */
export function utf8Bytes(s: string): number {
  let n = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { n += 4; i++; } else n += 3;
    } else n += 3;
  }
  return n;
}
export const PROMPT_MAX_BYTES = 30000;

export default {
  taskRpc, isStructuralSealedFailure, newOpId, hostCaps, hostSupportsTasks, serverSupportsTasks, refreshHostCaps, subscribeHostCaps,
  isHostConnected, capsLoaded, connectedHosts, isTaskWorkspace, utf8Bytes, runInput,
  listTasks, getTask, createTask, resendPrompt, trustRun, reopenRun, getDiff, discardTask, deleteTask,
  listBranches, gitStatus, commitRun, pushRun, createPr, prStatus, mergePr, mergeLocal, ghStatus,
  fixRun, dismissFollowup, getServerCaps, hostHasCap,
};
