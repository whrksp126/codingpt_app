// useAutoDeepLink — 자동화 번들 딥링크 두 종(automation-design.md §5.8 · §6.5).
//  · `codingpt://auto/<id>?host=<n>`  → `자동화` 장소의 그 상세(id 없으면 목록). 다른 PC 면 그 PC 로 옮긴 뒤.
//  · `codingpt://tasks?host=<n>`       → 그 PC 의 진행 현황(pc_sleeping / pc_disconnected 푸시).
//
// 입구는 useTaskDeepLink 와 같다: OS Linking(콜드스타트 getInitialURL — 프로세스당 1회, 실행 중 'url') + 푸시 탭
//  (pushService pending/리스너, kind 'auto'·'tasks' 로만 소비 — 다른 소비자의 pending 을 뺏지 않는다).
// WorkspaceShellContext 가 마운트한다(로그인 뒤에만 의미가 있다). goHost = 셸의 setActiveDevice(PC 전환).

import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import pushService, { parseAutoDeeplink, parseTasksDeeplink } from '../services/pushService';
import { openAutomations } from '../workspace/automations/automationsUi';
import { openTasksDashboard } from '../workspace/tasks/tasksUi';

export type GoHost = (host: number) => void;

/** 링크 하나 처리 — 소비했으면 true. */
export function handleAutoLink(url: string | null | undefined, goHost?: GoHost): boolean {
  if (!url) return false;
  const a = parseAutoDeeplink(url);
  if (a) {
    openAutomations({ id: a.id, host: a.host });
    return true;
  }
  const t = parseTasksDeeplink(url);
  if (t) {
    // 진행 현황은 고른 PC 의 것 — 먼저 그 PC 로(focus 없이 여는 openTasksDashboard 는 PC 를 모른다).
    if (t.host != null && goHost) goHost(t.host);
    openTasksDashboard();
    return true;
  }
  return false;
}

let initialConsumed = false;
/** 테스트 전용. */
export function _resetAutoDeepLinkForTest(): void { initialConsumed = false; }

export function useAutoDeepLink(enabled: boolean, goHost?: GoHost): void {
  const goRef = useRef(goHost); goRef.current = goHost;
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const go: GoHost = (h) => { goRef.current?.(h); };
    if (!initialConsumed) {
      initialConsumed = true;
      Linking.getInitialURL().then((u) => { if (alive) handleAutoLink(u, go); }).catch(() => { /* noop */ });
    }
    const sub = Linking.addEventListener('url', (e) => { handleAutoLink(e?.url, go); });
    for (const kind of ['auto', 'tasks'] as const) {
      const pend = pushService.takePendingPushDeeplink(kind);
      if (pend) handleAutoLink(pend, go);
    }
    const off = pushService.addPushDeeplinkListener((link) => {
      if (handleAutoLink(link, go)) { pushService.takePendingPushDeeplink('auto'); pushService.takePendingPushDeeplink('tasks'); }
    });
    return () => { alive = false; sub.remove(); off(); };
  }, [enabled]);
}

export default useAutoDeepLink;
