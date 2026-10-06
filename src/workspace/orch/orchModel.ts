// orchModel.ts — 오케스트레이션 화면 판정(순수 함수). PC 의 `codingpt_pc/src/js/orch-model.js` 와 **같은 규칙**이다
//  (픽스처 교차 검증: codingpt_pc/test/orch-crossimpl.mjs). 여기에 React·서비스 접근을 넣지 않는다.
//
// 색은 상태 신호에만 쓴다(무채색 규칙): 확인이 필요하면 warn, 실패면 error, 나머지는 명암.

type Worker = { dispatchId: string; uiState: string; state: string; terminal: string; title?: string; cwd?: string | null; tid?: number | null; createdAt?: number };
type Run = { id: string; state: string; cwd?: string; objective?: string; createdAt?: number; coordinator?: { cwd?: string; tid?: number | null } | null; workers?: Worker[]; gates?: unknown[] };
type Snapshot = { runs?: Run[]; notes?: { cwd?: string; comment?: string | null; status?: string | null }[] } | null | undefined;
export type OrchDot = 'none' | 'spin' | 'warn' | 'error' | 'off';
export type TerminalRole = { role: 'coordinator' | 'worker'; runId: string; dispatchId?: string; uiState?: string; title: string; dot: OrchDot };

export const ATTENTION_STATES = ['asking', 'blocked', 'needs_input', 'idle_no_report'];
const FAILED_STATES = ['failed', 'exited', 'abandoned'];
const LIVE_STATES = ['working', 'starting'];

export function workerDot(ui: string): OrchDot {
  if (ATTENTION_STATES.includes(ui)) return 'warn';
  if (FAILED_STATES.includes(ui)) return 'error';
  if (LIVE_STATES.includes(ui)) return 'spin';
  if (ui === 'stopped') return 'off';
  return 'none';
}

export function workerTextKey(ui: string): string {
  const m: Record<string, string> = {
    starting: 'wStarting', working: 'wWorking', asking: 'wAsking', blocked: 'wBlocked', needs_input: 'wNeedsInput',
    idle_no_report: 'wIdleNoReport', exited: 'wExited', succeeded: 'wSucceeded', failed: 'wFailed',
    stopped: 'wStopped', abandoned: 'wAbandoned',
  };
  return m[ui] || 'wUnknown';
}

export function visibleWorkers<W extends Worker>(run: { workers?: W[] } | null | undefined): W[] {
  const ws = (run && run.workers) || [];
  return ws.filter((w) => !(w.terminal === 'transferred' && w.state !== 'ready' && w.state !== 'starting'))
    .slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function runRollup(run: Run | null | undefined): { dot: OrchDot; counts: { total: number; live: number; attention: number; ok: number; failed: number }; gates: number } {
  const ws = visibleWorkers(run);
  const c = { total: ws.length, live: 0, attention: 0, ok: 0, failed: 0 };
  for (const w of ws) {
    const ui = w.uiState;
    if (ATTENTION_STATES.includes(ui)) c.attention += 1;
    else if (FAILED_STATES.includes(ui)) c.failed += 1;
    else if (LIVE_STATES.includes(ui)) c.live += 1;
    else if (ui === 'succeeded') c.ok += 1;
  }
  const gates = ((run && run.gates) || []).length;
  const dot: OrchDot = c.attention || gates ? 'warn' : c.failed ? 'error' : c.live ? 'spin' : 'none';
  return { dot, counts: c, gates };
}

export function runsForCwd<R extends Run>(snapshot: { runs?: R[] } | null | undefined, cwd: string): R[] {
  const runs = (snapshot && snapshot.runs) || [];
  return runs.filter((r) => r.state === 'active' && (r.cwd || '') === (cwd || ''))
    .slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function noteFor(snapshot: Snapshot, cwd: string): { comment: string; status: string } | null {
  const n = ((snapshot && snapshot.notes) || []).find((x) => (x.cwd || '') === (cwd || ''));
  return n && (n.comment || n.status) ? { comment: n.comment || '', status: n.status || '' } : null;
}

export function terminalRoles(snapshot: Snapshot): Map<string, TerminalRole> {
  const out = new Map<string, TerminalRole>();
  for (const run of (snapshot && snapshot.runs) || []) {
    if (run.state !== 'active') continue;
    const co = run.coordinator;
    if (co && co.tid != null) {
      const k = `${co.cwd || ''}\n${co.tid}`;
      if (!out.has(k)) out.set(k, { role: 'coordinator', runId: run.id, dot: runRollup(run).dot, title: run.objective || '' });
    }
  }
  for (const run of (snapshot && snapshot.runs) || []) {
    if (run.state !== 'active') continue;
    for (const w of visibleWorkers(run)) {
      if (w.tid == null || w.terminal === 'released') continue;
      out.set(`${w.cwd || ''}\n${w.tid}`, { role: 'worker', runId: run.id, dispatchId: w.dispatchId, uiState: w.uiState, title: w.title || '', dot: workerDot(w.uiState) });
    }
  }
  return out;
}

export function attentionCount(snapshot: Snapshot, cwd: string): number {
  let n = 0;
  for (const run of runsForCwd(snapshot as { runs?: Run[] }, cwd)) {
    const r = runRollup(run);
    n += r.counts.attention + r.gates;
  }
  return n;
}

export function runTitle(run: { objective?: string } | null | undefined): string {
  const line = String((run && run.objective) || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  return line.length > 60 ? line.slice(0, 59) + '…' : line;
}
