// convTabs.ts — 채팅 탭을 레이아웃에서 찾고 여는 **순수 규칙**(RN·셸 의존 0).
//
// 부르는 곳이 셋이다: 알림 탭(그 대화로 가기) · 대화 목록(고른 대화 열기) · 공유 표면 리컨실러.
//  셋이 각자 "이미 열려 있나"를 판정하면 같은 대화가 탭 두 개로 열린다 → 판정을 여기 한 곳에 둔다.

import * as T from '../tiling';

/**
 * 채팅 표면의 공유 id — 대화마다 하나(`c-<threadId>`, PC·앱 공통 — chat-v2-design.md §4.4).
 *  기기마다 다른 id 를 만들면 같은 대화가 표면 두 개로 등록된다.
 *  ⚠ 데몬 surfaces 의 id 규칙은 `^[A-Za-z0-9_-]{1,64}$` 다 — 콜론 같은 글자가 들면 등록이 거절된다.
 */
export const CHAT_SID_PREFIX = 'c-';
export function chatSid(threadId: string): string { return CHAT_SID_PREFIX + threadId; }

export interface ChatHit { leafId: string; /** 혼합 탭 안의 인덱스. 독립 pane 이면 -1. */ index: number }

/** 그 대화를 보고 있는 탭/ pane. 없으면 null. */
export function findChat(layout: T.TilingNode | null, threadId: string): ChatHit | null {
  if (!layout || !threadId) return null;
  let hit: ChatHit | null = null;
  T.eachLeaf(layout, (l) => {
    if (hit) return;
    if (l.kind === 'chat') { if (l.threadId === threadId) hit = { leafId: l.id, index: -1 }; return; }
    if (l.kind !== 'terminal') return;
    const i = l.tabs.findIndex((t) => t.kind === 'chat' && t.threadId === threadId);
    if (i >= 0) hit = { leafId: l.id, index: i };
  });
  return hit;
}

/** 새 채팅 탭 한 칸. threadId 가 없으면 새 대화(기기 로컬 — 공유 표면에 등록되지 않는다). */
export function newChatTab(threadId?: string | null, title?: string): T.TerminalTab {
  return {
    kind: 'chat', threadId: threadId || null, title: title || '', tid: T.newPaneId(),
    ...(threadId ? { sid: chatSid(threadId) } : {}),
  };
}

/**
 * 그 대화를 연다 — 이미 열려 있으면 그 탭을 앞으로, 없으면 포커스된(없으면 첫) 터미널 pane 의 탭으로 들인다.
 *  터미널 pane 이 하나도 없으면 첫 pane 옆을 갈라 넣는다. 폰은 좁아서 탭 편입이 기본이다(smartAdd 와 같은 규칙).
 */
export function openChat<R extends { layout: T.TilingNode; focusId: string | null }>(rt: R, threadId: string, title?: string): R {
  if (!rt || !rt.layout || !threadId) return rt;
  const hit = findChat(rt.layout, threadId);
  if (hit) {
    const layout = hit.index >= 0
      ? T.mapLeaf(rt.layout, hit.leafId, (l) => (l.kind === 'terminal' && l.active !== hit.index ? { ...l, active: hit.index } : l))
      : rt.layout;
    if (layout === rt.layout && rt.focusId === hit.leafId) return rt;
    return { ...rt, layout, focusId: hit.leafId };
  }
  const tab = newChatTab(threadId, title);
  let target: string | null = null;
  const focus = rt.focusId ? T.findLeaf(rt.layout, rt.focusId) : null;
  if (focus && focus.kind === 'terminal') target = focus.id;
  if (!target) T.eachLeaf(rt.layout, (l) => { if (!target && l.kind === 'terminal') target = l.id; });
  if (target) {
    const layout = T.mapLeaf(rt.layout, target, (l) => (l.kind === 'terminal' ? { ...l, tabs: [...l.tabs, tab], active: l.tabs.length } : l));
    return { ...rt, layout, focusId: target };
  }
  const anchor = T.firstLeafId(rt.layout);
  const leaf = T.tabToLeaf(tab);
  if (!anchor || !leaf) return rt;
  return { ...rt, layout: T.split(rt.layout, anchor, 'h', leaf).tree, focusId: leaf.id };
}
