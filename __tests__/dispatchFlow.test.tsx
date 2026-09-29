/**
 * 한 줄 지시(automation-design.md §3) — 오케스트레이션 + 플랜 카드.
 *
 * 고정하는 것:
 *  · 카탈로그 2대 중 1대 실패 → 그 PC 는 빼고 계획, 카드 위에 "○○ 정보를 가져오지 못했어요" 한 줄.
 *  · 플래너 = 활성 PC(카탈로그가 성공한 PC 중) — 아니면 첫 PC.
 *  · dispatch.get 2s 폴링 · state failed 는 error.code 로 throw · 120s 초과 PLANNER_TIMEOUT.
 *  · 폴백 플랜이면 `간단 매칭` pill + 사유 문구. 저장소 없는 항목은 [시작] 불가.
 *  · [시작] = task.create(origin dispatch) 순서대로 → auto.create(createdBy dispatch), 실패는 모아서 돌려준다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/animations/haptics', () => ({ haptic: { keyPress: () => {}, select: () => {} } }));
jest.mock('../src/components/keyboard/KeyAssist', () => ({ KeyAssistOverlay: () => null, collapseKeyAssist: () => {} }));

import {
  collectCatalogs, pickPlannerHost, runPlan, toEditablePlan, canStart, startEditablePlan, pickWorkspace, onDispatchChanged,
  _resetDispatchForTest, type DispatchDeps,
} from '../src/workspace/dispatch/dispatchFlow';
import PlanCard from '../src/workspace/dispatch/PlanCard';
import type { HostCatalog, Plan } from '../src/services/dispatchService';
import { tx } from '../src/text';
import { AUTO_TEXT } from '../src/text/automations';

const TA = tx(AUTO_TEXT);

const CAT_A: HostCatalog = {
  host: 12, hostName: 'MacBook Pro', generatedAt: 1,
  agents: [{ id: 'claude', installed: true, loggedIn: true }, { id: 'codex', installed: true, loggedIn: null }],
  workspaces: [
    { id: 'ws_abc', name: 'codingpt', path: 'work/codingpt', branch: 'main', topDirs: ['codingpt_back'] },
    { id: 'ws_blog', name: 'blog', path: 'work/blog', branch: 'gh-pages' },
  ],
};
const PLAN_CLI: Plan = {
  v: 1, planner: { agent: 'claude', mode: 'cli', durationMs: 8000, fallbackReason: null },
  summary: '결제 재시도',
  tasks: [{ host: 12, workspaceId: 'ws_abc', repo: 'work/codingpt', subdir: 'codingpt_back', base: 'main', title: '결제 실패 재시도', prompt: 'p', agents: [{ id: 'claude', count: 1 }], why: 'README' }],
  automations: [{ host: 12, draft: { v: 1, name: '매일 bug', trigger: { type: 'schedule', cron: '0 9 * * *', tz: 'Asia/Seoul' }, actions: [{ type: 'notify', title: 'x' }] } as any, why: '매일' }],
  questions: [],
};
const PLAN_FALLBACK: Plan = {
  v: 1, planner: { agent: null, mode: 'fallback', fallbackReason: 'PLANNER_UNAVAILABLE' },
  summary: '', tasks: [{ host: 12, workspaceId: null, repo: null, title: 't', prompt: 'p', agents: [{ id: 'claude', count: 1 }] }],
  automations: [], questions: [],
};

function deps(over: Partial<DispatchDeps> = {}): DispatchDeps & { calls: string[] } {
  const calls: string[] = [];
  let polls = 0;
  return {
    calls,
    getCatalog: jest.fn(async (h: number) => {
      calls.push(`catalog:${h}`);
      if (h === 13) throw Object.assign(new Error('x'), { code: 'TIMEOUT' });
      return CAT_A;
    }),
    startPlan: jest.fn(async (h: number) => { calls.push(`plan:${h}`); return { accepted: true as const, planId: 'p_1', planner: { agent: 'claude' } }; }),
    getPlan: jest.fn(async () => { polls += 1; return polls < 2 ? { planId: 'p_1', state: 'planning' as const } : { planId: 'p_1', state: 'done' as const, plan: PLAN_CLI }; }),
    newOpId: () => 'op',
    sleep: async () => {},
    ...over,
  };
}

beforeEach(() => _resetDispatchForTest());

describe('오케스트레이션', () => {
  test('카탈로그 2대 중 1대 실패 → 성공한 PC 만, 실패 목록에 이름', async () => {
    const d = deps();
    const progress: string[] = [];
    const r = await collectCatalogs([{ id: 12, name: 'MacBook Pro' }, { id: 13, name: 'Mac mini' }], d, (a, b) => progress.push(`${a}/${b}`));
    expect(r.catalogs.map((c) => c.host)).toEqual([12]);
    expect(r.failed).toEqual([{ host: 13, name: 'Mac mini', code: 'TIMEOUT' }]);
    expect(progress[0]).toBe('0/2');
    expect(progress[progress.length - 1]).toBe('2/2');
  });
  test('플래너 PC = 활성 PC, 없으면 첫 PC', () => {
    expect(pickPlannerHost([12, 13], 13)).toBe(13);
    expect(pickPlannerHost([12, 13], 99)).toBe(12);
    expect(pickPlannerHost([], 12)).toBeNull();
  });
  test('runPlan — 활성 PC(13) 카탈로그가 실패하면 성공한 12 가 계획, 폴링 끝에 done', async () => {
    const d = deps();
    const phases: string[] = [];
    const r = await runPlan({
      instruction: '결제 재시도 넣어줘', hosts: [{ id: 12, name: 'MacBook Pro' }, { id: 13, name: 'Mac mini' }], activeId: 13, deps: d,
      onPhase: (p) => phases.push(p.kind),
    });
    expect(r.plannerHost).toBe(12);
    expect(r.failed.map((f) => f.host)).toEqual([13]);
    expect(r.plan.planner.mode).toBe('cli');
    expect(d.calls).toContain('plan:12');
    expect(phases).toContain('collecting');
    expect(phases[phases.length - 1]).toBe('planning');
    expect((d.startPlan as jest.Mock).mock.calls[0][1].catalog.hosts.map((c: HostCatalog) => c.host)).toEqual([12]);
  });
  test('대상 0대 → NO_HOST · 전부 실패 → CATALOG_FAILED · state failed → 그 code', async () => {
    await expect(runPlan({ instruction: 'x', hosts: [], activeId: null, deps: deps() })).rejects.toMatchObject({ code: 'NO_HOST' });
    await expect(runPlan({ instruction: 'x', hosts: [{ id: 13, name: 'm' }], activeId: null, deps: deps() })).rejects.toMatchObject({ code: 'CATALOG_FAILED' });
    const d = deps({ getPlan: async () => ({ planId: 'p_1', state: 'failed', error: { code: 'DISPATCH_DISABLED' } }) });
    await expect(runPlan({ instruction: 'x', hosts: [{ id: 12, name: 'a' }], activeId: 12, deps: d })).rejects.toMatchObject({ code: 'DISPATCH_DISABLED' });
  });
  test('120s 넘게 planning 이면 PLANNER_TIMEOUT', async () => {
    let t = 0;
    const d = deps({ getPlan: async () => ({ planId: 'p_1', state: 'planning' }), now: () => { t += 30000; return t; } });
    await expect(runPlan({ instruction: 'x', hosts: [{ id: 12, name: 'a' }], activeId: 12, deps: d })).rejects.toMatchObject({ code: 'PLANNER_TIMEOUT' });
  });
  test('dispatch.changed 가 대기를 깨운다(2s 를 기다리지 않는다)', async () => {
    let polls = 0;
    const d = deps({
      sleep: () => new Promise<void>(() => {}), // 영원히 — 깨우기가 없으면 끝나지 않는다
      getPlan: async () => { polls += 1; if (polls === 1) setTimeout(() => onDispatchChanged({ host: 12, planId: 'p_1' }), 0); return polls < 2 ? { planId: 'p_1', state: 'planning' } : { planId: 'p_1', state: 'done', plan: PLAN_CLI }; },
    });
    const r = await runPlan({ instruction: 'x', hosts: [{ id: 12, name: 'a' }], activeId: 12, deps: d });
    expect(r.plan).toBe(PLAN_CLI);
    expect(polls).toBe(2);
  });
});

describe('편집 모델 · [시작]', () => {
  test('카탈로그의 워크스페이스로 채우고, 모르는 워크스페이스는 null → [시작] 불가 → 고르면 가능', () => {
    const ep = toEditablePlan(PLAN_CLI, [CAT_A]);
    expect(ep.tasks[0]).toMatchObject({ workspaceId: 'ws_abc', repo: 'work/codingpt', subdir: 'codingpt_back', base: 'main' });
    expect(canStart(ep)).toBe(true);
    const fb = toEditablePlan(PLAN_FALLBACK, [CAT_A]);
    expect(fb.tasks[0].workspaceId).toBeNull();
    expect(canStart(fb)).toBe(false);
    const fixed = { ...fb, tasks: [pickWorkspace(fb.tasks[0], 12, 'ws_blog', [CAT_A])] };
    expect(fixed.tasks[0]).toMatchObject({ workspaceId: 'ws_blog', repo: 'work/blog', base: 'gh-pages' });
    expect(canStart(fixed)).toBe(true);
  });
  test('실행 합계 4 초과면 [시작] 불가', () => {
    const ep = toEditablePlan(PLAN_CLI, [CAT_A]);
    ep.tasks[0].agents = [{ id: 'claude', count: 3 }, { id: 'codex', count: 2 }];
    expect(canStart(ep)).toBe(false);
  });
  test('[시작] — task.create(origin dispatch, subdir 결합, 고정 opId) 다음 auto.create(createdBy dispatch). 제외한 자동화는 안 만든다', async () => {
    const ep = toEditablePlan(PLAN_CLI, [CAT_A]);
    const createTask = jest.fn(async () => ({ task: { id: 't_new' } }));
    const createAutomation = jest.fn(async () => ({ automation: { id: 'a_new' } }));
    const r = await startEditablePlan(ep, 'p_1', { createTask, createAutomation, newOpId: () => 'fresh' }, { t0: 'op-fixed' });
    expect(r).toEqual({ tasks: [{ host: 12, taskId: 't_new' }], automations: [{ host: 12, id: 'a_new' }], errors: [] });
    expect(createTask).toHaveBeenCalledWith(12, expect.objectContaining({
      opId: 'op-fixed', repo: 'work/codingpt/codingpt_back', base: 'main', workspaceId: 'ws_abc', origin: { kind: 'dispatch', planId: 'p_1' },
    }));
    expect(createAutomation).toHaveBeenCalledWith(12, PLAN_CLI.automations[0].draft, { kind: 'dispatch', planId: 'p_1', deviceId: 12 });
    const off = { ...ep, automations: ep.automations.map((a) => ({ ...a, include: false })) };
    createAutomation.mockClear();
    await startEditablePlan(off, 'p_1', { createTask, createAutomation, newOpId: () => 'x' });
    expect(createAutomation).not.toHaveBeenCalled();
  });
  test('하나가 실패해도 나머지는 계속, 실패는 모은다', async () => {
    const ep = toEditablePlan(PLAN_CLI, [CAT_A]);
    const r = await startEditablePlan(ep, 'p_1', {
      createTask: async () => { throw Object.assign(new Error('l'), { code: 'TASK_LIMIT' }); },
      createAutomation: async () => ({ automation: { id: 'a_new' } }),
      newOpId: () => 'x',
    });
    expect(r.errors).toEqual([{ key: 't0', code: 'TASK_LIMIT' }]);
    expect(r.automations).toEqual([{ host: 12, id: 'a_new' }]);
  });
});

describe('플랜 카드 렌더', () => {
  const texts = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((n) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.join('') : String(c);
  });
  test('카탈로그 실패 줄 + 폴백 pill + 사유 + 저장소 고르기', () => {
    const fb = toEditablePlan(PLAN_FALLBACK, [CAT_A]);
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      r = ReactTestRenderer.create(<PlanCard plan={PLAN_FALLBACK} ep={fb} onChange={() => {}} catalogs={[CAT_A]}
        failed={[{ host: 13, name: 'Mac mini', code: 'TIMEOUT' }]} now={0} />);
    });
    const t = texts(r);
    expect(t).toContain(TA.catalogFailed('Mac mini'));
    expect(t).toContain(TA.simpleMatch);
    expect(t).toContain(TA.fallbackNoAgent);
    expect(t).toContain(TA.pickRepo);
    act(() => r.unmount());
  });
  test('cli 플랜은 pill 없음 · 자동화 항목(트리거 문장·포함 체크)', () => {
    const ep = toEditablePlan(PLAN_CLI, [CAT_A]);
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => { r = ReactTestRenderer.create(<PlanCard plan={PLAN_CLI} ep={ep} onChange={() => {}} catalogs={[CAT_A]} failed={[]} now={0} />); });
    const t = texts(r);
    expect(t).not.toContain(TA.simpleMatch);
    expect(t).toContain('매일 bug');
    expect(t).toContain(TA.trigSchedule('0 9 * * *', 'Asia/Seoul'));
    expect(t).toContain(TA.planAutomations);
    act(() => r.unmount());
  });
});
