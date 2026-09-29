// agentStateStore.listAgentSnaps — 작업 현황판 모델의 입력(설계 §5.1).
//  host 는 숫자로 정규화하고 **모름 = 0**, 프레임의 since(상태 전이 시각)는 보존, 스테일은 뺀다.
import {
  applyAgentState, listAgentSnaps, resetAgentStates, AGENT_STATE_STALE_MS, agentSnapOf,
} from '../src/services/agentStateStore';

beforeEach(() => { resetAgentStates(); });

const frame = (p: Record<string, unknown>) => ({
  cwd: '.codingpt/worktrees/codingpt-x2m1qa-1', win: 1234567, state: 'permission', agent: 'claude',
  version: 3, at: 1790000000000, source: 'hook', since: 1789999990000, hostDeviceId: 12, ...p,
});

test('host 정규화 — 프레임에 hostDeviceId 가 없으면 0', () => {
  applyAgentState(frame({}), 1000);
  applyAgentState(frame({ win: 5, hostDeviceId: undefined }), 1000);
  const list = listAgentSnaps(1000).sort((a, b) => a.win - b.win);
  expect(list.map((s) => s.host)).toEqual([0, 12]);
});

test('since 보존(구 데몬은 null)', () => {
  applyAgentState(frame({}), 1000);
  applyAgentState(frame({ win: 9, since: undefined }), 1000);
  const byWin = Object.fromEntries(listAgentSnaps(1000).map((s) => [s.win, s.since]));
  expect(byWin[1234567]).toBe(1789999990000);
  expect(byWin[9]).toBeNull();
  expect(agentSnapOf(12, frame({}).cwd as string, 1234567, 1000)?.since).toBe(1789999990000);
});

test('스테일(15분)·gone 은 목록에 없다', () => {
  applyAgentState(frame({}), 1000);
  expect(listAgentSnaps(1000 + AGENT_STATE_STALE_MS + 1)).toEqual([]);
  applyAgentState(frame({ state: 'gone', version: 4, at: 1790000001000 }), 2000);
  expect(listAgentSnaps(2000)).toEqual([]);
});

test('모양 — 모델 입력 필드만', () => {
  applyAgentState(frame({ state: 'working' }), 5000);
  expect(listAgentSnaps(5000)).toEqual([{
    host: 12, cwd: '.codingpt/worktrees/codingpt-x2m1qa-1', win: 1234567, agent: 'claude', state: 'working', at: 5000, since: 1789999990000,
  }]);
});
