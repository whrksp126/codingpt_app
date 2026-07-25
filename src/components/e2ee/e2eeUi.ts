// 기기 신뢰 시트의 열림 상태(모듈 스토어) — approvalUi.ts 관례 미러.
//
// 왜 컨텍스트가 아니라 모듈 스토어인가: "이 기기를 승인해 달라"는 요청은 알림 탭·WS 팬아웃·설정
//  화면 어디서든 열려야 하고, 호스트는 셸에 1회만 마운트된다. 컨텍스트에 넣으면 값이 바뀔 때마다
//  셸 전체(무거운 pane 트리)가 리렌더된다.

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });

/** 기기 승인 시트를 펼친다(알림 탭 · device_approval_event · 설정에서 진입). */
export function openDeviceTrustSheet(): void {
  if (open) return;
  open = true;
  emit();
}
export function closeDeviceTrustSheet(): void {
  if (!open) return;
  open = false;
  emit();
}
export function isDeviceTrustSheetOpen(): boolean { return open; }
export function subscribeDeviceTrustUi(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
