// e2eeState.ts — E2EE 상태 전이의 **순수 로직**만 분리(네트워크·저장소 없음).
//  실기기 검증이 불가능한 부분(승인 흐름의 분기)을 jest 로 고정하기 위해 여기로 뽑았다.
//  ⚠ 문구는 UI 가 그대로 쓴다 — 바꾸면 설정/배너 캡처가 달라진다.

export type E2eeState = 'unavailable' | 'unsupported' | 'off' | 'bootstrap' | 'pending' | 'trusted' | 'error';
export type E2eePolicy = 'off' | 'preferred' | 'required';

export type EnrollAction = 'bootstrap' | 'adopt' | 'poll' | 'none';

/**
 * enroll 응답 → 다음 상태/행동. (설계 §2.9-A 의 3가지 state 를 코드화)
 *  · bootstrap : 계정에 열쇠가 아직 없다 → 이 기기가 MK 를 만든다(마찰 0)
 *  · trusted   : 이미 승인됨 → grant 를 채택(adopt)
 *  · pending   : 승인 대기 → 확인 숫자 표시 + 폴링(WS resolved 가 정본, 폴링은 그물망)
 * 알 수 없는 응답은 error 로 떨어지되, **이미 열쇠가 있으면 trusted 를 유지**한다
 *  (일시적 서버 이상이 동작 중인 암호화를 끄면 안 된다).
 */
export function reduceEnroll(body: any, hasKey: boolean): { state: E2eeState; action: EnrollAction } {
  const st = String(body?.state || '');
  if (st === 'trusted') {
    if (body?.grant) return { state: 'trusted', action: 'adopt' };
    // grant 없이 trusted = 서버가 봉인문을 못 준 상태(회전 중 등) → 열쇠가 있으면 유지, 없으면 대기.
    return hasKey ? { state: 'trusted', action: 'none' } : { state: 'pending', action: 'poll' };
  }
  if (st === 'bootstrap') return { state: 'bootstrap', action: 'bootstrap' };
  if (st === 'pending') return { state: 'pending', action: 'poll' };
  return hasKey ? { state: 'trusted', action: 'none' } : { state: 'error', action: 'none' };
}

/**
 * "암호화 필요" 게이팅 문구 — null 이면 **막지 않는다**.
 * ★ 불변식: policy='preferred'(기본) 에서는 절대 막지 않는다. 승인 전에도 기기 목록·워크스페이스·
 *   터미널·알림이 전부 그대로 동작해야 한다(평문 폴백). 막는 것은 사용자가 'required' 를 켠 경우뿐.
 */
export function gateFor(s: { policy: E2eePolicy; ready: boolean; state: E2eeState }): string | null {
  if (s.policy !== 'required' || s.ready) return null;
  if (s.state === 'pending') return '승인 대기 중 — 기존 기기에서 이 기기를 승인해 주세요.';
  if (s.state === 'unavailable') return '이 기기에서 종단간 암호화를 쓸 수 없어요(앱 업데이트 필요).';
  if (s.state === 'unsupported') return '서버/PC 가 아직 종단간 암호화를 지원하지 않아요.';
  return '종단간 암호화를 준비하는 중이에요.';
}

/** 평문 폴백 허용 여부 — required 에서는 절대 폴백하지 않는다(다운그레이드 공격 차단). */
export function mayFallbackFor(policy: E2eePolicy, code: string | undefined, status: number | undefined): boolean {
  if (policy === 'required') return false;
  if (!code && !status) return true;
  return code === 'UNSUPPORTED' || code === 'DECRYPT_FAILED' || status === 404 || status === 501;
}

/** 설정 화면 상태 라벨(3플랫폼 동일 정보 구조). */
export function stateLabel(s: { state: E2eeState; policy: E2eePolicy; ready: boolean }): { text: string; tone: 'on' | 'wait' | 'off' } {
  if (s.policy === 'off') return { text: '꺼짐', tone: 'off' };
  if (s.ready) return { text: '켜짐', tone: 'on' };
  if (s.state === 'pending') return { text: '승인 대기', tone: 'wait' };
  if (s.state === 'bootstrap') return { text: '준비 중', tone: 'wait' };
  if (s.state === 'unavailable') return { text: '사용 불가', tone: 'off' };
  if (s.state === 'unsupported') return { text: '미지원', tone: 'off' };
  if (s.state === 'error') return { text: '오류', tone: 'off' };
  return { text: '꺼짐', tone: 'off' };
}
