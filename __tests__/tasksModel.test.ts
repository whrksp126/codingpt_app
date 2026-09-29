// 작업 현황판 모델(설계 §5) — 행 생성·중복 제거·그룹 판정·정렬.
//
// 두 층:
//  1) 이 파일 안의 규칙별 케이스 — §5.3 의 각 규칙을 한 줄씩 고정한다(픽스처가 없어도 돈다).
//  2) 공유 픽스처 model-*.json — PC tasks-model.js 와 **같은 입력에 같은 출력**(교차 구현 대조).
//     모양 `{ input, expect: { groups, reasons, unread, offline } }` = PC summarize() 정본. 앱은 summarizeModel().
import { buildTasksModel, groupOf, primaryActionFor, runBusy, summarizeModel, type ModelInput } from '../src/workspace/tasks/tasksModel';
import type { TaskLite, RunLite } from '../src/services/taskService';
import { listFixtures, loadFixture, fixtureTest } from './fixtures';

const NOW = 1790000100000;

function mkRun(p: Partial<RunLite> & { id: string; idx: number }): RunLite {
  return {
    agent: 'claude', branch: `cpt/x2m1qa-${p.idx}`, dir: `.codingpt/worktrees/codingpt-x2m1qa-${p.idx}`,
    cwd: `.codingpt/worktrees/codingpt-x2m1qa-${p.idx}`, workspaceId: `ws_${p.idx}`,
    tid: 1000 + p.idx, state: 'running', terminalAlive: true, agentGone: false, trustPending: false,
    diff: null, commits: null, pr: null, op: null, lastOp: null, error: null,
    createdAt: NOW - 100000, updatedAt: NOW - 50000, lastActivityAt: NOW - 50000,
    ...p,
  } as RunLite;
}
function mkTask(p: Partial<TaskLite> & { id: string; runs: RunLite[] }): TaskLite {
  return {
    title: '로그인 폼', repo: { path: 'work/codingpt', name: 'codingpt', github: null }, base: 'main',
    workspaceId: 'ws_repo', state: 'open', winnerRunId: null, error: null,
    createdAt: NOW - 200000, updatedAt: NOW - 50000, closedAt: null,
    ...p,
  } as TaskLite;
}
function input(p: Partial<ModelInput>): ModelInput {
  return {
    now: NOW,
    hosts: [{ id: 7, name: 'MacBook', online: true, caps: ['task.v1'] }],
    tasks: [], agentSnaps: [], approvals: [], unread: [], terminalsFallback: [], workspaces: [],
    ...p,
  };
}
const keysOf = (m: ReturnType<typeof buildTasksModel>, g: keyof ReturnType<typeof buildTasksModel>['groups']) => m.groups[g].map((r) => r.k);

