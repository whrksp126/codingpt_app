// dispatchFlow.ts — 한 줄 지시의 오케스트레이션(automation-design.md §3.1) + 시트 열림 상태.
//
// 클라이언트가 오케스트레이터다(PC 끼리 직접 채널이 없고 서버는 내용을 못 본다 — §3.1·부록 Z-2):
//  1) 대상 PC = 온라인 로컬 러너 ∧ dispatch.v1   (0대 → noHost)
//  2) 각 PC 에 병렬 dispatch.catalog(봉인, 30s) — 실패한 PC 는 빼고 카드 위에 "○○ 정보를 가져오지 못했어요"
//  3) 플래너 = 활성 PC(오프라인이면 hosts[0]) 에 dispatch.plan
//  4) dispatch.get 2s 폴링(최대 120s) — dispatch.changed 가 오면 즉시 다시 본다
//  5) 플랜 카드 → 사용자가 고친 뒤 [시작] → task.create(origin dispatch) / auto.create(createdBy dispatch) 순서대로
// 이 파일의 함수는 전송을 **주입**받는다(deps) — 테스트가 PC 2대·실패·폴백을 네트워크 없이 돌린다.

import type { HostCatalog, Plan, PlanResult, PlanTask, PlanAutomation } from '../../services/dispatchService';
import type { AutomationDraft } from '../../services/automationService';

// ── 시트 열림 상태(모듈 스토어 — 진행 현황 헤더·자동화 빈 상태·팔레트가 연다) ──
import { afterModalTransition, noteModalClosing } from '../../components/modalLayer';
import { collapseKeyAssist } from '../../components/keyboard/KeyAssist';

type SheetState = { open: boolean; gen: number; prefill: string };
let sheet: SheetState = { open: false, gen: 0, prefill: '' };
const sheetListeners = new Set<() => void>();
function setSheet(p: Partial<SheetState>) {
  sheet = { ...sheet, ...p };
  sheetListeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });
}
export function subscribeDispatchSheet(fn: () => void): () => void { sheetListeners.add(fn); return () => { sheetListeners.delete(fn); }; }
export function getDispatchSheet(): SheetState { return sheet; }
export function openDispatch(prefill?: string): void {
  collapseKeyAssist();
  // 방금 닫힌 모달(팔레트 등)이 내려가는 중이면 그 뒤에 연다(iOS 형제 present 거부 방지).
  afterModalTransition(() => setSheet({ open: true, gen: sheet.gen + 1, prefill: prefill || '' }));
}
export function closeDispatch(): void {
  if (!sheet.open) return;
  noteModalClosing();
  setSheet({ open: false });
}

// ── dispatch.changed(ui_command) — 폴링 중인 흐름을 깨운다 ──
const planWaiters = new Set<(host: number, planId: string | null) => void>();
export function onDispatchChanged(params: { host?: unknown; planId?: unknown }): void {
  const h = Number(params?.host);
  const pid = params?.planId == null ? null : String(params.planId);
  planWaiters.forEach((fn) => { try { fn(Number.isFinite(h) ? h : 0, pid); } catch (_) { /* noop */ } });
}

// ── 순수 오케스트레이션 ───────────────────────────────────────────────────
export interface DispatchHost { id: number; name: string }
export interface DispatchDeps {
  getCatalog: (host: number) => Promise<HostCatalog>;
  startPlan: (host: number, p: { opId: string; instruction: string; catalog: { hosts: HostCatalog[] }; prefer?: { agent?: string } }) =>
    Promise<{ accepted: true; planId: string; planner: { agent: string | null } | null }>;
  getPlan: (host: number, planId: string) => Promise<PlanResult>;
  newOpId: () => string;
  /** 대기(테스트는 즉시 resolve). */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}
export interface CatalogFailure { host: number; name: string; code: string }

export const PLAN_POLL_MS = 2000;
export const PLAN_DEADLINE_MS = 120000;

/** 2) 각 PC 카탈로그를 병렬로 — 실패한 PC 는 빼고 사유를 모은다. onProgress(끝난 수, 전체). */
export async function collectCatalogs(hosts: DispatchHost[], deps: Pick<DispatchDeps, 'getCatalog'>, onProgress?: (done: number, total: number) => void): Promise<{ catalogs: HostCatalog[]; failed: CatalogFailure[] }> {
  let done = 0;
  onProgress?.(0, hosts.length);
  const results = await Promise.all(hosts.map(async (h) => {
    try {
      const c = await deps.getCatalog(h.id);
      return { ok: true as const, c: { ...c, host: Number(c?.host ?? h.id), hostName: String(c?.hostName || h.name) } };
    } catch (e: any) {
      return { ok: false as const, f: { host: h.id, name: h.name, code: String(e?.code || 'ERROR') } };
    } finally {
      done += 1;
      onProgress?.(done, hosts.length);
    }
  }));
  const catalogs: HostCatalog[] = [];
  const failed: CatalogFailure[] = [];
  for (const r of results) { if (r.ok) catalogs.push(r.c); else failed.push(r.f); }
  return { catalogs, failed };
}

