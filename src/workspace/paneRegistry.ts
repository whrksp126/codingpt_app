// paneRegistry — pane/탭들의 화면(window) 좌표 rect 를 모아 드래그 히트테스트에 쓴다.
//   PC 의 elementFromPoint 대체: 각 PaneView/DraggableTab 이 measureInWindow 결과를 등록 →
//   손가락 위치로 pane/존/탭 삽입 위치 판정. 드래그 시작 시 measureAll() 로 전부 재측정(스테일 방지).

export interface PaneRect { x: number; y: number; w: number; h: number }
export type DropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';

const rects = new Map<string, PaneRect>();

export function setPaneRect(id: string, r: PaneRect): void { rects.set(id, r); }
export function removePaneRect(id: string): void { rects.delete(id); }
export function getPaneRect(id: string): PaneRect | undefined { return rects.get(id); }

// ── 재측정 훅 — 등록된 모든 pane/탭이 스스로 measureInWindow 를 다시 수행 ──
//   onLayout 은 "부모 기준 상대 위치"가 안 변하면 재발화하지 않아, 다른 분할 변경/사이드바 토글로
//   화면 절대좌표가 밀리면 rect 가 스테일해진다 → 드래그 시작 순간 전부 재측정한다.
const measurers = new Map<string, () => void>();

export function registerMeasurer(key: string, fn: () => void): void { measurers.set(key, fn); }
export function unregisterMeasurer(key: string): void { measurers.delete(key); }
export function measureAll(): void { for (const fn of measurers.values()) { try { fn(); } catch (_) { /* noop */ } } }

// ── 터미널 탭 rect — 탭바 드롭(순서 재배치/삽입 위치) 판정용. key = `${paneId}#${index}` ──
const tabRects = new Map<string, PaneRect>();

export function setTabRect(paneId: string, index: number, r: PaneRect): void { tabRects.set(`${paneId}#${index}`, r); }
export function removeTabRect(paneId: string, index: number): void { tabRects.delete(`${paneId}#${index}`); }

// 해당 pane 의 탭 rect 를 index 순으로 반환.
export function tabRectsFor(paneId: string): Array<{ index: number; rect: PaneRect }> {
  const out: Array<{ index: number; rect: PaneRect }> = [];
  const prefix = paneId + '#';
  for (const [k, r] of tabRects) {
    if (k.startsWith(prefix)) out.push({ index: parseInt(k.slice(prefix.length), 10) || 0, rect: r });
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

// ── 드래그 원본(전역) — 탭바 가로 스크롤 잠금 + 원본 탭 흐리기용 ──
//  tabIndex<0 = pane 통째(IDE/프리뷰) 드래그. null = 드래그 아님.
export interface DragSrc { paneId: string; tabIndex: number }
let dragSrc: DragSrc | null = null;
const dragSubs = new Set<() => void>();
export function setDragSrc(v: DragSrc | null): void {
  dragSrc = v;
  for (const fn of dragSubs) { try { fn(); } catch (_) { /* noop */ } }
}
export function getDragSrc(): DragSrc | null { return dragSrc; }
export function subscribeDragSrc(fn: () => void): () => void {
  dragSubs.add(fn);
  return () => { dragSubs.delete(fn); };
}

// ── 탭바 가로 스크롤러 — 드래그 중 끝단 자동 스크롤용(PaneHeader 가 등록) ──
//  scrollBy: 오프셋을 dx 만큼 이동(클램프). 실제로 움직였으면 true.
export interface TabScroller { scrollBy(dx: number): boolean }
const tabScrollers = new Map<string, TabScroller>();
export function registerTabScroller(paneId: string, s: TabScroller): void { tabScrollers.set(paneId, s); }
export function unregisterTabScroller(paneId: string): void { tabScrollers.delete(paneId); }
export function getTabScroller(paneId: string): TabScroller | undefined { return tabScrollers.get(paneId); }

// (x,y) 화면좌표 아래의 pane id.
export function paneAt(x: number, y: number): string | null {
  for (const [id, r] of rects) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return id;
  }
  return null;
}

// pane 내 상대 위치로 드롭 존(가장자리 25% = 방향 분할, 아니면 center=스왑/탭이동).
export function dropZone(id: string, x: number, y: number): DropZone {
  const r = rects.get(id);
  if (!r || r.w <= 0 || r.h <= 0) return 'center';
  const fx = (x - r.x) / r.w;
  const fy = (y - r.y) / r.h;
  const m = Math.min(fx, 1 - fx, fy, 1 - fy);
  if (m < 0.25) {
    if (m === fx) return 'left';
    if (m === 1 - fx) return 'right';
    if (m === fy) return 'top';
    return 'bottom';
  }
  return 'center';
}

// 탭바 위 삽입 위치 — PC update() 미러: 각 탭의 가로 중앙보다 왼쪽이면 그 앞에 삽입.
//  반환: { index: 삽입 인덱스, lineX: 인서트 라인 화면 x } (측정된 탭이 없으면 tabCount 뒤 삽입).
export function tabInsertAt(paneId: string, x: number, tabCount: number): { index: number; lineX: number } {
  const tabs = tabRectsFor(paneId);
  if (!tabs.length) {
    const r = rects.get(paneId);
    return { index: tabCount, lineX: r ? r.x : x };
  }
  for (let k = 0; k < tabs.length; k++) {
    const tr = tabs[k].rect;
    if (x < tr.x + tr.w / 2) return { index: k, lineX: tr.x };
  }
  const last = tabs[tabs.length - 1].rect;
  return { index: tabs.length, lineX: last.x + last.w };
}
