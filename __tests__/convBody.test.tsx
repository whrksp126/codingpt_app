/**
 * 채팅 탭 화면(ConvBody) — 가짜 전송 계층으로 끝에서 끝까지.
 *
 * 서버(데몬·back)가 아직 없다 → conv.* RPC 를 메모리 가짜로 바꿔 끼우고, push 는 실제 분배 함수
 * (convService.dispatchConvEvent)로 흘린다. 고정하는 것:
 *  · 새 대화: 빈 상태 → 첫 메시지가 conv.create → 탭에 threadId 가 쓰인다.
 *  · 보내기: 낙관 버블이 즉시 뜨고, 실패하면 [다시 시도] 가 **같은 clientId** 로 다시 보낸다.
 *  · 스트리밍: 델타가 자라는 글로 보이고, 완성 msg 가 오면 목록 행으로 바뀐다.
 *  · 요청 도크: 승인 카드의 응답이 conv.respond 로 간다(승인 인박스가 아니다).
 *  · 틈이 난 push → conv.since 로 메운다.
 *  · 오프라인: 보내지 않고 실패 버블 + 상단 상태 줄.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, AppState } from 'react-native';

jest.mock('../src/animations/haptics', () => ({ haptic: { keyPress: () => {}, select: () => {}, holdOpen: () => {}, warning: () => {} } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children }: any) => children }));
jest.mock('../src/contexts/ThemeContext', () => ({ useTheme: () => ({ resolvedScheme: 'dark' }) }));
const mockShell = { respondApproval: jest.fn(), dismissApproval: jest.fn(), notifications: [], markNotifRead: jest.fn() };
jest.mock('../src/contexts/WorkspaceShellContext', () => ({ useWorkspaceShell: () => mockShell }));
jest.mock('../src/utils/termSchemeSetting', () => ({ useTermScheme: () => 'auto' }));
// 컴포저의 곁가지(첨부·받아쓰기·파일 시트)는 이 테스트의 관심사가 아니다.
jest.mock('../src/services/attachFlow', () => ({ pickAndUploadAttachments: jest.fn(), subscribeAttachBusy: () => () => {}, getAttachBusy: () => false }));
// 받아쓰기 훅은 컴포저 파일 안에 있다 — 네이티브 음성 모듈이 없는 환경에서는 마이크 버튼을 스스로 감춘다(목 불필요).
jest.mock('../src/workspace/chat/ProjectFileSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/workspace/chat/ImageViewer', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/workspace/chat/AgentStatusStrip', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/components/keyboard/KeyTextInput', () => {
  const R = require('react');
  const { TextInput } = require('react-native');
  return { __esModule: true, default: R.forwardRef((p: any, ref: any) => R.createElement(TextInput, { ...p, ref })) };
});
jest.mock('../src/services/daemonService', () => ({ __esModule: true, default: {}, getDeviceLabel: () => '내 폰', getClientKey: async () => 'k', getMyDeviceId: async () => 1 }));
jest.mock('../src/services/convCache', () => {
  const api = { loadConv: jest.fn(async () => null), saveConv: jest.fn(async () => true), removeConv: jest.fn(async () => {}), clearAll: jest.fn(async () => {}) };
  return { __esModule: true, default: api, ...api };
});
jest.mock('../src/services/notificationService', () => ({
  __esModule: true,
  addChannelResetListener: () => () => {},
  getChannelState: () => mockChannel.state,
  subscribeChannelState: (fn: () => void) => { mockChannel.subs.add(fn); return () => { mockChannel.subs.delete(fn); }; },
}));
const mockChannel = { state: 'open', subs: new Set<() => void>() };

// ── 가짜 전송 계층 — conv.* 를 메모리에서 흉내 낸다 ──
const mockRpc: Record<string, jest.Mock> = {
  open: jest.fn(), since: jest.fn(), before: jest.fn(), send: jest.fn(), create: jest.fn(), respond: jest.fn(),
  interrupt: jest.fn(), set: jest.fn(), commands: jest.fn(), toTerminal: jest.fn(), list: jest.fn(), adopt: jest.fn(), remove: jest.fn(),
};
jest.mock('../src/services/convService', () => {
  const actual = jest.requireActual('../src/services/convService');
  // 팩토리는 import 시점에 돈다(위 const 보다 먼저) → 이름은 여기 적고, 값은 부를 때 찾는다(지연 참조).
  const names = ['open', 'since', 'before', 'send', 'create', 'respond', 'interrupt', 'set', 'commands', 'toTerminal', 'list', 'adopt', 'remove'];
  const wrap = Object.fromEntries(names.map((k) => [k, (...a: any[]) => mockRpc[k](...a)]));
  return { __esModule: true, ...actual, ...wrap, default: { ...actual.default, ...wrap } };
});

import ConvBody, { safeResumeArgs } from '../src/workspace/conv/ConvBody';
import convService, { ConvError } from '../src/services/convService';
import PressableScale from '../src/components/ui/PressableScale';
import type { ConvEvent, ConvMsg } from '../src/workspace/conv/convModel';

const T0 = 1790000000000;
const msg = (seq: number, key: string, p: Partial<ConvMsg> = {}): ConvEvent => ({
  seq, ts: T0 + seq, op: 'msg', msg: { key, seq, ts: T0 + seq, role: 'assistant', kind: 'text', text: `답 ${seq}`, ...p } as ConvMsg,
});

const texts = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((t) => {
  const c = t.props.children;
  return Array.isArray(c) ? c.filter((x: any) => typeof x === 'string' || typeof x === 'number').join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : '';
}).filter(Boolean);
const has = (r: ReactTestRenderer.ReactTestRenderer, s: string) => texts(r).some((t) => t.includes(s));
// 버튼은 전부 PressableScale 이다 — 그 아래 호스트 뷰들도 같은 props 를 물려받으므로 타입으로 집는다.
const byLabel = (r: ReactTestRenderer.ReactTestRenderer, label: string) => r.root.findAllByType(PressableScale).filter((n) => n.props.accessibilityLabel === label);
const input = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.props && typeof n.props.onChangeText === 'function' && n.props.multiline)[0];

async function flush(ms = 0) {
  await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}
async function type(r: ReactTestRenderer.ReactTestRenderer, t: string) {
  await act(async () => { input(r).props.onChangeText(t); });
}
async function pressSend(r: ReactTestRenderer.ReactTestRenderer) {
  await act(async () => { byLabel(r, '보내기')[0].props.onPress(); await Promise.resolve(); });
  await flush();
}

const patches: any[] = [];
// 띄운 화면은 테스트가 끝나면 내린다 — 안 내리면 앞 테스트의 화면들이 같은 대화(t1)의 push 를 계속 듣고
//  각자 받아 오기를 해서 호출 수가 부풀려진다(가짜 전송 계층은 하나다).
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
function render(p: Partial<React.ComponentProps<typeof ConvBody>> = {}) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  const props: React.ComponentProps<typeof ConvBody> = {
    cwd: 'work/app', host: 7, hostOnline: true, supported: true, account: 12, threadId: null, title: '', initialDraft: '',
    active: true, onPatch: (x) => { patches.push(x); }, ...p,
  };
  act(() => { r = ReactTestRenderer.create(<ConvBody {...props} />); });
  mounted.push(r);
  return { r, props, rerender: (q: Partial<React.ComponentProps<typeof ConvBody>>) => act(() => { r.update(<ConvBody {...props} {...q} />); }) };
}

beforeEach(() => {
  jest.useFakeTimers();
  // jest 의 AppState 는 상태를 모른다 — 앱이 앞에 떠 있는 상황으로 둔다(백그라운드에서는 받아 오지 않는다).
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  patches.length = 0;
  mockChannel.state = 'open';
  Object.values(mockRpc).forEach((m) => m.mockReset());
  mockRpc.since.mockImplementation(async (_h: any, _id: string, sinceSeq: number) => ({ thread: { id: 't1', state: 'idle' }, events: [], headSeq: sinceSeq, live: [] }));
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'idle', title: '리팩터링' }, events: [], headSeq: 0, floorSeq: 0, live: [], pending: [] });
});
afterEach(() => {
  act(() => { mounted.splice(0).forEach((r) => { try { r.unmount(); } catch (_) { /* 이미 내려감 */ } }); });
  jest.useRealTimers();
});

