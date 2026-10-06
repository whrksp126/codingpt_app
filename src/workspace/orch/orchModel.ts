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

// ── 에이전트 행(Orca 방식, 2026-10-06 · PC orch-model.js 와 같은 규칙) ────────────────────────────
//  워크스페이스 아래에 "그 폴더에서 돌아가는 에이전트" 를 한 줄씩 그린다. 일을 시킨 에이전트가 부모 행, 맡은 워커가 자식 행.
//  다른 브랜치(전용 작업 폴더)의 워커는 제 브랜치 줄 아래에 둔다(worktreeGroups).
export type AgentGlyphKind = 'working' | 'waiting' | 'blocked' | 'failed' | 'interrupted' | 'done' | 'unverifiable' | 'idle';
type Session = { cwd?: string | null; tid?: number | null; threadId?: string | null; chat?: boolean; agent?: string | null; state?: string; detail?: string | null; title?: string | null; model?: string | null; since?: number | null };
type FullWorker = Worker & { agent?: string | null; model?: string | null; phase?: string | null; updatedAt?: number; placement?: string; branch?: string | null;
  taskRef?: { taskId: string; runId?: string } | null; question?: { text: string } | null; result?: { summary?: string } | null };
export type WorkerRow = {
  kind: 'worker'; key: string; runId: string; dispatchId: string; glyph: AgentGlyphKind; textKey: string; agent: string | null; lead: string; trail: string; model: string;
  at: number | null; tid: number | null; cwd: string; placement: string; terminal: string; branch: string; taskId: string | null; needsReply: boolean; worker: any;
};
export type SessionRow = {
  kind: 'session'; key: string; tid: number | null; threadId?: string; chat?: boolean; agent: string | null; glyph: AgentGlyphKind; lead: string; trail: string; model?: string;
  at: number | null; runIds: string[]; rollup: { total: number; live: number; attention: number; ok: number; failed: number; gates: number } | null; children: WorkerRow[]; gone?: boolean;
};

export function sessionGlyph(state: string | undefined, hasDetail: boolean): AgentGlyphKind {
  if (state === 'working') return 'working';
  if (state === 'permission' || state === 'needsInput') return 'waiting';
  if (state === 'idle') return hasDetail ? 'done' : 'idle';
  return 'idle';
}

export function workerGlyph(ui: string): AgentGlyphKind {
  const m: Record<string, AgentGlyphKind> = {
    starting: 'working', working: 'working', asking: 'waiting', needs_input: 'waiting', blocked: 'blocked',
    idle_no_report: 'unverifiable', exited: 'unverifiable', succeeded: 'done', failed: 'failed',
    stopped: 'interrupted', abandoned: 'interrupted',
  };
  return m[ui] || 'unverifiable';
}

const firstLine = (s: unknown): string => String(s || '').split('\n').map((x) => x.trim()).find(Boolean) || '';
const SETTLED_UI = ['succeeded', 'failed', 'stopped', 'abandoned'];

function workerRow(run: Run, w: FullWorker): WorkerRow {
  const settled = SETTLED_UI.includes(w.uiState);
  const said = w.question ? firstLine(w.question.text) : settled ? firstLine(w.result && w.result.summary) : (w.phase || '');
  return {
    kind: 'worker', key: 'd:' + w.dispatchId, runId: run.id, dispatchId: w.dispatchId, glyph: workerGlyph(w.uiState), textKey: workerTextKey(w.uiState),
    agent: w.agent || null, lead: w.title || '', trail: said, model: w.model || '', at: (settled ? w.updatedAt : w.createdAt) || null,
    tid: w.tid == null ? null : w.tid, cwd: w.cwd || '', placement: w.placement || 'current', terminal: w.terminal,
    branch: w.branch || '', taskId: (w.taskRef && w.taskRef.taskId) || null,
    needsReply: !!w.question, worker: w,
  };
}

export const inWorktree = (c: { placement?: string } | null | undefined): boolean => !!c && c.placement === 'worktree';

