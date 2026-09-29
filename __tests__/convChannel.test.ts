/**
 * 알림 채널(WSS/SSE)의 채팅 v2 배선.
 *
 * 고정하는 것:
 *  · conv_event 프레임이 **WSS 와 SSE 폴백 양쪽**에서 convService 로 흘러간다(한쪽만 배선하면 폴백으로
 *    내려간 기기에서 채팅이 조용히 멈춘다).
 *  · ui_hello 의 caps 에 conv.v1 이 실린다.
 *  · 연결 상태(연결됨/재연결 중)를 구독할 수 있다 — 첫 연결 전은 "재연결 중"이 아니다.
 *  · 채널 리셋 리스너는 **여럿** 붙는다. 기존 단일 슬롯(setChannelResetListener)을 덮지 않는다.
 *  · 알림 딥링크의 thread·host 를 읽는다(없으면 예전 그대로).
 */
import fs from 'node:fs';
import path from 'node:path';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../src/services/daemonService', () => ({ __esModule: true, default: {}, getClientKey: async () => 'ck', getMyDeviceId: async () => 3, getDeviceLabel: () => '내 폰' }));
jest.mock('../src/utils/api', () => ({ apiRequest: jest.fn(), api: { daemon: { eventStream: jest.fn() } }, refreshAccessToken: jest.fn(async () => 'tok2') }));
jest.mock('../src/services/e2ee', () => ({ __esModule: true, default: { clientCaps: () => [], openEnvelope: () => null } }));

