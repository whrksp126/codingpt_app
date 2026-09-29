/**
 * 채팅 → 터미널 이어가기(§4.4·§6.1) — `daemonService.launchAgent` 가 인자를 `POST /api/daemon/agents/launch` 의
 *  `args` 로 싣는가. 서버(launchargs.v1)가 그 값을 데몬까지 넘기고, 데몬이 카탈로그의 실행 파일 뒤에 붙인다.
 *  인자가 빠지면 `--resume <id>` 없이 **새 대화**가 실행된다(조용한 오동작) — 그래서 고정한다.
 */
const mockApi = { apiRequest: jest.fn() };
jest.mock('../src/utils/api', () => ({ apiRequest: (...a: any[]) => mockApi.apiRequest(...a), api: {}, refreshAccessToken: jest.fn() }));

import { launchAgent } from '../src/services/daemonService';

beforeEach(() => { mockApi.apiRequest.mockReset(); mockApi.apiRequest.mockResolvedValue({ success: true, data: { ok: true, ready: true } }); });

test('★ args 를 body 에 싣는다(호스트와 함께)', async () => {
  await launchAgent('work/app', 3, 'claude', 7, ['--resume', '0d1c2b3a-1111']);
  const [url, opts] = mockApi.apiRequest.mock.calls[0];
  expect(url).toBe('/api/daemon/agents/launch');
  expect(opts.method).toBe('POST');
  expect(opts.body).toEqual({ cwd: 'work/app', index: 3, id: 'claude', args: ['--resume', '0d1c2b3a-1111'], hostDeviceId: 7 });
});

test('인자가 없으면 args 필드를 싣지 않는다(구 호출부 그대로) · 빈 값은 걸러낸다', async () => {
  await launchAgent('work/app', 3, 'claude', 7);
  expect(mockApi.apiRequest.mock.calls[0][1].body).toEqual({ cwd: 'work/app', index: 3, id: 'claude', hostDeviceId: 7 });
  await launchAgent('work/app', 3, 'claude', null, ['', '--resume', 'x']);
  expect(mockApi.apiRequest.mock.calls[1][1].body).toEqual({ cwd: 'work/app', index: 3, id: 'claude', args: ['--resume', 'x'] });
});