/** 3) 플래너 PC — 활성 PC 가 대상에 있으면 그것, 아니면 첫 PC(§3.1). 카탈로그가 성공한 PC 중에서 고른다. */
export function pickPlannerHost(hosts: number[], activeId: number | null | undefined): number | null {
  if (!hosts.length) return null;
  const a = Number(activeId);
  return hosts.includes(a) ? a : hosts[0];
}

export type PlanPhase =
  | { kind: 'collecting'; done: number; total: number }
  | { kind: 'planning'; agent: string | null };

/**
 * 1)~5) 한 번의 계획. 반환 = 플랜(폴백 포함) + 카탈로그 실패 목록 + planId.
 *  throw: 대상 PC 0대(`NO_HOST`) · 모든 카탈로그 실패(`CATALOG_FAILED`) · plan/get 전송 실패(그 code) ·
 *  state 'failed'(error.code) · 120s 초과(`PLANNER_TIMEOUT`) · 취소(`CANCELLED`).
 */
export async function runPlan(args: {
  instruction: string;
  hosts: DispatchHost[];
  activeId: number | null;
  deps: DispatchDeps;
  prefer?: { agent?: string };
  onPhase?: (p: PlanPhase) => void;
  isCancelled?: () => boolean;
}): Promise<{ plan: Plan; planId: string; plannerHost: number; catalogs: HostCatalog[]; failed: CatalogFailure[] }> {
  const { deps } = args;
  const sleep = deps.sleep || ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now || Date.now;
  if (!args.hosts.length) throw Object.assign(new Error('no host'), { code: 'NO_HOST' });
  const { catalogs, failed } = await collectCatalogs(args.hosts, deps, (done, total) => args.onPhase?.({ kind: 'collecting', done, total }));
  if (args.isCancelled?.()) throw Object.assign(new Error('cancelled'), { code: 'CANCELLED' });
  if (!catalogs.length) throw Object.assign(new Error('catalog failed'), { code: 'CATALOG_FAILED', failed });
  const plannerHost = pickPlannerHost(catalogs.map((c) => c.host), args.activeId) as number;
  const acc = await deps.startPlan(plannerHost, {
    opId: deps.newOpId(), instruction: args.instruction, catalog: { hosts: catalogs }, ...(args.prefer ? { prefer: args.prefer } : {}),
  });
  args.onPhase?.({ kind: 'planning', agent: acc?.planner?.agent || null });
  const planId = String(acc.planId);
  const start = now();
  // dispatch.changed 가 오면 대기를 끊고 곧장 다시 본다.
  let wake: (() => void) | null = null;
  const waiter = (h: number, pid: string | null) => { if ((!h || h === plannerHost) && (!pid || pid === planId)) wake?.(); };
  planWaiters.add(waiter);
  try {
    for (;;) {
      if (args.isCancelled?.()) throw Object.assign(new Error('cancelled'), { code: 'CANCELLED' });
      const r = await deps.getPlan(plannerHost, planId);
      if (r.state === 'done' && r.plan) return { plan: r.plan, planId, plannerHost, catalogs, failed };
      if (r.state === 'failed') throw Object.assign(new Error(r.error?.message || 'failed'), { code: r.error?.code || 'PLANNER_FAILED' });
      if (now() - start > PLAN_DEADLINE_MS) throw Object.assign(new Error('timeout'), { code: 'PLANNER_TIMEOUT' });
      await Promise.race([sleep(PLAN_POLL_MS), new Promise<void>((res) => { wake = res; })]);
      wake = null;
    }
  } finally {
    planWaiters.delete(waiter);
  }
}

// ── 플랜 카드의 편집 모델 ─────────────────────────────────────────────────
export interface EditTask {
  key: string;
  host: number;
  workspaceId: string | null;
  /** 홈-상대 저장소 경로(카탈로그 path). 워크스페이스를 고르면 따라 바뀐다. */
  repo: string | null;
  subdir: string;
  base: string | null;
  title: string;
  prompt: string;
  agents: { id: string; count: number }[];
  why: string;
  confidence: number | null;
}
export interface EditAuto { key: string; host: number; draft: AutomationDraft; why: string; include: boolean }
export interface EditablePlan { tasks: EditTask[]; automations: EditAuto[] }

export const MAX_RUNS = 4;
export const PLAN_AGENTS = ['claude', 'codex', 'gemini'];

/** 데몬 플랜 → 편집 모델. 카탈로그에 없는 워크스페이스는 null(카드에서 고른다 — §3.4 마지막 줄). */
export function toEditablePlan(plan: Plan, catalogs: HostCatalog[]): EditablePlan {
  const wsOf = (host: number, id: string | null) => {
    if (!id) return null;
    const c = catalogs.find((x) => x.host === host);
    return c?.workspaces.find((w) => w.id === id) || null;
  };
  const tasks = (plan.tasks || []).map((t: PlanTask, i): EditTask => {
    const ws = wsOf(Number(t.host), t.workspaceId);
    return {
      key: `t${i}`,
      host: Number(t.host),
      workspaceId: ws ? ws.id : null,
      repo: ws ? ws.path : null,
      subdir: String(t.subdir || ''),
      base: t.base || ws?.branch || null,
      title: String(t.title || ''),
      prompt: String(t.prompt || ''),
      agents: (t.agents || []).filter((a) => a && a.id && a.count > 0).map((a) => ({ id: String(a.id), count: Math.max(1, Math.floor(a.count)) })),
      why: String(t.why || ''),
      confidence: typeof t.confidence === 'number' ? t.confidence : null,
    };
  });
  const automations = (plan.automations || []).map((a: PlanAutomation, i): EditAuto => ({
    key: `a${i}`, host: Number(a.host), draft: a.draft, why: String(a.why || ''), include: true,
  }));
  return { tasks, automations };
}

