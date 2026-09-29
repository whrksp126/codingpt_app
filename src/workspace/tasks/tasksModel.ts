// tasksModel.ts — 작업 현황판의 순수 로직(행 생성·중복 제거·그룹·정렬).
//
// 정본: codingpt_daemon/docs/agent-tasks-design.md §5. PC 미러 = codingpt_pc/src/js/tasks-model.js.
//  **같은 입력에 같은 출력**이어야 한다 — 폰과 PC 가 같은 에이전트를 다른 그룹에 두면 "PC 에선 입력 대기인데
//  폰에선 대기 중" 이 된다. 교차 테스트는 docs/fixtures/agent-tasks/model-*.json 한 벌로 양쪽을 돌린다.
//
// 규율:
//  · React·네트워크·시계를 import 하지 않는다. 시간은 `input.now` 로만 들어온다(결정적 테스트).
//  · host 는 숫자이고 **모름 = 0**(agentStateStore 의 `host ?? 0` 과 같은 규칙). 스냅의 host 가 0 이면
//    run 의 실제 host 와도 매칭한다(구 back 이 hostDeviceId 를 빼먹은 프레임 — §5.2 (2)).
//  · "입력 대기/작업 중" 은 영속 상태가 아니다 — 라이브 스냅·승인·run.op·trustPending 을 겹쳐 계산한다.

import type { TaskLite, RunLite } from '../../services/taskService';

export type TaskGroup = 'needs_input' | 'working' | 'review_ready' | 'idle' | 'done';
export const GROUP_ORDER: TaskGroup[] = ['needs_input', 'working', 'review_ready', 'idle', 'done'];

export type LiveState = 'idle' | 'working' | 'permission' | 'needsInput';

export interface ModelInput {
  now: number;
  hosts: { id: number; name: string; online: boolean; caps: string[] }[];
  tasks: { host: number; items: TaskLite[] }[];
  agentSnaps: { host: number; cwd: string; win: number; agent: string; state: LiveState; at: number; since: number | null }[];
  approvals: { id: string; host: number; cwd: string; win: number; createdAt: number }[];
  unread: { host: number; cwd: string; win: number; count: number }[];
  terminalsFallback: { host: number; cwd: string; win: number; agent: string | null; on: boolean; state: string | null }[];
  workspaces: { id: string; host: number; localPath: string; name: string }[];
  /** 사용자가 카드에서 [확인] 으로 지운 실패 op 의 opId — 로컬 전용(설계 §5.3 1 마지막 항). 없으면 []. */
  dismissedOps?: string[];
}

export interface LiveSnap { state: LiveState; at: number; since: number | null; agent: string }

export type NeedsInputReason =
  | 'failed' | 'promptNotDelivered' | 'interrupted' | 'trust' | 'terminalGone' | 'agentGone'
  | 'permission' | 'needsInput' | 'approval' | 'keptDirty' | 'opFailed';

export interface TaskRow {
  /** 중복 제거 키 — run/agent: `${host}|${cwd}|${win}`(tid 없으면 '-'), task: `${host}|task:${taskId}`. */
  k: string;
  kind: 'run' | 'agent' | 'task';
  group: TaskGroup;
  /** 입력 대기의 사유(§5.3 규칙 1 의 항목 순서 첫 매치) — 카드가 행동 버튼을 고른다. 그 외 그룹은 null. */
  reason: NeedsInputReason | null;
  host: number;
  hostName: string;
  cwd: string | null;
  win: number | null;
  agent: string | null;
  task: TaskLite | null;
  run: RunLite | null;
  live: LiveSnap | null;
  /** agent 행의 출처 — 'snap'(agent_state push) | 'fallback'(터미널 목록 휴리스틱). run/task 행은 null. */
  source: 'snap' | 'fallback' | null;
  approvals: { id: string; createdAt: number }[];
  unread: number;
  workspace: { id: string; name: string } | null;
  /** merged 작업에 남은 run(폐기를 건너뛴 것) — 카드에 "미커밋 변경 때문에 남겨둠". */
  kept: boolean;
  /** 정렬 키 — needs_input: 기다리기 시작한 시각(오름차순), 그 외: 마지막 활동(내림차순). */
  waitSince: number;
  activityAt: number;
}

