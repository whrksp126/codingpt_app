// tasksUi.ts — 작업 현황판·새 작업 시트의 열림 상태(모듈 스토어).
//
// 왜 Context 가 아니라 모듈 스토어인가: 여는 쪽이 사이드바·헤더 아이콘·팔레트·딥링크·알림 패널·
//  WorkspaceShellContext(작업 워크스페이스가 정리됐을 때) 로 흩어져 있고, 그중 일부는 React 밖(푸시 콜백)이다.
//  NotificationsPanel 의 openNotifPanel() 과 같은 패턴 — 호스트 컴포넌트는 셸에 1회 마운트된다.

import { collapseKeyAssist } from '../../components/keyboard/KeyAssist';
import { afterModalTransition, noteModalClosing, setOverlayLayer } from '../../components/modalLayer';
import { tx } from '../../text';
import { TASKS_TEXT } from '../../text/tasks';

export interface TasksFocus {
  taskId?: string | null;
  runId?: string | null;
  host?: number | null;
  /** 알림 행처럼 taskId 를 모르고 터미널 좌표만 아는 진입 — 스토어가 run 을 찾아 준다. */
  cwd?: string | null;
  win?: number | null;
}

export interface NewTaskPrefill {
  host?: number | null;
  /** 저장소 = 워크스페이스 id(그 워크스페이스의 localPath 가 repo 파라미터가 된다). */
  workspaceId?: string | null;
  prompt?: string;
}

type UiState = {
  open: boolean;
  focus: TasksFocus | null;
  /** 같은 focus 를 다시 열어도 상세가 다시 뜨게 하는 세대 번호. */
  focusGen: number;
  newTask: NewTaskPrefill | null;
  toast: string | null;
  toastGen: number;
  /** 현황판 Modal 의 key — present 가 실패한(onShow 가 안 온) 모달을 다시 마운트해 되살린다. */
  modalGen: number;
  /** onShow 가 왔다(= 실제로 떠 있다). */
  shown: boolean;
  openedAt: number;
};

let state: UiState = { open: false, focus: null, focusGen: 0, newTask: null, toast: null, toastGen: 0, modalGen: 0, shown: false, openedAt: 0 };
// 열었는데 이만큼 지나도 onShow 가 없으면 present 실패로 보고 다시 마운트한다(iOS 형제 모달 거부 복구).
const PRESENT_GRACE_MS = 1500;
const listeners = new Set<() => void>();
function set(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });
}

export function subscribeTasksUi(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getTasksUi(): UiState { return state; }

/** 현황판 열기. focus 가 있으면 그 작업(과 run) 상세로 곧장 들어간다(딥링크·알림). */
export function openTasksDashboard(focus?: TasksFocus | null, opts?: { toast?: string }): void {
  collapseKeyAssist(); // 전체화면 모달 = 키보드/특수키 패널 내림(다른 오버레이와 같은 규칙)
  const patch = (): Partial<UiState> => ({
    focus: focus && (focus.taskId || focus.cwd) ? focus : null,
    focusGen: state.focusGen + 1,
    ...(opts?.toast ? { toast: opts.toast, toastGen: state.toastGen + 1 } : {}),
  });
  if (state.open) {
    // 이미 열림 — 초점만 바꾼다. 단 present 가 실패해 안 떠 있는 모달이면(onShow 없음) 다시 마운트해 되살린다.
    const stuck = !state.shown && Date.now() - state.openedAt > PRESENT_GRACE_MS;
    set({ ...patch(), ...(stuck ? { modalGen: state.modalGen + 1, openedAt: Date.now() } : {}) });
    return;
  }
  // ★ 방금 닫힌 형제 모달(새 작업 시트·알림 패널·팔레트)이 내려가는 중이면 그 뒤에 연다(iOS present 거부 방지).
  afterModalTransition(() => {
    setOverlayLayer('tasks'); // 공용 오버레이(알럿·승인·새 작업)는 이제 현황판 안에서 뜬다
    set({ open: true, shown: false, openedAt: Date.now(), ...patch() });
  });
}
export function closeTasksDashboard(): void {
  if (!state.open) return;
  noteModalClosing();
  setOverlayLayer('root');
  set({ open: false, focus: null, shown: false });
}
/** 현황판 Modal 의 onShow — 실제로 떠 있음을 기록(present 실패 복구 판정용). */
export function markTasksDashboardShown(): void {
  if (!state.shown) set({ shown: true });
}
/** 상세에서 목록으로 돌아갈 때 focus 를 비운다(다시 열었을 때 옛 상세가 튀어나오지 않게). */
export function clearTasksFocus(): void {
  if (state.focus) set({ focus: null });
}

export function openNewTask(prefill?: NewTaskPrefill | null): void {
  collapseKeyAssist();
  const apply = () => set({ newTask: { ...(prefill || {}) } });
  // 현황판 안에서 열면 중첩 present(즉시). 셸 레벨이면 방금 닫힌 모달(팔레트 등) 뒤에.
  if (state.open) apply();
  else afterModalTransition(apply);
}
export function closeNewTask(): void {
  if (!state.newTask) return;
  noteModalClosing();
  set({ newTask: null });
}

export function showTasksToast(msg: string): void {
  set({ toast: msg, toastGen: state.toastGen + 1 });
}
export function clearTasksToast(): void {
  if (state.toast) set({ toast: null });
}

/** openTaskTerminal 이 쓰는 셸 부분 — ref 로 최신 값을 읽는다(목록 새로고침 뒤 다시 확인해야 한다). */
export interface TerminalShell {
  workspaces: { id: string }[];
  loadWorkspaces: () => Promise<unknown>;
  setActive: (id: string, opts?: { allowTask?: boolean }) => void;
  focusTerminal: (wsId: string, win: number) => void;
}

/**
 * run 의 터미널 열기(설계 §4) — 카드 `'terminal'` 액션과 사이드바 에이전트 행이 **같은 경로**를 탄다
 *  (agent-tasks-sidebar.md §5). 새 worktree 워크스페이스는 목록에 아직 없을 수 있다(back 은 생성을 방송하지
 *  않는다) → 먼저 목록 새로고침. 그래도 없으면 wsNotRegistered 토스트.
 */
export async function openTaskTerminal(getShell: () => TerminalShell, wsId: string | null, tid: number | null, isTask: boolean): Promise<void> {
  if (!wsId) { showTasksToast(tx(TASKS_TEXT).wsNotRegistered); return; }
  if (!getShell().workspaces.some((w) => w.id === wsId)) {
    await getShell().loadWorkspaces();
    await new Promise((r) => setTimeout(r, 60)); // 새 목록이 렌더(=ref 갱신)될 한 박자
  }
  if (!getShell().workspaces.some((w) => w.id === wsId)) { showTasksToast(tx(TASKS_TEXT).wsNotRegistered); return; }
  closeTasksDashboard();
  const S = getShell();
  S.setActive(wsId, isTask ? { allowTask: true } : undefined);
  if (typeof tid === 'number') S.focusTerminal(wsId, tid);
}
