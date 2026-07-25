// 승인 카드 UI 의 열림 상태(모듈 스토어) — NotificationsPanel(openNotifPanel) 관례 미러.
//
// 왜 컨텍스트가 아니라 모듈 스토어인가: 딥링크 소비(WorkspaceShellContext)·배너 탭(PaneView 하위)·
//  알림 패널 어디서든 "이 승인 카드를 펼쳐라"를 호출해야 하고, 그 호스트는 셸에 1회만 마운트된다.
//  컨텍스트에 넣으면 값이 바뀔 때마다 셸 전체가 리렌더된다(승인은 잦지 않지만 pane 트리가 무겁다).

let openId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });

/** 이 id 의 승인 카드를 전체 모달로 펼친다(알림 탭·딥링크 진입). */
export function openApprovalCard(id: string): void {
  openId = id;
  emit();
}
export function closeApprovalCard(): void {
  if (!openId) return;
  openId = null;
  emit();
}
export function getOpenApprovalId(): string | null { return openId; }
export function subscribeApprovalUi(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
