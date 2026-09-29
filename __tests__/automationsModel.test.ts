// 자동화 목록 모델(automation-design.md §8.2) + 진행 현황 PR 후속 사유(§8.1).
//
// 두 층:
//  1) 규칙별 케이스 — 픽스처 없이도 돈다.
//  2) 공유 픽스처 docs/fixtures/automation/auto-*.json — PC automations-model.js 와 같은 입력에 같은 출력.
//     모양 `{ input, expect: { rows:[{id,group,dot,attention,triggerKey}], counts } }` = summarizeAuto().
import fs from 'fs';
import path from 'path';
import { buildAutomationsModel, summarizeAuto, triggerKeyOf, type AutoInput } from '../src/workspace/automations/automationsModel';
import { buildTasksModel, type ModelInput } from '../src/workspace/tasks/tasksModel';
import type { AutomationLite } from '../src/services/automationService';
import type { TaskLite, RunLite } from '../src/services/taskService';
import { FIXTURES_DIR } from './fixtures';

const AUTO_DIR = process.env.CPT_AUTO_FIXTURES || path.resolve(FIXTURES_DIR, '../automation');
const autoFixtures: string[] = (() => {
  try { return fs.readdirSync(AUTO_DIR).filter((f) => /^auto-.*\.json$/.test(f)).sort(); } catch (_) { return []; }
})();

const NOW = 1790000000000;
function mk(p: Partial<AutomationLite> & { id: string }): AutomationLite {
  return {
    v: 1, name: p.id, enabled: true, paused: false, pausedReason: null,
    createdBy: { kind: 'agent', agent: 'claude' },
    trigger: { type: 'schedule', cron: '0 9 * * *', tz: 'Asia/Seoul' },
    actions: [{ type: 'notify', title: 'x' }],
    guards: { maxRunsPerDay: 10, maxConcurrent: 1, cooldownMs: 300000 },
    state: { nextRunAt: NOW + 1000, lastRunAt: null, runsToday: 0, inflight: 0, consecutiveFailures: 0, lastResult: null },
    createdAt: NOW - 1000, updatedAt: NOW - 1000,
    ...p,
  } as AutomationLite;
}
const inp = (items: AutomationLite[], p: Partial<AutoInput> = {}): AutoInput => ({ now: NOW, items, paused: false, hostOnline: true, ...p });

describe('automationsModel — 규칙', () => {
  test('트리거 키: cron → trigSchedule, at → trigOnce, 나머지 표 그대로', () => {
    expect(triggerKeyOf({ type: 'schedule', cron: '0 9 * * *' })).toBe('trigSchedule');
    expect(triggerKeyOf({ type: 'schedule', at: NOW })).toBe('trigOnce');
    expect(triggerKeyOf({ type: 'git.commits', repo: 'a' })).toBe('trigCommits');
    expect(triggerKeyOf({ type: 'github.issues', repo: 'a' })).toBe('trigIssues');
    expect(triggerKeyOf({ type: 'pr.ci_failed', repo: null })).toBe('trigCi');
    expect(triggerKeyOf({ type: 'pr.review_comments', repo: null })).toBe('trigReviews');
    expect(triggerKeyOf({ type: 'task.event', event: 'merged', repo: null })).toBe('trigTaskEvent');
  });
  test('주의 = 에러/상한 멈춤 ‖ 마지막 실패 ‖ 연속 실패 — dot error 가 spin 보다 먼저', () => {
    const m = buildAutomationsModel(inp([
      mk({ id: 'a_fail', state: { nextRunAt: null, lastRunAt: null, runsToday: 0, inflight: 1, consecutiveFailures: 0, lastResult: { firingId: 'f', ok: false, code: 'TASK_LIMIT', at: NOW } } }),
      mk({ id: 'a_run', state: { nextRunAt: NOW + 5, lastRunAt: null, runsToday: 0, inflight: 1, consecutiveFailures: 0, lastResult: null } }),
      mk({ id: 'a_lim', pausedReason: 'limit' }),
    ]));
    const by = Object.fromEntries(m.rows.map((r) => [r.id, r]));
    expect(by.a_fail.dot).toBe('error');
    expect(by.a_run.dot).toBe('spin');
    expect(by.a_lim.attention).toBe(true);
    expect(m.counts.attention).toBe(2);
  });
  test('그룹 = paused ‖ !enabled. 전체 일시정지·오프라인은 행을 바꾸지 않는다', () => {
    const items = [mk({ id: 'a1' }), mk({ id: 'a2', enabled: false }), mk({ id: 'a3', paused: true, pausedReason: 'user' })];
    const a = summarizeAuto(buildAutomationsModel(inp(items)));
    const b = summarizeAuto(buildAutomationsModel(inp(items, { paused: true, hostOnline: false })));
    expect(a).toEqual(b);
    expect(a.counts).toEqual({ total: 3, paused: 2, attention: 0 });
  });
  test('정렬: 활성 = 주의 먼저 → nextRunAt 오름(null 뒤) → 이름 코드포인트 · 일시정지 = updatedAt 내림', () => {
    const m = buildAutomationsModel(inp([
      mk({ id: 'n1', name: 'b', state: { nextRunAt: null, lastRunAt: null, runsToday: 0, inflight: 0, consecutiveFailures: 0, lastResult: null } }),
      mk({ id: 'n2', name: 'a', state: { nextRunAt: null, lastRunAt: null, runsToday: 0, inflight: 0, consecutiveFailures: 0, lastResult: null } }),
      mk({ id: 's2', name: 'z', state: { nextRunAt: NOW + 20, lastRunAt: null, runsToday: 0, inflight: 0, consecutiveFailures: 0, lastResult: null } }),
      mk({ id: 's1', name: 'y', state: { nextRunAt: NOW + 10, lastRunAt: null, runsToday: 0, inflight: 0, consecutiveFailures: 2, lastResult: null } }),
      mk({ id: 'p1', paused: true, updatedAt: NOW - 50 }),
      mk({ id: 'p2', paused: true, updatedAt: NOW - 10 }),
    ]));
    expect(m.rows.map((r) => r.id)).toEqual(['s1', 's2', 'n2', 'n1', 'p2', 'p1']);
  });
  test('트리거 변수 — labels 는 쉼표, repo:null 은 그대로 null', () => {
    const m = buildAutomationsModel(inp([
      mk({ id: 'i', trigger: { type: 'github.issues', repo: 'work/a', labels: ['bug', 'p1'] } }),
      mk({ id: 'c', trigger: { type: 'pr.ci_failed', repo: null } }),
    ]));
    const by = Object.fromEntries(m.rows.map((r) => [r.id, r]));
    expect(by.i.triggerVars.labels).toBe('bug, p1');
    expect(by.c.triggerVars.repo).toBeNull();
  });
});

