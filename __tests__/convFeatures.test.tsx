/**
 * 채팅 탭(채팅 v2) 2차 기능 — 가짜 전송 계층으로 화면 끝에서 끝까지(chat-v2-design.md §4.4·§4.5·§10).
 *
 * 고정하는 것:
 *  · 첨부: 보낸 버블의 `[첨부] <경로>` 줄은 본문에서 떼어 칩(이미지 = conv.file 썸네일, 탭 = 크게 보기)으로.
 *    컴포저에서 방금 첨부한 사진은 가진 바이트로 그린다(다시 받지 않는다). 전송은 attachments 로.
 *  · 잘린 본문 → [전체 보기] 가 conv.detail 로 교체.
 *  · 대화 안 검색 — 건수·이동·결과 없음.
 *  · conv.caps: 모드 교집합 · 에이전트 선택(2개 이상일 때만) · 모델 시트(목록이 있을 때만, conv.set {model}).
 *  · 사용량 줄 "모델 · 컨텍스트 n%" — null 필드를 견딘다.
 *  · 터미널에서 이어가기 — 서버 cap(launchargs.v1)이 있을 때만 입구가 열리고, 인자를 넘긴다.
 *  · 탭 제목은 대화 제목을 따라간다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, Image, AppState } from 'react-native';

jest.mock('../src/animations/haptics', () => ({ haptic: { keyPress: () => {}, select: () => {}, holdOpen: () => {}, warning: () => {} } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children }: any) => children }));
jest.mock('../src/contexts/ThemeContext', () => ({ useTheme: () => ({ resolvedScheme: 'dark' }) }));
const mockShell = { respondApproval: jest.fn(), dismissApproval: jest.fn(), notifications: [], markNotifRead: jest.fn() };
jest.mock('../src/contexts/WorkspaceShellContext', () => ({ useWorkspaceShell: () => mockShell }));
jest.mock('../src/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 12 } }) }));
jest.mock('../src/utils/termSchemeSetting', () => ({ useTermScheme: () => 'auto' }));
jest.mock('../src/services/attachFlow', () => ({ pickAndUploadAttachments: jest.fn(), subscribeAttachBusy: () => () => {}, getAttachBusy: () => false }));
jest.mock('../src/workspace/chat/ProjectFileSheet', () => ({ __esModule: true, default: () => null }));
// 크게 보기 — 무엇을 열었는지 글로 드러낸다.
jest.mock('../src/workspace/chat/ImageViewer', () => {
  const R = require('react');
  const { Text: T } = require('react-native');
  return { __esModule: true, default: ({ item }: any) => (item ? R.createElement(T, null, `VIEW:${item.name}:${item.uri || ''}`) : null) };
});
jest.mock('../src/components/keyboard/KeyTextInput', () => {
  const R = require('react');
  const { TextInput } = require('react-native');
  return { __esModule: true, default: R.forwardRef((p: any, ref: any) => R.createElement(TextInput, { ...p, ref })) };
});
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: { fs: { dirs: { CacheDir: '/cache' }, mkdir: jest.fn(async () => {}), exists: jest.fn(async () => false), writeFile: jest.fn(async () => {}) }, config: jest.fn() },
}));
jest.mock('../src/services/daemonService', () => ({ __esModule: true, default: {}, getDeviceLabel: () => '내 폰', getClientKey: async () => 'k', getMyDeviceId: async () => 1 }));
jest.mock('../src/services/convCache', () => {
  const api = { loadConv: jest.fn(async () => null), saveConv: jest.fn(async () => true), removeConv: jest.fn(async () => {}), clearAll: jest.fn(async () => {}) };
  return { __esModule: true, default: api, ...api };
});
jest.mock('../src/services/notificationService', () => ({
  __esModule: true,
  addChannelResetListener: () => () => {},
  getChannelState: () => 'open',
  subscribeChannelState: () => () => {},
}));

const mockRpc: Record<string, jest.Mock> = {
  open: jest.fn(), since: jest.fn(), before: jest.fn(), send: jest.fn(), create: jest.fn(), respond: jest.fn(), interrupt: jest.fn(),
  set: jest.fn(), commands: jest.fn(), toTerminal: jest.fn(), list: jest.fn(), adopt: jest.fn(), remove: jest.fn(),
  file: jest.fn(), detail: jest.fn(), caps: jest.fn(),
};
const mockCaps: { v: any; subs: Set<() => void>; launchArgs: boolean } = { v: null, subs: new Set(), launchArgs: false };
jest.mock('../src/services/convService', () => {
  const actual = jest.requireActual('../src/services/convService');
  const names = ['open', 'since', 'before', 'send', 'create', 'respond', 'interrupt', 'set', 'commands', 'toTerminal', 'list', 'adopt', 'remove', 'file', 'detail'];
  const wrap: any = Object.fromEntries(names.map((k) => [k, (...a: any[]) => mockRpc[k](...a)]));
  // caps 저장소 — 실제 구현은 따로(convService.test) 고정한다. 여기선 화면이 그 값을 어떻게 쓰는지만 본다.
  wrap.loadConvCaps = async (h: any) => { const c = await mockRpc.caps(h); mockCaps.v = c || null; mockCaps.subs.forEach((f) => f()); return mockCaps.v; };
  wrap.peekConvCaps = () => mockCaps.v;
  wrap.subscribeConvCaps = (fn: () => void) => { mockCaps.subs.add(fn); return () => { mockCaps.subs.delete(fn); }; };
  wrap.serverForwardsLaunchArgs = () => mockCaps.launchArgs;
  wrap.hostSupportsConv = () => true;
  wrap.capsLoaded = () => true;
  wrap.refreshHostCaps = async () => {};
  wrap.subscribeHostCaps = () => () => {};
  return { __esModule: true, ...actual, ...wrap, default: { ...actual.default, ...wrap } };
});

import ConvBody from '../src/workspace/conv/ConvBody';
import ChatSurface from '../src/workspace/conv/ChatSurface';
import PressableScale from '../src/components/ui/PressableScale';
import type { ConvEvent, ConvMsg } from '../src/workspace/conv/convModel';

const T0 = 1790000000000;
const msg = (seq: number, key: string, p: Partial<ConvMsg> = {}): ConvEvent => ({
  seq, ts: T0 + seq, op: 'msg', msg: { key, seq, ts: T0 + seq, role: 'assistant', kind: 'text', text: `답 ${seq}`, ...p } as ConvMsg,
});
const flat = (c: any): string => (Array.isArray(c) ? c.map(flat).join('') : typeof c === 'string' || typeof c === 'number' ? String(c) : c && c.props ? flat(c.props.children) : '');
const texts = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((t) => flat(t.props.children)).filter(Boolean);
const has = (r: ReactTestRenderer.ReactTestRenderer, s: string) => texts(r).some((t) => t.includes(s));
const byLabel = (r: ReactTestRenderer.ReactTestRenderer, label: string) => r.root.findAllByType(PressableScale).filter((n) => n.props.accessibilityLabel === label);
const composerInput = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.props && typeof n.props.onChangeText === 'function' && n.props.multiline)[0];
const searchInput = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.props && typeof n.props.onChangeText === 'function' && n.props.accessibilityLabel === '대화에서 찾기')[0];
const press = async (node: any) => { await act(async () => { node.props.onPress(); await Promise.resolve(); }); await flush(); };

async function flush(ms = 0) {
  await act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 6; i++) await Promise.resolve(); });
}

const patches: any[] = [];
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
function render(p: Partial<React.ComponentProps<typeof ConvBody>> = {}) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  const props: React.ComponentProps<typeof ConvBody> = {
    cwd: 'work/app', host: 7, hostOnline: true, supported: true, account: 12, threadId: null, title: '', initialDraft: '',
    active: true, onPatch: (x) => { patches.push(x); }, ...p,
  };
  act(() => { r = ReactTestRenderer.create(<ConvBody {...props} />); });
  mounted.push(r);
  return { r, props };
}
const opened = (events: ConvEvent[], thread: any = {}) => ({ thread: { id: 't1', state: 'idle', title: '대화', ...thread }, events, headSeq: events.length ? events[events.length - 1].seq : 0, floorSeq: 1, live: [], pending: [] });

beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
  patches.length = 0;
  mockCaps.v = null; mockCaps.subs.clear(); mockCaps.launchArgs = false;
  Object.values(mockRpc).forEach((m) => m.mockReset());
  mockRpc.caps.mockResolvedValue({ enabled: true, agents: [{ id: 'claude', label: 'Claude', available: true }], modes: ['default', 'acceptEdits', 'plan', 'auto'], maxLive: 3 });
  mockRpc.since.mockImplementation(async (_h: any, _id: string, sinceSeq: number) => ({ thread: { id: 't1', state: 'idle' }, events: [], headSeq: sinceSeq, live: [] }));
  mockRpc.open.mockResolvedValue(opened([]));
});
afterEach(() => {
  act(() => { mounted.splice(0).forEach((r) => { try { r.unmount(); } catch (_) { /* noop */ } }); });
  jest.useRealTimers();
});

