// dispatchService.ts — 한 줄 지시(dispatch.*) 와이어 타입 + 래퍼(automation-design.md §3).
//  전송은 automationService.autoRpc(봉인 우선 · 평문은 /api/daemon/auto) — 카탈로그(README 머리·커밋 제목)와
//  지시 문장은 서버가 보면 안 되는 내용이다(§12 1).
import { autoRpc, type AutomationDraft } from './automationService';

export interface CatalogAgent { id: string; installed: boolean; loggedIn: boolean | null }
export interface CatalogWorkspace {
  id: string; name: string; path: string; subdir?: string;
  remoteUrl?: string | null; github?: { owner: string; repo: string } | null;
  branch?: string | null; dirtyCount?: number;
  readmeHead?: string; recentCommits?: string[]; topDirs?: string[]; lastActivityAt?: number | null;
}
export interface HostCatalog {
  host: number; hostName: string; generatedAt: number; truncated?: boolean;
  agents: CatalogAgent[]; workspaces: CatalogWorkspace[];
}

export type FallbackReason = 'PLANNER_UNAVAILABLE' | 'PLANNER_TIMEOUT' | 'PLANNER_FAILED' | 'BAD_PLAN';
export interface PlanTask {
  host: number; workspaceId: string | null; repo: string | null; subdir?: string; base?: string | null;
  title: string; prompt: string; agents: { id: string; count: number }[]; confidence?: number; why?: string;
}
export interface PlanAutomation { host: number; draft: AutomationDraft; why?: string }
export interface Plan {
  v: 1;
  planner: { agent: 'claude' | 'codex' | 'gemini' | null; mode: 'cli' | 'fallback'; durationMs?: number; fallbackReason: FallbackReason | null };
  summary: string;
  tasks: PlanTask[];
  automations: PlanAutomation[];
  questions: string[];
}
export interface PlanResult {
  planId: string; state: 'planning' | 'done' | 'failed'; plan?: Plan; error?: { code: string; message?: string } | null;
  startedAt?: number; finishedAt?: number | null;
}

export const getCatalog = (host: number, refresh = false) =>
  autoRpc<HostCatalog>('dispatch.catalog', refresh ? { refresh: true } : {}, host);
export const startPlan = (host: number, p: { opId: string; instruction: string; catalog: { hosts: HostCatalog[] }; prefer?: { agent?: string } }) =>
  autoRpc<{ accepted: true; planId: string; planner: { agent: string | null } | null }>('dispatch.plan', p as unknown as Record<string, unknown>, host);
export const getPlan = (host: number, planId: string) => autoRpc<PlanResult>('dispatch.get', { planId }, host);

export default { getCatalog, startPlan, getPlan };
