// lanPath.ts — (내 기기 × 대상 PC × 네트워크) 쌍별 "경로 상태" 순수 상태 머신.
//
// 왜 순수 함수인가: 경로 승격/강등은 플래핑하면 사용자가 즉시 체감하는(프리뷰가 끊기는) 로직인데
//  타이머·소켓과 얽히면 경계값을 검증할 방법이 없다. 여기엔 I/O 가 한 줄도 없고 시간은 인자로만
//  들어온다 → `__tests__/lanPath.test.ts` 가 임계값을 고정한다.
//
// 절대 규율(과거 사고 기반)
//  · 이 파일은 **호스트 온/오프라인을 모른다**. 경로 상태와 호스트 상태는 완전히 분리된 두 값이다
//    (LAN 실패를 "호스트 오프라인"으로 오탐하면 차단 오버레이가 뜨는 게 그 사고 — 설계 §5.3).
//  · 이 파일은 터미널 재연결 카운터를 모른다. LAN 실패는 여기서만 세고, RECONNECT_MAX 와 절대 공유하지 않는다.
//  · `mode==='lan'` 이 아닌 모든 상태는 **정상**이다. relay 는 에러가 아니라 기본값이다.

export type PathMode = 'relay' | 'probing' | 'lan' | 'cooldown';

export interface PathState {
  mode: PathMode;
  /** 이 상태가 묶인 네트워크 지문(성공 endpoint 의 /24, IPv6 는 /64). 바뀌면 엔트리를 새로 만든다. */
  fingerprint: string;
  /** 연속 probe 성공 수(승격 조건) */
  okStreak: number;
  /** 연속 소프트 실패 수(강등 조건) */
  softStreak: number;
  /** 이 지문에서의 누적 하드 실패 — 3회면 blocked(iOS 로컬 네트워크 권한 거부 추정) */
  hardFails: number;
  /** mode 진입 시각(최소 체류 판정) */
  enteredAt: number;
  /** lan 진입 직후 관찰 구간 종료 시각(이 구간의 오류는 즉시 강등) */
  observeUntil: number;
  /** 쿨다운 종료 시각 */
  cooldownUntil: number;
  /** 다음 쿨다운 길이(강등마다 ×2, 상한 15분) */
  cooldownMs: number;
  /** 이 지문에서 LAN 영구 중단(사용자가 설정에서 해제하거나 네트워크가 바뀌어야 풀린다) */
  blocked: boolean;
  /** 이 호스트는 LAN 자체를 지원하지 않음(grant 404 LAN_UNSUPPORTED) — 정상 상태다 */
  unsupported: boolean;
  /** 사용자 설정 OFF */
  disabled: boolean;
}

export type PathEvent =
  /** probe(연결+인증 왕복) 성공. rttMs 가 상한을 넘으면 성공으로 세지 않는다. */
  | { t: 'probe_ok'; rttMs: number; fingerprint: string }
  /**
   * 하드 실패 — 1회로 즉시 강등.
   * cause 로 원인을 구분한다(이게 없으면 "집에서 직결이 영구히 죽는" 버그가 난다):
   *  · 'auth'|'proto' — 이 네트워크가 우리를 **거부**한다는 신호(인증 실패/프레임 위반).
   *    반복되면 그 네트워크에서 그만 시도할 근거가 된다 → blocked 카운터에 넣는다.
   *  · 'unreachable' — 그냥 **닿지 않았다**(connect/handshake 타임아웃).
   *    폰이 다른 망(셀룰러·외부 Wi-Fi)에 있을 때 항상 이 결과가 나오는데, 지문은 대상 PC 의
   *    서브넷이라 그 실패가 **집 지문**에 누적된다. 3회면 blocked 가 되고 해제 수단이 설정 토글뿐이라,
   *    외출 중 프리뷰를 몇 번 열었다는 이유로 귀가 후에도 직결이 영구 미사용이 된다(조용히·영구히).
   *    → 쿨다운만 걸고 blocked 카운터에는 넣지 않는다.
   */
  | { t: 'hard_fail'; cause?: 'auth' | 'proto' | 'unreachable' }
  /** 소프트 실패 — RTT 초과/채널 오픈 타임아웃. 2연속으로 강등(최소 체류 중엔 무시). */
  | { t: 'soft_fail' }
  /** grant 가 LAN_UNSUPPORTED — 서버 스위치 off/구 데몬/클라우드 러너. 조용히 릴레이. */
  | { t: 'unsupported' }
  /** lan 이 관찰 구간을 무사히 넘겼다 — 백오프를 기본값으로 되돌린다. */
  | { t: 'settle' }
  /**
   * 부활 트리거 — 앱 포그라운드 복귀 / 사용자 새로고침 / lan_update. 쿨다운 1회 무시.
   * user:true = 사용자의 명시적 제스처(새로고침/재시도 버튼) → blocked 까지 해제한다.
   *  자동 부활(포그라운드 복귀)은 blocked 를 건드리지 않는다(스팸 방지).
   */
  | { t: 'revive'; user?: boolean }
  /** 네트워크가 바뀌었다(다른 Wi-Fi/셀룰러) — 지문 기반 상태를 통째로 리셋. */
  | { t: 'net_change'; fingerprint: string }
  | { t: 'disable' }
  | { t: 'enable' };

