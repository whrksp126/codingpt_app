// automationsUi.ts — `자동화` 장소의 열림 상태(모듈 스토어). tasksUi 와 같은 모양·같은 이유(여는 쪽이 사이드바·
//  팔레트·딥링크·알림 패널·작업 카드 칩으로 흩어져 있고 일부는 React 밖이다).
//
// ★ 진행 현황과 **배타**다(automation-design.md §5.9) — 둘 다 고른 PC 밑의 장소이고 선택 배경은 하나다.
//  openAutomations 가 closeTasksDashboard 를, tasksUi.openTasksDashboard 가 closeAutomations 를 부른다.
//  나가는 길 = 워크스페이스(로컬 행)·PC 행·진행 현황 행.

import { collapseKeyAssist } from '../../components/keyboard/KeyAssist';
import { closeTasksDashboard } from '../tasks/tasksUi';

export interface AutomationsFocus {
  /** 자동화 id — 있으면 그 상세로 곧장(딥링크·알림·작업 카드 `자동` 칩). */
  id?: string | null;
  /** 그 자동화가 사는 PC. 다른 PC 면 그 PC 로 옮긴 뒤 연다. */
  host?: number | null;
}

type UiState = {
  open: boolean;
  focus: AutomationsFocus | null;
  focusGen: number;
  toast: string | null;
  toastGen: number;
};

let state: UiState = { open: false, focus: null, focusGen: 0, toast: null, toastGen: 0 };
const listeners = new Set<() => void>();
function set(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });
}

export function subscribeAutomationsUi(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getAutomationsUi(): UiState { return state; }

/** 자동화 장소로 들어간다. 토글이 아니다(이미 들어와 있으면 초점만 바꾼다). */
export function openAutomations(focus?: AutomationsFocus | null): void {
  collapseKeyAssist();
  closeTasksDashboard(); // 장소는 하나 — 진행 현황에서 나온다
  set({
    open: true,
    focus: focus && (focus.id || focus.host != null) ? focus : null,
    focusGen: state.focusGen + 1,
  });
}
export function closeAutomations(): void {
  if (!state.open) return;
  set({ open: false, focus: null });
}
export function clearAutomationsFocus(): void {
  if (state.focus) set({ focus: null });
}

// 하드웨어 back — 전역 AppBackHandler 가 handleTasksBack 다음에 부른다(상세 → 목록 → 워크스페이스).
let backFn: (() => boolean) | null = null;
export function setAutomationsBackHandler(fn: (() => boolean) | null): void { backFn = fn; }
export function handleAutomationsBack(): boolean {
  if (!state.open || !backFn) return false;
  try { return backFn(); } catch (_) { return false; }
}

export function showAutomationsToast(msg: string): void {
  set({ toast: msg, toastGen: state.toastGen + 1 });
}
export function clearAutomationsToast(): void {
  if (state.toast) set({ toast: null });
}

/** 테스트 전용. */
export function _resetAutomationsUiForTest(): void {
  state = { open: false, focus: null, focusGen: 0, toast: null, toastGen: 0 };
  backFn = null;
}
