// chatNoSession.test.ts — chat.open 이 `noSession`(보여줄 대화 없음)을 돌려줄 때의 **재오픈 폭주 방지**를
// 실행으로 고정한다.
//
// 왜 이 테스트가 필요한가(2026-07-27 계약 리뷰가 지적한 함정):
//  noSession 은 **성공 응답**인데 `chatId: null` 이다. 그래서 "chatId 없으면 다시 열기" 류의 조건이 매
//  폴링 틱(4s)마다 참이 되고, 실패 카운터 기반 스로틀은 성공이라 걸리지도 않는다 → 화면은 정상인데
//  데몬/릴레이만 계속 두들기는 조용한 퇴행(원격 PC 면 릴레이 왕복까지 매 틱). 소스 정규식으로는 절대
//  안 잡히는 종류라 **가짜 타이머로 실제 호출 횟수를 센다**.
//
// 대상: `chatReopen.ts`(정책 정본, DOM/React 없음) + 훅이 그 정책에만 의존한다는 배선 핀.
//  (이 앱 jest 는 RN 컴포넌트 렌더가 불가 — nativewind JSX 인터롭이 transformIgnorePatterns 밖이라
//   훅을 렌더해서는 셀 수 없다. 그래서 결정 로직을 정책으로 떼어냈다.)
import fs from 'fs';
import path from 'path';

import {
  ChatReopenPolicy, BIND_WATCH_DELAYS_MS, SLOW_REOPEN_MS, PUSH_REOPEN_GAP_MS,
} from '../src/workspace/chat/chatReopen';

const POLL_MS = 4000;   // 훅의 폴링 주기(useChatStream POLL_MS) — 아래 핀이 소스와 일치를 확인한다.

/**
 * 훅의 구동 방식을 그대로 재현하는 드라이버.
 *  · open 이 나가면 markOpened + 응답 반영(setNoSession) — 훅의 open() 이 하는 것과 같은 순서.
 *  · 폴링 틱은 정책 onTick 의 반환값으로 "캐치업 진행" 여부를 정한다(훅과 동일).
 */
function harness(reply: () => 'noSession' | 'live', reason: 'not_started' | 'ambiguous' | 'none' = 'not_started') {
  let opens = 0;
  let catchUps = 0;
  const doOpen = () => {
    opens += 1;
    policy.markOpened();
    policy.setNoSession(reply() === 'noSession' ? reason : null);
  };
  const policy = new ChatReopenPolicy({ open: doOpen });
  return {
    policy,
    get opens() { return opens; },
    get catchUps() { return catchUps; },
    firstOpen: doOpen,                                   // 구독 effect 의 최초 open
    tick: () => { if (policy.onTick()) catchUps += 1; },
    foreground: () => { if (policy.onForeground()) catchUps += 1; },
  };
}

/** 가짜 시간을 ms 만큼 흘리며 훅의 폴링 틱을 그대로 발생시킨다. */
function run(h: ReturnType<typeof harness>, ms: number) {
  for (let t = 0; t < ms; t += POLL_MS) {
    jest.advanceTimersByTime(POLL_MS);   // 감시창 타이머도 이 진행에서 발화한다
    h.tick();
  }
}

