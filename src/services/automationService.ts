// automationService.ts — 자동화 번들(auto.* · dispatch.* · power.*) 전송 + 와이어 타입 + 호스트 caps.
//
// 정본 계약: codingpt_daemon/docs/automation-design.md §5.6(auto RPC) · §3(dispatch) · §6.4(power) · §7.1(평문 라우트).
//  PC 미러 = codingpt_pc/src/js/automations-api.js(같은 폴백 규칙·같은 타임아웃 표).
//
// 전송 규칙은 taskService 와 **같은 구현**을 탄다(familyRpc): 봉인 우선, 봉투가 호스트에 닿지 못했음이 구조적으로
//  확실할 때만 평문 `POST /api/daemon/auto` 로, 읽기만 전송 실패 시 1회 재시도, 변이는 재시도하지 않는다.
//  ★ 자동화 이름·템플릿·감사 로그·카탈로그(README/커밋 제목)·지시 문장은 봉인 경로로만 다닌다(§12 1).

import { familyRpc, hostHasCap, newOpId } from './taskService';

// ── 와이어 타입(§5.1) ─────────────────────────────────────────────────────
export type Trigger =
  | { type: 'schedule'; cron: string; tz?: string; missed?: 'once' | 'skip' }
  | { type: 'schedule'; at: number; tz?: string }
  | { type: 'git.commits'; repo: string; branch?: string; remote?: string }
  | { type: 'github.issues'; repo: string; labels?: string[]; state?: string }
  | { type: 'pr.ci_failed'; repo?: string | null }
  | { type: 'pr.review_comments'; repo?: string | null }
  | { type: 'task.event'; event: 'review_ready' | 'merged' | 'failed'; repo?: string | null };

export type Action =
  | { type: 'task.create'; repo: string; subdir?: string; base?: string | null; agents: { id: string; count: number }[]; title?: string; prompt: string; copyEnv?: boolean }
  | { type: 'terminal.prompt'; target: { taskId: string; runId: string } | { event: true } | { cwd: string; tid: number }; text: string }
  | { type: 'notify'; title: string; subtitle?: string };

export interface AutoGuards { maxRunsPerDay: number; maxConcurrent: number; cooldownMs: number }
export interface AutoStepResult { type: string; ok: boolean; taskId?: string; code?: string | null }
export interface AutoLastResult {
  firingId: string; ok: boolean; code: string | null; message?: string | null; at: number; taskIds?: string[]; steps?: AutoStepResult[];
}
export interface AutoState {
  nextRunAt: number | null; lastRunAt: number | null; runsToday: number; dayKey?: string;
  inflight: number; cursor?: Record<string, unknown>; consecutiveFailures: number; lastResult: AutoLastResult | null;
}
export interface AutoCreatedBy {
  kind: 'agent' | 'dispatch' | 'user'; agent?: string | null; tsession?: string | null; taskId?: string | null;
  planId?: string | null; deviceId?: number | null; at?: number;
}
export interface AutomationLite {
  id: string; v?: number; name: string;
  enabled: boolean; paused: boolean; pausedReason: 'user' | 'limit' | 'server' | 'error' | null;
  createdBy: AutoCreatedBy;
  trigger: Trigger; actions: Action[];
  guards: AutoGuards;
  state: AutoState;
  createdAt: number; updatedAt: number;
}
/** auto.create 입력 — id/state/createdAt/updatedAt/createdBy 를 뺀 것. */
export type AutomationDraft = Omit<AutomationLite, 'id' | 'state' | 'createdAt' | 'updatedAt' | 'createdBy' | 'enabled' | 'paused' | 'pausedReason' | 'guards'>
  & { enabled?: boolean; guards?: Partial<AutoGuards> };

export interface AutoLimits {
  maxItems: number; maxActions: number; maxRunsPerDayDefault: number; maxRunsPerDayCap: number; maxConcurrentCap: number;
  minScheduleMs: number; pollMs: number; tickMs: number; firingDeadlineMs: number; templateMaxBytes: number; nameMax: number;
}
export interface AutoListResult {
  items: AutomationLite[]; paused: boolean; limits?: AutoLimits; counts?: { total: number; paused: number; attention: number };
}
export interface AutoLogLine {
  at: number; autoId: string; firingId?: string; stage: 'start' | 'step' | 'end' | 'skip'; type?: string; ok?: boolean;
  code?: string | null; message?: string | null; taskId?: string | null;
}