describe('첨부 썸네일', () => {
  test('★ 보낸 버블의 [첨부] 줄은 칩이 되고, 이미지는 conv.file 로 썸네일 → 탭하면 크게 본다', async () => {
    mockRpc.open.mockResolvedValue(opened([msg(1, 'u:c1', { role: 'user', clientId: 'c1', status: 'sent', text: '이 화면 봐줘\n\n[첨부] /Users/me/shot.png\n[첨부] /Users/me/log.txt' })]));
    mockRpc.file.mockResolvedValue({ mediaType: 'image/png', base64: 'QUJD', bytes: 3, name: 'shot.png' });
    const { r } = render({ threadId: 't1' });
    await flush();
    await flush();
    expect(has(r, '이 화면 봐줘')).toBe(true);
    expect(has(r, '[첨부]')).toBe(false);                       // 줄은 본문에서 뗐다
    expect(has(r, 'log.txt')).toBe(true);                        // 파일은 이름 칩
    expect(mockRpc.file).toHaveBeenCalledWith(7, 't1', '/Users/me/shot.png');
    expect(mockRpc.file).toHaveBeenCalledTimes(1);               // 파일(txt)은 받지 않는다
    const thumb = r.root.findAllByType(Image).find((i) => String(i.props.source?.uri || '').includes('shot.png'));
    expect(thumb).toBeTruthy();
    await press(byLabel(r, 'shot.png')[0]);
    expect(has(r, 'VIEW:shot.png:file:///cache/cpt-media/3-shot.png')).toBe(true);
  });

  test('★ 컴포저에서 첨부해 보내면 attachments 로 가고, 버블은 가진 바이트로 그린다(다시 받지 않는다)', async () => {
    mockRpc.open.mockResolvedValue(opened([msg(1, 'a0', { text: '안녕' })]));
    let done!: (v: any) => void;
    mockRpc.send.mockImplementation(() => new Promise((res) => { done = res; }));
    const { r } = render({ threadId: 't1' });
    await flush();
    const composer = r.root.findAll((n) => n.props && typeof n.props.onAttachAdd === 'function')[0];
    let added: any[] = [];
    await act(async () => { added = composer.props.onAttachAdd([{ path: '/Users/me/new.jpg', name: 'new.jpg', image: true, base64: 'SkZJRg==' }]); });
    await act(async () => { composerInput(r).props.onChangeText(`${added[0].token} 이거 고쳐줘`); });
    await press(byLabel(r, '보내기')[0]);
    const [host, p] = mockRpc.send.mock.calls[0];
    expect(host).toBe(7);
    expect(p.text).toBe('이거 고쳐줘');                          // 토큰은 본문에서 걷었다
    expect(p.attachments).toEqual([{ path: '/Users/me/new.jpg', name: 'new.jpg', mediaType: 'image/jpeg' }]);
    // 낙관 버블 — 로컬 바이트(data:)로 바로 그린다.
    const local = r.root.findAllByType(Image).find((i) => String(i.props.source?.uri || '').startsWith('data:image/jpeg;base64,SkZJRg=='));
    expect(local).toBeTruthy();
    // 서버 행으로 바뀌어도 이미 있는 썸네일을 쓴다.
    mockRpc.since.mockResolvedValueOnce({ thread: { id: 't1', state: 'working' }, events: [msg(2, 'u:' + p.clientId, { role: 'user', clientId: p.clientId, status: 'sent', text: '이거 고쳐줘\n\n[첨부] /Users/me/new.jpg' })], headSeq: 2, live: [] });
    await act(async () => { done({ ok: true, status: 'sent', seq: 2 }); await Promise.resolve(); });
    await flush(); await flush();
    expect(texts(r).filter((t) => t === '이거 고쳐줘').length).toBe(1);
    expect(mockRpc.file).not.toHaveBeenCalled();
    expect(r.root.findAllByType(Image).some((i) => String(i.props.source?.uri || '').startsWith('data:image/jpeg'))).toBe(true);
  });
});

