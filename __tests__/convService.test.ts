/**
 * conv.* 전송 규칙(chat-v2-design.md §4·§4.0).
 *
 * 고정하는 것:
 *  · 평문 REST `POST /api/daemon/conv` 하나만 쓴다. 봉인 RPC 를 거치지 않는다(타임아웃 뒤 평문 재전송 = 이중 실행).
 *  · 실패는 **code 로** 분기한다 — HTTP 상태는 code 가 없을 때의 추정에만 쓴다.
 *  · 변이(send·respond·create…)는 자동으로 다시 보내지 않는다. 읽기만 전송 실패 시 1회.
 *  · 클라 HTTP 타임아웃 = back 값 + 5초(35초 / 20초).
 *  · conv_event 프레임이 듣는 화면에 닿는다(WSS·SSE 가 같은 분배를 쓴다).
 */
const mockApi = { apiRequest: jest.fn() };
jest.mock('../src/utils/api', () => ({ apiRequest: (...a: any[]) => mockApi.apiRequest(...a), api: {}, refreshAccessToken: jest.fn() }));
const mockE2ee = { rpcAvailable: jest.fn(() => true), sealedRpc: jest.fn(), gateReason: jest.fn(() => null), getStatus: jest.fn(() => ({ policy: 'preferred' })) };
jest.mock('../src/services/e2ee', () => ({ __esModule: true, default: mockE2ee }));
const mockDaemon = { getStatus: jest.fn() };
jest.mock('../src/services/daemonService', () => ({ __esModule: true, default: { getStatus: (...a: any[]) => mockDaemon.getStatus(...a) } }));

import convService, { ConvError, convRpc, convTimeoutMs, hostSupportsConv, serverDisabledConv, serverForwardsLaunchArgs, _resetConvCapsForTest } from '../src/services/convService';
import { refreshHostCaps, _resetHostCapsForTest } from '../src/services/taskService';

beforeEach(() => {
  mockApi.apiRequest.mockReset();
  mockE2ee.sealedRpc.mockReset();
  mockDaemon.getStatus.mockReset();
  _resetHostCapsForTest();
  _resetConvCapsForTest();
});

describe('전송', () => {
  test('★ 평문 REST 로만 간다 — 봉인 RPC 를 부르지 않는다', async () => {
    mockApi.apiRequest.mockResolvedValue({ success: true, data: { ok: true, status: 'sent', seq: 12 } });
    await expect(convService.send(7, { threadId: 't1', clientId: 'c1', text: '해줘' })).resolves.toEqual({ ok: true, status: 'sent', seq: 12 });
    expect(mockE2ee.sealedRpc).not.toHaveBeenCalled();
    const [url, opts] = mockApi.apiRequest.mock.calls[0];
    expect(url).toBe('/api/daemon/conv');
    expect(opts.method).toBe('POST');
    expect(opts.body).toEqual({ method: 'conv.send', params: { threadId: 't1', clientId: 'c1', text: '해줘' }, hostDeviceId: 7 });
  });

  test('성공 응답은 데몬 결과가 최상위다(래핑 없음)', async () => {
    mockApi.apiRequest.mockResolvedValue({ success: true, data: { thread: { id: 't1' }, events: [], headSeq: 0, floorSeq: 0 } });
    await expect(convService.open(7, 't1')).resolves.toMatchObject({ thread: { id: 't1' }, headSeq: 0 });
  });

  test('host 가 없으면 hostDeviceId 를 싣지 않는다', async () => {
    mockApi.apiRequest.mockResolvedValue({ success: true, data: { threads: [] } });
    await convService.list(null, { cwd: 'work/app' });
    expect(mockApi.apiRequest.mock.calls[0][1].body).toEqual({ method: 'conv.list', params: { cwd: 'work/app' } });
  });

  test.each([
    ['conv.create', 35000], ['conv.send', 35000], ['conv.open', 35000], ['conv.adopt', 35000], ['conv.toTerminal', 35000],
    ['conv.since', 20000], ['conv.before', 20000], ['conv.respond', 20000], ['conv.interrupt', 20000], ['conv.set', 20000],
    ['conv.list', 20000], ['conv.remove', 20000], ['conv.commands', 20000], ['conv.file', 35000], ['conv.detail', 20000],
  ])('타임아웃 %s = %ims', async (method, ms) => {
    expect(convTimeoutMs(method)).toBe(ms);
    mockApi.apiRequest.mockResolvedValue({ success: true, data: { ok: true } });
    await convRpc(method, {}, 7);
    expect(mockApi.apiRequest.mock.calls[0][1].timeoutMs).toBe(ms);
  });
});

