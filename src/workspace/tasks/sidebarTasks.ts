// sidebarTasks.ts — 사이드바 저장소 트리(워크스페이스 그룹 ⊃ 로컬 행 + 열린 작업 행)의 순수 파생.
//
// 정본: codingpt_daemon/docs/agent-tasks-sidebar.md §2. PC 미러 = codingpt_pc/src/js/sidebar-tasks.js.
//  **같은 입력에 같은 출력**이어야 한다 — 폰과 PC 가 다른 트리를 그리면 "작업 vs 워크스페이스" 혼동이 더 커진다.
//  교차 테스트는 docs/fixtures/agent-tasks/sidebar-01.json 한 벌로 양쪽을 돌린다.
//
// 규율:
//  · React·네트워크·시계를 import 하지 않는다.
//  · 상태를 새로 판정하지 않는다 — 현황판 모델(tasksModel)의 행(rows)을 run.id 로 색인만 한다(설계 §5 규율).
//  · 동률은 코드포인트 비교(localeCompare 금지 — 런타임마다 결과가 다르다).

import type { TaskLite } from '../../services/taskService';
import type { TaskGroup } from './tasksModel';

export type SidebarDot = 'warn' | 'error' | 'spin' | 'none';
export type SidebarSubKey = 'groupNeedsInput' | 'groupWorking' | 'groupReviewReady' | 'groupIdle' | 'stateCreating';

export interface SidebarRowIn {
  k: string;
  kind: 'run' | 'agent' | 'task';
  group: TaskGroup;
  reason: string | null;
  run: { id: string } | null;
  task: { id: string } | null;
  sortAt: number;
}

export interface SidebarInput {
  /** 지금 사이드바가 보는 PC. 0/모름이면 빈 결과. */
  host: number;
  /** workspacesForDevice(host) 순서 그대로(isTaskWorkspace 제외·핀 우선). */
  workspaces: { id: string; localPath: string }[];
  /** 그 PC 버킷의 작업만(byHost[host].items). */
  tasks: TaskLite[];
  /** 현황판 모델 행을 GROUP_ORDER 순으로 평탄화한 것. */
  rows: SidebarRowIn[];
}

export interface SidebarRun {
  runId: string; agent: string; branch: string; workspaceId: string | null; tid: number | null;
  group: TaskGroup; dot: SidebarDot;
}
export interface SidebarTask {
  taskId: string; title: string;
  group: TaskGroup;
  dot: SidebarDot;
  sub: { key: SidebarSubKey; diff: { a: number; d: number } | null };
  fanout: number;
  runs: SidebarRun[];
}
export interface SidebarGroup {
  wsId: string;
  openCount: number;
  needsInput: boolean;
  tasks: SidebarTask[];
}
export interface SidebarOutput { groups: Record<string, SidebarGroup> }

const HIDDEN_RUN_STATES = new Set(['merged', 'discarded']);
const AGG_ORDER: TaskGroup[] = ['needs_input', 'working', 'review_ready', 'idle'];
// taskService.isTaskWorkspace 와 같은 접두(순수 함수라 서비스를 import 하지 않는다).
const TASK_WS_RE = /^\.codingpt\/worktrees\//;
const ERROR_REASONS = new Set(['failed', 'opFailed']);

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const num = (v: unknown): number => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);

function dotOf(group: TaskGroup, reason: string | null): SidebarDot {
  if (group === 'needs_input') return reason && ERROR_REASONS.has(reason) ? 'error' : 'warn';
  if (group === 'working') return 'spin';
  return 'none';
}

/** 작업 → 워크스페이스 id(§2.3). 없으면 null(사이드바에 그리지 않는다). */
function assignWs(task: TaskLite, workspaces: SidebarInput['workspaces']): string | null {
  if (task.workspaceId) {
    const w = workspaces.find((x) => x.id === task.workspaceId);
    if (w) return w.id;
  }
  const repo = task.repo || ({} as TaskLite['repo']);
  const base = typeof repo.path === 'string' ? repo.path : '';
  if (!base) return null;
  const sub = typeof repo.subdir === 'string' && repo.subdir ? `${base}/${repo.subdir}` : null;
  let best: { id: string; len: number } | null = null;
  for (const w of workspaces) {
    const lp = w.localPath;
    if (typeof lp !== 'string' || !lp) continue;
    if (lp === base || (sub && lp === sub)) {
      if (!best || lp.length > best.len) best = { id: w.id, len: lp.length };
    }
  }
  return best ? best.id : null;
}