test('★ 어시스턴트 본문의 이미지는 conv.file 로(v1 의 chat.file 이 아니다)', async () => {
  mockRpc.open.mockResolvedValue(opened([msg(1, 'a1', { text: '결과예요\n\n![스크린샷](/Users/me/out.png)' })]));
  mockRpc.file.mockResolvedValue({ mediaType: 'image/png', base64: 'QUJD', bytes: 9, name: 'out.png' });
  const { r } = render({ threadId: 't1' });
  await flush(); await flush();
  expect(mockRpc.file).toHaveBeenCalledWith(7, 't1', '/Users/me/out.png');
  expect(r.root.findAllByType(Image).some((i) => String(i.props.source?.uri || '').includes('9-out.png'))).toBe(true);
});

test('★ 잘린 본문 — [전체 보기] 가 conv.detail 로 받아 교체한다', async () => {
  mockRpc.open.mockResolvedValue(opened([msg(1, 'a1', { text: '앞부분만…', truncated: true })]));
  mockRpc.detail.mockResolvedValue({ text: '앞부분만이 아니라 끝까지 전부' });
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(has(r, '앞부분만…')).toBe(true);
  await press(byLabel(r, '전체 보기')[0]);
  expect(mockRpc.detail).toHaveBeenCalledWith(7, 't1', 'a1');
  expect(has(r, '앞부분만이 아니라 끝까지 전부')).toBe(true);
  expect(byLabel(r, '전체 보기').length).toBe(0);
});

