// taskService 전송 규칙(설계 §3.2) — 이 표가 틀리면 **이중 실행**(봉인 타임아웃 뒤 평문 재전송으로
//  worktree 두 번·머지 두 번)이 조용히 생긴다. 그래서 폴백 여부를 경우마다 고정한다.
//  · 구조적 미지원(501·404·SEALED_STRUCTURAL·보내기 전 실패)만 평문으로 간다.
//  · 타임아웃·5xx·네트워크·도메인 code 는 throw, 평문 재전송 0회.
//  · policy='required' 면 구조적 미지원이어도 평문 금지.
//  · 읽기만 전송 실패 시 1회 재시도, 변이는 재시도하지 않는다.
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
// 팩토리는 import 시점에 돈다(위 const 보다 먼저) → 값이 아니라 **지연 참조**로 넘긴다.
jest.mock('../src/services/daemonService', () => ({ __esModule: true, default: { getStatus: (...a: any[]) => mockDaemon.getStatus(...a) } }));

import taskService, {
  taskRpc, isStructuralSealedFailure, TaskRpcError, utf8Bytes, isTaskWorkspace, newOpId,
  refreshHostCaps, hostCaps, hostSupportsTasks, isHostConnected, _resetHostCapsForTest, TASK_RPC_TIMEOUTS,
} from '../src/services/taskService';

class FakeE2eeError extends Error { constructor(m: string, public status: number, public code: string) { super(m); } }

beforeEach(() => {
  mockApi.apiRequest.mockReset();
  mockE2ee.rpcAvailable.mockReset().mockReturnValue(true);
  mockE2ee.gateReason.mockReset().mockReturnValue(null);
  mockE2ee.sealedRpc.mockReset();
  mockE2ee.getStatus.mockReset().mockReturnValue({ policy: 'preferred' });
});

describe('isStructuralSealedFailure', () => {
  test.each([
    [{ status: 501, code: 'UNSUPPORTED' }, true],
    [{ status: 404, code: 'UNSUPPORTED' }, true],
    [{ status: 502, code: 'E2EE_NO_ENVELOPE' }, true],
    [{ status: 502, code: 'E2EE_BAD_METHOD' }, true],
    [{ status: 501, code: 'E2EE_NO_KEY' }, true],
    [{ status: 0, code: 'UNSUPPORTED' }, true],      // 열쇠·난수 없음 — 보내기 전
    [{ status: 0, code: 'EPOCH_GATED' }, true],      // 세대 억제 게이트 — 보내기 전
    [{ status: 0, code: 'UNKNOWN' }, false],         // 네트워크/클라 타임아웃 — 호스트가 실행했을 수 있다
    [{ status: 502, code: 'E2EE_RELAY_FAILED' }, false],
    [{ status: 409, code: 'E2EE_EPOCH_MISMATCH' }, false],
    [{ status: 200, code: 'DECRYPT_FAILED' }, false],
    [{ status: 200, code: 'UNCOMMITTED_CHANGES' }, false],
    [{ status: 500, code: 'TIMEOUT' }, false],
    [{ status: 504, code: 'TIMEOUT' }, false],     // back 봉인 경로의 릴레이 타임아웃(통합 라운드 — 종전엔 501 로 위장)
  ])('%j → %s', (err, want) => { expect(isStructuralSealedFailure(err)).toBe(want); });
});

