// tiling.ts — pane 분할 트리(순수 로직). PC codingpt_pc/src/js/tiling.js 1:1 이식.
//   렌더/영속화가 이 트리를 소비한다.
//
//   노드:
//    · leaf   = { id, kind:'terminal'|'preview'|'ide', tabs?/url?/openPath? }
//    · branch = { dir:'h'|'v', ratio:0..1, first:node, second:node }
//      - dir 'h' = 좌우 분할(가로로 나란히), 'v' = 상하 분할(세로로 쌓기)
//
//   cmux: ⌘D = 우측 분할('h'), ⌘⇧D = 하단 분할('v').

export type PaneKind = 'terminal' | 'preview' | 'ide';

// pane 탭 — 기본은 터미널(tmux window)이지만, IDE/프리뷰도 같은 pane 의 탭으로 편입 가능(혼합 탭).
//  kind 미지정 = 'term'(하위호환 — 기존 영속 레이아웃의 탭은 전부 터미널).
export interface TerminalTab {
  win?: number | 'new';
  title?: string;
  // '+'(새 터미널)로 만든 탭 표시 — 풀 미배치 터미널 입양 없이 반드시 새로 생성한다.
  fresh?: boolean;
  kind?: 'term' | 'ide' | 'preview';
  url?: string | null;        // preview 탭 상태
  openPath?: string | null;   // ide 탭 상태
  // 혼합 탭 안정 키 — ide/preview 탭 생성 시 부여(리렌더/재배치에도 본문 상태 유지).
  tid?: string;
}

// 탭이 터미널(tmux window) 탭인지 — kind 미지정 하위호환 포함.
export function isTermTab(t: TerminalTab | undefined | null): boolean {
  return !!t && (!t.kind || t.kind === 'term');
}

export interface TerminalLeaf {
  id: string;
  kind: 'terminal';
  tabs: TerminalTab[];
  active: number;
}

export interface PreviewLeaf {
  id: string;
  kind: 'preview';
  url: string | null;
}

export interface IdeLeaf {
  id: string;
  kind: 'ide';
  url?: string | null;
  openPath?: string | null;
}

export type Leaf = TerminalLeaf | PreviewLeaf | IdeLeaf;

export interface Branch {
  dir: 'h' | 'v';
  ratio: number;
  first: TilingNode;
  second: TilingNode;
}

export type TilingNode = Leaf | Branch;

export interface LeafOpts {
  win?: number | 'new';
  title?: string;
  url?: string | null;
  openPath?: string | null;
}

let _seq = 1;

export function newPaneId(): string {
  // RN 에는 performance.now 가 없을 수 있어 Date.now 로 대체(충돌 방지용 suffix).
  return 'p' + _seq++ + '-' + Math.floor(Date.now()).toString(36);
}

// 영속화 복원 시 seq 를 밀어 충돌 방지.
export function bumpSeq(fromIds?: string[]): void {
  for (const id of fromIds || []) {
    const m = /^p(\d+)-/.exec(id || '');
    if (m) _seq = Math.max(_seq, parseInt(m[1], 10) + 1);
  }
}

// leaf: 터미널 pane 은 탭 배열(각 탭=tmux window). 프리뷰/IDE 는 url/openPath.
export function leaf(kind: PaneKind, opts: LeafOpts = {}): Leaf {
  if (kind === 'preview') {
    return { id: newPaneId(), kind: 'preview', url: opts.url || null };
  }
  if (kind === 'ide') {
    return { id: newPaneId(), kind: 'ide', url: opts.url || null, openPath: opts.openPath || null };
  }
  return {
    id: newPaneId(),
    kind: 'terminal',
    tabs: [{ win: opts.win ?? 0, title: opts.title || '' }],
    active: 0,
  };
}

export function isLeaf(n: TilingNode | null | undefined): n is Leaf {
  return !!n && !(n as Branch).dir;
}

export function isBranch(n: TilingNode | null | undefined): n is Branch {
  return !!n && !!(n as Branch).dir;
}