test('새 대화 — 빈 상태에서 첫 메시지가 conv.create 가 되고 탭에 threadId 가 쓰인다', async () => {
  let done!: (v: any) => void;
  mockRpc.create.mockImplementation(() => new Promise((res) => { done = res; }));
  const { r } = render();
  expect(has(r, '무엇이든 요청하세요')).toBe(true);
  expect(mockRpc.open).not.toHaveBeenCalled();

  await type(r, '로그인 폼 고쳐줘');
  await pressSend(r);
  // 낙관 버블이 **즉시** 뜬다(서버 응답 전).
  expect(has(r, '로그인 폼 고쳐줘')).toBe(true);
  expect(has(r, '보내는 중')).toBe(true);
  expect(has(r, '무엇이든 요청하세요')).toBe(false);
  expect(mockRpc.create).toHaveBeenCalledTimes(1);
  const [host, p] = mockRpc.create.mock.calls[0];
  expect(host).toBe(7);
  expect(p).toMatchObject({ cwd: 'work/app', text: '로그인 폼 고쳐줘' });
  expect(typeof p.clientId).toBe('string');
  // 입력칸은 비었다 — 원문은 버블이 들고 있다.
  expect(input(r).props.value).toBe('');

  mockRpc.open.mockResolvedValue({
    thread: { id: 't1', state: 'working', title: '로그인 폼' }, headSeq: 1, floorSeq: 1, live: [], pending: [],
    events: [msg(1, 'u:' + p.clientId, { role: 'user', text: '로그인 폼 고쳐줘', clientId: p.clientId, status: 'sent' })],
  });
  await act(async () => { done({ thread: { id: 't1', title: '로그인 폼', state: 'working' }, seq: 1 }); await Promise.resolve(); });
  await flush();
  expect(patches).toContainEqual({ threadId: 't1', title: '로그인 폼' });
  expect(has(r, '보내는 중')).toBe(false);
  expect(texts(r).filter((t) => t === '로그인 폼 고쳐줘').length).toBe(1);   // 버블이 서버 행으로 **대체**됐다(두 번 보이지 않는다)
});