export interface ModelOutput {
  rows: TaskRow[];
  groups: Record<TaskGroup, TaskRow[]>;
  counts: Record<TaskGroup, number>;
  /** 작업을 가진 오프라인 호스트 — "PC 오프라인" 한 줄(호스트 이름만). */
  offlineHosts: { id: number; name: string }[];
  /** 같은 목록의 id 만(픽스처 대조용 — PC summarize().offline). */
  offline: number[];
}

const DONE_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_TASK_STATES = new Set(['merged', 'closed', 'failed']);
const HIDDEN_RUN_STATES = new Set(['merged', 'discarded']);

const LIVE_STATES = new Set(['idle', 'working', 'permission', 'needsInput']);
/** 숫자 아니면 d — `??` 와 같은 뜻(0 은 값이다: lastActivityAt 0 을 '없음' 으로 접지 않는다). */
const num = (v: unknown, d = 0): number => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
/** host 정규화 — 숫자가 아니면 0(모름). */
const hostOf = (v: unknown): number => num(v, 0);
export const rowKey = (host: number, cwd: string | null, win: number | null): string =>
  `${host}|${cwd ?? ''}|${win == null ? '-' : win}`;

/**
 * 입력 대기 사유 — §5.3 규칙 1 의 항목 순서 그대로(첫 매치). null = 입력 대기 아님.
 *  ⚠ 순서는 PC tasks-model.js needsInputReason 과 같아야 한다(픽스처 reasons 가 대조한다).
 */
export function needsInputReason(
  row: Pick<TaskRow, 'kind' | 'task' | 'run' | 'live' | 'approvals'>,
  dismissed?: Set<string>,
): NeedsInputReason | null {
  if (row.kind === 'task') return null;
  const run = row.run;
  const live = row.live;
  if (run) {
    if (run.state === 'failed') return 'failed';
    const ec = run.error && run.error.code;
    if (ec === 'PROMPT_NOT_DELIVERED') return 'promptNotDelivered';
    if (ec === 'OP_INTERRUPTED') return 'interrupted';
    if (run.trustPending) return 'trust';
    if (run.state === 'running' && run.terminalAlive === false) return 'terminalGone';
    if (run.agentGone) return 'agentGone';
  }
  //  리뷰 준비된 작업 실행의 needsInput 은 claude 의 60초 유휴 알림(idle_prompt)일 뿐 질문이 아니다 — 리뷰 준비로 둔다
  //  (PC tasks-model.js 와 같은 규칙, 2026-09-29 실측). 진짜 질문은 permission·approvals 로 온다.
  const idleAfterReview = !!(live && live.state === 'needsInput' && run && run.state === 'review_ready');
  if (live && !idleAfterReview && (live.state === 'permission' || live.state === 'needsInput')) return live.state;
  if (row.approvals.length > 0) return 'approval';
  if (run && row.task && row.task.state === 'merged' && run.id !== row.task.winnerRunId) return 'keptDirty';
  if (run && run.lastOp && run.lastOp.ok === false && !(dismissed && dismissed.has(run.lastOp.opId))) return 'opFailed';
  return null;
}

/** 행 하나의 그룹 — §5.3 번호 순, 첫 매치. */
export function groupOf(row: Pick<TaskRow, 'kind' | 'task' | 'run' | 'live' | 'approvals'>, dismissed?: Set<string>): TaskGroup {
  if (row.kind === 'task') return 'done';
  if (needsInputReason(row, dismissed)) return 'needs_input';
  const run = row.run;
  const liveState = row.live ? row.live.state : null;
  if (liveState === 'working' || (run && (run.state === 'creating' || run.state === 'launching' || run.state === 'merging' || run.op != null))) return 'working';
  if (run && run.state === 'review_ready') return 'review_ready';
  return 'idle';
}

