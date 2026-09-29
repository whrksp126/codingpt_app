// automationService 전송 규칙(automation-design.md §0-4·§7.1) — 폴백 규칙은 taskService 와 **같아야** 한다:
//  · 봉인 성공이면 평문 0회 · 구조적 미지원(501/404/E2EE_NO_ENVELOPE/보내기 전)만 평문 `/api/daemon/auto`
//  · 타임아웃·도메인 code 는 throw(평문 재전송 0회 — 이중 실행 방지) · policy required 면 구조적 미지원이어도 평문 금지
//  · 읽기만 전송 실패 시 1회 재시도 · caps = 러너 ∩ 서버(킬스위치)
//  + 자동화 에러 code → 문구(AUTO_ERROR_KEY) 가 전부 사전에 있다.
const mockApi = { apiRequest: jest.fn() };
jest.mock('../src/utils/api', () => ({ apiRequest: (...a: any[]) => mockApi.apiRequest(...a) }));
const mockE2ee = {
  rpcAvailable: jest.fn(() => true),
  gateReason: jest.fn(() => null as string | null),
  sealedRpc: jest.fn(),
  getStatus: jest.fn(() => ({ policy: 'preferred' })),
};
jest.mock('../src/services/e2ee', () => ({ __esModule: true, default: mockE2ee }));
const mockDaemon = { getStatus: jest.fn() };
jest.mock('../src/services/daemonService', () => ({ __esModule: true, default: { getStatus: (...a: any[]) => mockDaemon.getStatus(...a) } }));

import { autoRpc, AUTO_RPC_TIMEOUTS, hostSupportsAuto, hostSupportsDispatch, hostSupportsPower, listAutomations, runAutomationNow } from '../src/services/automationService';
import { refreshHostCaps, _resetHostCapsForTest, TaskRpcError, TASK_RPC_TIMEOUTS } from '../src/services/taskService';
import { AUTO_ERROR_KEY, ERROR_KEY, TASKS_TEXT, taskErrorText } from '../src/text/tasks';
import { AUTO_TEXT } from '../src/text/automations';

class FakeE2eeError extends Error { constructor(m: string, public status: number, public code: string) { super(m); } }

beforeEach(() => {
  mockApi.apiRequest.mockReset();
  mockE2ee.rpcAvailable.mockReset().mockReturnValue(true);
  mockE2ee.gateReason.mockReset().mockReturnValue(null);
  mockE2ee.sealedRpc.mockReset();
  mockE2ee.getStatus.mockReset().mockReturnValue({ policy: 'preferred' });
});