test('★ 전송 실패 → [다시 시도] 는 같은 clientId, [삭제] 는 버블을 걷는다', async () => {
  mockRpc.send.mockRejectedValueOnce(new ConvError('x', 'TIMEOUT', 0)).mockResolvedValueOnce({ ok: true, status: 'queued', seq: 5 });
  const { r } = render({ threadId: 't1', title: '리팩터링' });
  await flush();
  await type(r, '다음 단계');
  await pressSend(r);
  expect(has(r, 'PC의 응답이 늦어요')).toBe(true);
  expect(has(r, '다음 단계')).toBe(true);           // 원문이 남아 있다
  const first = mockRpc.send.mock.calls[0][1];

  await act(async () => { byLabel(r, '다시 시도')[0].props.onPress(); await Promise.resolve(); });
  await flush();
  expect(mockRpc.send).toHaveBeenCalledTimes(2);
  expect(mockRpc.send.mock.calls[1][1]).toEqual(first);     // 같은 clientId·같은 본문
  expect(has(r, 'PC의 응답이 늦어요')).toBe(false);
  expect(has(r, '대기 중')).toBe(true);

  // 또 실패시켜 삭제를 본다.
  mockRpc.send.mockRejectedValueOnce(new ConvError('x', 'START_FAILED', 500));
  await type(r, '버릴 말');
  await pressSend(r);
  expect(has(r, '에이전트를 시작하지 못했어요')).toBe(true);
  await act(async () => { byLabel(r, '삭제')[0].props.onPress(); });
  expect(has(r, '버릴 말')).toBe(false);
});

test('전송 중에도 다음 메시지를 보낼 수 있다(직렬화하지 않는다)', async () => {
  mockRpc.send.mockImplementation(() => new Promise(() => {}));
  const { r } = render({ threadId: 't1' });
  await flush();
  await type(r, '하나');
  await pressSend(r);
  await type(r, '둘');
  await pressSend(r);
  expect(mockRpc.send).toHaveBeenCalledTimes(2);
  expect(mockRpc.send.mock.calls[0][1].clientId).not.toBe(mockRpc.send.mock.calls[1][1].clientId);
  expect(has(r, '하나') && has(r, '둘')).toBe(true);
});

test('★ 스트리밍 — 델타가 자라는 글로 보이고 완성 msg 가 목록 행으로 바꾼다', async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'working' }, events: [msg(1, 'a', { role: 'user', text: '질문' })], headSeq: 1, floorSeq: 1, live: [], pending: [] });
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(has(r, '작업 중')).toBe(true);

  await act(async () => {
    convService.dispatchConvEvent({ type: 'conv_event', threadId: 't1', hostDeviceId: 7, delta: { key: 'blk', kind: 'text', off: 0, text: '안녕' } });
    convService.dispatchConvEvent({ type: 'conv_event', threadId: 't1', hostDeviceId: 7, delta: { key: 'blk', kind: 'text', off: 2, text: '하세요' } });
  });
  // 프레임은 모아서 한 번에 반영한다 — 타이머가 돌기 전에는 아직이다.
  expect(has(r, '안녕하세요')).toBe(false);
  await flush(80);
  expect(has(r, '안녕하세요')).toBe(true);
  expect(has(r, '작업 중')).toBe(false);            // 글이 나오는 동안은 "작업 중" 줄을 감춘다

  await act(async () => {
    convService.dispatchConvEvent({ type: 'conv_event', threadId: 't1', hostDeviceId: 7, headSeq: 3, events: [msg(2, 'blk', { text: '안녕하세요. 끝.' }), { seq: 3, ts: T0, op: 'turn', phase: 'end', turn: 1, ok: true, durationMs: 8000 }] });
  });
  await flush(80);
  expect(texts(r).filter((t) => t.includes('안녕하세요')).length).toBe(1);
  expect(has(r, '안녕하세요. 끝.')).toBe(true);
  expect(has(r, '8초 걸림')).toBe(true);
  // 다른 PC 의 프레임은 버린다.
  await act(async () => { convService.dispatchConvEvent({ type: 'conv_event', threadId: 't1', hostDeviceId: 99, events: [msg(4, 'z', { text: '남의 PC' })] }); });
  await flush(80);
  expect(has(r, '남의 PC')).toBe(false);
});