describe('automationsModel — 공유 픽스처(auto-*.json)', () => {
  if (!autoFixtures.length) {
    test.skip('자동화 픽스처 없음 — 교차 대조 skip', () => {});
    return;
  }
  test('픽스처 2개 이상(목록·빈 목록)', () => { expect(autoFixtures.length).toBeGreaterThanOrEqual(2); });
  for (const f of autoFixtures) {
    test(f, () => {
      const fx = JSON.parse(fs.readFileSync(path.join(AUTO_DIR, f), 'utf8'));
      expect(summarizeAuto(buildAutomationsModel(fx.input))).toEqual(fx.expect);
    });
  }
});

// ── 진행 현황 PR 후속 사유(§8.1) — 공유 픽스처 model-12/13 은 tasksModel.test 가 자동으로 집는다. 여기는 규칙 한 줄씩. ──
function run(p: Partial<RunLite> = {}): RunLite {
  return {
    id: 'r_1', idx: 1, agent: 'claude', branch: 'cpt/a-1', dir: 'w/1', cwd: 'w/1', workspaceId: 'ws_1', tid: 11,
    state: 'review_ready', terminalAlive: true, agentGone: false, trustPending: false,
    diff: null, commits: null, pr: null, op: null, lastOp: null, error: null,
    createdAt: NOW - 9000, updatedAt: NOW - 5000, lastActivityAt: NOW - 5000, ...p,
  } as RunLite;
}
const task = (r: RunLite, p: Partial<TaskLite> = {}): TaskLite => ({
  id: 't_1', title: 'x', repo: { path: 'w', name: 'w', github: { owner: 'o', repo: 'r' } }, base: 'main', workspaceId: 'ws', state: 'open',
  winnerRunId: null, error: null, createdAt: NOW - 9000, updatedAt: NOW - 5000, closedAt: null, runs: [r], ...p,
}) as TaskLite;
const tin = (r: RunLite, extra: Partial<ModelInput> = {}): ModelInput => ({
  now: NOW, hosts: [{ id: 7, name: 'M', online: true, caps: [] }], tasks: [{ host: 7, items: [task(r)] }],
  agentSnaps: [], approvals: [], unread: [], terminalsFallback: [], workspaces: [], ...extra,
});
const CI = { ci: { status: 'failing' as const, detectedAt: NOW - 3000, failed: [{ name: 'lint' }] } };
const RV = { reviews: { detectedAt: NOW - 2000, pending: [{ id: 1, kind: 'review_comment' as const, author: 'a', bodyHead: 'x' }] } };

describe('tasksModel — PR 후속 사유', () => {
  test('검사 실패 → 입력 대기 ciFailed, waitSince = detectedAt', () => {
    const m = buildTasksModel(tin(run({ followup: CI })));
    expect(m.rows[0].group).toBe('needs_input');
    expect(m.rows[0].reason).toBe('ciFailed');
    expect(m.rows[0].waitSince).toBe(NOW - 3000);
  });
  test('[무시](dismissedAt) 는 상태가 남아도 사유를 끈다 → 리뷰 준비', () => {
    const m = buildTasksModel(tin(run({ followup: { ci: { ...CI.ci, dismissedAt: NOW - 100 } } })));
    expect(m.rows[0].group).toBe('review_ready');
  });
  test('라이브 working 이면 후속 사유 무시(이미 고치는 중)', () => {
    const snaps = [{ host: 7, cwd: 'w/1', win: 11, agent: 'claude', state: 'working' as const, at: NOW, since: null }];
    expect(buildTasksModel(tin(run({ followup: { ...CI, ...RV } }), { agentSnaps: snaps })).rows[0].group).toBe('working');
  });
  test('검사 실패가 리뷰 코멘트보다 먼저 · 리뷰 코멘트만이면 reviewComments(waitSince = reviews.detectedAt)', () => {
    expect(buildTasksModel(tin(run({ followup: { ...CI, ...RV } }))).rows[0].reason).toBe('ciFailed');
    const m = buildTasksModel(tin(run({ followup: RV })));
    expect(m.rows[0].reason).toBe('reviewComments');
    expect(m.rows[0].waitSince).toBe(NOW - 2000);
  });
  test('리뷰 코멘트가 실패 op 보다 먼저', () => {
    const lastOp = { opId: 'o1', kind: 'push' as const, ok: false, code: 'PUSH_REJECTED' };
    expect(buildTasksModel(tin(run({ followup: RV, lastOp }))).rows[0].reason).toBe('reviewComments');
  });
});