describe('§5.3 그룹 판정 — 규칙마다 하나', () => {
  const run1 = mkRun({ id: 'r_1', idx: 1 });
  const base = (r: RunLite, t?: Partial<TaskLite>) => input({ tasks: [{ host: 7, items: [mkTask({ id: 't_1', runs: [r], ...t })] }] });

  test('failed run → 입력 대기', () => {
    expect(buildTasksModel(base({ ...run1, state: 'failed', error: { code: 'AGENT_LAUNCH_FAILED' } })).rows[0].group).toBe('needs_input');
  });
  test('PROMPT_NOT_DELIVERED / OP_INTERRUPTED → 입력 대기', () => {
    expect(buildTasksModel(base({ ...run1, error: { code: 'PROMPT_NOT_DELIVERED' } })).rows[0].group).toBe('needs_input');
    expect(buildTasksModel(base({ ...run1, error: { code: 'OP_INTERRUPTED' } })).rows[0].group).toBe('needs_input');
  });
  test('trustPending → 입력 대기', () => {
    expect(buildTasksModel(base({ ...run1, trustPending: true })).rows[0].group).toBe('needs_input');
  });
  test('running + terminalAlive false → 입력 대기(대기 중으로 숨지 않는다)', () => {
    expect(buildTasksModel(base({ ...run1, terminalAlive: false })).rows[0].group).toBe('needs_input');
  });
  test('agentGone → 입력 대기', () => {
    expect(buildTasksModel(base({ ...run1, agentGone: true })).rows[0].group).toBe('needs_input');
  });
  test('라이브 permission/needsInput → 입력 대기', () => {
    for (const st of ['permission', 'needsInput'] as const) {
      const m = buildTasksModel({ ...base(run1), agentSnaps: [{ host: 7, cwd: run1.cwd, win: run1.tid as number, agent: 'claude', state: st, at: NOW - 1000, since: NOW - 90000 }] });
      expect(m.rows).toHaveLength(1);
      expect(m.rows[0].group).toBe('needs_input');
    }
  });
  test('승인 대기가 k 로 붙으면 → 입력 대기', () => {
    const m = buildTasksModel({ ...base(run1), approvals: [{ id: 'ap1', host: 7, cwd: run1.cwd, win: run1.tid as number, createdAt: NOW - 5000 }] });
    expect(m.rows[0].group).toBe('needs_input');
    expect(m.rows[0].approvals.map((a) => a.id)).toEqual(['ap1']);
  });
  test('merged 작업에 남은 run(승자 아님) → 입력 대기 + kept', () => {
    const r2 = mkRun({ id: 'r_2', idx: 2, state: 'review_ready' });
    const m = buildTasksModel(input({ tasks: [{ host: 7, items: [mkTask({ id: 't_1', state: 'merged', winnerRunId: 'r_1', closedAt: NOW - 1000, runs: [{ ...run1, state: 'merged' }, r2] })] }] }));
    const runRow = m.rows.find((r) => r.kind === 'run')!;
    expect(runRow.run!.id).toBe('r_2');
    expect(runRow.group).toBe('needs_input');
    expect(runRow.kept).toBe(true);
    expect(runRow.reason).toBe('keptDirty');
    // 두 행: 잔존 run + 완료 task 행(§5.2 (4))
    expect(m.groups.done.map((r) => r.kind)).toEqual(['task']);
  });
  test('lastOp.ok === false → 입력 대기, [확인] 으로 지우면 원래 그룹', () => {
    const r = { ...run1, state: 'review_ready' as const, lastOp: { opId: 'op-1', kind: 'push' as const, ok: false, code: 'PUSH_REJECTED' } };
    expect(buildTasksModel(base(r)).rows[0].group).toBe('needs_input');
    expect(buildTasksModel({ ...base(r), dismissedOps: ['op-1'] }).rows[0].group).toBe('review_ready');
  });
  test('작업 중: 라이브 working / creating / launching / merging / op 진행', () => {
    const snap = { host: 7, cwd: run1.cwd, win: run1.tid as number, agent: 'claude', state: 'working' as const, at: NOW, since: NOW };
    expect(buildTasksModel({ ...base(run1), agentSnaps: [snap] }).rows[0].group).toBe('working');
    for (const st of ['creating', 'launching', 'merging'] as const) expect(buildTasksModel(base({ ...run1, state: st })).rows[0].group).toBe('working');
    expect(buildTasksModel(base({ ...run1, state: 'review_ready', op: { opId: 'o', kind: 'push', startedAt: NOW } })).rows[0].group).toBe('working');
  });
  test('review_ready → 리뷰 준비, 그 외 running → 대기 중', () => {
    expect(buildTasksModel(base({ ...run1, state: 'review_ready' })).rows[0].group).toBe('review_ready');
    expect(buildTasksModel(base(run1)).rows[0].group).toBe('idle');
  });
  test('종결 task(7일 이내) → 완료 행 1개, 7일 넘으면 없음', () => {
    const closed = mkTask({ id: 't_c', state: 'closed', closedAt: NOW - 1000, runs: [{ ...run1, state: 'discarded' }] });
    const m = buildTasksModel(input({ tasks: [{ host: 7, items: [closed] }] }));
    expect(m.rows.map((r) => [r.kind, r.group, r.k])).toEqual([['task', 'done', '7|task:t_c']]);
    const old = { ...closed, closedAt: NOW - 8 * 24 * 3600 * 1000 };
    expect(buildTasksModel(input({ tasks: [{ host: 7, items: [old] }] })).rows).toHaveLength(0);
  });
  test('규칙 순서 — failed 이면서 working 이어도 입력 대기(첫 매치)', () => {
    const snap = { host: 7, cwd: run1.cwd, win: run1.tid as number, agent: 'claude', state: 'working' as const, at: NOW, since: NOW };
    expect(buildTasksModel({ ...base({ ...run1, state: 'failed' }), agentSnaps: [snap] }).rows[0].group).toBe('needs_input');
  });
});