test('★ 틈이 난 push 는 적용하지 않고 conv.since 로 메운다', async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'idle' }, events: [msg(1, 'a')], headSeq: 1, floorSeq: 1, live: [], pending: [] });
  const { r } = render({ threadId: 't1' });
  await flush();
  mockRpc.since.mockClear();
  mockRpc.since.mockResolvedValue({ thread: { id: 't1', state: 'idle' }, events: [msg(2, 'b', { text: '빠진 것' }), msg(3, 'c', { text: '뒤에 온 것' })], headSeq: 3, live: [] });
  await act(async () => { convService.dispatchConvEvent({ type: 'conv_event', threadId: 't1', events: [msg(3, 'c', { text: '뒤에 온 것' })] }); });
  await flush(80);
  expect(mockRpc.since).toHaveBeenCalledWith(7, 't1', 1);
  expect(has(r, '빠진 것')).toBe(true);
  expect(has(r, '뒤에 온 것')).toBe(true);
});

test('★ thread 힌트의 headSeq 가 앞서 있으면 당겨 온다(가져온 과거는 push 되지 않는다)', async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'idle' }, events: [msg(1, 'a')], headSeq: 1, floorSeq: 1, live: [] });
  const { r } = render({ threadId: 't1' });
  await flush();
  mockRpc.since.mockClear();
  mockRpc.since.mockResolvedValue({ thread: { id: 't1', state: 'idle', headSeq: 3 }, events: [msg(2, 'b', { text: '터미널에서 이어 간 말' }), msg(3, 'c')], headSeq: 3, live: [], pending: [], more: false });
  await act(async () => { convService.dispatchConvEvent({ type: 'conv_event', threadId: 't1', hostDeviceId: 7, thread: { id: 't1', headSeq: 3 } }); });
  await flush(80);
  expect(mockRpc.since).toHaveBeenCalledWith(7, 't1', 1);
  expect(has(r, '터미널에서 이어 간 말')).toBe(true);
});

test('★ conv.since 가 reset 을 주면 로컬 상태와 캐시를 버리고 응답으로 바꾼다', async () => {
  const cache = require('../src/services/convCache').default;
  cache.loadConv.mockResolvedValueOnce({ v: 1, threadId: 't1', thread: { id: 't1', title: '옛 제목' }, events: [msg(1, 'o1', { text: '옛 대화 하나' }), msg(2, 'o2', { text: '옛 대화 둘' })], headSeq: 9, floorSeq: 1, at: 1 });
  mockRpc.since.mockResolvedValueOnce({ reset: true, thread: { id: 't1', state: 'idle', title: '다시 만든 대화' }, events: [msg(1, 'n1', { text: '새 대화의 첫 말' })], headSeq: 1, floorSeq: 1, live: [], pending: [], more: false });
  const { r } = render({ threadId: 't1' });
  await flush();
  // 캐시가 있었으므로 open 이 아니라 since(캐시 head)가 나갔다.
  expect(mockRpc.open).not.toHaveBeenCalled();
  expect(mockRpc.since).toHaveBeenCalledWith(7, 't1', 9);
  expect(has(r, '새 대화의 첫 말')).toBe(true);
  expect(has(r, '옛 대화 하나')).toBe(false);
  expect(cache.removeConv).toHaveBeenCalledWith(12, 7, 't1');
});

test('열 때 cwd 를 넘긴다 — 터미널에서 만든 대화(external)를 데몬이 찾는 근거', async () => {
  render({ threadId: 't1' });
  await flush();
  expect(mockRpc.open).toHaveBeenCalledWith(7, 't1', { cwd: 'work/app' });
});

test('★ 터미널 전용 명령 — 실패 버블이 아니라 안내, [다시 시도] 없음', async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'idle' }, events: [msg(1, 'a')], headSeq: 1, floorSeq: 1, live: [] });
  mockRpc.send.mockImplementation(async (_h: any, p: any) => {
    mockRpc.since.mockResolvedValueOnce({
      thread: { id: 't1', state: 'idle' }, headSeq: 3, live: [], pending: [], more: false,
      events: [
        msg(2, 'u:' + p.clientId, { role: 'user', text: '/vim', clientId: p.clientId, status: 'failed' }),
        { seq: 3, ts: T0, op: 'notice', level: 'info', code: 'TERMINAL_ONLY_COMMAND', text: '이 명령은 터미널에서만 쓸 수 있습니다' },
      ],
    });
    return { ok: false, status: 'failed', code: 'TERMINAL_ONLY_COMMAND' };
  });
  const { r } = render({ threadId: 't1' });
  await flush();
  await type(r, '/vim');
  await pressSend(r);
  await flush();
  expect(has(r, '이 명령은 터미널에서만 쓸 수 있어요.')).toBe(true);
  expect(byLabel(r, '다시 시도').length).toBe(0);
  expect(byLabel(r, '삭제').length).toBe(1);
  expect(texts(r).filter((t) => t === '/vim').length).toBe(1);
  await act(async () => { byLabel(r, '삭제')[0].props.onPress(); });
  expect(has(r, '/vim')).toBe(false);
});