test('★ 대화 안 검색 — 건수·이동·결과 없음·닫기', async () => {
  mockRpc.open.mockResolvedValue(opened([
    msg(1, 'u1', { role: 'user', text: '로그인 버그 고쳐줘' }),
    msg(2, 'a1', { text: '로그인 폼을 고쳤어요' }),
    msg(3, 'a2', { text: '다른 이야기' }),
  ]));
  const { r } = render({ threadId: 't1' });
  await flush();
  expect(searchInput(r)).toBeUndefined();
  // 머리줄이 없다 — 검색은 컴포저 도구줄의 ⋯ 시트에 있다.
  await press(byLabel(r, '더 보기')[0]);
  const findRow = r.root.findAll((n) => n.props && n.props.accessibilityLabel === '대화에서 찾기' && typeof n.props.onPress === 'function')[0];
  await act(async () => { findRow.props.onPress(); });
  await flush(300);
  await act(async () => { searchInput(r).props.onChangeText('로그인'); });
  await flush();
  expect(has(r, '2/2')).toBe(true);                   // 가장 최근 일치부터
  await press(byLabel(r, '이전 일치')[0]);
  expect(has(r, '1/2')).toBe(true);
  await press(byLabel(r, '이전 일치')[0]);
  expect(has(r, '2/2')).toBe(true);                   // 돈다
  await act(async () => { searchInput(r).props.onChangeText('없는 말'); });
  await flush();
  expect(has(r, '결과 없음')).toBe(true);
  await press(byLabel(r, '검색 닫기')[0]);
  expect(searchInput(r)).toBeUndefined();
});