describe('noSession = 확정 상태(오류 아님) — 재오픈은 의미 있는 트리거에서만', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(0); });
  afterEach(() => { jest.useRealTimers(); });

  it('not_started: 60초 동안 폴링은 15틱인데 재오픈은 느린 간격뿐(초기 1 + 2회)', () => {
    const h = harness(() => 'noSession');
    h.firstOpen();
    expect(h.opens).toBe(1);
    run(h, 60000);
    // 25초 스로틀 → t=28s, t=56s 두 번만 통과. 게이트가 없으면 15회가 된다.
    expect(h.opens).toBe(3);
    // 볼 대화가 없으므로 델타 pull(캐치업)은 단 한 번도 진행하지 않는다.
    expect(h.catchUps).toBe(0);
  });

  it('ambiguous: 자동 재시도가 아예 없다(사용자가 고르기 전까지 답이 정해지지 않는다)', () => {
    const h = harness(() => 'noSession', 'ambiguous');
    h.firstOpen();
    run(h, 120000);
    expect(h.opens).toBe(1);
    expect(h.catchUps).toBe(0);
  });

  it('ambiguous 는 push 가 와도 재오픈하지 않는다', () => {
    const h = harness(() => 'noSession', 'ambiguous');
    h.firstOpen();
    jest.advanceTimersByTime(60000);
    for (let i = 0; i < 20; i++) h.policy.onPush();
    expect(h.opens).toBe(1);
  });

  it('앱 백그라운드↔복귀를 반복해도 폭주하지 않는다(복귀마다 open 금지)', () => {
    const h = harness(() => 'noSession');
    h.firstOpen();
    for (let i = 0; i < 20; i++) h.foreground();      // 시간 진행 없음 = 같은 순간에 20번 복귀
    expect(h.opens).toBe(1);
    jest.advanceTimersByTime(SLOW_REOPEN_MS + 1);
    h.foreground();                                    // 느린 간격을 넘긴 첫 복귀만 통과
    expect(h.opens).toBe(2);
  });

  it('chat_event push 는 스로틀(3s) 안에서 한 번만 재오픈한다', () => {
    const h = harness(() => 'noSession');
    h.firstOpen();
    jest.advanceTimersByTime(PUSH_REOPEN_GAP_MS + 1);
    for (let i = 0; i < 10; i++) h.policy.onPush();   // 같은 순간의 프레임 폭우
    expect(h.opens).toBe(2);
    jest.advanceTimersByTime(PUSH_REOPEN_GAP_MS + 1);
    h.policy.onPush();
    expect(h.opens).toBe(3);
  });

  it('첫 메시지 전송 후 감시창이 대화를 잡고, 붙는 즉시 멈춘다', () => {
    let live = false;
    const h = harness(() => (live ? 'live' : 'noSession'));
    h.firstOpen();
    expect(h.opens).toBe(1);
    live = true;                                       // 전송 → 훅이 바인딩을 만든다
    h.policy.onSend();
    jest.advanceTimersByTime(BIND_WATCH_DELAYS_MS[0]);  // 첫 확인에서 붙는다
    expect(h.opens).toBe(2);
    expect(h.policy.noSession).toBeNull();
    run(h, 60000);                                     // 그 뒤로는 open 없이 캐치업만
    expect(h.opens).toBe(2);
    expect(h.catchUps).toBe(60000 / POLL_MS);
  });

  it('전송해도 바인딩이 안 생기면 감시창은 상한에서 멈춘다(무한 두들김 금지)', () => {
    const h = harness(() => 'noSession');
    h.firstOpen();
    h.policy.onSend();
    // 감시창 전체 길이보다 넉넉히 흘린다(폴링 틱 없이 = 감시창 단독 계측).
    jest.advanceTimersByTime(BIND_WATCH_DELAYS_MS.reduce((a, b) => a + b, 0) * 3);
    expect(h.opens).toBe(1 + BIND_WATCH_DELAYS_MS.length);
    // 상한 이후에는 아무리 기다려도 더 늘지 않는다.
    const at = h.opens;
    jest.advanceTimersByTime(600000);
    expect(h.opens).toBe(at);
  });

  it('전송 감시창은 재전송마다 다시 열린다(첫 시도가 상한을 태워도 두 번째 전송이 살아난다)', () => {
    const h = harness(() => 'noSession');
    h.firstOpen();
    h.policy.onSend();
    jest.advanceTimersByTime(60000);
    const after1 = h.opens;
    h.policy.onSend();
    jest.advanceTimersByTime(BIND_WATCH_DELAYS_MS[0] + 1);
    expect(h.opens).toBe(after1 + 1);
  });

  it('대화가 붙은 뒤에는 정책이 평소 경로(캐치업)만 허용한다', () => {
    const h = harness(() => 'live');
    h.firstOpen();
    run(h, 20000);
    expect(h.opens).toBe(1);
    expect(h.catchUps).toBe(5);
    h.policy.onSend();                                  // live 에서는 감시창을 열지 않는다
    jest.advanceTimersByTime(60000);
    expect(h.opens).toBe(1);
  });
});

// ── 배선 핀: 훅이 재오픈을 스스로 결정하지 않는다(정책 위임) ────────────────────────
//  위 실행 검증이 의미를 갖는 전제 = "훅에 다른 재오픈 경로가 없다". 정규식이지만 이 핀이 없으면
//  누군가 훅 안에 `if (!chatIdRef.current) open()` 을 되살려도 위 테스트는 전부 초록으로 남는다.
describe('useChatStream 배선 — 정책에만 의존한다', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../src/workspace/chat/useChatStream.ts'), 'utf8');

  it('폴링 주기 상수가 이 테스트의 가정과 같다', () => {
    expect(/const POLL_MS = (\d+);/.exec(src)?.[1]).toBe(String(POLL_MS));
  });

  it('캐치업은 noSession 이면 즉시 반환한다(재오픈 금지)', () => {
    const at = src.indexOf('const catchUp = useCallback');
    const body = src.slice(at, at + 400);
    expect(/if \(policy\.noSession\) return;/.test(body)).toBe(true);
    // "chatId 없으면 열기" 는 그 게이트 **뒤에** 있어야 한다.
    expect(body.indexOf('if (policy.noSession) return;')).toBeLessThan(body.indexOf('if (!chatIdRef.current)'));
  });

  it('폴링/포그라운드/푸시/전송이 전부 정책을 거친다', () => {
    expect(/setInterval\(\(\) => \{ if \(policy\.onTick\(\)\) void catchUp\(\); \}, POLL_MS\)/.test(src)).toBe(true);
    expect(/if \(policy\.onForeground\(\)\) void catchUp\(\);/.test(src)).toBe(true);
    expect(/policy\.onPush\(\);/.test(src)).toBe(true);
    expect(/if \(policy\.noSession\) \{ policy\.onSend\(\); return; \}/.test(src)).toBe(true);
  });

  it('noSession 응답은 오류가 아니라 empty 상태로 확정된다(배너 금지)', () => {
    const at = src.indexOf('if (snap.noSession === true || !snap.chatId)');
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf('return;', at));
    expect(/setState\('empty'\)/.test(body)).toBe(true);
    expect(/setError\(null\)/.test(body)).toBe(true);
    expect(/setState\('error'\)/.test(body)).toBe(false);
  });
});