/**
 * 사설(RFC1918/CGNAT 밖) 주소인가 — LAN 직결은 **사설 대역으로만** 다이얼한다.
 *
 * 서버가 주소를 정규화해 주지만(back normLanInfo), 클라이언트도 스스로 이 축을 지켜야 한다:
 * 서버가 침해되면 "공용 IP 로 직결하라"는 힌트를 내려 우리 트래픽을 임의 호스트로 유도할 수 있다.
 * 심층방어 1줄로 그 경로를 없앤다.
 *  · 허용: 10/8, 172.16-31/12, 192.168/16, 169.254/16(링크로컬 — 호스트가 명시할 때만)
 *  · IPv6: fc00::/7(ULA), fe80::/10(링크로컬). ::ffff:a.b.c.d 는 IPv4 로 접어 판정.
 *  · 거부: 그 외 전부(공용·loopback 포함 — loopback 은 LAN 직결의 대상이 아니다)
 */
export function isPrivateHost(host: string): boolean {
  let h = String(host || '').trim().toLowerCase();
  if (!h) return false;
  const zone = h.indexOf('%'); // fe80::1%en0 — zone-id 제거
  if (zone >= 0) h = h.slice(0, zone);
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  const v4mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (v4mapped) h = v4mapped[1];
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]);
    if ([a, b, Number(m[3]), Number(m[4])].some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;  // fc00::/7
  if (/^fe[89ab][0-9a-f]?:/.test(h)) return true; // fe80::/10
  return false;
}

// ── 임계값(설계 §6 확정안) ───────────────────────────────────────────────
export const PROBE_OK_STREAK = 2;          // 승격에 필요한 연속 성공
export const PROBE_RTT_MAX_MS = 800;       // 이보다 느린 성공은 성공으로 세지 않는다
export const OBSERVE_MS = 3_000;           // 승격 후 관찰 구간(오류 0 이어야 정착)
export const MIN_DWELL_MS = 30_000;        // lan 최소 체류(소프트 실패로는 강등 안 함)
export const SOFT_FAIL_STREAK = 2;         // 소프트 실패 강등 임계
export const COOLDOWN_BASE_MS = 60_000;    // 첫 쿨다운
export const COOLDOWN_MAX_MS = 15 * 60_000; // 쿨다운 상한
export const HARD_FAIL_BLOCK = 3;          // 같은 네트워크에서 이만큼 하드 실패 → 영구 중단
export const UNSUPPORTED_RETRY_MS = 30 * 60_000; // 미지원 호스트 재확인 주기(grant 왕복 억제)

export function initialState(fingerprint = '', now = 0): PathState {
  return {
    mode: 'relay', fingerprint, okStreak: 0, softStreak: 0, hardFails: 0,
    enteredAt: now, observeUntil: 0, cooldownUntil: 0, cooldownMs: COOLDOWN_BASE_MS,
    blocked: false, unsupported: false, disabled: false,
  };
}

/** 지금 probe 를 시도해도 되는가 — 이 판정이 false 인 것은 전부 "정상"이다(사용자에게 아무 표시 없음). */
export function canProbe(s: PathState, now: number): boolean {
  if (s.disabled || s.blocked) return false;
  if (s.mode === 'lan' || s.mode === 'probing') return false;
  return now >= s.cooldownUntil;
}

/** 지금 이 경로로 새 연결을 만들 때 LAN 을 써야 하는가. (이미 살아있는 연결은 건드리지 않는다) */
export function shouldUseLan(s: PathState): boolean {
  return s.mode === 'lan';
}

/** 사이드바 배지용 — 'lan' 일 때만 표시하고 나머지는 아무것도 표시하지 않는다(정상을 시끄럽게 하지 않는다). */
export function badge(s: PathState): '직결' | null {
  return s.mode === 'lan' ? '직결' : null;
}

// 강등 공통 — 쿨다운 진입 + 백오프 2배(상한). hard 여부에 따라 blocked 카운터를 올린다.
function demote(s: PathState, now: number, hard: boolean): PathState {
  const hardFails = hard ? s.hardFails + 1 : s.hardFails;
  return {
    ...s,
    mode: 'cooldown',
    okStreak: 0,
    softStreak: 0,
    hardFails,
    enteredAt: now,
    observeUntil: 0,
    cooldownUntil: now + s.cooldownMs,
    cooldownMs: Math.min(s.cooldownMs * 2, COOLDOWN_MAX_MS),
    // 같은 네트워크에서 하드 실패가 반복 = 방화벽/iOS 권한 거부 → 그 네트워크에선 그만 시도한다.
    //  (iOS 는 권한 거부를 알려주는 API 가 없어 "실패 반복"이 유일한 신호다 — 설계 §2.6)
    blocked: hardFails >= HARD_FAIL_BLOCK,
  };
}