describe('conv.caps', () => {
  test('모드 목록 = 데몬이 받는 모드 ∩ 카탈로그', async () => {
    mockRpc.caps.mockResolvedValue({ enabled: true, agents: [{ id: 'claude', label: 'Claude', available: true }], modes: ['default', 'plan', 'bypassPermissions'], maxLive: 3 });
    const { r } = render({ threadId: 't1' });
    await flush();
    const composer = r.root.findAll((n) => n.props && Array.isArray(n.props.modeChoices))[0];
    expect(composer.props.modeChoices.map((m: any) => m.id)).toEqual(['default', 'plan']);
  });

  test('에이전트가 하나면 선택 줄이 없다 · 둘 이상이면 새 대화에서 고르고 conv.create 에 싣는다', async () => {
    const a = render();
    await flush();
    expect(a.r.root.findAll((n) => n.props && n.props.accessibilityRole === 'radio').length).toBe(0);

    mockRpc.caps.mockResolvedValue({ enabled: true, agents: [{ id: 'claude', label: 'Claude', available: true }, { id: 'codex', label: 'Codex', available: true }], modes: ['default'], maxLive: 3 });
    mockRpc.create.mockImplementation(() => new Promise(() => {}));
    const { r } = render();
    await flush();
    expect(byLabel(r, 'Codex').length).toBe(1);
    await press(byLabel(r, 'Codex')[0]);
    await act(async () => { composerInput(r).props.onChangeText('시작'); });
    await press(byLabel(r, '보내기')[0]);
    expect(mockRpc.create.mock.calls[0][1]).toMatchObject({ agent: 'codex', text: '시작' });
  });

  test('★ 모델 목록이 없으면 모델 입구가 없다 · 있으면 시트에서 골라 conv.set {model}', async () => {
    mockRpc.open.mockResolvedValue(opened([msg(1, 'a1')], { model: 'opus', usage: { contextPct: 12, model: 'opus' } }));
    const a = render({ threadId: 't1' });
    await flush();
    await press(byLabel(a.r, '더 보기')[0]);                   // ⋯ 는 항상 있다(새 대화·목록) — 모델 입구는 목록이 있을 때만
    expect(has(a.r, '새 대화')).toBe(true);
    expect(byLabel(a.r, '모델').length).toBe(0);       // 도구줄 [모델] 버튼(PC 와 같은 자리)도 없다
    act(() => { a.r.unmount(); });
    mounted.splice(mounted.indexOf(a.r), 1);

    mockRpc.caps.mockResolvedValue({ enabled: true, agents: [], modes: ['default'], maxLive: 3, models: ['opus', { id: 'sonnet', label: 'Sonnet' }] });
    mockCaps.v = null;
    mockRpc.set.mockResolvedValue({ thread: { id: 't1', model: 'sonnet' } });
    const { r } = render({ threadId: 't1' });
    await flush();
    // 모델은 컴포저 도구줄의 [모델] 버튼 → 팝오버(PC conv-view 와 같은 자리·동작).
    const row = r.root.findAll((n) => n.props && n.props.accessibilityLabel === '모델' && typeof n.props.onPress === 'function')[0];
    expect(row).toBeTruthy();
    await act(async () => { row.props.onPress(); });
    await flush(300);
    const pick = r.root.findAll((n) => n.props && n.props.accessibilityLabel === 'Sonnet' && typeof n.props.onPress === 'function')[0];
    await act(async () => { pick.props.onPress(); await Promise.resolve(); });
    await flush();
    expect(mockRpc.set).toHaveBeenCalledWith(7, 't1', { model: 'sonnet' });
  });
});