export function worktreeGroups(rows: { children?: WorkerRow[] }[] | null | undefined): { key: string; branch: string; taskId: string | null; workers: WorkerRow[] }[] {
  const out: { key: string; branch: string; taskId: string | null; workers: WorkerRow[] }[] = [];
  const by = new Map<string, { key: string; branch: string; taskId: string | null; workers: WorkerRow[] }>();
  for (const r of rows || []) for (const c of r.children || []) {
    if (!inWorktree(c)) continue;
    const key = c.branch ? 'b:' + c.branch : 'd:' + c.dispatchId;
    let g = by.get(key);
    if (!g) { g = { key, branch: c.branch || '', taskId: c.taskId || null, workers: [] }; by.set(key, g); out.push(g); }
    g.workers.push(c);
  }
  return out;
}

/** 그 폴더의 에이전트 행 트리 — 워커로 돌고 있는 터미널은 최상위에 다시 그리지 않고, 코디네이터를 못 찾은 묶음도 부모 행을 만든다. */
export function sessionTree(snapshot: ({ runs?: Run[]; sessions?: Session[] } | null | undefined), cwd: string): SessionRow[] {
  const here = cwd || '';
  const runs = runsForCwd(snapshot as { runs?: Run[] }, here);
  const workerTerms = new Set<string>();
  for (const run of (snapshot && snapshot.runs) || []) {
    if (run.state !== 'active') continue;
    for (const w of visibleWorkers(run)) if (w.tid != null && w.terminal !== 'released') workerTerms.add(`${w.cwd || ''}\n${w.tid}`);
  }
  const rows: SessionRow[] = [];
  const byTid = new Map<number, SessionRow>();
  const mine = ((snapshot && snapshot.sessions) || []).filter((x) => (x.cwd || '') === here);
  const terms = mine.filter((x) => !x.chat && x.tid != null && !workerTerms.has(`${here}\n${x.tid}`)).sort((a, b) => (a.tid as number) - (b.tid as number));
  const chats = mine.filter((x) => x.chat && x.threadId).sort((a, b) => (String(a.threadId) < String(b.threadId) ? -1 : 1));
  for (const x of terms) {
    const row: SessionRow = { kind: 'session', key: 's:' + x.tid, tid: x.tid as number, agent: x.agent || null, glyph: sessionGlyph(x.state, !!x.detail),
      lead: '', trail: x.detail || '', at: x.since || null, runIds: [], rollup: null, children: [] };
    rows.push(row);
    byTid.set(x.tid as number, row);
  }
  for (const x of chats) {
    rows.push({ kind: 'session', key: 'c:' + x.threadId, tid: null, threadId: x.threadId as string, chat: true, agent: x.agent || null, glyph: sessionGlyph(x.state, !!x.detail),
      lead: x.title || '', trail: x.detail || '', model: x.model || '', at: x.since || null, runIds: [], rollup: null, children: [] });
  }
  for (const run of runs) {
    const co = run.coordinator || {};
    let row = co.tid != null && (co.cwd || '') === here ? byTid.get(co.tid) : null;
    if (!row) {
      row = { kind: 'session', key: 'r:' + run.id, tid: co.tid == null || (co.cwd || '') !== here ? null : co.tid, agent: (co as { agent?: string | null }).agent || null, glyph: 'idle',
        lead: '', trail: '', at: run.createdAt || null, runIds: [], rollup: null, children: [], gone: true };
      rows.push(row);
    }
    row.runIds.push(run.id);
    if (!row.lead) row.lead = runTitle(run);
    const roll = runRollup(run);
    if (!row.rollup) row.rollup = { total: 0, live: 0, attention: 0, ok: 0, failed: 0, gates: 0 };
    for (const k of ['total', 'live', 'attention', 'ok', 'failed'] as const) row.rollup[k] += roll.counts[k];
    row.rollup.gates += roll.gates;
    for (const w of visibleWorkers(run)) row.children.push(workerRow(run, w as FullWorker));
    if ((row.gone || row.glyph === 'idle' || row.glyph === 'done') && row.rollup.attention + row.rollup.gates > 0) row.glyph = 'waiting';
  }
  return rows;
}

/** 짧은 경과 시간 — "3m" "2h" "5d"(1분 안쪽은 "<1m"). */
export function shortAgo(at: number | null | undefined, now: number): string {
  if (!at || !now || now < at) return '';
  const m = Math.floor((now - at) / 60000);
  if (m < 1) return '<1m';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  return h < 24 ? h + 'h' : Math.floor(h / 24) + 'd';
}