describe('실패 — code 로 분기한다', () => {
  test.each([
    [{ success: false, code: 'THREAD_BUSY_IN_TERMINAL', status: 500, error: '터미널에서 사용 중' }, 'THREAD_BUSY_IN_TERMINAL'],
    [{ success: false, code: 'REQ_NOT_PENDING', status: 500 }, 'REQ_NOT_PENDING'],
    [{ success: false, code: 'TIMEOUT', status: 500 }, 'TIMEOUT'],
    [{ success: false, code: 'DAEMON_OFFLINE', status: 409 }, 'DAEMON_OFFLINE'],
    [{ success: false, code: 'CONV_DISABLED', status: 403 }, 'CONV_DISABLED'],
    // code 가 없을 때만 상태로 추정한다.
    [{ success: false, status: 409 }, 'DAEMON_OFFLINE'],
    [{ success: false, status: 403 }, 'CONV_DISABLED'],
    [{ success: false, status: 404 }, 'SERVER_NEEDS_UPDATE'],
    [{ success: false, status: 400 }, 'CONV_ERROR'],
    [{ success: false, status: 500 }, 'CONV_ERROR'],
    [{ success: false, error: 'Aborted' }, 'TIMEOUT'],
    [{ success: false, error: 'Network request failed' }, 'NETWORK'],
  ])('%j → %s', async (res, code) => {
    mockApi.apiRequest.mockResolvedValue(res);
    await expect(convService.respond(7, { threadId: 't', reqId: 'r', decision: 'allow' })).rejects.toMatchObject({ code });
  });

  test('오류는 ConvError — 화면은 code 만 본다', async () => {
    mockApi.apiRequest.mockResolvedValue({ success: false, code: 'START_FAILED', status: 500, error: '기동 실패' });
    const e = await convService.create(7, { cwd: 'a', text: 'x', clientId: 'c' }).catch((x) => x);
    expect(e).toBeInstanceOf(ConvError);
    expect(e.code).toBe('START_FAILED');
    expect(e.status).toBe(500);
  });

  test('★ 변이는 타임아웃이어도 자동으로 다시 보내지 않는다', async () => {
    mockApi.apiRequest.mockResolvedValue({ success: false, error: 'Aborted' });
    for (const call of [
      () => convService.send(7, { threadId: 't', clientId: 'c', text: 'x' }),
      () => convService.create(7, { cwd: 'a', text: 'x', clientId: 'c' }),
      () => convService.respond(7, { threadId: 't', reqId: 'r', decision: 'deny' }),
      () => convService.interrupt(7, 't'),
      () => convService.remove(7, 't'),
      () => convService.toTerminal(7, 't'),
      () => convService.adopt(7, 'a', 3),
    ]) {
      mockApi.apiRequest.mockClear();
      await expect(call()).rejects.toMatchObject({ code: 'TIMEOUT' });
      expect(mockApi.apiRequest).toHaveBeenCalledTimes(1);
    }
  });

  test('읽기는 전송 실패 시 1회 다시 부른다 — 도메인 오류는 다시 부르지 않는다', async () => {
    mockApi.apiRequest.mockResolvedValueOnce({ success: false, error: 'Network request failed' })
      .mockResolvedValueOnce({ success: true, data: { thread: { id: 't' }, events: [], headSeq: 3 } });
    await expect(convService.since(7, 't', 2)).resolves.toMatchObject({ headSeq: 3 });
    expect(mockApi.apiRequest).toHaveBeenCalledTimes(2);
    mockApi.apiRequest.mockReset();
    mockApi.apiRequest.mockResolvedValue({ success: false, code: 'THREAD_NOT_FOUND', status: 500 });
    await expect(convService.since(7, 't', 2)).rejects.toMatchObject({ code: 'THREAD_NOT_FOUND' });
    expect(mockApi.apiRequest).toHaveBeenCalledTimes(1);
  });
});

describe('conv_event 분배', () => {
  test('듣는 화면 전부에 닿고, 한 화면의 오류가 다른 화면을 막지 않는다', () => {
    const got: string[] = [];
    const off1 = convService.addConvEventListener(() => { throw new Error('boom'); });
    const off2 = convService.addConvEventListener((f) => got.push(String(f.threadId)));
    convService.dispatchConvEvent({ type: 'conv_event', threadId: 't1', delta: { key: 'k', kind: 'text', off: 0, text: 'a' } });
    expect(got).toEqual(['t1']);
    off1(); off2();
    convService.dispatchConvEvent({ type: 'conv_event', threadId: 't2' });
    expect(got).toEqual(['t1']);
    expect(convService.convListenerCount()).toBe(0);
  });
});