export function buildTasksModel(input: ModelInput): ModelOutput {
  const inp = input || ({} as ModelInput);
  const now = num(inp.now, Date.now());
  const hostName = new Map<number, string>();
  const offlineSet = new Set<number>();
  for (const h of inp.hosts || []) {
    if (!h) continue;
    hostName.set(hostOf(h.id), String(h.name || ''));
    if (h.online === false) offlineSet.add(hostOf(h.id));
  }
  // host 0(모름)은 오프라인으로 단정하지 않는다.
  const isOff = (h: number) => h !== 0 && offlineSet.has(h);
  const dismissed = new Set(inp.dismissedOps || []);

  const workspaces = (inp.workspaces || []).map((w) => ({ id: String(w.id), name: String(w.name || ''), host: hostOf(w.host), localPath: w.localPath }));
  const wsFor = (host: number, cwd: string | null, id?: string | null): { id: string; name: string } | null => {
    if (id) { const w = workspaces.find((x) => x.id === id); if (w) return { id: w.id, name: w.name }; }
    if (!cwd) return id ? { id, name: '' } : null;
    const w = workspaces.find((x) => x.localPath === cwd && x.host === host) || workspaces.find((x) => x.localPath === cwd && x.host === 0);
    return w ? { id: w.id, name: w.name } : (id ? { id, name: '' } : null);
  };
  const liveOf = (s: { state: string; agent?: string | null; at?: number; since?: number | null }): LiveSnap => ({
    state: (LIVE_STATES.has(s.state) ? s.state : 'idle') as LiveState,
    agent: s.agent || '',
    at: num(s.at),
    since: s.since == null ? null : num(s.since),
  });

  const rows = new Map<string, TaskRow>();
  const order: string[] = [];
  const put = (r: TaskRow) => { rows.set(r.k, r); order.push(r.k); };
  const offlineWithTasks = new Set<number>();
  const blank = { group: 'idle' as TaskGroup, reason: null, approvals: [] as { id: string; createdAt: number }[], unread: 0, kept: false, waitSince: 0, activityAt: 0 };

  // 스냅 색인 — 정확한 k 로만(같은 k 둘이면 뒤엣것). host 0 재시도는 run 행에 붙일 때만(§5.2 (2)).
  const snaps = new Map<string, ModelInput['agentSnaps'][number]>();
  for (const s of inp.agentSnaps || []) {
    if (!s || typeof s.cwd !== 'string' || s.win == null) continue;
    snaps.set(rowKey(hostOf(s.host), s.cwd, Number(s.win)), s);
  }
  const usedSnap = new Set<string>();

  // (1) run 행 — 모든 task(상태 무관)의 run 중 merged/discarded 가 아닌 것.
  for (const bucket of inp.tasks || []) {
    const host = hostOf(bucket && bucket.host);
    const items = (bucket && bucket.items) || [];
    if (isOff(host)) { if (items.length) offlineWithTasks.add(host); continue; }
    for (const task of items) {
      for (const run of task.runs || []) {
        if (!run || HIDDEN_RUN_STATES.has(run.state)) continue;
        const win = run.tid == null ? null : Number(run.tid);
        const k = rowKey(host, run.cwd, win);
        if (rows.has(k)) continue; // 같은 터미널을 두 run 이 주장 = 데몬 버그 — 먼저 온 것 하나만
        let sk = k;
        let snap = snaps.get(k);
        if (!snap && win != null && host !== 0) { sk = rowKey(0, run.cwd, win); snap = snaps.get(sk); }
        if (snap) usedSnap.add(sk);
        put({
          ...blank, approvals: [], k, kind: 'run', host, hostName: hostName.get(host) || '',
          cwd: run.cwd, win, agent: run.agent || null, task, run, live: snap ? liveOf(snap) : null, source: null,
          workspace: wsFor(host, run.cwd, run.workspaceId),
          kept: task.state === 'merged' && run.id !== task.winnerRunId,
        });
      }
    }
  }

  // (2) 에이전트 행 — run 에 붙지 않은 스냅마다 1행(키는 스냅 자신의 k).
  for (const [k, s] of snaps) {
    if (usedSnap.has(k) || rows.has(k)) continue;
    const host = hostOf(s.host);
    if (isOff(host)) continue;
    const live = liveOf(s);
    put({
      ...blank, approvals: [], k, kind: 'agent', host, hostName: hostName.get(host) || '',
      cwd: s.cwd, win: Number(s.win), agent: live.agent || null, task: null, run: null, live, source: 'snap',
      workspace: wsFor(host, s.cwd),
    });
  }

  // (3) 터미널 폴백 — on:true 이고 (1)(2) 에 같은 k(또는 host 0 k)가 없는 것만. 상태를 모르면 live 없음.
  for (const f of inp.terminalsFallback || []) {
    if (!f || !f.on || typeof f.cwd !== 'string' || f.win == null) continue;
    const host = hostOf(f.host);
    if (isOff(host)) continue;
    const k = rowKey(host, f.cwd, Number(f.win));
    if (rows.has(k) || rows.has(rowKey(0, f.cwd, Number(f.win)))) continue;
    put({
      ...blank, approvals: [], k, kind: 'agent', host, hostName: hostName.get(host) || '',
      cwd: f.cwd, win: Number(f.win), agent: f.agent || null, task: null, run: null,
      live: f.state && LIVE_STATES.has(f.state) ? { state: f.state as LiveState, agent: f.agent || '', at: 0, since: null } : null,
      source: 'fallback', workspace: wsFor(host, f.cwd),
    });
  }

  // 승인·미읽음은 k 로 붙인다 — 행의 k 와, 행이 host 를 알면 같은 (cwd,win) 의 host 0 항목까지.
  const indexByK = <T extends { host: number; cwd: string; win: number }>(list: T[] | undefined) => {
    const m = new Map<string, T[]>();
    for (const x of list || []) {
      if (!x || typeof x.cwd !== 'string' || x.win == null) continue;
      const k = rowKey(hostOf(x.host), x.cwd, Number(x.win));
      const cur = m.get(k);
      if (cur) cur.push(x); else m.set(k, [x]);
    }
    return m;
  };
  const apByK = indexByK(inp.approvals);
  const unByK = indexByK(inp.unread);
  for (const k of order) {
    const r = rows.get(k)!;
    const keys = [k];
    if (r.host !== 0) keys.push(rowKey(0, r.cwd, r.win));
    for (const kk of keys) {
      for (const a of apByK.get(kk) || []) r.approvals.push({ id: String(a.id), createdAt: num(a.createdAt) });
      for (const u of unByK.get(kk) || []) r.unread += num(u.count);
    }
    r.approvals.sort((a, b) => a.createdAt - b.createdAt);
  }

  // (4) 종결 작업 — closedAt(없으면 updatedAt) 7일 이내면 done 행 1개.
  for (const bucket of inp.tasks || []) {
    const host = hostOf(bucket && bucket.host);
    if (isOff(host)) continue;
    for (const task of (bucket && bucket.items) || []) {
      if (!task || !TERMINAL_TASK_STATES.has(task.state)) continue;
      const at = num(task.closedAt, num(task.updatedAt));
      if (now - at > DONE_KEEP_MS) continue;
      put({
        ...blank, approvals: [], k: `${host}|task:${task.id}`, kind: 'task', group: 'done', host, hostName: hostName.get(host) || '',
        cwd: null, win: null, agent: null, task, run: null, live: null, source: null,
        workspace: task.workspaceId ? wsFor(host, null, task.workspaceId) : null,
        waitSince: at, activityAt: at,
      });
    }
  }

  const groups = { needs_input: [], working: [], review_ready: [], idle: [], done: [] } as Record<TaskGroup, TaskRow[]>;
  for (const k of order) {
    const r = rows.get(k)!;
    r.reason = r.kind === 'task' ? null : needsInputReason(r, dismissed);
    r.group = groupOf(r, dismissed);
    if (r.kind !== 'task') {
      // 최근 활동 — run: max(lastActivityAt ?? updatedAt, live.at) · 에이전트: live.at
      r.activityAt = Math.max(r.run ? num(r.run.lastActivityAt, num(r.run.updatedAt)) : 0, r.live ? r.live.at : 0);
      // 기다린 시각 — 승인 createdAt → live.since → run.updatedAt → live.at
      r.waitSince = r.approvals.length ? r.approvals[0].createdAt
        : r.live && r.live.since != null ? r.live.since
          : r.run ? num(r.run.updatedAt)
            : r.live ? r.live.at : 0;
    }
    groups[r.group].push(r);
  }
  // 동률은 k 코드포인트 오름차순(localeCompare 금지 — 런타임마다 결과가 다르다).
  const byK = (a: TaskRow, b: TaskRow) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0);
  groups.needs_input.sort((a, b) => a.waitSince - b.waitSince || byK(a, b));
  for (const g of ['working', 'review_ready', 'idle', 'done'] as TaskGroup[]) groups[g].sort((a, b) => b.activityAt - a.activityAt || byK(a, b));

  const rowsOut = GROUP_ORDER.flatMap((g) => groups[g]);
  const counts = Object.fromEntries(GROUP_ORDER.map((g) => [g, groups[g].length])) as Record<TaskGroup, number>;
  const offline = [...offlineWithTasks].sort((a, b) => a - b);
  return { rows: rowsOut, groups, counts, offline, offlineHosts: offline.map((id) => ({ id, name: hostName.get(id) || '' })) };
}