describe('사용량 줄', () => {
  test('모델 · 컨텍스트 n% — usage 가 정본', async () => {
    mockRpc.open.mockResolvedValue(opened([msg(1, 'a1')], { model: 'x', usage: { contextTokens: 1, contextMax: 2, contextPct: 37, costUsd: null, model: 'claude-opus-4-1-20250805' } }));
    const { r } = render({ threadId: 't1' });
    await flush();
    // 도구줄의 사용량 링 → 누르면 상세(모델 · 컨텍스트 n%) — PC _toggleUsagePop 과 같다.
    const ring = r.root.findAll((n) => n.props && n.props.accessibilityLabel === '사용량' && typeof n.props.onPress === 'function')[0];
    expect(ring).toBeTruthy();
    await act(async () => { ring.props.onPress(); });
    await flush(300);
    expect(has(r, 'claude-opus-4-1')).toBe(true);
    expect(has(r, '20250805')).toBe(false);
    expect(has(r, '37%')).toBe(true);
  });
  test('★ 필드가 전부 null 이면 줄이 없다(죽지 않는다)', async () => {
    mockRpc.open.mockResolvedValue(opened([msg(1, 'a1')], { usage: { contextTokens: null, contextMax: null, contextPct: null, costUsd: null, model: null } }));
    const { r } = render({ threadId: 't1' });
    await flush();
    expect(has(r, '컨텍스트')).toBe(false);
  });
});

describe('터미널에서 이어가기(launchargs.v1)', () => {
  const ws: any = { id: 'w1', name: 'app', localPath: 'work/app', hostDeviceId: 7, hostOnline: true };
  function surface(onOpenTerminal: jest.Mock) {
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => { r = ReactTestRenderer.create(<ChatSurface ws={ws} threadId="t1" title="" draft="" active onPatch={() => {}} onOpenTerminal={onOpenTerminal} />); });
    mounted.push(r);
    return r;
  }
  test('서버가 선언하지 않으면 입구가 없다', async () => {
    const r = surface(jest.fn());
    await flush();
    await press(byLabel(r, '더 보기')[0]);
    expect(has(r, '터미널에서 이어가기')).toBe(false);
  });
  test('★ 선언하면 메뉴가 보이고, conv.toTerminal 의 인자를 넘긴다', async () => {
    mockCaps.launchArgs = true;
    mockRpc.toTerminal.mockResolvedValue({ ok: true, cwd: 'work/app', agent: 'claude', command: 'claude --resume t1', args: ['--resume', 't1'] });
    const open = jest.fn();
    const r = surface(open);
    await flush();
    await press(byLabel(r, '더 보기')[0]);
    const row = r.root.findAll((n) => n.props && n.props.accessibilityLabel === '터미널에서 이어가기' && typeof n.props.onPress === 'function')[0];
    await act(async () => { row.props.onPress(); await Promise.resolve(); });
    await flush();
    expect(mockRpc.toTerminal).toHaveBeenCalledWith(7, 't1');
    expect(open).toHaveBeenCalledWith('claude', ['--resume', 't1']);
  });
});

test('★ 탭 제목은 대화 제목을 따라간다(탭이 옛 대화의 제목으로 남지 않게)', async () => {
  mockRpc.open.mockResolvedValue(opened([msg(1, 'a1')], { title: '새 대화 B' }));
  render({ threadId: 't1', title: '파이썬 퀵소트를…' });
  await flush();
  expect(patches).toContainEqual({ title: '새 대화 B' });
  expect(patches.some((p) => 'threadId' in p)).toBe(false);   // 탭의 대화는 건드리지 않는다
});
