// chatReopen.ts — "언제 chat.open 을 다시 부를지" 결정만 담은 **순수 정책**(DOM/React 없음).
//
// 왜 별 파일인가(2026-07-27 계약 리뷰가 지적한 함정):
//  `chat.open` 이 `noSession`(보여줄 대화 없음)을 돌려줄 때 그것은 **성공 응답**인데 `chatId` 가 null 이다.
//  그래서 스트림 훅의 기존 규칙("chatId 가 없으면 다시 열기")이 폴링 틱마다 참이 되고, 실패 카운터 기반
//  스로틀은 성공이라 걸리지도 않는다 → 화면은 정상인데 데몬/릴레이만 4초마다 두들기는 조용한 퇴행이 된다
//  (원격 PC 면 릴레이 왕복까지). 정책이 훅 안에 인라인으로 있으면 이걸 실행으로 검증할 수 없다(이 앱의
//  jest 에서는 RN 컴포넌트 렌더가 불가 = nativewind JSX 인터롭이 변환 대상이 아니다) → 정책만 떼어
//  `__tests__/chatNoSession.test.ts` 가 **가짜 타이머로 호출 횟수를 센다**.
//
// 규칙(사용자·부모 확정):
//  · noSession 은 실패가 아니라 **확정된 상태**다. 그 상태에서 기본 재오픈은 하지 않는다.
//  · 재오픈은 의미 있는 트리거에서만: ① 첫 메시지 전송 직후(짧은 감시창 — 훅이 바인딩을 만들 때까지)
//    ② chat_event push 수신 ③ 리타깃(cwd/tid/선택 세션 변경 — 훅의 effect 가 정책을 새로 만든다)
//    ④ 그 밖에는 긴 간격(SLOW_REOPEN_MS)뿐.
//  · 'ambiguous' 는 사용자가 고르기 전까지 답이 바뀌지 않으므로 **자동 재시도 자체가 없다**.

/** noSession 사유(데몬 계약). null = 대화가 있다(정상 스트림). */
// 'claimed' = 후보가 있지만 **전부 다른 터미널이 바인딩한 대화**다(데몬 resolveTarget ④-b).
//  'ambiguous' 와 같이 사람이 고를 여지가 있지만, 이쪽은 훅이 이 터미널의 바인딩을 만드는 순간
//  저절로 해소되므로 **느린 재확인은 유지한다**(자동 재시도 0회는 'ambiguous' 뿐이다).
export type ChatNoSession = 'not_started' | 'ambiguous' | 'none' | 'claimed';

/** not_started/none 의 배경 재확인 간격 — 사용자가 PC 앞에서 대화를 시작할 수도 있다. */
export const SLOW_REOPEN_MS = 25000;
/** chat_event push 로 재오픈할 때의 최소 간격(우리 chatId 가 없어 남의 프레임에도 반응하므로 필요). */
export const PUSH_REOPEN_GAP_MS = 3000;
/** 전송 직후 감시창 — 이 배열 길이가 곧 시도 상한이다(붙으면 즉시 중단). */
export const BIND_WATCH_DELAYS_MS = [800, 1600, 3000, 6000, 10000];

export interface ChatReopenDeps {
  /** 실제 재오픈(훅의 open). 정책은 호출만 하고 결과는 setNoSession 으로 되돌려 받는다. */
  open: () => void;
  /** 테스트에서 시간 주입 — 기본은 Date.now. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

export class ChatReopenPolicy {
  private readonly d: Required<Pick<ChatReopenDeps, 'open'>> & ChatReopenDeps;
  private reason: ChatNoSession | null = null;
  private lastOpenAt = 0;
  private bindTimer: unknown = null;
  private bindStep = 0;

  constructor(deps: ChatReopenDeps) {
    this.d = deps;
  }

  private now(): number { return this.d.now ? this.d.now() : Date.now(); }
  private setTimer(fn: () => void, ms: number): unknown {
    return this.d.setTimer ? this.d.setTimer(fn, ms) : setTimeout(fn, ms);
  }
  private clearTimer(h: unknown): void {
    if (h == null) return;
    if (this.d.clearTimer) this.d.clearTimer(h);
    else clearTimeout(h as ReturnType<typeof setTimeout>);
  }

  /** 지금 "보여줄 대화 없음" 상태인가(훅의 캐치업 게이트가 이걸 본다). */
  get noSession(): ChatNoSession | null { return this.reason; }