test('★ 서버가 실패로 바꾼 내 메시지 — [다시 시도] 가 같은 clientId 로 다시 보낸다', async () => {
  mockRpc.open.mockResolvedValue({
    thread: { id: 't1', state: 'error' }, headSeq: 2, floorSeq: 1, live: [],
    events: [msg(1, 'a'), { ...msg(2, 'u:cx', { role: 'user', text: '죽기 전에 보낸 말', clientId: 'cx', status: 'failed' }), first: 2 }],
  });
  mockRpc.send.mockResolvedValue({ ok: true, status: 'queued', seq: 2 });
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(has(r, '전달되지 않았어요.')).toBe(true);
  await act(async () => { byLabel(r, '다시 시도')[0].props.onPress(); await Promise.resolve(); });
  await flush();
  expect(mockRpc.send).toHaveBeenCalledTimes(1);
  expect(mockRpc.send.mock.calls[0][1]).toEqual({ threadId: 't1', clientId: 'cx', text: '죽기 전에 보낸 말' });
  expect(texts(r).filter((t) => t === '죽기 전에 보낸 말').length).toBe(1);
  expect(has(r, '전달되지 않았어요.')).toBe(false);
});

test('★ 다른 기기가 대화를 지우면 이 탭은 빈 새 대화로 되돌아간다', async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'idle', title: '리팩터링' }, events: [msg(1, 'a', { text: '남아 있던 말' })], headSeq: 1, floorSeq: 1, live: [] });
  const { r, rerender } = render({ threadId: 't1', title: '리팩터링' });
  await flush();
  expect(has(r, '남아 있던 말')).toBe(true);
  patches.length = 0;
  await act(async () => { convService.dispatchConvEvent({ type: 'conv_event', hostDeviceId: 7, control: { kind: 'deleted', threadId: 't1' } }); });
  await flush(80);
  expect(patches).toContainEqual({ threadId: null, title: '', sid: undefined });
  // 탭이 값을 받아 다시 그린다 — 빈 대화 + 사라진 이유.
  rerender({ threadId: null, title: '' });
  await flush();
  expect(has(r, '남아 있던 말')).toBe(false);
  expect(has(r, '무엇이든 요청하세요')).toBe(true);
  expect(has(r, '이 대화는 삭제됐어요.')).toBe(true);
});

test("control 'gone' — 받아 둔 것을 버리고 다시 연다", async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'idle' }, events: [msg(1, 'a', { text: '첫 말' })], headSeq: 1, floorSeq: 1, live: [] });
  const { r } = render({ threadId: 't1' });
  await flush();
  mockRpc.open.mockClear();
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'idle' }, events: [msg(1, 'a', { text: '첫 말' }), msg(2, 'b', { text: '다시 연 뒤의 말' })], headSeq: 2, floorSeq: 1, live: [] });
  await act(async () => { convService.dispatchConvEvent({ type: 'conv_event', hostDeviceId: 7, control: { kind: 'gone', threadId: 't1' } }); });
  await flush(80);
  await flush();
  expect(mockRpc.open).toHaveBeenCalledTimes(1);
  expect(has(r, '다시 연 뒤의 말')).toBe(true);
});

test('권한 모드 — 알약은 사람이 읽는 이름, 고르면 conv.set', async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'idle', mode: 'acceptEdits' }, events: [msg(1, 'a')], headSeq: 1, floorSeq: 1, live: [] });
  mockRpc.set.mockResolvedValue({ thread: { id: 't1', mode: 'plan' } });
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(has(r, '파일 수정은 자동 허용')).toBe(true);
  expect(has(r, 'accept edits on')).toBe(false);
  const sheet = r.root.findAll((n) => n.props && typeof n.props.onPick === 'function' && Array.isArray(n.props.choices))[0];
  expect(sheet.props.choices.map((c: any) => c.label)).toEqual(['매번 물어보기', '파일 수정은 자동 허용', '계획만 세우기', '자동']);
  await act(async () => { sheet.props.onPick('plan'); await Promise.resolve(); });
  await flush();
  expect(mockRpc.set).toHaveBeenCalledWith(7, 't1', { mode: 'plan' });
  expect(has(r, '계획만 세우기')).toBe(true);
});

