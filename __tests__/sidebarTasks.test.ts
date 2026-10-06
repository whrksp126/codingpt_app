// 사이드바 저장소 트리 파생(agent-tasks-sidebar.md §2) — 워크스페이스 배정·집계·정렬.
//
// 두 층(tasksModel.test 와 같은 방식):
//  1) 규칙별 케이스 — §2.3~2.6 을 한 줄씩 고정(픽스처가 없어도 돈다).
//  2) 공유 픽스처 sidebar-01.json — PC sidebar-tasks.js 와 같은 입력에 같은 출력(summarizeSidebar).
import { buildSidebarTasks, summarizeSidebar, type SidebarInput, type SidebarRowIn } from '../src/workspace/tasks/sidebarTasks';
import type { TaskLite, RunLite } from '../src/services/taskService';
import { listFixtures, loadFixture, fixtureTest } from './fixtures';

const NOW = 1790000100000;

function mkRun(p: Partial<RunLite> & { id: string; idx: number }): RunLite {
  return {
    agent: 'claude', branch: `cpt/x-${p.idx}`, dir: `.codingpt/worktrees/x-${p.idx}`,
    cwd: `.codingpt/worktrees/x-${p.idx}`, workspaceId: `ws_run_${p.id}`,
    tid: 1000 + p.idx, state: 'running', diff: null, commits: null, pr: null, op: null, lastOp: null, error: null,
    createdAt: NOW, updatedAt: NOW,
    ...p,
  } as RunLite;
}
function mkTask(p: Partial<TaskLite> & { id: string; runs: RunLite[] }): TaskLite {
  return {
    title: p.id, repo: { path: 'work/codingpt', name: 'codingpt', github: null }, base: 'main',
    workspaceId: null, state: 'open', winnerRunId: null, error: null,
    createdAt: NOW, updatedAt: NOW, closedAt: null,
    ...p,
  } as TaskLite;
}
const row = (runId: string, group: SidebarRowIn['group'], sortAt = 0, reason: string | null = null): SidebarRowIn =>
  ({ k: `1|${runId}`, kind: 'run', group, reason, run: { id: runId }, task: null, sortAt });

const WS = [
  { id: 'ws_a', localPath: 'work/codingpt' },
  { id: 'ws_sub', localPath: 'work/codingpt/app' },
  { id: 'ws_b', localPath: 'work/blog' },
];
const base = (tasks: TaskLite[], rows: SidebarRowIn[]): SidebarInput => ({ host: 1, workspaces: WS, tasks, rows });

describe('buildSidebarTasks — 배정(§2.3)', () => {
  test('작업 0개 워크스페이스도 키가 있다', () => {
    const out = buildSidebarTasks(base([], []));
    expect(Object.keys(out.groups)).toEqual(['ws_a', 'ws_sub', 'ws_b']);
    expect(out.groups.ws_b).toEqual({ wsId: 'ws_b', openCount: 0, needsInput: false, tasks: [] });
  });
  test('host 0 = 빈 결과(작업을 붙이지 않는다)', () => {
    const t = mkTask({ id: 't1', runs: [mkRun({ id: 'r1', idx: 1 })] });
    const out = buildSidebarTasks({ ...base([t], [row('r1', 'working')]), host: 0 });
    expect(out.groups.ws_a.tasks).toEqual([]);
  });
  test('workspaceId 매치가 경로보다 먼저', () => {
    const t = mkTask({ id: 't1', workspaceId: 'ws_b', runs: [mkRun({ id: 'r1', idx: 1 })] });
    const out = buildSidebarTasks(base([t], []));
    expect(out.groups.ws_b.openCount).toBe(1);
    expect(out.groups.ws_a.openCount).toBe(0);
  });
  test('repo.path 매치, subdir 가 있으면 더 긴 경로 우선', () => {
    const t1 = mkTask({ id: 't1', runs: [mkRun({ id: 'r1', idx: 1 })] });
    const t2 = mkTask({ id: 't2', repo: { path: 'work/codingpt', subdir: 'app', name: 'c', github: null }, runs: [mkRun({ id: 'r2', idx: 1 })] });
    const out = buildSidebarTasks(base([t1, t2], []));
    expect(out.groups.ws_a.tasks.map((t) => t.taskId)).toEqual(['t1']);
    expect(out.groups.ws_sub.tasks.map((t) => t.taskId)).toEqual(['t2']);
  });
  test('미등록 저장소·종결 작업·잔존 run 0 은 제외', () => {
    const tasks = [
      mkTask({ id: 'u', repo: { path: 'elsewhere', name: 'e', github: null }, runs: [mkRun({ id: 'r1', idx: 1 })] }),
      mkTask({ id: 'm', state: 'merged', runs: [mkRun({ id: 'r2', idx: 1 })] }),
      mkTask({ id: 'z', runs: [mkRun({ id: 'r3', idx: 1, state: 'discarded' }), mkRun({ id: 'r4', idx: 2, state: 'merged' })] }),
    ];
    const out = buildSidebarTasks(base(tasks, []));
    for (const g of Object.values(out.groups)) expect(g.openCount).toBe(0);
  });
  test('작업 워크스페이스는 그룹이 되지 않는다(방어)', () => {
    const out = buildSidebarTasks({ ...base([], []), workspaces: [...WS, { id: 'ws_t', localPath: '.codingpt/worktrees/x-1' }] });
    expect(out.groups.ws_t).toBeUndefined();
  });
});