/**
 * 현황판을 한 PC 로 좁힌다 — 진행 현황은 PC 안의 장소다(사이드바 "내 PC ▸ 진행 현황", 2026-09-29 사용자 확정).
 *  host 0(모름)은 어느 PC 인지 모르니 버리지 않고 보고 있는 PC 쪽에 둔다. PC tasks-model.js scopeToHost 와 같은 규칙.
 */
export function scopeToHost<M extends ModelOutput>(m: M, host: number): M {
  const h = hostOf(host);
  const groups = {} as Record<TaskGroup, TaskRow[]>;
  for (const g of GROUP_ORDER) groups[g] = m.groups[g].filter((r) => r.host === h || r.host === 0);
  const counts = Object.fromEntries(GROUP_ORDER.map((g) => [g, groups[g].length])) as Record<TaskGroup, number>;
  return {
    ...m,
    rows: GROUP_ORDER.flatMap((g) => groups[g]),
    groups,
    counts,
    offline: m.offline.filter((x) => x === h),
    offlineHosts: m.offlineHosts.filter((x) => x.id === h),
  };
}

/** PC 별 입력 대기 수(host → n) — 사이드바 PC 행 배지. host 0 은 셀 수 없다. */
export function needsInputByHost(m: ModelOutput): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of m.groups.needs_input) if (r.host) out[r.host] = (out[r.host] || 0) + 1;
  return out;
}