export function buildSidebarTasks(input: SidebarInput): SidebarOutput {
  const inp = input || ({} as SidebarInput);
  const groups: Record<string, SidebarGroup> = {};
  const host = num(inp.host);
  // 방어: 작업 워크스페이스는 그룹이 되지 않는다.
  const workspaces = (inp.workspaces || []).filter((w) => w && w.id && !TASK_WS_RE.test(String(w.localPath || '')));
  for (const w of workspaces) groups[w.id] = { wsId: w.id, openCount: 0, needsInput: false, tasks: [] };
  if (!host) return { groups };

  // run.id → 모델 행(kind 'run' 만)
  const byRun = new Map<string, SidebarRowIn>();
  for (const r of inp.rows || []) {
    if (r && r.kind === 'run' && r.run && r.run.id && !byRun.has(r.run.id)) byRun.set(r.run.id, r);
  }

  const acc = new Map<string, { t: SidebarTask; sortAt: number }[]>();
  for (const task of inp.tasks || []) {
    if (!task || task.state !== 'open') continue;
    const live = (task.runs || []).filter((r) => r && !HIDDEN_RUN_STATES.has(r.state));
    if (!live.length) continue;
    const wsId = assignWs(task, workspaces);
    if (!wsId || !groups[wsId]) continue;
    const runs = live.slice().sort((a, b) => num(a.idx) - num(b.idx) || cmp(String(a.id), String(b.id)));

    let sortAt = 0;
    const per = runs.map((run) => {
      const row = byRun.get(run.id);
      const group: TaskGroup = row && row.group !== 'done' ? row.group : 'idle';
      const reason = row ? row.reason : null;
      if (row) sortAt = Math.max(sortAt, num(row.sortAt));
      return { run, group, dot: row ? dotOf(group, reason) : ('none' as SidebarDot) };
    });

    let agg: TaskGroup = 'idle';
    for (const g of AGG_ORDER) { if (per.some((p) => p.group === g)) { agg = g; break; } }
    let dot: SidebarDot = 'none';
    if (agg === 'needs_input') dot = per.some((p) => p.group === 'needs_input' && p.dot === 'error') ? 'error' : 'warn';
    else if (agg === 'working') dot = 'spin';

    let key: SidebarSubKey;
    let diff: { a: number; d: number } | null = null;
    if (agg === 'needs_input') key = 'groupNeedsInput';
    else if (agg === 'working') key = runs.every((r) => r.state === 'creating') ? 'stateCreating' : 'groupWorking';
    else if (agg === 'review_ready') {
      key = 'groupReviewReady';
      const first = per.find((p) => p.group === 'review_ready');
      const d = first && first.run.diff;
      if (d) diff = { a: num(d.additions), d: num(d.deletions) };
    } else key = 'groupIdle';

    const t: SidebarTask = {
      taskId: String(task.id),
      title: String(task.title || ''),
      group: agg,
      dot,
      sub: { key, diff },
      fanout: runs.length,
      runs: runs.length >= 2 ? per.map((p) => ({
        runId: String(p.run.id),
        agent: String(p.run.agent || ''),
        branch: String(p.run.branch || ''),
        workspaceId: p.run.workspaceId || null,
        tid: p.run.tid == null ? null : Number(p.run.tid),
        group: p.group,
        dot: p.dot,
      })) : [],
    };
    const list = acc.get(wsId);
    if (list) list.push({ t, sortAt }); else acc.set(wsId, [{ t, sortAt }]);
  }

  for (const [wsId, list] of acc) {
    list.sort((a, b) => AGG_ORDER.indexOf(a.t.group) - AGG_ORDER.indexOf(b.t.group)
      || b.sortAt - a.sortAt
      || cmp(a.t.taskId, b.t.taskId));
    const g = groups[wsId];
    g.tasks = list.map((x) => x.t);
    g.openCount = g.tasks.length;
    g.needsInput = g.tasks.some((t) => t.group === 'needs_input');
  }
  return { groups };
}

/** 픽스처 대조용 요약(§7.3) — PC summarizeSidebar() 와 같은 모양. title·agent·branch 는 제외. */
export function summarizeSidebar(out: SidebarOutput): Record<string, {
  openCount: number; needsInput: boolean;
  tasks: { taskId: string; group: TaskGroup; dot: SidebarDot; sub: { key: SidebarSubKey; diff: { a: number; d: number } | null }; fanout: number; runs: { runId: string; group: TaskGroup; dot: SidebarDot }[] }[];
}> {
  const res: ReturnType<typeof summarizeSidebar> = {};
  for (const [wsId, g] of Object.entries(out.groups)) {
    res[wsId] = {
      openCount: g.openCount,
      needsInput: g.needsInput,
      tasks: g.tasks.map((t) => ({
        taskId: t.taskId, group: t.group, dot: t.dot, sub: { key: t.sub.key, diff: t.sub.diff }, fanout: t.fanout,
        runs: t.runs.map((r) => ({ runId: r.runId, group: r.group, dot: r.dot })),
      })),
    };
  }
  return res;
}