test('보고 있다는 신호 — push 가 계속 와도 20초마다 한 번은 받아 온다', async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'working' }, events: [msg(1, 'a')], headSeq: 1, floorSeq: 1, live: [] });
  let off = 0;
  // 데몬은 지금까지 쓴 글을 live 로 돌려준다 — 다음 델타의 off 는 그 길이에서 이어진다.
  mockRpc.since.mockImplementation(async (_h: any, _id: string, s: number) => ({ thread: { id: 't1', state: 'working' }, events: [], headSeq: s, live: [{ key: 'blk', kind: 'text', text: '가'.repeat(off) }], more: false }));
  render({ threadId: 't1' });
  await flush();
  mockRpc.since.mockClear();
  for (let i = 0; i < 45; i++) {
    // 1초마다 델타가 온다(push 가 살아 있다) — 폴백 폴링은 계속 건너뛰어진다.
    await act(async () => { convService.dispatchConvEvent({ type: 'conv_event', threadId: 't1', hostDeviceId: 7, delta: { key: 'blk', kind: 'text', off, text: '가' } }); });
    off += 1;
    await flush(1000);
  }
  // 45초 동안 2번(20초·40초 무렵). 델타 off 가 since 의 live 와 어긋나 생기는 추가 호출은 없다.
  expect(mockRpc.since.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(mockRpc.since.mock.calls.length).toBeLessThanOrEqual(3);
});

test('512KB 로 잘린 응답(more) 은 끝까지 이어 받는다', async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'idle' }, events: [msg(1, 'a'), msg(2, 'b')], headSeq: 4, floorSeq: 1, more: true });
  mockRpc.since.mockResolvedValueOnce({ thread: { id: 't1' }, events: [msg(3, 'c')], headSeq: 4, more: true })
    .mockResolvedValueOnce({ thread: { id: 't1' }, events: [msg(4, 'd', { text: '마지막' })], headSeq: 4, live: [] });
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(mockRpc.since.mock.calls.map((c) => c[2])).toEqual([2, 3]);
  expect(has(r, '마지막')).toBe(true);
});

test('요청 도크 — 승인 응답이 conv.respond 로 간다(승인 인박스가 아니다)', async () => {
  mockRpc.open.mockResolvedValue({
    thread: { id: 't1', state: 'waiting', pending: 1 }, headSeq: 2, floorSeq: 1, live: [],
    pending: [{ id: 'req_1', kind: 'permission', tool: 'Bash', summary: 'rm -rf build', status: 'pending', requestedAt: T0, turn: 1 }],
    events: [msg(1, 'a', { role: 'user', text: '지워줘' }), { seq: 2, ts: T0, op: 'req', req: { id: 'req_1', kind: 'permission', tool: 'Bash', summary: 'rm -rf build', status: 'pending', requestedAt: T0, turn: 1 } }],
  });
  mockRpc.respond.mockResolvedValue({ ok: true });
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(has(r, 'rm -rf build')).toBe(true);
  expect(has(r, '명령 실행')).toBe(true);
  const allow = r.root.findAllByType(PressableScale).find((b) => b.findAllByType(Text).some((t) => t.props.children === '허용'))!;
  await act(async () => { allow.props.onPress(); await Promise.resolve(); });
  await flush();
  expect(mockRpc.respond).toHaveBeenCalledTimes(1);
  expect(mockRpc.respond.mock.calls[0][1]).toMatchObject({ threadId: 't1', reqId: 'req_1', decision: 'allow', by: '내 폰' });
  expect(mockShell.respondApproval).not.toHaveBeenCalled();
  expect(has(r, 'rm -rf build')).toBe(false);          // 카드가 닫혔다
});

test('다른 기기가 먼저 답하면 카드가 즉시 닫힌다 + 여러 개면 "n개 더"', async () => {
  const rq = (seq: number, id: string, status: string, summary: string): ConvEvent => ({ seq, ts: T0 + seq, op: 'req', req: { id, kind: 'permission', tool: 'Bash', summary, status: status as any, requestedAt: T0 + seq, turn: 1 } });
  const evs = [rq(1, 'r1', 'pending', 'npm test'), rq(2, 'r2', 'pending', 'git push')];
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'waiting' }, headSeq: 2, floorSeq: 1, live: [], pending: evs.map((e: any) => e.req), events: evs });
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(has(r, 'npm test')).toBe(true);               // 가장 오래된 것부터
  expect(has(r, 'git push')).toBe(false);
  expect(has(r, '1개 더 기다리는 중')).toBe(true);
  await act(async () => { convService.dispatchConvEvent({ type: 'conv_event', threadId: 't1', events: [rq(3, 'r1', 'allowed', 'npm test')] }); });
  await flush(80);
  expect(has(r, 'npm test')).toBe(false);
  expect(has(r, 'git push')).toBe(true);
  expect(has(r, '더 기다리는 중')).toBe(false);
});

