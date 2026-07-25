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

/**
 * 평문 폴백 허용 여부 — required 에서는 절대 폴백하지 않는다(다운그레이드 공격 차단).
 *
 * ★ preferred(기본)에서는 **봉투 계층의 어떤 실패도 조작을 막지 않는다**(gateFor 의 불변식과 같은 규율).
 *  과거엔 허용 코드를 화이트리스트(UNSUPPORTED/DECRYPT_FAILED/404/501)로 좁혀 뒀는데, 열쇠 없는 PC
 *  데몬은 back 을 통해 **502 E2EE_OPEN_FAILED** 로 회신한다(daemonController SEALED_UNSUPPORTED 에
 *  E2EE_OPEN_FAILED 가 없어 501 이 아니다). 그러면 fs.* 가 sealed 단계에서 throw 되어 **뒤의 평문 REST
 *  라인에 도달하지 못하고** IDE 트리·파일 열기·800ms 자동저장이 붉은 오류로 죽는다(= 자기 기기에서
 *  잠긴다). E2EE_SEAL_FAILED / E2EE_HOST_MISMATCH / E2EE_REPLAY 도 같은 부류다.
 *
 * 단 하나의 예외: **status 200 + ok:false** = 봉투가 왕복해 호스트가 요청을 실제로 처리했고 그 처리가
 *  실패한 경우다. 이걸 폴백하면 같은 변형(fs.write 등)을 평문으로 한 번 더 실행한다(이중 실행 사고).
 *  복호 실패(DECRYPT_FAILED, 회전 직후)는 200 이지만 호스트 처리 결과가 아니므로 폴백 대상이다.
 */
export function mayFallbackFor(policy: E2eePolicy, code: string | undefined, status: number | undefined): boolean {
  if (policy === 'required') return false;
  if (!code && !status) return true;
  if (status === 200) return code === 'DECRYPT_FAILED';
  return true; // 404·501·4xx·5xx·네트워크(0) = 봉투 계층 실패 → 평문 라인으로 계속 간다
}

/**
 * 설정 화면 상태 라벨(3플랫폼 동일 정보 구조).
 *  ★ ready 는 **이 기기에 열쇠가 있다(계정 스코프)** 는 뜻일 뿐이다 — 상대 호스트에 열쇠가 없으면
 *   그 PC 로 가는 트래픽은 평문이다. 그래서 '켜짐' 이라고 쓰지 않는다(거짓 자물쇠 금지).
 *   실제 트래픽 자물쇠는 호스트별로 `hostLockLabel()` 이 그린다.
 */
export function stateLabel(s: { state: E2eeState; policy: E2eePolicy; ready: boolean }): { text: string; tone: 'on' | 'wait' | 'off' } {
  if (s.policy === 'off') return { text: '꺼짐', tone: 'off' };
  if (s.ready) return { text: '이 기기 준비됨', tone: 'on' };
  if (s.state === 'pending') return { text: '승인 대기', tone: 'wait' };
  if (s.state === 'bootstrap') return { text: '준비 중', tone: 'wait' };
  if (s.state === 'unavailable') return { text: '사용 불가', tone: 'off' };
  if (s.state === 'unsupported') return { text: '미지원', tone: 'off' };
  if (s.state === 'error') return { text: '오류', tone: 'off' };
  return { text: '꺼짐', tone: 'off' };
}

/**
 * **호스트별** 자물쇠 라벨 — 이 PC 로 가는 트래픽이 실제로 암호화되는가(교집합).
 *  근거 = `runner_status.e2eeEpoch`(back 이 이미 팬아웃한다. 0 = 그 호스트에 열쇠 없음,
 *  undefined = 구 back 이거나 아직 프레임을 못 받았다 = 모름).
 *  ⚠ '모름' 을 '평문' 으로 단정하지 않는다 — 표시를 위해 있는 값이지 게이팅 근거가 아니다.
 *
 * ★ 세대(epoch)까지 교집합이다(2026-07-25 실측 결함). `hostEpoch > 0` 만 보고 '암호화됨' 을 그리면
 *   회전 직후 **거짓 자물쇠**가 된다: 데몬은 회전을 폴링(TRUSTED_MS=15분)으로만 감지하므로 back 이
 *   팬아웃하는 e2eeEpoch 는 최대 15분간 옛 세대다. 그동안 이 기기가 새 세대로 봉인해 보내면 데몬이
 *   E2EE_EPOCH_MISMATCH(409) → `mayFallbackFor`=true → **평문 REST** 인데 배지는 초록이었다.
 *   그래서 `myEpoch` 를 받아 **세대가 일치할 때만** '암호화됨' 을 그린다(불일치 = '확인 중').
 *   `myEpoch` 를 넘기지 않으면(구 호출부) 세대 대조를 건너뛴다 — 기존 동작 그대로.
 *   ⚠ PC `src/js/host-lock.js` 도 같은 규칙·같은 문구여야 한다(3플랫폼 문구 동일 규율).
 */
export function hostLockLabel(
  selfReady: boolean,
  hostEpoch: number | null | undefined,
  myEpoch?: number | null,
): { text: string; tone: 'on' | 'wait' | 'off' } {
  if (!selfReady) return { text: '평문', tone: 'off' };            // 이 기기에 열쇠가 없다
  if (hostEpoch == null) return { text: '확인 중', tone: 'wait' }; // 아직 모름(구 back 포함)
  if (hostEpoch <= 0) return { text: '이 PC 는 평문(열쇠 없음)', tone: 'off' };
  // 세대 불일치 = 지금 보내는 봉투가 그 PC 에서 거절된다(또는 그 PC 의 봉투를 내가 못 연다) = 평문 폴백.
  if (myEpoch != null && Number(myEpoch) > 0 && Number(myEpoch) !== Number(hostEpoch)) {
    return { text: '확인 중', tone: 'wait' };
  }
  return { text: '암호화됨', tone: 'on' };
}