describe('buildSidebarTasks — 집계(§2.4~2.5)', () => {
  test('팬아웃 ×3: needs_input 우선, 실패 사유는 error, runs 는 idx 순', () => {
    const t = mkTask({ id: 't1', runs: [mkRun({ id: 'c', idx: 3 }), mkRun({ id: 'a', idx: 1 }), mkRun({ id: 'b', idx: 2 })] });
    const out = buildSidebarTasks(base([t], [row('a', 'working'), row('b', 'needs_input', 0, 'failed'), row('c', 'review_ready')]));
    const s = out.groups.ws_a.tasks[0];
    expect(s.group).toBe('needs_input');
    expect(s.dot).toBe('error');
    expect(s.sub).toEqual({ key: 'groupNeedsInput', diff: null });
    expect(s.fanout).toBe(3);
    expect(s.runs.map((r) => [r.runId, r.group, r.dot])).toEqual([['a', 'working', 'spin'], ['b', 'needs_input', 'error'], ['c', 'review_ready', 'none']]);
    expect(out.groups.ws_a.needsInput).toBe(true);
  });
  test('단일 run 은 runs 가 비어 있다 · 색인에 없는 run = idle/none', () => {
    const t = mkTask({ id: 't1', runs: [mkRun({ id: 'r1', idx: 1 })] });
    const s = buildSidebarTasks(base([t], [])).groups.ws_a.tasks[0];
    expect(s).toMatchObject({ group: 'idle', dot: 'none', sub: { key: 'groupIdle', diff: null }, fanout: 1, runs: [] });
  });
  test('전부 creating 이면 stateCreating', () => {
    const t = mkTask({ id: 't1', runs: [mkRun({ id: 'r1', idx: 1, state: 'creating' })] });
    const s = buildSidebarTasks(base([t], [row('r1', 'working')])).groups.ws_a.tasks[0];
    expect(s).toMatchObject({ dot: 'spin', sub: { key: 'stateCreating' } });
  });
  test('review_ready diff = review_ready 인 첫 run(idx 순)', () => {
    const t = mkTask({ id: 't1', runs: [
      mkRun({ id: 'r2', idx: 2, state: 'review_ready', diff: { files: 1, additions: 9, deletions: 9, at: 0 } }),
      mkRun({ id: 'r1', idx: 1, state: 'review_ready', diff: { files: 2, additions: 41, deletions: 7, at: 0 } }),
    ] });
    const s = buildSidebarTasks(base([t], [row('r1', 'review_ready'), row('r2', 'review_ready')])).groups.ws_a.tasks[0];
    expect(s.sub).toEqual({ key: 'groupReviewReady', diff: { a: 41, d: 7 } });
    expect(s.dot).toBe('none');
  });
});

describe('buildSidebarTasks — 정렬(§2.6)', () => {
  test('그룹 순 → 최근 활동 내림차순 → taskId', () => {
    const tasks = [
      mkTask({ id: 'idle1', runs: [mkRun({ id: 'i1', idx: 1 })] }),
      mkTask({ id: 'w_old', runs: [mkRun({ id: 'w1', idx: 1 })] }),
      mkTask({ id: 'w_new', runs: [mkRun({ id: 'w2', idx: 1 })] }),
      mkTask({ id: 'n1', runs: [mkRun({ id: 'n', idx: 1 })] }),
      mkTask({ id: 'b_tie', runs: [mkRun({ id: 't2', idx: 1 })] }),
      mkTask({ id: 'a_tie', runs: [mkRun({ id: 't1', idx: 1 })] }),
    ];
    const rows = [row('i1', 'idle', 999), row('w1', 'working', 10), row('w2', 'working', 20), row('n', 'needs_input', 1), row('t1', 'review_ready', 5), row('t2', 'review_ready', 5)];
    const out = buildSidebarTasks(base(tasks, rows));
    expect(out.groups.ws_a.tasks.map((t) => t.taskId)).toEqual(['n1', 'w_new', 'w_old', 'a_tie', 'b_tie', 'idle1']);
    expect(out.groups.ws_a.openCount).toBe(6);
  });
});

describe('sidebar 공유 픽스처(PC sidebar-tasks.js 와 대조)', () => {
  const files = listFixtures('sidebar-');
  for (const f of files) {
    fixtureTest(f, () => {
      const fx = loadFixture<{ input: SidebarInput; expect: unknown }>(f)!;
      expect(summarizeSidebar(buildSidebarTasks(fx.input))).toEqual(fx.expect);
    });
  }
  if (!files.length) test.skip('sidebar-*.json 없음(PC 구현자 소유)', () => {});
});

// 소스 계약(명세 §3.2·§5) — 라벨·진입점이 조용히 되돌아가지 않게.
describe('사이드바 소스 계약', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const src: string = require('fs').readFileSync(require('path').resolve(__dirname, '../src/components/SidebarContent.tsx'), 'utf8');
  test('상단 행 = Tasks(이슈) 하나 — 진행 현황·자동화 행은 뺐다(2026-10-07, PC 와 같다)', () => {
    expect(src).toMatch(/label="Tasks" onPress=\{onIssues\}/);
    expect(src).not.toMatch(/TASKS_TX\.overview/);
    expect(src).not.toMatch(/<AutoRow /);
  });
  test('그룹 + 는 그 워크스페이스를 미리 선택한 새 작업 시트를 연다', () => {
    expect(src).toMatch(/openNewTask\(\{[^}]*workspaceId: w\.id/);
  });
  test('Pressable 함수형 style 금지', () => {
    expect(src).not.toMatch(/style=\{\(\{\s*pressed/);
  });
});
