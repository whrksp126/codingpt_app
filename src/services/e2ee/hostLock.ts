// hostLock.ts — 호스트(내 PC)별 열쇠 세대 보관소 = **정직한 자물쇠 표시**의 근거.
//
// 왜 이 모듈이 필요한가:
//  설정의 '종단간 암호화 켜짐' 은 자기 기기 열쇠(계정 스코프)만 보고 있었다. 그런데 실제 트래픽이
//  암호화되는지는 **상대 호스트도 열쇠를 갖고 있느냐**에 달려 있다(교집합 게이팅). 열쇠 없는 PC 데몬으로
//  가는 fs/터미널 바이트는 100% 평문 릴레이인데 화면은 '켜짐' 이었다 = 거짓 자물쇠. 게다가 봉투 RPC
//  UNSUPPORTED 네거티브 캐시(10분)가 재시도조차 억제해 사용자에게 어떤 신호도 남지 않는다.
//
//  back 은 이미 `runner_status.e2eeEpoch`(daemonRelayService.js:79/219 — hello.e2eeEpoch, 0=열쇠 없음)를
//  전 기기로 팬아웃한다. 지금까지 어느 클라이언트도 이 필드를 읽지 않았다. 여기서 받아 보관하고
//  `hostLockLabel()`(e2eeState.ts) 로 호스트별 배지를 그린다 — 새 배관 0개.
//
//  ⚠ 이 값은 **표시 전용**이다. 게이팅(봉인 시도 여부)은 그대로 실제 왕복 결과로 판단한다 — epoch 를
//   근거로 미리 막으면 구 back(필드 없음 = undefined)에서 기능이 조용히 꺼진다(무마찰 불변식).
//  ⚠ 호스트가 오프라인이면 항목을 지운다: 마지막 값은 근거가 사라진 사진이다(agentStateStore 규율 미러).

const epochs = new Map<number, number>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  listeners.forEach((l) => { try { l(); } catch (_) { /* 구독자 오류가 소켓 루프를 깨지 않게 */ } });
}

/** useSyncExternalStore 용 구독. @returns 해제 함수 */
export function subscribeHostLock(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function getHostLockVersion(): number { return version; }

/**
 * runner_status 수신 반영. @param epoch 0/undefined = 열쇠 없음, null = 오프라인(항목 삭제)
 * @returns 스토어가 바뀌었는지
 */
export function setHostE2eeEpoch(host: number, epoch: number | null | undefined): boolean {
  if (!Number.isFinite(host)) return false;
  if (epoch == null) {
    if (!epochs.delete(host)) return false;
    emit();
    return true;
  }
  const v = Number(epoch) > 0 ? Number(epoch) : 0;
  if (epochs.get(host) === v) return false;
  epochs.set(host, v);
  emit();
  return true;
}
/** 그 호스트의 열쇠 세대. undefined = 모름(구 back / 아직 프레임 없음) — '평문' 이라고 단정하지 않는다. */
export function hostE2eeEpoch(host: number | null | undefined): number | undefined {
  if (host == null || !Number.isFinite(host)) return undefined;
  return epochs.get(host);
}
/** 로그아웃/계정 전환 — 전량 폐기. */
export function resetHostLocks(): boolean {
  if (!epochs.size) return false;
  epochs.clear();
  emit();
  return true;
}

export default { subscribeHostLock, getHostLockVersion, setHostE2eeEpoch, hostE2eeEpoch, resetHostLocks };