describe('taskRpc', () => {
  test('봉인 성공 — 평문 0회, 타임아웃 표 값 전달', async () => {
    mockE2ee.sealedRpc.mockResolvedValue({ items: [], caps: { gh: {} } });
    await expect(taskRpc('task.diff', { taskId: 't', runId: 'r' }, 7)).resolves.toEqual({ items: [], caps: { gh: {} } });
    expect(mockE2ee.sealedRpc).toHaveBeenCalledWith('task.diff', { taskId: 't', runId: 'r' }, { hostDeviceId: 7, timeoutMs: 30000 });
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
  });

  test('봉인 501(구 데몬) → 평문 폴백 1회, HTTP 타임아웃 = 표 값 + 5s', async () => {
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('x', 501, 'UNSUPPORTED'));
    mockApi.apiRequest.mockResolvedValue({ success: true, data: { accepted: true, opId: 'o' } });
    await expect(taskRpc('git.push', { opId: 'o', taskId: 't', runId: 'r' }, 7)).resolves.toEqual({ accepted: true, opId: 'o' });
    expect(mockApi.apiRequest).toHaveBeenCalledTimes(1);
    const [url, opts] = mockApi.apiRequest.mock.calls[0];
    expect(url).toBe('/api/daemon/task');
    expect(opts.body).toEqual({ method: 'git.push', params: { opId: 'o', taskId: 't', runId: 'r' }, hostDeviceId: 7 });
    expect(opts.timeoutMs).toBe(TASK_RPC_TIMEOUTS['git.push'] + 5000);
  });

  test('봉인 타임아웃(status 0) — 변이는 평문으로 **가지 않고** 재시도도 없다', async () => {
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('aborted', 0, 'UNKNOWN'));
    await expect(taskRpc('git.pr.merge', { opId: 'o' }, 7)).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(mockE2ee.sealedRpc).toHaveBeenCalledTimes(1);
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
  });

  test('봉인 504 TIMEOUT(서버 릴레이 타임아웃) — 변이는 평문 재전송 0회', async () => {
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('데몬이 응답하지 않습니다(RPC 타임아웃).', 504, 'TIMEOUT'));
    await expect(taskRpc('git.pr.merge', { opId: 'o' }, 7)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(mockE2ee.sealedRpc).toHaveBeenCalledTimes(1);
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
  });

  test('봉인 5xx(릴레이 실패) — 평문 금지', async () => {
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('relay', 502, 'E2EE_RELAY_FAILED'));
    await expect(taskRpc('task.create', { opId: 'o' }, 7)).rejects.toBeInstanceOf(TaskRpcError);
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
  });

  test('도메인 code(호스트가 실행한 실패) — 그대로 throw, 평문 금지', async () => {
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('먼저 커밋', 200, 'UNCOMMITTED_CHANGES'));
    await expect(taskRpc('git.pr.merge', { opId: 'o' }, 7)).rejects.toMatchObject({ code: 'UNCOMMITTED_CHANGES' });
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
  });

  test("policy='required' — 구조적 미지원이어도 평문 금지", async () => {
    mockE2ee.getStatus.mockReturnValue({ policy: 'required' });
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('x', 501, 'UNSUPPORTED'));
    await expect(taskRpc('task.list', {}, 7)).rejects.toBeInstanceOf(TaskRpcError);
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
  });

  test('봉인 불가 + 게이트 사유 있음(required) → 평문 없이 throw', async () => {
    mockE2ee.rpcAvailable.mockReturnValue(false);
    mockE2ee.gateReason.mockReturnValue('승인 대기 중');
    await expect(taskRpc('task.list', {}, 7)).rejects.toMatchObject({ code: 'E2EE_REQUIRED' });
    expect(mockApi.apiRequest).not.toHaveBeenCalled();
  });

  test('봉인 불가(열쇠 없음, preferred) → 곧장 평문', async () => {
    mockE2ee.rpcAvailable.mockReturnValue(false);
    mockApi.apiRequest.mockResolvedValue({ success: true, data: { items: [] } });
    await expect(taskRpc('task.list', {}, 7)).resolves.toEqual({ items: [] });
    expect(mockE2ee.sealedRpc).not.toHaveBeenCalled();
  });

  test('평문 실패 code 매핑 — detail.code / 409 DAEMON_OFFLINE / 404 SERVER_NEEDS_UPDATE', async () => {
    mockE2ee.rpcAvailable.mockReturnValue(false);
    mockApi.apiRequest.mockResolvedValueOnce({ success: false, error: 'x', code: 'NOT_GITHUB', status: 500 });
    await expect(taskRpc('git.pr.create', {}, 7)).rejects.toMatchObject({ code: 'NOT_GITHUB', status: 500 });
    mockApi.apiRequest.mockResolvedValueOnce({ success: false, error: 'offline', status: 409 });
    await expect(taskRpc('git.push', {}, 7)).rejects.toMatchObject({ code: 'DAEMON_OFFLINE' });
    mockApi.apiRequest.mockResolvedValueOnce({ success: false, error: 'not found', status: 404 });
    await expect(taskRpc('git.push', {}, 7)).rejects.toMatchObject({ code: 'SERVER_NEEDS_UPDATE' });
  });

  test('읽기는 전송 실패(TIMEOUT)에서 1회 재시도, 변이는 안 한다', async () => {
    mockE2ee.rpcAvailable.mockReturnValue(false);
    mockApi.apiRequest
      .mockResolvedValueOnce({ success: false, error: 't', code: 'TIMEOUT', status: 500 })
      .mockResolvedValueOnce({ success: true, data: { items: [1] } });
    await expect(taskRpc('task.list', {}, 7)).resolves.toEqual({ items: [1] });
    expect(mockApi.apiRequest).toHaveBeenCalledTimes(2);

    mockApi.apiRequest.mockReset().mockResolvedValue({ success: false, error: 't', code: 'TIMEOUT', status: 500 });
    await expect(taskRpc('git.commit', { opId: 'o' }, 7)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(mockApi.apiRequest).toHaveBeenCalledTimes(1);
  });

  test('읽기도 도메인 code 에서는 재시도하지 않는다', async () => {
    mockE2ee.sealedRpc.mockRejectedValue(new FakeE2eeError('없음', 200, 'TASK_NOT_FOUND'));
    await expect(taskRpc('task.get', { taskId: 'x' }, 7)).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    expect(mockE2ee.sealedRpc).toHaveBeenCalledTimes(1);
  });

  test('변이 래퍼는 opId 를 싣는다(멱등 키)', async () => {
    mockE2ee.sealedRpc.mockResolvedValue({ accepted: true });
    await taskService.mergeLocal(7, 't', 'r', 'merge', true, 'fixed-op');
    expect(mockE2ee.sealedRpc.mock.calls[0][1]).toEqual({ opId: 'fixed-op', taskId: 't', runId: 'r', method: 'merge', discardOthers: true });
    await taskService.discardTask(7, 't');
    expect(typeof mockE2ee.sealedRpc.mock.calls[1][1].opId).toBe('string');
    expect(mockE2ee.sealedRpc.mock.calls[1][1]).not.toHaveProperty('runId');
  });
});