test('질문 하나 — 컴포저에 친 글이 답이 되고, 실패하면 입력칸으로 되돌아온다', async () => {
  mockRpc.open.mockResolvedValue({
    thread: { id: 't1', state: 'waiting' }, headSeq: 1, floorSeq: 1, live: [],
    events: [{ seq: 1, ts: T0, op: 'req', req: { id: 'q1', kind: 'question', tool: 'AskUserQuestion', status: 'pending', requestedAt: T0, turn: 1, questions: [{ header: '색', question: '어느 색?', options: [{ label: '빨강' }, { label: '파랑' }], multiSelect: false }] } }],
  });
  mockRpc.respond.mockRejectedValueOnce(new ConvError('x', 'TIMEOUT', 0)).mockResolvedValueOnce({ ok: true });
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(input(r).props.placeholder).toBe('또는 직접 답장…');
  await type(r, '초록으로');
  await pressSend(r);
  expect(mockRpc.send).not.toHaveBeenCalled();
  expect(input(r).props.value).toBe('초록으로');       // ★ 실패 — 쓴 글이 사라지지 않았다
  await pressSend(r);
  expect(mockRpc.respond.mock.calls[1][1]).toMatchObject({ reqId: 'q1', decision: 'answer', answers: { '어느 색?': '초록으로' } });
  expect(input(r).props.value).toBe('');
});

test('작업 중 — 전송 버튼 자리가 중단 버튼이 되고, 글자가 있으면 다시 전송', async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'working' }, events: [msg(1, 'a', { role: 'user', text: '질문' })], headSeq: 1, floorSeq: 1, live: [], pending: [] });
  mockRpc.interrupt.mockResolvedValue({ ok: true, interrupted: true });
  mockRpc.send.mockResolvedValue({ ok: true, status: 'queued', seq: 2 });
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(byLabel(r, '중단').length).toBe(1);
  expect(byLabel(r, '보내기').length).toBe(0);
  await act(async () => { byLabel(r, '중단')[0].props.onPress(); await Promise.resolve(); });
  expect(mockRpc.interrupt).toHaveBeenCalledWith(7, 't1');
  await type(r, '그리고 이것도');
  expect(byLabel(r, '중단').length).toBe(0);
  expect(byLabel(r, '보내기').length).toBe(1);
  await pressSend(r);
  expect(mockRpc.send.mock.calls[0][1]).toMatchObject({ threadId: 't1', text: '그리고 이것도' });
});

test('오프라인 — 보내지 않고 실패 버블 + 상단 상태 줄', async () => {
  const { r } = render({ threadId: 't1', hostOnline: false });
  await flush();
  expect(has(r, 'PC가 꺼져 있거나 연결이 끊겼어요. 켜지면 이어서 받아 와요.')).toBe(true);
  await type(r, '나중에 보낼 말');
  await pressSend(r);
  expect(mockRpc.send).not.toHaveBeenCalled();
  expect(has(r, '나중에 보낼 말')).toBe(true);
  expect(byLabel(r, '다시 시도').length).toBe(1);
  expect(byLabel(r, '다시 시도')[0].props.disabled).toBe(true);
});

test('재연결 중 표시는 채널 상태를 따른다', async () => {
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(has(r, '다시 연결하는 중')).toBe(false);
  await act(async () => { mockChannel.state = 'reconnecting'; mockChannel.subs.forEach((fn) => fn()); });
  expect(has(r, '다시 연결하는 중')).toBe(true);
  await act(async () => { mockChannel.state = 'open'; mockChannel.subs.forEach((fn) => fn()); });
  expect(has(r, '다시 연결하는 중')).toBe(false);
});

test('구버전 PC — "업데이트 필요" 안내 + 입력 잠금', async () => {
  const { r } = render({ supported: false });
  expect(has(r, '이 PC 앱을 업데이트해야 채팅을 쓸 수 있어요')).toBe(true);
  expect(input(r).props.editable).toBe(false);
});

test('가려진 탭은 폴링하지 않는다 — 다시 보이면 메운다', async () => {
  const { r, rerender } = render({ threadId: 't1', active: false });
  await flush();
  expect(mockRpc.open).not.toHaveBeenCalled();
  await flush(20000);
  expect(mockRpc.open).not.toHaveBeenCalled();
  expect(mockRpc.since).not.toHaveBeenCalled();
  rerender({ threadId: 't1', active: true });
  await flush();
  expect(mockRpc.open).toHaveBeenCalledTimes(1);
  expect(r.root).toBeTruthy();
});