describe('§5.2 행 생성·중복 제거', () => {
  const run1 = mkRun({ id: 'r_1', idx: 1 });
  test('스냅이 run 과 같은 k 면 행을 만들지 않고 live 로 붙는다', () => {
    const m = buildTasksModel(input({
      tasks: [{ host: 7, items: [mkTask({ id: 't_1', runs: [run1] })] }],
      agentSnaps: [{ host: 7, cwd: run1.cwd, win: run1.tid as number, agent: 'claude', state: 'working', at: NOW, since: NOW - 10 }],
    }));
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].kind).toBe('run');
    expect(m.rows[0].live?.state).toBe('working');
  });
  test('host 0(모름) 스냅도 run 에 붙는다(0|cwd|win 재시도)', () => {
    const m = buildTasksModel(input({
      tasks: [{ host: 7, items: [mkTask({ id: 't_1', runs: [run1] })] }],
      agentSnaps: [{ host: 0, cwd: run1.cwd, win: run1.tid as number, agent: 'claude', state: 'permission', at: NOW, since: NOW - 10 }],
    }));
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].group).toBe('needs_input');
  });
  test('run 에 안 붙은 스냅은 에이전트 행 — 다른 워크스페이스의 에이전트도 현황판에 나온다', () => {
    const m = buildTasksModel(input({
      agentSnaps: [{ host: 7, cwd: 'work/other', win: 5, agent: 'codex', state: 'needsInput', at: NOW, since: NOW - 60000 }],
      workspaces: [{ id: 'ws_o', host: 7, localPath: 'work/other', name: 'other' }],
    }));
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]).toMatchObject({ kind: 'agent', k: '7|work/other|5', group: 'needs_input', source: 'snap', agent: 'codex' });
    expect(m.rows[0].workspace?.name).toBe('other');
  });
  test('폴백 터미널은 (1)(2) 에 없는 on:true 만', () => {
    const m = buildTasksModel(input({
      agentSnaps: [{ host: 7, cwd: 'a', win: 1, agent: 'claude', state: 'idle', at: NOW, since: null }],
      terminalsFallback: [
        { host: 7, cwd: 'a', win: 1, agent: 'claude', on: true, state: null },
        { host: 7, cwd: 'b', win: 2, agent: 'gemini', on: true, state: null },
        { host: 7, cwd: 'c', win: 3, agent: null, on: false, state: null },
      ],
    }));
    expect(m.rows.map((r) => [r.k, r.source])).toEqual([['7|a|1', 'snap'], ['7|b|2', 'fallback']].sort((x, y) => (x[0] < y[0] ? -1 : 1)));
  });
  test('merged/discarded run 은 행이 없다', () => {
    const m = buildTasksModel(input({ tasks: [{ host: 7, items: [mkTask({ id: 't_1', runs: [{ ...run1, state: 'discarded' }, mkRun({ id: 'r_2', idx: 2, state: 'merged' })] })] }] }));
    expect(m.rows.filter((r) => r.kind === 'run')).toHaveLength(0);
  });
  test('tid 없는 run 의 k 는 `-`', () => {
    const m = buildTasksModel(input({ tasks: [{ host: 7, items: [mkTask({ id: 't_1', runs: [{ ...run1, tid: null, state: 'creating' }] })] }] }));
    expect(m.rows[0].k).toBe(`7|${run1.cwd}|-`);
  });
  test('오프라인 host 의 작업은 행 대신 "PC 오프라인" 한 줄', () => {
    const m = buildTasksModel(input({
      hosts: [{ id: 7, name: 'MacBook', online: false, caps: [] }],
      tasks: [{ host: 7, items: [mkTask({ id: 't_1', runs: [run1] })] }],
    }));
    expect(m.rows).toHaveLength(0);
    expect(m.offlineHosts).toEqual([{ id: 7, name: 'MacBook' }]);
    expect(m.offline).toEqual([7]);
  });
  test('미읽음은 host 0(알림에 host 없음) 이어도 run 카드에 붙는다', () => {
    const m = buildTasksModel(input({
      tasks: [{ host: 7, items: [mkTask({ id: 't_1', runs: [run1] })] }],
      unread: [{ host: 0, cwd: run1.cwd, win: run1.tid as number, count: 2 }],
    }));
    expect(m.rows[0].unread).toBe(2);
  });
});