export function totalRuns(ep: EditablePlan): number {
  return ep.tasks.reduce((n, t) => n + t.agents.reduce((m, a) => m + a.count, 0), 0);
}

/** [시작] 가능한가 — 모든 작업에 저장소·에이전트 1개 이상, 실행 합계 ≤ 4, 뭔가 하나는 만든다. */
export function canStart(ep: EditablePlan): boolean {
  if (!ep.tasks.length && !ep.automations.some((a) => a.include)) return false;
  if (ep.tasks.some((t) => !t.workspaceId || !t.repo || !t.agents.length || !t.prompt.trim())) return false;
  return totalRuns(ep) <= MAX_RUNS;
}

/** 저장소 선택 — 같은 PC 카탈로그의 워크스페이스로 바꾼다(PC 가 바뀌면 host 도). */
export function pickWorkspace(t: EditTask, host: number, wsId: string, catalogs: HostCatalog[]): EditTask {
  const ws = catalogs.find((c) => c.host === host)?.workspaces.find((w) => w.id === wsId) || null;
  if (!ws) return t;
  return { ...t, host, workspaceId: ws.id, repo: ws.path, base: ws.branch || t.base, subdir: host === t.host && ws.id === t.workspaceId ? t.subdir : '' };
}

export interface StartDeps {
  createTask: (host: number, p: { opId: string; repo: string; base: string; prompt: string; title?: string; agents: { id: string; count: number }[]; copyEnv?: boolean; workspaceId?: string | null; origin?: { kind: 'dispatch'; planId: string } }) => Promise<{ task: { id: string } }>;
  createAutomation: (host: number, draft: AutomationDraft, createdBy: { kind: 'dispatch'; planId: string; deviceId?: number | null }) => Promise<{ automation: { id: string } }>;
  newOpId: () => string;
}

/** 6) [시작] — 작업을 순서대로, 그 다음 포함된 자동화. 하나가 실패해도 나머지는 계속하고 실패를 모아 돌려준다. */
export async function startEditablePlan(ep: EditablePlan, planId: string, deps: StartDeps, opIds?: Record<string, string>): Promise<{
  tasks: { host: number; taskId: string }[]; automations: { host: number; id: string }[]; errors: { key: string; code: string }[];
}> {
  const out = { tasks: [] as { host: number; taskId: string }[], automations: [] as { host: number; id: string }[], errors: [] as { key: string; code: string }[] };
  for (const t of ep.tasks) {
    if (!t.repo || !t.workspaceId) { out.errors.push({ key: t.key, code: 'BAD_PARAMS' }); continue; }
    try {
      const r = await deps.createTask(t.host, {
        // opId 는 카드가 열려 있는 동안 같은 값(다시 눌러도 데몬이 재생으로 받는다 — 설계 §2.12).
        opId: opIds?.[t.key] || deps.newOpId(),
        repo: t.subdir ? `${t.repo}/${t.subdir}` : t.repo,
        base: t.base || '',
        prompt: t.prompt,
        title: t.title || undefined,
        agents: t.agents,
        copyEnv: true,
        workspaceId: t.workspaceId,
        origin: { kind: 'dispatch', planId },
      });
      if (r?.task?.id) out.tasks.push({ host: t.host, taskId: r.task.id });
    } catch (e: any) { out.errors.push({ key: t.key, code: String(e?.code || 'ERROR') }); }
  }
  for (const a of ep.automations) {
    if (!a.include) continue;
    try {
      const r = await deps.createAutomation(a.host, a.draft, { kind: 'dispatch', planId, deviceId: a.host });
      if (r?.automation?.id) out.automations.push({ host: a.host, id: r.automation.id });
    } catch (e: any) { out.errors.push({ key: a.key, code: String(e?.code || 'ERROR') }); }
  }
  return out;
}

/** 폴백 사유 → 문구 필드(§3.4). */
export function fallbackKey(reason: string | null | undefined): 'fallbackNoAgent' | 'fallbackTimeout' | 'fallbackFailed' {
  return reason === 'PLANNER_UNAVAILABLE' ? 'fallbackNoAgent' : reason === 'PLANNER_TIMEOUT' ? 'fallbackTimeout' : 'fallbackFailed';
}

/** 테스트 전용. */
export function _resetDispatchForTest(): void { sheet = { open: false, gen: 0, prefill: '' }; planWaiters.clear(); }