describe('hostCaps — GET /status runners[].caps 가 유일한 출처(설계 §2.3)', () => {
  beforeEach(() => _resetHostCapsForTest());
  test('모름은 null, 조회 뒤 로컬 러너만', async () => {
    expect(hostCaps(7)).toBeNull();
    expect(hostSupportsTasks(7)).toBeNull();
    mockDaemon.getStatus.mockResolvedValue({ runners: [
      { deviceId: 7, kind: 'local', caps: ['caps.v1', 'task.v1'] },
      { deviceId: 8, kind: 'local', caps: ['caps.v1'] },
      { deviceId: 9, kind: 'cloud', caps: ['task.v1'] },
    ] });
    await refreshHostCaps();
    expect(hostSupportsTasks(7)).toBe(true);
    expect(hostSupportsTasks(8)).toBe(false);
    expect(hostCaps(9)).toBeNull();
    expect(isHostConnected(7)).toBe(true);
    expect(isHostConnected(9)).toBe(false);
  });
  test('서버 킬스위치 — serverCaps 에 task.v1 이 없으면 러너가 광고해도 false(교집합)', async () => {
    mockDaemon.getStatus.mockResolvedValueOnce({ serverCaps: ['agentstate.v1'], runners: [{ deviceId: 7, kind: 'local', caps: ['task.v1'] }] });
    await refreshHostCaps();
    expect(hostSupportsTasks(7)).toBe(false);
    mockDaemon.getStatus.mockResolvedValueOnce({ serverCaps: ['task.v1'], runners: [{ deviceId: 7, kind: 'local', caps: ['task.v1'] }] });
    await refreshHostCaps();
    expect(hostSupportsTasks(7)).toBe(true);
  });
  test('조회 실패는 이전 값을 지우지 않는다', async () => {
    mockDaemon.getStatus.mockResolvedValueOnce({ runners: [{ deviceId: 7, kind: 'local', caps: ['task.v1'] }] });
    await refreshHostCaps();
    mockDaemon.getStatus.mockRejectedValueOnce(new Error('net'));
    await refreshHostCaps();
    expect(hostSupportsTasks(7)).toBe(true);
  });
});

describe('보조 함수', () => {
  test('utf8Bytes = Buffer.byteLength', () => {
    for (const s of ['', 'abc', '한글', 'emoji \u{1F600}', 'a'.repeat(30000), '가'.repeat(10001)]) {
      expect(utf8Bytes(s)).toBe(Buffer.byteLength(s, 'utf8'));
    }
  });
  test('isTaskWorkspace — .codingpt/worktrees/ 접두만', () => {
    expect(isTaskWorkspace({ localPath: '.codingpt/worktrees/codingpt-x2m1qa-1' })).toBe(true);
    expect(isTaskWorkspace({ localPath: '.codingpt/worktrees/codingpt-x2m1qa-1/codingpt_back' })).toBe(true);
    expect(isTaskWorkspace({ localPath: 'work/.codingpt/worktrees/x' })).toBe(false);
    expect(isTaskWorkspace({ localPath: 'work/codingpt' })).toBe(false);
    expect(isTaskWorkspace({})).toBe(false);
    expect(isTaskWorkspace(null)).toBe(false);
  });
  test('newOpId — UUID v4 모양, 매번 다름', () => {
    const a = newOpId(); const b = newOpId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

// ── 에러 코드 표(설계 §2.13/§9) — 데몬 rpc-errors.json 과 앱 ERROR_KEY 가 같은 집합인가 ──
import { ERROR_KEY, TASKS_TEXT, taskErrorText } from '../src/text/tasks';
import { loadFixture, fixtureTest } from './fixtures';

describe('ERROR_KEY', () => {
  test('모든 값이 문구 사전의 필드다(빈 문구 금지)', () => {
    const T = TASKS_TEXT.ko as Record<string, unknown>;
    for (const [code, field] of Object.entries(ERROR_KEY)) expect([code, field in T]).toEqual([code, true]);
  });
  test('모르는 code 는 errGeneric, 클라 전송 코드는 자기 문구', () => {
    expect(taskErrorText(TASKS_TEXT.ko, 'NOPE')).toBe(TASKS_TEXT.ko.errGeneric);
    expect(taskErrorText(TASKS_TEXT.ko, 'DAEMON_OFFLINE')).toBe(TASKS_TEXT.ko.hostOffline);
    expect(taskErrorText(TASKS_TEXT.ko, 'BASE_MOVED', { base: 'main' })).toContain('main');
  });
  fixtureTest('rpc-errors.json 의 code 집합 = ERROR_KEY 키 집합', () => {
    const fx = loadFixture<{ codes: string[] }>('rpc-errors.json');
    expect([...(fx?.codes || [])].sort()).toEqual(Object.keys(ERROR_KEY).sort());
  });
});
