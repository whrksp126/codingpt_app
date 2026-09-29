/**
 * 작업 현황판 화면 — 렌더 스모크 + 카드 계약.
 *
 * 고정하는 것:
 *  · 그룹 섹션이 고정 순서로 그려지고, 대기 중/완료는 기본 접힘(§5.3·§6.4).
 *  · 카드의 행동 버튼은 입력 대기 **사유**가 정한다(§5.4) — 신뢰 대기면 [신뢰하고 계속], 실패면 [다시 열기].
 *  · 상세는 run 칩·요약·결정표의 주 행동을 그리고, 리뷰 모드는 [코멘트 에이전트에게 보내기] 바를 쓴다.
 *  · 빈 현황판·PC 없음 화면(§6.7 A).
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/animations/haptics', () => ({ haptic: { keyPress: () => {}, select: () => {} } }));
jest.mock('../src/components/keyboard/KeyAssist', () => ({ KeyAssistOverlay: () => null, collapseKeyAssist: () => {} }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children }: any) => children }));
jest.mock('../src/components/SidebarContent', () => {
  const { Text: T } = require('react-native');
  return { SectionHead: ({ title }: { title: string }) => <T>{title}</T> };
});
const mockSvc: Record<string, jest.Mock> = {
  getTask: jest.fn(),
  prStatus: jest.fn(async (..._a: any[]) => ({ pr: null, run: null })),
  getDiff: jest.fn(),
  listTasks: jest.fn(),
};
jest.mock('../src/services/taskService', () => {
  const actual = jest.requireActual('../src/services/taskService');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      getTask: (...a: any[]) => mockSvc.getTask(...a),
      prStatus: (...a: any[]) => mockSvc.prStatus(...a),
      getDiff: (...a: any[]) => mockSvc.getDiff(...a),
      listTasks: (...a: any[]) => mockSvc.listTasks(...a),
    },
  };
});

import TaskList from '../src/workspace/tasks/TaskList';
import TaskDetail from '../src/workspace/tasks/TaskDetail';
import { buildTasksModel, type ModelInput } from '../src/workspace/tasks/tasksModel';
import { refreshHost, resetTasksStore } from '../src/workspace/tasks/useTasks';
import type { TaskLite, RunLite } from '../src/services/taskService';
import { tx } from '../src/text';
import { TASKS_TEXT } from '../src/text/tasks';

const TX = tx(TASKS_TEXT);
const NOW = 1790000100000;

function run(p: Partial<RunLite> & { id: string; idx: number }): RunLite {
  return {
    agent: 'claude', branch: `cpt/abcdef-${p.idx}`, dir: `.codingpt/worktrees/app-abcdef-${p.idx}`, cwd: `.codingpt/worktrees/app-abcdef-${p.idx}`,
    workspaceId: `ws_${p.idx}`, tid: 100 + p.idx, state: 'running', terminalAlive: true, agentGone: false, trustPending: false,
    diff: null, commits: null, pr: null, op: null, lastOp: null, error: null, createdAt: NOW - 1000, updatedAt: NOW - 1000, lastActivityAt: NOW - 1000,
    ...p,
  } as RunLite;
}
const TASK: TaskLite = {
  id: 't_abcdefghij', title: '로그인 폼 검증', repo: { path: 'work/app', name: 'app', github: null }, base: 'main', workspaceId: 'ws_repo',
  state: 'open', winnerRunId: null, error: null, createdAt: NOW - 5000, updatedAt: NOW - 1000, closedAt: null,
  runs: [
    run({ id: 'r_1', idx: 1, trustPending: true }),
    run({ id: 'r_2', idx: 2, agent: 'codex', state: 'review_ready', diff: { files: 3, additions: 41, deletions: 7, at: NOW }, commits: { ahead: 2, at: NOW } }),
    run({ id: 'r_3', idx: 3, state: 'failed', error: { code: 'AGENT_LAUNCH_FAILED' } }),
  ],
};
const input = (p: Partial<ModelInput> = {}): ModelInput => ({
  now: NOW, hosts: [{ id: 5, name: 'MacBook', online: true, caps: ['task.v1'] }], tasks: [{ host: 5, items: [TASK] }],
  agentSnaps: [], approvals: [], unread: [], terminalsFallback: [], workspaces: [], ...p,
});
const texts = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((t) => {
  const c = t.props.children;
  return Array.isArray(c) ? c.join('') : String(c ?? '');
});

function renderList(model = buildTasksModel(input()), banners: any[] = []) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(
      <TaskList model={model} now={NOW} refreshing={false} onRefresh={() => {}} onOpenRow={() => {}} onAction={() => {}}
        busy={null} selectedKey={null} seenIds={new Set()} banners={banners} onNewTask={() => {}} onConnectPc={() => {}} />,
    );
  });
  return r;
}

describe('TaskList', () => {
  test('그룹 섹션과 사유별 카드 행동', () => {
    const r = renderList();
    const t = texts(r);
    expect(t).toContain(`${TX.groupNeedsInput} (2)`);
    expect(t).toContain(`${TX.groupReviewReady} (1)`);
    expect(t).toContain(TX.trustContinue);      // 신뢰 대기 → [신뢰하고 계속]
    expect(t).toContain(TX.reopen);             // 실패 → [다시 열기]
    expect(t).toContain(TX.review);             // 리뷰 준비 → [리뷰]
    expect(t.some((x) => x.includes(TX.filesSummary(3)))).toBe(true);
    // 제목·브랜치가 카드 둘째 줄에(작업 제목은 봉인 task.list 에서만 온다)
    expect(t.some((x) => x.includes('로그인 폼 검증 · cpt/abcdef-2'))).toBe(true);
    r.unmount();
  });
  test('대기 중·완료는 기본 접힘 — 헤더만, 카드 없음', () => {
    const done: TaskLite = { ...TASK, id: 't_done000000', state: 'closed', closedAt: NOW - 10, runs: [run({ id: 'r_9', idx: 9, state: 'discarded' })] };
    const idle: TaskLite = { ...TASK, id: 't_idle000000', runs: [run({ id: 'r_8', idx: 8 })] };
    const r = renderList(buildTasksModel(input({ tasks: [{ host: 5, items: [done, idle] }] })));
    const t = texts(r);
    expect(t).toContain(`${TX.groupIdle} (1)`);
    expect(t).toContain(`${TX.groupDone} (1)`);
    expect(t).not.toContain(TX.deleteRecord);
    r.unmount();
  });
  test('빈 현황판 / PC 없음', () => {
    const empty = buildTasksModel(input({ tasks: [] }));
    let r = renderList(empty);
    expect(texts(r)).toEqual(expect.arrayContaining([TX.empty, TX.emptyHint, TX.newTask]));
    r.unmount();
    r = renderList(empty, [{ kind: 'noHost' }]);
    expect(texts(r)).toEqual(expect.arrayContaining([TX.noHost, TX.connectPc]));
    r.unmount();
  });
});

describe('TaskDetail', () => {
  beforeEach(async () => {
    resetTasksStore();
    mockSvc.listTasks.mockResolvedValue({ items: [TASK], caps: { gh: { gitOk: true, ghInstalled: false, ghAuthed: false } } });
    mockSvc.getTask.mockResolvedValue({ task: { ...TASK, prompt: '로그인 폼에 이메일 검증을 넣어 줘' } });
    await refreshHost(5);
  });

  test('요약 — run 칩·상태·결정표의 주 행동(원격 없음 → 로컬 머지)', async () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<TaskDetail host={5} taskId={TASK.id} initialRunId="r_2" onOpenTerminal={() => {}} approvalsFor={() => []} />);
    });
    const t = texts(r);
    expect(t).toContain('로그인 폼 검증');
    expect(t).toContain(`${TX.runN(2)} · codex`);
    expect(t).toContain(TX.stateReviewReady);
    expect(t).toContain(TX.mergeLocal);
    expect(t.some((x) => x.includes(TX.commitsAhead(2)))).toBe(true);
    r.unmount();
  });

  test('리뷰 모드 — diff 를 불러와 [코멘트 에이전트에게 보내기] 바', async () => {
    mockSvc.getDiff.mockResolvedValue({
      taskId: TASK.id, runId: 'r_2', base: 'main', baseSha: 'x', head: 'y', mergeBase: 'x', uncommitted: false,
      files: [{ path: 'src/a.ts', status: 'M', additions: 1, deletions: 1, diffText: '@@ -1,2 +1,2 @@\n-a\n+b\n c\n' }],
      totals: { files: 1, additions: 1, deletions: 1 }, truncatedTotal: false,
    });
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(<TaskDetail host={5} taskId={TASK.id} initialRunId="r_2" initialView="review" onOpenTerminal={() => {}} approvalsFor={() => []} />);
    });
    await act(async () => { await Promise.resolve(); });
    expect(mockSvc.getDiff).toHaveBeenCalledWith(5, TASK.id, 'r_2');
    expect(texts(r)).toContain(TX.sendComments);
    r.unmount();
  });
});