describe('autoRpc — 폴백 규칙(taskRpc 와 동일)', () => {
  test('봉인 성공 → 평문 0회', async () => {
    mockE2ee.sealedRpc.mockResolvedValue({ items: [], paused: false });
    await expect(listAutomations(5)).resolves.toEqual({ items: [], paused: false });
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
    expect(mockE2ee.sealedRpc).toHaveBeenCalledWith('auto.list', {}, { hostDeviceId: 5, timeoutMs: 15000 });
  });
  test('구조적 미지원(501) → 평문 /api/daemon/auto 로 한 번', async () => {
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('x', 501, 'UNSUPPORTED'));
    mockApi.apiRequest.mockResolvedValue({ success: true, data: { accepted: true, firingId: 'f_1' } });
    await expect(runAutomationNow(5, 'a_1', 'op-1')).resolves.toEqual({ accepted: true, firingId: 'f_1' });
    expect(mockApi.apiRequest).toHaveBeenCalledTimes(1);
    const [url, opts] = mockApi.apiRequest.mock.calls[0];
    expect(url).toBe('/api/daemon/auto');
    expect(opts.body).toEqual({ method: 'auto.runNow', params: { opId: 'op-1', id: 'a_1' }, hostDeviceId: 5 });
    expect(opts.timeoutMs).toBe(15000 + 5000);
  });
  test('변이 타임아웃 → throw, 평문 재전송 0회', async () => {
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('t', 504, 'TIMEOUT'));
    await expect(autoRpc('auto.pause', { id: 'a' }, 5)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
    expect(mockE2ee.sealedRpc).toHaveBeenCalledTimes(1); // 변이는 재시도하지 않는다
  });
  test('도메인 code(AUTO_LOOP) 는 그대로 — 평문 0회', async () => {
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('loop', 200, 'AUTO_LOOP'));
    const err = await autoRpc('auto.create', {}, 5).catch((e) => e);
    expect(err).toBeInstanceOf(TaskRpcError);
    expect(err.code).toBe('AUTO_LOOP');
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
  });
  test('policy required → 구조적 미지원이어도 평문 금지', async () => {
    mockE2ee.getStatus.mockReturnValue({ policy: 'required' });
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('x', 501, 'UNSUPPORTED'));
    await expect(autoRpc('dispatch.catalog', {}, 5)).rejects.toBeInstanceOf(TaskRpcError);
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
  });
  test('읽기(dispatch.catalog)만 전송 실패 시 1회 재시도, 타임아웃 30s', async () => {
    mockE2ee.sealedRpc.mockRejectedValueOnce(new FakeE2eeError('n', 0, 'UNKNOWN')).mockResolvedValueOnce({ host: 5, workspaces: [] });
    await expect(autoRpc('dispatch.catalog', {}, 5)).resolves.toEqual({ host: 5, workspaces: [] });
    expect(mockE2ee.sealedRpc).toHaveBeenCalledTimes(2);
    expect(mockE2ee.sealedRpc.mock.calls[0][2]).toEqual({ hostDeviceId: 5, timeoutMs: 30000 });
  });
  test('평문 404(구 back 에 /auto 라우트 없음) → SERVER_NEEDS_UPDATE', async () => {
    mockE2ee.rpcAvailable.mockReturnValue(false);
    mockApi.apiRequest.mockResolvedValue({ success: false, status: 404 });
    await expect(autoRpc('auto.list', {}, 5)).rejects.toMatchObject({ code: 'SERVER_NEEDS_UPDATE' });
  });
  test('타임아웃 표 = §7.1 AUTO_RPC_OK · PR 후속 2개는 TASK 표에', () => {
    expect(Object.keys(AUTO_RPC_TIMEOUTS).sort()).toEqual([
      'auto.create', 'auto.get', 'auto.list', 'auto.log', 'auto.pause', 'auto.pauseAll', 'auto.remove', 'auto.resume', 'auto.runNow',
      'auto.update', 'auto.validate', 'dispatch.catalog', 'dispatch.get', 'dispatch.plan', 'power.set', 'power.setup', 'power.status',
    ]);
    expect(AUTO_RPC_TIMEOUTS['power.event' as string]).toBeUndefined(); // 로컬 전용(§6.4)
    expect(TASK_RPC_TIMEOUTS['task.run.fix']).toBe(15000);
    expect(TASK_RPC_TIMEOUTS['task.run.followup.dismiss']).toBe(15000);
  });
});

describe('caps 게이팅 — 러너 ∩ 서버', () => {
  beforeEach(() => _resetHostCapsForTest());
  test('모름(조회 전) = null', () => {
    expect(hostSupportsAuto(5)).toBeNull();
  });
  test('러너가 광고하고 서버가 켜면 true, 서버 킬스위치면 false, 구 데몬이면 false', async () => {
    mockDaemon.getStatus.mockResolvedValue({
      serverCaps: ['task.v1', 'auto.v1', 'power.v1'],
      runners: [
        { kind: 'local', deviceId: 5, caps: ['task.v1', 'auto.v1', 'dispatch.v1', 'power.v1'] },
        { kind: 'local', deviceId: 6, caps: ['task.v1'] },
      ],
    });
    await refreshHostCaps();
    expect(hostSupportsAuto(5)).toBe(true);
    expect(hostSupportsPower(5)).toBe(true);
    expect(hostSupportsDispatch(5)).toBe(false); // 서버가 dispatch.v1 을 껐다
    expect(hostSupportsAuto(6)).toBe(false);
  });
});

describe('자동화 에러 문구', () => {
  test('AUTO_ERROR_KEY 의 모든 값이 문구 사전(TASKS 또는 AUTO)의 필드', () => {
    const T = TASKS_TEXT.ko as Record<string, unknown>;
    const A = AUTO_TEXT.ko as Record<string, unknown>;
    for (const [code, field] of Object.entries(AUTO_ERROR_KEY)) expect([code, field in T || field in A]).toEqual([code, true]);
  });
  test('작업 ERROR_KEY 와 겹치지 않는다(두 표는 각자의 픽스처와 대조된다)', () => {
    for (const k of Object.keys(AUTO_ERROR_KEY)) expect([k, k in ERROR_KEY]).toEqual([k, false]);
  });
  test('code → 문구', () => {
    expect(taskErrorText(TASKS_TEXT.ko, 'AUTO_LOOP')).toBe(AUTO_TEXT.ko.errAutoLoop);
    expect(taskErrorText(TASKS_TEXT.ko, 'POWER_NO_GUI')).toBe(AUTO_TEXT.ko.setupRemoteHint);
    expect(taskErrorText(TASKS_TEXT.ko, 'FOLLOWUP_NOTHING')).toBe(TASKS_TEXT.ko.errFollowupNothing);
    expect(taskErrorText(TASKS_TEXT.ko, 'DISPATCH_DISABLED')).toBe(TASKS_TEXT.ko.errTasksDisabled);
  });
});
