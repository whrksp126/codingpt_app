// orchService.ts — 오케스트레이션 RPC(orch.*). 정본 계약 = codingpt_daemon/docs/orchestration-design.md.
//
// 전송 규칙은 작업 RPC 와 같다(taskService.familyRpc 한 벌 — 봉인 우선, 평문 폴백은 구조적 미지원에서만).
//  폰은 **사람 권한**만 쓴다: 보기(orch.list) + 답하기·결정·멈추기·정리·닫기. 워커를 띄우는 쪽은 PC 터미널 안의 에이전트다.
import { familyRpc, hostHasCap } from './taskService';

export type OrchUiState = 'starting' | 'working' | 'asking' | 'blocked' | 'needs_input' | 'idle_no_report' | 'exited'
  | 'succeeded' | 'failed' | 'stopped' | 'abandoned';

export interface OrchWorker {
  dispatchId: string; taskId: string; runId: string; title: string;
  state: string; uiState: OrchUiState | string; agent: string | null;
  placement: 'current' | 'worktree'; cwd: string | null; tid: number | null; tsession: string | null;
  branch: string | null; taskRef: { taskId: string; runId: string } | null;
  phase: string | null; createdAt: number; terminal: string;
  question: { id: string; text: string; options: string[] } | null;
  result: { outcome: string; summary?: string } | null;
}
export interface OrchGate { id: string; runId: string; taskId: string | null; question: string; options: string[]; status: string }
export interface OrchRun {
  id: string; objective: string; state: string; cwd: string; depth: number; createdAt: number;
  coordinator: { cwd: string; tid: number | null; tsession: string | null; agent: string | null } | null;
  tasks: { id: string; title: string; status: string; deps: string[] }[];
  workers: OrchWorker[];
  gates: OrchGate[];
}
export interface OrchNote { cwd: string; comment?: string | null; status?: string | null }
export interface OrchSnapshot { runs: OrchRun[]; notes: OrchNote[] }

const TIMEOUTS: Record<string, number> = {
  'orch.list': 20000, 'orch.runClose': 60000, 'orch.workerRelease': 60000,
};
const READS = new Set(['orch.list']);

export function orchRpc<T = any>(method: string, params: Record<string, unknown>, host: number | null): Promise<T> {
  return familyRpc<T>('/api/daemon/orch', method, params, host, TIMEOUTS[method] || 15000, READS);
}

/** 그 PC 가 오케스트레이션을 아는가(∩ 서버가 켰는가) — true/false/null(모름). */
export function hostSupportsOrch(host: number | null | undefined): boolean | null { return hostHasCap(host, 'orch.v1'); }

export const listOrch = (host: number) => orchRpc<OrchSnapshot>('orch.list', {}, host);
export const replyOrch = (host: number, id: string, body: string) => orchRpc('orch.reply', { id, body }, host);
export const resolveGate = (host: number, id: string, resolution: string) => orchRpc('orch.gateResolve', { id, resolution }, host);
export const stopWorker = (host: number, dispatch: string) => orchRpc('orch.workerStop', { dispatch }, host);
export const releaseWorker = (host: number, dispatch: string, merge = false) => orchRpc('orch.workerRelease', { dispatch, ...(merge ? { merge: true } : {}) }, host);
export const closeRun = (host: number, run: string, force: boolean) => orchRpc('orch.runClose', { run, force }, host);
