// refreshAccessToken — 토큰 갱신이 폭주하지 않는다는 계약.
//
// 왜 이 파일이 있나(2026-09-07 실사고):
//   prod DB 에서 계정을 지웠더니 폰이 죽은 refreshToken 으로 `/api/users/refresh` 를 **분당 40여 건**
//   두들겼다. 5분간 멈추지 않았고, 그때 /refresh 는 /login 과 레이트리밋 버킷을 공유했기 때문에
//   같은 집 IP 의 PC 가 "요청이 너무 많습니다"로 **로그인 자체를 못 했다**.
//   원인은 서버가 아니라 클라이언트였다 — 401 을 받은 호출부 6곳(daemon SSE·ide·notification…)이
//   각자 재발급을 부르는데, 실패해도 저장된 토큰을 지우지 않아 재시도가 영원히 계속됐다.
//
// 그래서 여기서 고정하는 것은 "요청이 몇 번 나갔는가" 다. 세 겹 방어를 각각 센다.
import { DeviceEventEmitter } from 'react-native';

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete store[k]; }),
    multiRemove: jest.fn(async (ks: string[]) => { ks.forEach((k) => { delete store[k]; }); }),
  },
}));

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

const load = (reply: () => Reply) => {
  jest.resetModules();
  Object.keys(store).forEach((k) => delete store[k]);
  store.accessToken = 'stale-access';
  store.refreshToken = 'dead-refresh';

  const calls: string[] = [];
  (global as any).fetch = jest.fn(async (url: string) => {
    calls.push(url);
    const r = reply();
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: { get: (h: string) => (r.headers || {})[h.toLowerCase()] ?? null },
      json: async () => r.body ?? {},
    };
  });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const api = require('../src/utils/api');
  return { api, calls };
};

const DEAD = { status: 401, body: { success: false, message: '존재하지 않는 계정입니다.', detail: { code: 'REFRESH_INVALID' } } };

describe('토큰 갱신 폭주 방지', () => {
  test('동시에 여러 곳이 불러도 실제 요청은 1건이다 (single-flight)', async () => {
    const { api, calls } = load(() => ({ status: 200, body: { accessToken: 'fresh' } }));
    const results = await Promise.all(Array.from({ length: 10 }, () => api.refreshAccessToken()));
    expect(calls.length).toBe(1); // 호출부 6곳이 동시에 401 을 받아도 서버엔 한 번만 간다
    expect(results.every((r) => r === 'fresh')).toBe(true);
  });

  test('영구 실패면 토큰을 버려서 이후 호출이 네트워크를 아예 안 쓴다 (★사고의 근본 차단)', async () => {
    const { api, calls } = load(() => DEAD);

    await api.refreshAccessToken();
    expect(calls.length).toBe(1);
    expect(store.refreshToken).toBeUndefined(); // 죽은 토큰을 지우는 게 루프를 끊는 핵심
    expect(store.accessToken).toBeUndefined();

    // 사고 재현: 계속 두들겨 본다. 요청은 단 한 건도 더 나가면 안 된다.
    for (let i = 0; i < 50; i += 1) await api.refreshAccessToken();
    expect(calls.length).toBe(1);
  });

  test('영구 실패는 세션 종료 이벤트로 알려 로그인 화면으로 되돌린다', async () => {
    const { api } = load(() => DEAD);
    const seen: unknown[] = [];
    const sub = DeviceEventEmitter.addListener(api.SESSION_EXPIRED_EVENT, (e: unknown) => seen.push(e));
    await api.refreshAccessToken();
    sub.remove();
    expect(seen.length).toBe(1);
  });

  test('429 면 Retry-After 만큼 요청 자체를 만들지 않는다 (불난 집에 부채질 금지)', async () => {
    const { api, calls } = load(() => ({ status: 429, headers: { 'retry-after': '300' } }));

    await api.refreshAccessToken();
    expect(calls.length).toBe(1);

    for (let i = 0; i < 20; i += 1) await api.refreshAccessToken();
    expect(calls.length).toBe(1);
    // 레이트리밋은 서버가 잠깐 미는 것일 뿐 — 세션은 살아 있어야 한다(로그아웃시키면 안 됨).
    expect(store.refreshToken).toBe('dead-refresh');
  });

  test('일시 실패(5xx)는 토큰을 지키고 다음 기회에 다시 시도한다', async () => {
    const { api, calls } = load(() => ({ status: 500, body: { message: 'DB 장애' } }));

    await api.refreshAccessToken();
    await api.refreshAccessToken();
    expect(calls.length).toBe(2); // 쿨다운 대상이 아니다
    expect(store.refreshToken).toBe('dead-refresh'); // 로그아웃시키지 않는다
  });
});
