// hostUpdating.ts — "이 PC 는 지금 업데이트로 재시작 중" 표식.
//
// 왜 필요한가:
//  PC 앱이 자동 업데이트를 적용하면 스스로 재시작한다(20~30초). 그 사이 폰에서 보고 있던 사용자는
//  일반 "연결 끊김" 화면을 만나는데, PC 가 죽은 건지 인터넷이 끊긴 건지 알 수 없어 불안하다.
//  같은 끊김이라도 **이유를 알면 사람은 기다린다** — 모르면 고장으로 읽고 앱을 껐다 켠다.
//  back 이 runner_status 에 `updating`/`reason:'updating'` 을 실어 주므로 여기서 받아 보관한다.
//
//  ⚠ 표시 전용이다. 이 값으로 기능을 막지 않는다(구 back/구 PC 는 안 보내므로 undefined = 평소 문구).
//  ⚠ 자동 만료가 있어야 한다: 업데이트가 실패해 영영 안 돌아오면 "곧 다시 연결" 이 영구 거짓말이 된다.
//    그 경우 일반 오프라인 문구로 되돌아가야 한다.

const MAX_UPDATING_MS = 5 * 60 * 1000; // 이보다 오래면 업데이트 실패로 보고 일반 오프라인으로 되돌린다

const marks = new Map<number, { at: number; toVersion?: string }>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  listeners.forEach((l) => { try { l(); } catch (_) { /* 구독자 오류가 소켓 루프를 깨지 않게 */ } });
}

/** useSyncExternalStore 용 구독. @returns 해제 함수 */
export function subscribeHostUpdating(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function getHostUpdatingVersion(): number { return version; }

/** 업데이트 예고/사유 수신. */
export function markHostUpdating(host: number, toVersion?: string): void {
  if (!Number.isFinite(host)) return;
  marks.set(host, { at: Date.now(), toVersion });
  emit();
}

/** 그 호스트가 돌아왔다(또는 업데이트와 무관한 상태 변화) — 표식 제거. */
export function clearHostUpdating(host: number): void {
  if (marks.delete(host)) emit();
}

/** 지금 업데이트 중으로 표시해야 하는가(만료 반영). */
export function isHostUpdating(host: number | null | undefined): boolean {
  if (host == null) return false;
  const m = marks.get(host);
  if (!m) return false;
  if (Date.now() - m.at > MAX_UPDATING_MS) { marks.delete(host); return false; }
  return true;
}

export function hostUpdatingTarget(host: number | null | undefined): string | null {
  if (host == null) return null;
  return marks.get(host)?.toVersion || null;
}

// ── "적용만 남은 업데이트가 있다" (원격 적용 버튼의 근거) ──────────────
//  PC 가 미리 받아 둔 상태. 여기 있어야 폰에서 [PC 업데이트] 를 눌러 원격 적용을 걸 수 있다.
const ready = new Map<number, string>(); // deviceId -> version

/** PC 가 업데이트를 받아 두었다(빈 값 = 이제 없음 — 적용 완료/취소). */
export function setHostUpdateReady(host: number, toVersion?: string): void {
  if (!Number.isFinite(host)) return;
  const v = String(toVersion || '');
  const had = ready.has(host);
  if (v) ready.set(host, v); else ready.delete(host);
  if (had !== ready.has(host) || (v && ready.get(host) !== v)) emit();
}
export function hostUpdateReady(host: number | null | undefined): string | null {
  if (host == null) return null;
  return ready.get(host) || null;
}

/** 로그아웃/채널 리셋 — 근거가 사라진 사진은 버린다(agentStateStore 규율 미러). */
export function resetHostUpdating(): void {
  if (marks.size === 0 && ready.size === 0) return;
  marks.clear();
  ready.clear();
  emit();
}

export const _internals = { MAX_UPDATING_MS, marks, ready };

export default {
  subscribeHostUpdating, getHostUpdatingVersion, markHostUpdating, clearHostUpdating,
  isHostUpdating, hostUpdatingTarget, resetHostUpdating, setHostUpdateReady, hostUpdateReady,
};
