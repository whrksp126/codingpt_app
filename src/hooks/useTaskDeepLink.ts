// useTaskDeepLink — `codingpt://task/<taskId>?host=<n>&run=<r>` → 작업 현황판의 그 작업 상세(설계 §6.9).
//
// 두 입구를 **같은 파서**(pushService.parseTaskDeeplink)로 받는다:
//  · OS Linking — `xcrun simctl openurl`, 다른 앱의 링크. 콜드스타트는 getInitialURL, 실행 중은 'url' 이벤트.
//    (지금까지 Linking 리스너는 usePairDeepLink(pair 만)와 LoginScreen 뿐이었다 — task 는 아무도 안 받았다.)
//  · 푸시 탭 — FCM data.deeplink 가 pushService 의 pending/리스너로 흐른다. kind 'task' 로만 소비해
//    알림/승인 딥링크 소비자(WorkspaceShellContext)와 같은 pending 을 서로 뺏지 않는다.
// WorkspaceShellContext 가 마운트한다(로그인 뒤에만 의미가 있다 — 작업 목록은 계정의 PC 에 있다).

import { useEffect } from 'react';
import { Linking } from 'react-native';
import pushService, { parseTaskDeeplink } from '../services/pushService';
import { openTasksDashboard } from '../workspace/tasks/tasksUi';

export function handleTaskLink(url: string | null | undefined): boolean {
  if (!url || !String(url).startsWith('codingpt://task/')) return false;
  const p = parseTaskDeeplink(url);
  if (!p) return false;
  openTasksDashboard({ taskId: p.taskId, runId: p.runId, host: p.host });
  return true;
}

// getInitialURL 은 프로세스가 사는 동안 **계속 같은 URL**(앱을 콜드스타트시킨 링크)을 돌려준다 — 로그아웃→로그인
//  (다른 계정 포함)마다 다시 읽으면 이미 처리한 작업 링크가 재생된다. 프로세스당 1회만 소비한다.
let initialConsumed = false;
/** 테스트 전용. */
export function _resetTaskDeepLinkForTest(): void { initialConsumed = false; }

export function useTaskDeepLink(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    if (!initialConsumed) {
      initialConsumed = true;
      Linking.getInitialURL().then((u) => { if (alive) handleTaskLink(u); }).catch(() => { /* noop */ });
    }
    const sub = Linking.addEventListener('url', (e) => { handleTaskLink(e?.url); });
    const pend = pushService.takePendingPushDeeplink('task');
    if (pend) handleTaskLink(pend);
    const off = pushService.addPushDeeplinkListener((link) => {
      if (handleTaskLink(link)) pushService.takePendingPushDeeplink('task'); // 보관분 소비(중복 열기 방지)
    });
    return () => { alive = false; sub.remove(); off(); };
  }, [enabled]);
}

export default useTaskDeepLink;