  /** chat.open 을 부를 때마다(정책 밖에서 부른 것도 포함) 호출 — 스로틀의 기준 시각. */
  markOpened(): void { this.lastOpenAt = this.now(); }

  /** chat.open 응답 반영. null = 대화가 붙었다 → 감시창을 즉시 끝낸다. */
  setNoSession(reason: ChatNoSession | null): void {
    this.reason = reason;
    if (!reason) this.cancelBindWatch();
  }

  /** 폴링 틱(수 초 주기). true 를 돌려주면 호출부가 캐치업(델타 pull)을 진행해야 한다. */
  onTick(): boolean {
    if (!this.reason) return true;                       // 정상 스트림 — 평소 경로
    if (this.reason === 'ambiguous') return false;       // 사용자 선택 전까지 아무것도 하지 않는다
    this.tryOpen(SLOW_REOPEN_MS);
    return false;
  }

  /** 포그라운드 복귀. true = 캐치업 진행. (복귀마다 open 하지 않는다 — 앱 전환이 잦으면 그게 폭주다) */
  onForeground(): boolean {
    return this.onTick();
  }

  /** chat_event push 를 받았지만 우리 chatId 가 없을 때 — 스로틀 걸어 확인만. */
  onPush(): void {
    if (!this.reason || this.reason === 'ambiguous') return;
    this.tryOpen(PUSH_REOPEN_GAP_MS);
  }

  /** 첫 메시지 전송 직후 — 훅이 바인딩을 만들 때까지 짧게 몇 번만 확인한다(상한 있음). */
  onSend(): void {
    if (!this.reason) return;                            // 이미 대화가 있다 → 평소 캐치업이 처리
    this.cancelBindWatch();
    this.bindStep = 0;
    this.stepBindWatch();
  }

  /**
   * 대기 중인 감시창 타이머를 취소한다(구독 effect 정리 시점).
   *  ⚠ **영구 정지 플래그를 두지 않는다**: 정책 객체는 마운트 동안 하나이고 구독 effect 는 리타깃마다
   *   다시 도는데, 한 번의 정리로 정책을 영구 사망시키면 그 뒤 모든 재오픈 트리거가 조용히 죽는다
   *   (전송해도 대화가 안 붙는 형태의 결함 — 에러 0건). 언마운트 후 늦게 뜨는 타이머는 훅의 aliveRef
   *   가드가 no-op 으로 흡수한다.
   */
  cancel(): void {
    this.cancelBindWatch();
  }

  private tryOpen(minGapMs: number): void {
    if (this.now() - this.lastOpenAt < minGapMs) return;
    this.markOpened();
    this.d.open();
  }

  private cancelBindWatch(): void {
    if (this.bindTimer != null) { this.clearTimer(this.bindTimer); this.bindTimer = null; }
  }

  private stepBindWatch(): void {
    if (!this.reason) return;                            // 이미 붙었다 → 감시 종료
    const i = this.bindStep++;
    const delay = BIND_WATCH_DELAYS_MS[i];
    if (delay == null) return;                           // 상한 — 더 이상 두들기지 않는다
    this.bindTimer = this.setTimer(() => {
      this.bindTimer = null;
      if (!this.reason) return;
      this.markOpened();
      this.d.open();
      // 다음 확인 예약은 응답을 반영(setNoSession)한 뒤에 판단한다 — 붙었으면 여기서 끝난다.
      this.stepBindWatch();
    }, delay);
  }
}
