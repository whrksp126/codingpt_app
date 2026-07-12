// paneRegistry — pane 들의 화면(window) 좌표 rect 를 모아 드래그 히트테스트에 쓴다.
//   PC 의 elementFromPoint 대체: 각 PaneView 가 measureInWindow 결과를 등록 → 손가락 위치로 pane/존 판정.

export interface PaneRect { x: number; y: number; w: number; h: number }
export type DropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';

const rects = new Map<string, PaneRect>();

export function setPaneRect(id: string, r: PaneRect): void { rects.set(id, r); }
export function removePaneRect(id: string): void { rects.delete(id); }
export function getPaneRect(id: string): PaneRect | undefined { return rects.get(id); }

// (x,y) 화면좌표 아래의 pane id.
export function paneAt(x: number, y: number): string | null {
  for (const [id, r] of rects) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return id;
  }
  return null;
}

// pane 내 상대 위치로 드롭 존(가장자리 25% = 방향 분할, 아니면 center=스왑).
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