// ── 타임아웃 표(§7.1 AUTO_RPC_OK — back 평문 allow-list 값) ────────────────
export const AUTO_RPC_TIMEOUTS: Record<string, number> = {
  'auto.list': 15000, 'auto.get': 15000, 'auto.validate': 15000, 'auto.create': 15000, 'auto.update': 15000, 'auto.remove': 15000,
  'auto.pause': 15000, 'auto.resume': 15000, 'auto.pauseAll': 15000, 'auto.runNow': 15000, 'auto.log': 15000,
  'dispatch.catalog': 30000, 'dispatch.plan': 15000, 'dispatch.get': 15000,
  'power.status': 15000, 'power.set': 15000, 'power.setup': 15000,
};
/** 읽기 — 전송 실패 시 1회 재시도가 허용된다. 변이는 절대 자동 재시도하지 않는다. */
export const AUTO_READ_METHODS = new Set([
  'auto.list', 'auto.get', 'auto.log', 'auto.validate', 'dispatch.catalog', 'dispatch.get', 'power.status',
]);

/**
 * 자동화 번들 RPC 단일 진입점. host = 그 PC 의 deviceId(자동화는 만든 PC 에 산다).
 *  평문 폴백 라우트만 다르고 규칙은 taskRpc 와 같다(테스트 automationService.test 가 표를 고정).
 */
export function autoRpc<T = any>(method: string, params: Record<string, unknown>, host: number | null, opts?: { timeoutMs?: number }): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? AUTO_RPC_TIMEOUTS[method] ?? 15000;
  return familyRpc<T>('/api/daemon/auto', method, params, host, timeoutMs, AUTO_READ_METHODS);
}

// ── caps(§0-3) — 러너 caps ∩ 서버 caps. 모름 = null(없음으로 단정하지 않는다) ──
export const hostSupportsAuto = (host: number | null | undefined): boolean | null => hostHasCap(host, 'auto.v1');
export const hostSupportsDispatch = (host: number | null | undefined): boolean | null => hostHasCap(host, 'dispatch.v1');
export const hostSupportsPower = (host: number | null | undefined): boolean | null => hostHasCap(host, 'power.v1');

// ── 메서드 래퍼 ─────────────────────────────────────────────────────────
export const listAutomations = (host: number) => autoRpc<AutoListResult>('auto.list', {}, host);
export const getAutomation = (host: number, id: string) =>
  autoRpc<{ automation: AutomationLite; log: AutoLogLine[] }>('auto.get', { id }, host);
export const createAutomation = (host: number, draft: AutomationDraft, createdBy?: { kind: 'user' | 'dispatch'; planId?: string | null; deviceId?: number | null }, opId = newOpId()) =>
  autoRpc<{ automation: AutomationLite }>('auto.create', { opId, draft, ...(createdBy ? { createdBy } : {}) }, host);
export const updateAutomation = (host: number, id: string, patch: Partial<Pick<AutomationLite, 'name' | 'trigger' | 'actions' | 'enabled'>> & { guards?: Partial<AutoGuards> }) =>
  autoRpc<{ automation: AutomationLite }>('auto.update', { id, patch }, host);
export const removeAutomation = (host: number, id: string) => autoRpc<{ ok: boolean }>('auto.remove', { id }, host);
export const pauseAutomation = (host: number, id: string) => autoRpc<{ automation: AutomationLite }>('auto.pause', { id }, host);
export const resumeAutomation = (host: number, id: string) => autoRpc<{ automation: AutomationLite }>('auto.resume', { id }, host);
export const pauseAllAutomations = (host: number, paused: boolean) => autoRpc<{ paused: boolean }>('auto.pauseAll', { paused }, host);
export const runAutomationNow = (host: number, id: string, opId = newOpId()) =>
  autoRpc<{ accepted: true; firingId: string }>('auto.runNow', { opId, id }, host);
export const automationLog = (host: number, id?: string, limit = 100) =>
  autoRpc<{ lines: AutoLogLine[] }>('auto.log', { ...(id ? { id } : {}), limit }, host);

export default {
  autoRpc, hostSupportsAuto, hostSupportsDispatch, hostSupportsPower,
  listAutomations, getAutomation, createAutomation, updateAutomation, removeAutomation,
  pauseAutomation, resumeAutomation, pauseAllAutomations, runAutomationNow, automationLog,
};