/** 픽스처 대조용 요약 — PC tasks-model.js summarize() 와 같은 모양(model-*.json 의 expect). */
export function summarizeModel(m: ModelOutput): { groups: Record<TaskGroup, string[]>; reasons: Record<string, string>; unread: Record<string, number>; offline: number[] } {
  const groups = {} as Record<TaskGroup, string[]>;
  const reasons: Record<string, string> = {};
  const unread: Record<string, number> = {};
  for (const g of GROUP_ORDER) {
    groups[g] = m.groups[g].map((r) => r.k);
    for (const r of m.groups[g]) {
      if (g === 'needs_input' && r.reason) reasons[r.k] = r.reason;
      if (r.unread) unread[r.k] = r.unread;
    }
  }
  return { groups, reasons, unread, offline: m.offline };
}

// ── 카드 표시 보조(순수) ───────────────────────────────────────────────────
/** review_ready 카드의 주 행동(설계 §6.7 B 결정표). */
export type PrimaryAction = 'mergeLocal' | 'ghLogin' | 'createPr' | 'mergePr' | 'pending';
export function primaryActionFor(
  task: Pick<TaskLite, 'repo'> | null,
  gh: { ghInstalled: boolean; ghAuthed: boolean } | null,
  run: Pick<RunLite, 'pr'> | null,
): { action: PrimaryAction; ghHint: 'missing' | null; prClosed: boolean } {
  const github = task?.repo?.github || null;
  if (!github) return { action: 'mergeLocal', ghHint: null, prClosed: false };
  if (!gh || !gh.ghInstalled) return { action: 'mergeLocal', ghHint: 'missing', prClosed: false };
  if (!gh.ghAuthed) return { action: 'ghLogin', ghHint: null, prClosed: false };
  const pr = run?.pr || null;
  if (!pr) return { action: 'createPr', ghHint: null, prClosed: false };
  if (pr.state === 'open') return { action: 'mergePr', ghHint: null, prClosed: false };
  if (pr.state === 'closed') return { action: 'createPr', ghHint: null, prClosed: true };
  return { action: 'pending', ghHint: null, prClosed: false };
}

/** 이 run 에 지금 변이(커밋·푸시·PR·머지·폐기)를 걸 수 없는가 — 설계 §6.0 마지막 줄. */
export function runBusy(run: Pick<RunLite, 'op'> | null, live: LiveSnap | null): boolean {
  return !!(run && run.op) || (!!live && live.state === 'working');
}
