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
 * 아직 대화가 없는 빈 새 채팅 탭(threadId 없음) — 포커스된 pane 의 것을 먼저, 없으면 처음 만나는 것.
 *  초안을 쓰고 있던 탭은 빈 탭이 아니다(사용자가 쓰던 글을 남의 대화로 덮지 않는다).
 */
export function findBlankChat(layout: T.TilingNode | null, focusId?: string | null): ChatHit | null {
  if (!layout) return null;
  const blank = (x: { kind?: string; threadId?: string | null; chatDraft?: string }) =>
    x.kind === 'chat' && !x.threadId && !String(x.chatDraft || '').trim();
  const inLeaf = (l: T.Leaf): ChatHit | null => {
    if (l.kind === 'chat') return blank(l) ? { leafId: l.id, index: -1 } : null;
    if (l.kind !== 'terminal') return null;
    // 활성 탭이 빈 채팅이면 그것부터(지금 보고 있는 빈 탭).
    if (l.tabs[l.active] && blank(l.tabs[l.active])) return { leafId: l.id, index: l.active };
    const i = l.tabs.findIndex(blank);
    return i >= 0 ? { leafId: l.id, index: i } : null;
  };
  const focus = focusId ? T.findLeaf(layout, focusId) : null;
  if (focus) { const h = inLeaf(focus); if (h) return h; }
  let hit: ChatHit | null = null;
  T.eachLeaf(layout, (l) => { if (!hit) hit = inLeaf(l); });
  return hit;
}

/**
 * 그 대화를 연다(알림·푸시의 목적지) — 규칙은 셋, 순서대로:
 *  ① 그 대화를 보는 탭이 있으면 그 탭을 앞으로.
 *  ② 없으면 **빈 새 채팅 탭**(threadId 없음)만 재사용한다 — 다른 대화를 보고 있는 탭은 절대 갈아치우지 않는다
 *     (2026-09-30 실기: 대화 A 탭이 B 의 푸시 탭으로 B 로 바뀌어 A 가 화면에서 사라졌다).
 *  ③ 그것도 없으면 포커스된(없으면 첫) 터미널 pane 에 새 탭으로 들인다. 터미널 pane 이 없으면 첫 pane 옆을 갈라 넣는다.
 *  대화 목록 시트에서 고른 것은 이 길이 아니다 — 사용자가 **그 탭에서** 고른 것이라 그 탭이 바뀌는 게 맞다(ConvBody.openThread).
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
  const blank = findBlankChat(rt.layout, rt.focusId);
  if (blank) {
    const fill = { threadId, title: title || '', sid: chatSid(threadId) };
    const layout = T.mapLeaf(rt.layout, blank.leafId, (l) => {
      if (blank.index < 0) return l.kind === 'chat' ? ({ ...l, ...fill } as T.Leaf) : l;
      if (l.kind !== 'terminal') return l;
      return { ...l, tabs: l.tabs.map((t, i) => (i === blank.index ? { ...t, ...fill } : t)), active: blank.index };
    });
    return { ...rt, layout, focusId: blank.leafId };
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