describe('caps 게이팅(§9) — 데몬 ∩ 서버', () => {
  const status = (caps: string[], serverCaps?: string[]) => ({ runners: [{ kind: 'local', deviceId: 7, caps }], ...(serverCaps ? { serverCaps } : {}) });

  test('조회 전에는 모름(null) — 없음으로 단정하지 않는다', () => {
    expect(hostSupportsConv(7)).toBeNull();
    expect(serverDisabledConv()).toBe(false);
  });

  test('둘 다 있으면 true', async () => {
    mockDaemon.getStatus.mockResolvedValue(status(['task.v1', 'conv.v1'], ['task.v1', 'conv.v1']));
    await refreshHostCaps();
    expect(hostSupportsConv(7)).toBe(true);
    expect(serverDisabledConv()).toBe(false);
  });

  test('PC 가 구버전이면 false(= "PC 업데이트 필요")', async () => {
    mockDaemon.getStatus.mockResolvedValue(status(['task.v1'], ['task.v1', 'conv.v1']));
    await refreshHostCaps();
    expect(hostSupportsConv(7)).toBe(false);
    expect(serverDisabledConv()).toBe(false);
  });

  test('서버 킬스위치 — PC 가 광고해도 false, 새 채팅 입구를 감춘다', async () => {
    mockDaemon.getStatus.mockResolvedValue(status(['conv.v1'], ['task.v1']));
    await refreshHostCaps();
    expect(hostSupportsConv(7)).toBe(false);
    expect(serverDisabledConv()).toBe(true);
  });
});

describe('conv.file · conv.caps(§4.5)', () => {
  test('conv.file — threadId·path 를 싣고, missing 은 예외가 아니라 값으로 돌려준다', async () => {
    mockApi.apiRequest.mockResolvedValue({ success: true, data: { missing: true, reason: 'not_referenced' } });
    await expect(convService.file(7, 't1', '/Users/me/a.png')).resolves.toEqual({ missing: true, reason: 'not_referenced' });
    const [, opts] = mockApi.apiRequest.mock.calls[0];
    expect(opts.body).toEqual({ method: 'conv.file', params: { threadId: 't1', path: '/Users/me/a.png' }, hostDeviceId: 7 });
    expect(opts.timeoutMs).toBe(35000);
  });

  test('conv.file 은 읽기다 — 전송 실패면 1회 다시 부른다', async () => {
    mockApi.apiRequest
      .mockResolvedValueOnce({ success: false, status: 0, error: 'Network request failed' })
      .mockResolvedValueOnce({ success: true, data: { mediaType: 'image/png', base64: 'AAA', bytes: 3, name: 'a.png' } });
    await expect(convService.file(7, 't1', '/a.png')).resolves.toMatchObject({ base64: 'AAA' });
    expect(mockApi.apiRequest).toHaveBeenCalledTimes(2);
  });

  test('conv.caps 는 PC 마다 한 번 — 탭 여러 개가 같이 쓴다. 실패는 캐시하지 않는다', async () => {
    mockApi.apiRequest.mockResolvedValueOnce({ success: false, status: 500, code: 'CONV_ERROR' });
    await expect(convService.loadConvCaps(7)).resolves.toBeNull();
    expect(convService.peekConvCaps(7)).toBeNull();
    const caps = { enabled: true, agents: [{ id: 'claude', label: 'Claude', available: true }], modes: ['default', 'plan'], maxLive: 3 };
    mockApi.apiRequest.mockResolvedValue({ success: true, data: caps });
    const seen: number[] = [];
    const off = convService.subscribeConvCaps(() => seen.push(1));
    const [a, b] = await Promise.all([convService.loadConvCaps(7), convService.loadConvCaps(7)]);
    expect(a).toEqual(caps);
    expect(b).toEqual(caps);
    await convService.loadConvCaps(7);
    const capsCalls = mockApi.apiRequest.mock.calls.filter((c: any[]) => c[1].body.method === 'conv.caps');
    expect(capsCalls.length).toBe(2);                 // 실패 1 + 성공 1 — 동시 두 번·그 뒤 한 번은 캐시
    expect(convService.peekConvCaps(7)).toEqual(caps);
    expect(convService.peekConvCaps(8)).toBeNull();   // 다른 PC 는 따로
    expect(seen.length).toBe(1);
    off();
  });
});

describe('터미널에서 이어가기 — 서버 cap launchargs.v1', () => {
  test('★ 서버가 선언하면 true, 없거나 모르면 false(인자가 떨어지면 새 대화가 실행된다)', async () => {
    expect(serverForwardsLaunchArgs()).toBe(false);
    mockDaemon.getStatus.mockResolvedValue({ runners: [], serverCaps: ['conv.v1'] });
    await refreshHostCaps();
    expect(serverForwardsLaunchArgs()).toBe(false);
    mockDaemon.getStatus.mockResolvedValue({ runners: [], serverCaps: ['conv.v1', 'launchargs.v1'] });
    await refreshHostCaps();
    expect(serverForwardsLaunchArgs()).toBe(true);
  });
});