test('폴백 폴링 — push 가 없으면 15초마다, 작업 중이면 5초마다', async () => {
  mockRpc.open.mockResolvedValue({ thread: { id: 't1', state: 'idle' }, events: [msg(1, 'a')], headSeq: 1, floorSeq: 1, live: [], pending: [] });
  render({ threadId: 't1' });
  await flush();
  // 1초씩 흘린다 — 한 번에 건너뛰면 그 사이 응답(프라미스)이 끼어들 틈이 없다.
  const tick = async (sec: number) => { for (let i = 0; i < sec; i++) await flush(1000); };
  mockRpc.since.mockClear();
  await tick(14);
  expect(mockRpc.since).toHaveBeenCalledTimes(0);
  await tick(2);
  expect(mockRpc.since).toHaveBeenCalledTimes(1);
  await tick(30);
  expect(mockRpc.since).toHaveBeenCalledTimes(3);          // 15초마다 — 받는 중에 겹쳐 부르지 않는다
  mockRpc.since.mockImplementation(async (_h: any, _id: string, s: number) => ({ thread: { id: 't1', state: 'working' }, events: [], headSeq: s, live: [] }));
  await tick(16);
  mockRpc.since.mockClear();
  await tick(20);
  expect(mockRpc.since).toHaveBeenCalledTimes(4);          // 작업 중 — 5초마다
});

test('터미널로 넘길 인자 — 실행 파일은 빼고, 이 대화의 id 가 든 안전한 인자만', () => {
  const id = '0d1c2b3a-1111-2222-3333-444455556666';
  // 응답의 args 가 정본.
  expect(safeResumeArgs(['--resume', id], `claude --resume ${id}`, id)).toEqual(['--resume', id]);
  // args 가 없으면(구 데몬) command 에서 실행 파일을 뺀다 — command 를 그대로 치지 않는다.
  expect(safeResumeArgs(undefined, `claude --resume ${id}`, id)).toEqual(['--resume', id]);
  expect(safeResumeArgs([], `/opt/homebrew/bin/claude --resume ${id}`, id)).toEqual(['--resume', id]);
  // 셸이 뜻을 두는 글자가 든 인자는 받지 않는다(데몬이 셸에 타이핑한다).
  expect(safeResumeArgs(['--resume', id, ';', 'rm', '-rf', '~'], '', id)).toBeNull();
  expect(safeResumeArgs(['--resume', `${id}&&curl`], '', id)).toBeNull();
  expect(safeResumeArgs(['--resume', '$(whoami)'], '', id)).toBeNull();
  expect(safeResumeArgs(undefined, `claude --resume ${id} | sh`, id)).toBeNull();
  // 다른 대화를 여는 인자는 받지 않는다.
  expect(safeResumeArgs(['--resume', 'other-id'], '', id)).toBeNull();
  expect(safeResumeArgs(['--resume', id], '', null)).toBeNull();
  expect(safeResumeArgs(undefined, '', id)).toBeNull();
  expect(safeResumeArgs(undefined, 'claude', id)).toBeNull();
});

test('터미널에서 이어가기 — 에이전트 실행 경로에 인자만 넘긴다(입구는 부르는 쪽이 줄 때만)', async () => {
  const id = '0d1c2b3a-1111-2222-3333-444455556666';
  mockRpc.open.mockResolvedValue({ thread: { id, state: 'idle', agent: 'claude' }, events: [msg(1, 'a')], headSeq: 1, floorSeq: 1, live: [] });
  mockRpc.since.mockImplementation(async (_h: any, _id: string, s: number) => ({ thread: { id, state: 'idle' }, events: [], headSeq: s, live: [] }));
  mockRpc.toTerminal.mockResolvedValue({ ok: true, cwd: 'work/app', agent: 'claude', command: `claude --resume ${id}`, args: ['--resume', id] });
  const calls: any[] = [];
  const { r } = render({ threadId: id, onOpenTerminal: (agent, args) => calls.push([agent, args]) });
  await flush();
  expect(byLabel(r, '더 보기').length).toBe(1);
  await act(async () => { byLabel(r, '더 보기')[0].props.onPress(); });
  const row = r.root.findAll((n) => n.props && n.props.accessibilityLabel === '터미널에서 이어가기' && typeof n.props.onPress === 'function')[0];
  await act(async () => { row.props.onPress(); await Promise.resolve(); });
  await flush();
  expect(mockRpc.toTerminal).toHaveBeenCalledWith(7, id);
  expect(calls).toEqual([['claude', ['--resume', id]]]);
  // 입구를 안 주면(서버가 인자를 못 넘긴다) 메뉴 자체가 없다.
  const none = render({ threadId: id });
  await flush();
  expect(byLabel(none.r, '더 보기').length).toBe(0);
});