describe('정렬', () => {
  test('입력 대기 = 오래 기다린 순(승인 createdAt → live.since → run.updatedAt), 나머지 = 최근 활동 순', () => {
    const a = mkRun({ id: 'r_a', idx: 1, trustPending: true, updatedAt: NOW - 3000 });
    const b = mkRun({ id: 'r_b', idx: 2, updatedAt: NOW - 1000 });
    const c = mkRun({ id: 'r_c', idx: 3, state: 'review_ready', lastActivityAt: NOW - 9000 });
    const d = mkRun({ id: 'r_d', idx: 4, state: 'review_ready', lastActivityAt: NOW - 100 });
    const m = buildTasksModel(input({
      tasks: [{ host: 7, items: [mkTask({ id: 't_1', runs: [a, b, c, d] })] }],
      approvals: [{ id: 'ap', host: 7, cwd: b.cwd, win: b.tid as number, createdAt: NOW - 60000 }],
    }));
    expect(keysOf(m, 'needs_input')).toEqual([`7|${b.cwd}|${b.tid}`, `7|${a.cwd}|${a.tid}`]);
    expect(keysOf(m, 'review_ready')).toEqual([`7|${d.cwd}|${d.tid}`, `7|${c.cwd}|${c.tid}`]);
    expect(m.rows.map((r) => r.group)).toEqual(['needs_input', 'needs_input', 'review_ready', 'review_ready']);
  });
});

describe('보조 판정', () => {
  test('주 행동 결정표(§6.7 B)', () => {
    const gh = { ghInstalled: true, ghAuthed: true };
    const t = (github: any) => ({ repo: { path: 'x', name: 'x', github } } as any);
    expect(primaryActionFor(t(null), gh, { pr: null }).action).toBe('mergeLocal');
    expect(primaryActionFor(t({ owner: 'o', repo: 'r' }), { ghInstalled: false, ghAuthed: false }, { pr: null })).toMatchObject({ action: 'mergeLocal', ghHint: 'missing' });
    expect(primaryActionFor(t({ owner: 'o', repo: 'r' }), { ghInstalled: true, ghAuthed: false }, { pr: null }).action).toBe('ghLogin');
    expect(primaryActionFor(t({ owner: 'o', repo: 'r' }), gh, { pr: null }).action).toBe('createPr');
    expect(primaryActionFor(t({ owner: 'o', repo: 'r' }), gh, { pr: { state: 'open' } as any }).action).toBe('mergePr');
    expect(primaryActionFor(t({ owner: 'o', repo: 'r' }), gh, { pr: { state: 'closed' } as any })).toMatchObject({ action: 'createPr', prClosed: true });
    expect(primaryActionFor(t({ owner: 'o', repo: 'r' }), gh, { pr: { state: 'merged' } as any }).action).toBe('pending');
  });
  test('run 이 바쁜가 — op 진행 또는 라이브 working', () => {
    expect(runBusy({ op: null }, null)).toBe(false);
    expect(runBusy({ op: { opId: 'o', kind: 'push', startedAt: 1 } }, null)).toBe(true);
    expect(runBusy({ op: null }, { state: 'working', at: 1, since: null, agent: 'claude' })).toBe(true);
  });
  test('groupOf — task 행은 언제나 완료', () => {
    expect(groupOf({ kind: 'task', task: null, run: null, live: null, approvals: [] })).toBe('done');
  });
});

// ── 공유 픽스처(교차 구현) ──
const MODEL_FIXTURES = listFixtures('model-');
describe('공유 픽스처 model-*.json (PC tasks-model.js 와 같은 출력)', () => {
  fixtureTest('픽스처가 하나 이상 있다', () => {
    expect(MODEL_FIXTURES.length).toBeGreaterThan(0);
  });
  for (const name of MODEL_FIXTURES) {
    fixtureTest(name, () => {
      const fx = loadFixture<any>(name);
      expect(fx && fx.input && fx.expect).toBeTruthy();
      expect(summarizeModel(buildTasksModel(fx.input as ModelInput))).toEqual(fx.expect);
    });
  }
});