// 트리에서 leaf 를 찾아 반환.
export function findLeaf(node: TilingNode | null, id: string): Leaf | null {
  if (!node) return null;
  if (isLeaf(node)) return node.id === id ? node : null;
  return findLeaf(node.first, id) || findLeaf(node.second, id);
}

// 모든 leaf 순회.
export function eachLeaf(node: TilingNode | null, cb: (l: Leaf) => void): void {
  if (!node) return;
  if (isLeaf(node)) {
    cb(node);
    return;
  }
  eachLeaf(node.first, cb);
  eachLeaf(node.second, cb);
}

export function leafIds(node: TilingNode | null): string[] {
  const ids: string[] = [];
  eachLeaf(node, (l) => ids.push(l.id));
  return ids;
}

// 다음 터미널 표시명("터미널 N") — 생성 시 고정 부여(pane 간 이동/새 분할에도 유지).
//  win(tmux window index)에서 파생하던 라벨은 독립 세션 구조에서 이동 시 번호가 재부여돼 이름이
//  바뀌어 보였다 → 사용중 번호(제목 "터미널 N" + 무제목 탭의 win 레거시 라벨) 최대값 +1. PC 와 동일 규칙.
export function nextTerminalTitle(root: TilingNode | null): string {
  let max = 0;
  eachLeaf(root, (l) => {
    if (l.kind !== 'terminal') return;
    for (const t of l.tabs || []) {
      const m = /^터미널 (\d+)$/.exec(t.title || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
      else if (!t.title && typeof t.win === 'number') max = Math.max(max, t.win);
    }
  });
  return '터미널 ' + (max + 1);
}

export function firstLeafId(node: TilingNode | null): string | null {
  let id: string | null = null;
  eachLeaf(node, (l) => {
    if (id == null) id = l.id;
  });
  return id;
}

// leaf 를 branch 로 치환(분할). before=true 면 newLeaf 를 first(좌/상)에 둔다.
//  반환: { tree, added } (새 트리 루트 + 추가된 leaf).
export function split(
  root: TilingNode,
  targetId: string,
  dir: 'h' | 'v',
  newLeafNode?: Leaf,
  before?: boolean,
): { tree: TilingNode; added: Leaf } {
  const added: Leaf = newLeafNode || leaf('terminal');
  function rec(node: TilingNode): TilingNode {
    if (isLeaf(node)) {
      if (node.id !== targetId) return node;
      return before
        ? { dir, ratio: 0.5, first: added, second: node }
        : { dir, ratio: 0.5, first: node, second: added };
    }
    return { ...node, first: rec(node.first), second: rec(node.second) };
  }
  return { tree: rec(root), added };
}

// leaf 닫기: 형제를 부모 자리로 승격. 마지막 하나면 null(빈 워크스페이스).
//  반환: { tree, focusId } (닫은 뒤 포커스 후보).
export function closeLeaf(
  root: TilingNode,
  targetId: string,
): { tree: TilingNode | null; focusId: string | null } {
  if (isLeaf(root)) return { tree: root.id === targetId ? null : root, focusId: null };
  interface RecResult {
    node: TilingNode;
    hit: boolean;
    focusId?: string | null;
  }
  function rec(node: TilingNode): RecResult {
    if (isLeaf(node)) return { node, hit: false };
    // 직속 자식이 타겟 leaf 면 형제 승격.
    if (isLeaf(node.first) && node.first.id === targetId) {
      return { node: node.second, hit: true, focusId: firstLeafId(node.second) };
    }
    if (isLeaf(node.second) && node.second.id === targetId) {
      return { node: node.first, hit: true, focusId: firstLeafId(node.first) };
    }
    const a = rec(node.first);
    if (a.hit) return { node: { ...node, first: a.node }, hit: true, focusId: a.focusId };
    const b = rec(node.second);
    if (b.hit) return { node: { ...node, second: b.node }, hit: true, focusId: b.focusId };
    return { node, hit: false };
  }
  const r = rec(root);
  return { tree: r.node, focusId: r.focusId || null };
}

// 두 leaf 의 트리 내 위치를 맞바꾼다(불변). 노드 객체 identity 는 유지.
export function swapLeaves(root: TilingNode, idA: string, idB: string): TilingNode {
  const a = findLeaf(root, idA);
  const b = findLeaf(root, idB);
  if (!a || !b) return root;
  function rec(node: TilingNode): TilingNode {
    if (isLeaf(node)) {
      if (node.id === idA) return b as Leaf;
      if (node.id === idB) return a as Leaf;
      return node;
    }
    return { ...node, first: rec(node.first), second: rec(node.second) };
  }
  return rec(root);
}

// leaf 통째로 이동. side=null → target 과 스왑, side=방향 → target 을 그 방향으로 분할해 삽입.
//  기존 leaf 객체를 재사용하므로 PaneView(터미널/에디터 상태)가 보존된다.
//  반환: { tree, movedId }.
export type Side = 'left' | 'right' | 'top' | 'bottom' | null;
export function moveLeaf(
  root: TilingNode,
  srcId: string,
  targetId: string,
  side: Side,
): { tree: TilingNode; movedId: string | null } {
  if (srcId === targetId) return { tree: root, movedId: null };
  const src = findLeaf(root, srcId);
  if (!src) return { tree: root, movedId: null };
  if (!side) return { tree: swapLeaves(root, srcId, targetId), movedId: srcId };
  const removed = closeLeaf(root, srcId).tree;
  if (!removed) return { tree: root, movedId: null };
  const dir: 'h' | 'v' = side === 'left' || side === 'right' ? 'h' : 'v';
  const before = side === 'left' || side === 'top';
  const r = split(removed, targetId, dir, src, before);
  return { tree: r.tree, movedId: src.id };
}

// 특정 leaf 를 fn 결과로 치환(불변). 나머지 노드는 identity 유지.
export function mapLeaf(root: TilingNode, id: string, fn: (l: Leaf) => Leaf): TilingNode {
  function rec(node: TilingNode): TilingNode {
    if (isLeaf(node)) return node.id === id ? fn(node) : node;
    const first = rec(node.first);
    const second = rec(node.second);
    if (first === node.first && second === node.second) return node;
    return { ...node, first, second };
  }
  return rec(root);
}

// branch 의 ratio 갱신(드래그 리사이즈). 불변 갱신.
//  branchPath: 루트부터 'first'|'second' 배열.
export function setRatio(root: TilingNode, branchPath: Array<'first' | 'second'>, ratio: number): TilingNode {
  function rec(node: TilingNode, i: number): TilingNode {
    if (isLeaf(node)) return node;
    if (i === branchPath.length) return { ...node, ratio: clamp(ratio, 0.1, 0.9) };
    const key = branchPath[i];
    return { ...node, [key]: rec(node[key], i + 1) };
  }
  return rec(root, 0);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 방향 이동(⌥⌘화살표) — 렌더된 rect 를 받아 가장 가까운 leaf 로 포커스.
//  dir: 'left'|'right'|'up'|'down'. rects: { id: {x,y,w,h} }.
export function neighbor(
  rects: Record<string, Rect>,
  fromId: string,
  dir: 'left' | 'right' | 'up' | 'down',
): string | null {
  const from = rects[fromId];
  if (!from) return null;
  const fcx = from.x + from.w / 2;
  const fcy = from.y + from.h / 2;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const [id, r] of Object.entries(rects)) {
    if (id === fromId) continue;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const dx = cx - fcx;
    const dy = cy - fcy;
    let ok = false;
    if (dir === 'left') ok = dx < -1 && Math.abs(dy) <= Math.max(from.h, r.h);
    else if (dir === 'right') ok = dx > 1 && Math.abs(dy) <= Math.max(from.h, r.h);
    else if (dir === 'up') ok = dy < -1 && Math.abs(dx) <= Math.max(from.w, r.w);
    else if (dir === 'down') ok = dy > 1 && Math.abs(dx) <= Math.max(from.w, r.w);
    if (!ok) continue;
    const score = Math.abs(dx) + Math.abs(dy);
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}