import notificationService, {
  addChannelResetListener, getChannelState, setChannelResetListener, subscribeChannelState, subscribeNotifEvents,
} from '../src/services/notificationService';
import convService from '../src/services/convService';
import { deeplinkOfPush, parseConvDeeplink, parseNotifDeeplink } from '../src/services/pushService';

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) { FakeSocket.all.push(this); }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  push(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
  drop() { this.readyState = 3; this.onclose?.(); }
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(async () => {
  jest.useFakeTimers();
  FakeSocket.all = [];
  (global as any).WebSocket = FakeSocket;
  await AsyncStorage.setItem('accessToken', 'tok');
});
afterEach(() => { jest.useRealTimers(); });

test('★ WSS — conv_event 가 convService 로 흐르고, 연결 상태·리셋 리스너가 돈다', async () => {
  const got: any[] = [];
  const offConv = convService.addConvEventListener((f) => got.push(f));
  const states: string[] = [];
  const offState = subscribeChannelState(() => states.push(getChannelState()));
  let single = 0; let multiA = 0; let multiB = 0;
  setChannelResetListener(() => { single += 1; });
  const offA = addChannelResetListener(() => { multiA += 1; });
  const offB = addChannelResetListener(() => { multiB += 1; });

  const unsub = subscribeNotifEvents(() => {});
  expect(getChannelState()).toBe('connecting');       // 첫 연결 전 — 끊긴 게 아니다
  await tick();
  const s1 = FakeSocket.all[0];
  expect(s1.url).toContain('/api/daemon/agent/stream');
  s1.open();
  await tick();
  expect(getChannelState()).toBe('open');
  expect([single, multiA, multiB]).toEqual([1, 1, 1]);   // 기존 슬롯도 그대로 불린다
  const hello = s1.sent.find((m) => m.type === 'ui_hello');
  expect(hello.caps).toContain('conv.v1');
  expect(hello.caps).toContain('approval.v1');

  s1.push({ type: 'conv_event', threadId: 't1', hostDeviceId: 7, headSeq: 3, events: [{ seq: 3, op: 'notice', level: 'info', text: 'x' }] });
  s1.push({ type: 'conv_event', threadId: 't1', hostDeviceId: 7, delta: { key: 'k', kind: 'text', off: 0, text: '가' } });
  s1.push({ type: 'conv_event', hostDeviceId: 7, control: { kind: 'deleted', threadId: 't9' } });
  s1.push({ type: 'conv_event' });                       // 대화를 모르는 프레임 — 버린다
  s1.push({ type: 'chat_event', chatId: 'c' });          // 다른 종류 — conv 로 오지 않는다
  expect(got.map((f) => f.threadId || f.control.threadId)).toEqual(['t1', 't1', 't9']);
  expect(got[1].delta.text).toBe('가');

  // 끊김 → 재연결 중 → 다시 열리면 리셋 신호(그 사이 push 를 놓쳤다).
  s1.drop();
  await tick();
  expect(getChannelState()).toBe('reconnecting');
  jest.advanceTimersByTime(3100);
  await tick();
  const s2 = FakeSocket.all[1];
  s2.open();
  await tick();
  expect(getChannelState()).toBe('open');
  expect([single, multiA, multiB]).toEqual([2, 2, 2]);
  offB();
  s2.drop(); await tick(); jest.advanceTimersByTime(3100); await tick();
  FakeSocket.all[2].open(); await tick();
  expect([single, multiA, multiB]).toEqual([3, 3, 2]);

  unsub();
  expect(getChannelState()).toBe('idle');
  expect(states).toEqual(expect.arrayContaining(['open', 'reconnecting', 'idle']));
  offConv(); offState(); offA(); setChannelResetListener(null);
  expect(notificationService.addChannelResetListener).toBe(addChannelResetListener);
});

test('SSE 폴백도 conv_event 를 분배한다(소스 고정)', () => {
  // SSE 경로는 XHR 스트림이라 여기서 돌리기 어렵다 → 분배 호출이 **두 경로 모두**에 있는지를 소스로 고정한다.
  const src = fs.readFileSync(path.join(__dirname, '../src/services/notificationService.ts'), 'utf8');
  const sse = src.slice(src.indexOf('function subscribeNotifEventsSse'));
  expect(sse).toContain('dispatchConv(msg)');
  const wss = src.slice(src.indexOf('export function subscribeNotifEvents('), src.indexOf('function subscribeNotifEventsSse'));
  expect(wss).toContain('dispatchConv(m)');
});

describe('알림 딥링크 — thread·host', () => {
  test('★ 채팅 알림', () => {
    expect(parseNotifDeeplink('codingpt://notif/812?ws=ws_1&cwd=work%2Fapp&thread=0d1c-22&host=7'))
      .toEqual({ id: '812', ws: 'ws_1', cwd: 'work/app', win: null, threadId: '0d1c-22', host: 7 });
  });
  test('thread 가 없으면 예전 그대로(터미널 win)', () => {
    expect(parseNotifDeeplink('codingpt://notif/5?ws=w&cwd=a&win=12')).toEqual({ id: '5', ws: 'w', cwd: 'a', win: 12, threadId: null, host: null });
  });
  test('★ 데몬이 실은 딥링크 — codingpt://conv/<threadId>?cwd=&host=', () => {
    expect(parseConvDeeplink('codingpt://conv/0d1c-22?cwd=work%2Fapp&host=7')).toEqual({ threadId: '0d1c-22', cwd: 'work/app', host: 7 });
    expect(parseConvDeeplink('codingpt://conv/0d1c-22')).toEqual({ threadId: '0d1c-22', cwd: null, host: null });
    expect(parseConvDeeplink('codingpt://conv/')).toBeNull();
    expect(parseConvDeeplink('codingpt://conversation/x')).toBeNull();     // 접두만 같은 다른 종류
    expect(parseConvDeeplink('codingpt://notif/5?thread=t')).toBeNull();
  });

  test('★ 푸시 data 의 threadId·hostDeviceId 로 링크를 보강한다', () => {
    // 링크가 이미 그 대화를 가리키면 그대로.
    expect(deeplinkOfPush({ deeplink: 'codingpt://conv/t1?cwd=a&host=7', threadId: 't1', hostDeviceId: '7' })).toBe('codingpt://conv/t1?cwd=a&host=7');
    expect(deeplinkOfPush({ deeplink: 'codingpt://notif/5?ws=w&thread=t1&host=7', threadId: 't1' })).toBe('codingpt://notif/5?ws=w&thread=t1&host=7');
    // 기본 알림 링크에 대화가 빠져 있으면 붙인다.
    const a = deeplinkOfPush({ deeplink: 'codingpt://notif/5?ws=w&cwd=a', threadId: 't1', hostDeviceId: 7 })!;
    expect(parseNotifDeeplink(a)).toMatchObject({ id: '5', ws: 'w', cwd: 'a', threadId: 't1', host: 7 });
    expect(parseNotifDeeplink(deeplinkOfPush({ deeplink: 'codingpt://notif/5', threadId: 't1' })!)).toMatchObject({ threadId: 't1', host: null });
    // 링크가 없으면 만든다.
    expect(parseConvDeeplink(deeplinkOfPush({ threadId: 't 1', hostDeviceId: '7', cwd: 'work/app' })!)).toEqual({ threadId: 't 1', cwd: 'work/app', host: 7 });
    // 채팅 알림이 아니면 예전 그대로.
    expect(deeplinkOfPush({ deeplink: 'codingpt://task/x?host=1' })).toBe('codingpt://task/x?host=1');
    expect(deeplinkOfPush({ deeplink: 'codingpt://task/x?host=1', threadId: 't1' })).toBe('codingpt://task/x?host=1');
    expect(deeplinkOfPush({})).toBeNull();
    expect(deeplinkOfPush(null)).toBeNull();
  });

  test('host 가 숫자가 아니면 모름', () => {
    expect(parseNotifDeeplink('codingpt://notif/5?thread=t&host=abc')).toMatchObject({ threadId: 't', host: null });
    expect(parseNotifDeeplink('codingpt://notif/5?thread=t&host=')).toMatchObject({ host: null, win: null });
  });
});