/** 상태 전이(순수). 알 수 없는 이벤트는 상태를 그대로 돌려준다(배관 안전). */
export function step(s: PathState, ev: PathEvent, now: number): PathState {
  switch (ev.t) {
    case 'disable':
      return { ...s, mode: 'relay', disabled: true, okStreak: 0, softStreak: 0, enteredAt: now };
    case 'enable':
      // 사용자가 다시 켜면 blocked/쿨다운까지 초기화(수동 재시도 = 명시적 의사표시).
      return { ...initialState(s.fingerprint, now) };
    case 'net_change':
      // 지문이 바뀌면 이전 네트워크의 실패 이력은 무의미하다 → 통째로 리셋(disabled 만 승계).
      if (ev.fingerprint === s.fingerprint) return s;
      return { ...initialState(ev.fingerprint, now), disabled: s.disabled };
    case 'unsupported':
      // 이 호스트는 LAN 을 못 한다(구 데몬/서버 off/클라우드). 오래 쉬되 blocked 는 아니다.
      return {
        ...s, mode: 'cooldown', unsupported: true, okStreak: 0, softStreak: 0,
        enteredAt: now, observeUntil: 0, cooldownUntil: now + UNSUPPORTED_RETRY_MS,
      };
    case 'revive':
      if (s.disabled) return s;
      // 사용자가 직접 다시 시도한 것이면 blocked 를 푼다 — 자동 복구 수단이 없으면 기능이 영구히 죽는다.
      if (s.blocked) {
        if (!ev.user) return s;
        return { ...s, blocked: false, hardFails: 0, mode: 'relay', cooldownUntil: 0, cooldownMs: COOLDOWN_BASE_MS, enteredAt: now };
      }
      // 미지원 호스트는 부활로도 앞당기지 않는다 — 포그라운드 복귀마다 grant 를 두드리면 스팸이다.
      if (s.unsupported) return s;
      if (s.mode !== 'cooldown') return s;
      return { ...s, mode: 'relay', cooldownUntil: 0, enteredAt: now };
    case 'settle':
      if (s.mode !== 'lan') return s;
      // 정착 = 백오프 리셋. 다음 강등은 다시 60s 부터 시작한다.
      return { ...s, cooldownMs: COOLDOWN_BASE_MS, hardFails: 0, softStreak: 0 };
    case 'probe_ok': {
      if (s.disabled || s.blocked) return s;
      if (s.mode === 'lan') return { ...s, softStreak: 0 };
      // 느린 성공은 승격 근거가 못 된다 — 릴레이보다 나을 게 없으므로 스트릭을 초기화한다.
      if (ev.rttMs > PROBE_RTT_MAX_MS) return { ...s, mode: 'relay', okStreak: 0 };
      const okStreak = s.okStreak + 1;
      const fingerprint = ev.fingerprint || s.fingerprint;
      if (okStreak < PROBE_OK_STREAK) return { ...s, mode: 'probing', okStreak, fingerprint, unsupported: false };
      return {
        ...s, mode: 'lan', okStreak, softStreak: 0, fingerprint, unsupported: false,
        enteredAt: now, observeUntil: now + OBSERVE_MS,
      };
    }
    case 'hard_fail': {
      if (s.disabled) return s;
      // 닿지 않은 것(타임아웃)은 "이 망이 거부한다"는 증거가 아니다 — 쿨다운만.
      const counts = ev.cause === 'auth' || ev.cause === 'proto';
      return demote(s, now, counts);
    }
    case 'soft_fail': {
      if (s.disabled) return s;
      if (s.mode !== 'lan') {
        // 승격 시도 중의 소프트 실패는 스트릭만 깨고 릴레이로 되돌린다(쿨다운 없음 = 다음 기회 즉시).
        return { ...s, mode: 'relay', okStreak: 0 };
      }
      // 관찰 구간의 오류는 "승격이 틀렸다"는 신호 → 즉시 강등(최소 체류 예외).
      if (now < s.observeUntil) return demote(s, now, false);
      // 최소 체류 중엔 소프트 실패를 무시한다(플랩 방지). 하드 실패는 위에서 예외 처리.
      if (now - s.enteredAt < MIN_DWELL_MS) return s;
      const softStreak = s.softStreak + 1;
      if (softStreak < SOFT_FAIL_STREAK) return { ...s, softStreak };
      return demote(s, now, false);
    }
    default:
      return s;
  }
}

/** 성공한 endpoint 로 네트워크 지문 계산 — IPv4 는 /24, IPv6 는 앞 4그룹(/64). NetInfo 없이도 된다. */
export function fingerprintOf(host: string): string {
  const h = String(host || '').trim().toLowerCase();
  if (!h) return '';
  if (h.includes('.') && !h.includes(':')) return h.split('.').slice(0, 3).join('.') + '.0/24';
  const groups = h.split(':').filter((g) => g !== '');
  return groups.slice(0, 4).join(':') + '::/64';
}
