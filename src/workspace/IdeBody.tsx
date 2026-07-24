// IdeBody — PC codingpt_pc/src/js/ide.js 미러(모바일 적응).
//  파일트리(폴더 계층·Material 아이콘·행 ... 메뉴·롱프레스 드래그 이동) + 트리 헤더(새 파일/새 폴더/새로고침)
//  + 프로젝트 전체 검색(파일 내용, fsGrep) + "에디터 그룹"(파일 탭 드래그로 분할/이동/순서변경 — VS Code
//  editor groups, PC egRoot 미러) + CodeMirror material-darker.
//  PC 와 다른 점(모바일 적응): 드래그=롱프레스 픽업. 저장=자동 저장(타이핑 멈춤 800ms, PC IDE 와 동일
//  정책 — 다른 기기에 곧바로 반영) + ⌘S/Ctrl+S 즉시 저장 병행.
//  같은 파일을 여러 그룹에 열면 "공유 버퍼"(files 스토어) — 한쪽 편집이 다른 그룹 에디터에 라이브 반영돼
//  마지막 저장이 덮어쓰는 문제가 없다(VS Code 동작).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Animated, PanResponder, LayoutChangeEvent } from 'react-native';
import { CaretRight, CaretUp, CaretDown, Plus, Folder as FolderIcn, ArrowClockwise, MagnifyingGlass, X, DotsThree, PencilSimple, Trash, FilePlus, SidebarSimple } from 'phosphor-react-native';
import { v2, v2Scheme } from '../theme/v2Tokens';
import daemonService, { DaemonGrepMatch } from '../services/daemonService';
import CodeEditorWebView, { CodeEditorHandle } from '../components/module/ide/CodeEditorWebView';
import { setKeyTarget, blurKeyTarget, setKeyTargetCtx, consumeKeyMods, KeyAssistOverlay, type KeyTarget } from '../components/keyboard/KeyAssist';
import KeyTextInput from '../components/keyboard/KeyTextInput';
import { FileTypeIcon, FolderTypeIcon } from './fileIcons';
import { registerIdeControl, getTermInsert, pickTermInsert } from './uiControls';
import * as paneRegistry from './paneRegistry';
import { haptic } from '../animations/haptics';

const C = v2.colors;

// 전역 키보드 액세서리 타깃 — 에디터 인스턴스(`${gid}::${rel}`)별. 핸들은 호출 시점에 Map 조회.
const makeEditorTarget = (key: string, refs: Map<string, CodeEditorHandle>): KeyTarget => ({
  id: 'ed:' + key,
  kind: 'editor',
  focus: () => refs.get(key)?.focus(),
  blur: () => refs.get(key)?.blur(),
  setVmods: (f) => refs.get(key)?.setVmods(f),
  applyKey: (n, f, os) => refs.get(key)?.applyKey(n, f, os),
  insertText: (t, c) => refs.get(key)?.insertText(t, c),
  setImeSuppressed: (on) => refs.get(key)?.setImeSuppressed(on),
  refocusKeyboard: () => refs.get(key)?.refocusKeyboard(),
});

const baseName = (p: string) => p.split('/').pop() || p;
const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// PC ide.js modeFor 미러(CodeEditorWebView language 문자열 기준).
const langFor = (path: string): string => {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', tsx: 'jsx',
    ts: 'typescript', json: 'json', html: 'html', htm: 'html', vue: 'html', svelte: 'html',
    css: 'css', scss: 'css', less: 'css', md: 'markdown', py: 'python',
    xml: 'xml', svg: 'xml', sh: 'shell', bash: 'shell', zsh: 'shell',
  };
  return map[ext] || 'text';
};

// ── diff 가상 문서(ui.ideDiff, 계약 §3) — 버퍼/그룹 open 목록에 'diff://<path>' 센티널 키로 편승 ──
//  읽기 전용이며 저장/자동저장/파일워치/영속 경로엔 절대 태우지 않는다(각 경로에 프리픽스 가드).
const DIFF_PREFIX = 'diff://';
const isDiffDoc = (rel: string) => rel.startsWith(DIFF_PREFIX);
const diffPathOf = (rel: string) => rel.slice(DIFF_PREFIX.length);
// 파일 탭 라벨 — diff 문서는 `diff: <basename>`, 일반 파일은 파일명.
const tabLabelOf = (rel: string) => (isDiffDoc(rel) ? 'diff: ' + baseName(diffPathOf(rel)) : baseName(rel));

interface TNode { name: string; rel: string; dir: boolean; children: TNode[] }

// 데몬 fsTree(flat 상대경로 목록) → 폴더 계층 트리. 폴더 먼저, 이름순(PC/VS Code 관례).
function buildTree(items: { path: string; text: boolean }[]): TNode[] {
  const root: TNode = { name: '', rel: '', dir: true, children: [] };
  const dirMap = new Map<string, TNode>([['', root]]);
  const ensureDir = (rel: string): TNode => {
    const got = dirMap.get(rel);
    if (got) return got;
    const parent = ensureDir(parentOf(rel));
    const node: TNode = { name: baseName(rel), rel, dir: true, children: [] };
    parent.children.push(node);
    dirMap.set(rel, node);
    return node;
  };
  for (const it of items) {
    const dir = ensureDir(parentOf(it.path));
    dir.children.push({ name: baseName(it.path), rel: it.path, dir: false, children: [] });
  }
  const sortRec = (n: TNode) => {
    n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root.children;
}

// ── 에디터 그룹 타일링 트리(PC egRoot 미러) — leaf=그룹(열린 파일 rel 목록), branch=분할 ──
let egSeq = 1;
export interface EgGroup { id: string; open: string[]; active: number }
export interface EgBranch { dir: 'h' | 'v'; ratio: number; first: EgNode; second: EgNode }
export type EgNode = EgGroup | EgBranch;

const isEgGroup = (n: EgNode | null | undefined): n is EgGroup => !!n && !('dir' in n);
const newGid = () => 'g' + egSeq++;

function egEach(node: EgNode | null, cb: (g: EgGroup) => void): void {
  if (!node) return;
  if (isEgGroup(node)) { cb(node); return; }
  egEach(node.first, cb);
  egEach(node.second, cb);
}
function egFind(node: EgNode | null, id: string): EgGroup | null {
  if (!node) return null;
  if (isEgGroup(node)) return node.id === id ? node : null;
  return egFind(node.first, id) || egFind(node.second, id);
}
function egFirst(node: EgNode): EgGroup {
  return isEgGroup(node) ? node : egFirst(node.first);
}
function egCount(node: EgNode): number {
  let n = 0; egEach(node, () => { n += 1; }); return n;
}
// 특정 그룹만 fn 결과로 치환(불변).
function egMapGroup(root: EgNode, id: string, fn: (g: EgGroup) => EgGroup): EgNode {
  if (isEgGroup(root)) return root.id === id ? fn(root) : root;
  const first = egMapGroup(root.first, id, fn);
  const second = egMapGroup(root.second, id, fn);
  if (first === root.first && second === root.second) return root;
  return { ...root, first, second };
}
// 모든 그룹 fn 결과로 치환(불변).
function egMapAll(root: EgNode, fn: (g: EgGroup) => EgGroup): EgNode {
  if (isEgGroup(root)) return fn(root);
  return { ...root, first: egMapAll(root.first, fn), second: egMapAll(root.second, fn) };
}
// 그룹을 branch 로 치환(분할). before=true 면 newG 를 first(좌/상)에 둔다.
function egSplit(root: EgNode, targetId: string, dir: 'h' | 'v', newG: EgGroup, before: boolean): EgNode {
  if (isEgGroup(root)) {
    if (root.id !== targetId) return root;
    return before ? { dir, ratio: 0.5, first: newG, second: root } : { dir, ratio: 0.5, first: root, second: newG };
  }
  return { ...root, first: egSplit(root.first, targetId, dir, newG, before), second: egSplit(root.second, targetId, dir, newG, before) };
}
// 그룹 닫기: 형제를 부모 자리로 승격. 마지막 하나면 null.
function egClose(root: EgNode, targetId: string): EgNode | null {
  if (isEgGroup(root)) return root.id === targetId ? null : root;
  const first = egClose(root.first, targetId);
  const second = egClose(root.second, targetId);
  if (first === null) return second;
  if (second === null) return first;
  if (first === root.first && second === root.second) return root;
  return { ...root, first, second };
}
// branch ratio 갱신(분할선 드래그) — 루트부터 'first'|'second' 경로.
function egSetRatio(root: EgNode, path: Array<'first' | 'second'>, ratio: number): EgNode {
  function rec(node: EgNode, i: number): EgNode {
    if (isEgGroup(node)) return node;
    if (i === path.length) return { ...node, ratio: clampN(ratio, 0.1, 0.9) };
    const key = path[i];
    return { ...node, [key]: rec(node[key], i + 1) };
  }
  return rec(root, 0);
}
// 빈 그룹 정리(그룹이 2개 이상 남는 한 빈 그룹은 닫는다) — 삭제/이동 뒤처리.
function egPruneEmpty(root: EgNode): EgNode {
  let t: EgNode = root;
  for (;;) {
    let victim: string | null = null;
    let count = 0;
    egEach(t, (g) => { count += 1; if (!g.open.length && victim == null) victim = g.id; });
    if (victim == null || count <= 1) return t;
    const closed = egClose(t, victim);
    if (!closed) return t;
    t = closed;
  }
}
// 그룹에서 index 파일 제거(+비면 그룹 닫기 — 마지막 그룹은 빈 채 유지).
function egRemoveAt(root: EgNode, gid: string, index: number): EgNode {
  const g = egFind(root, gid);
  if (!g || index < 0 || index >= g.open.length) return root;
  const open = g.open.filter((_, k) => k !== index);
  if (!open.length && egCount(root) > 1) return egClose(root, gid) || root;
  let active = g.active;
  if (index < active) active -= 1;
  if (active >= open.length) active = open.length - 1;
  return egMapGroup(root, gid, (gg) => ({ ...gg, open, active }));
}

// 직렬화(영속) — id 는 저장하지 않고 복원 시 재부여(JSON 안정성).
type EgSaved = { open: string[]; active: number } | { dir: 'h' | 'v'; ratio: number; first: EgSaved; second: EgSaved };
function serializeEg(node: EgNode): EgSaved {
  if (isEgGroup(node)) return { open: [...node.open], active: node.active };
  return { dir: node.dir, ratio: node.ratio, first: serializeEg(node.first), second: serializeEg(node.second) };
}
function restoreEg(input: unknown): EgNode | null {
  const rec = (n: any): EgNode | null => {
    if (!n || typeof n !== 'object') return null;
    if (n.dir === 'h' || n.dir === 'v') {
      const first = rec(n.first);
      const second = rec(n.second);
      if (!first || !second) return first || second; // 한쪽 깨짐 → 남은 쪽 승격
      return { dir: n.dir, ratio: typeof n.ratio === 'number' ? clampN(n.ratio, 0.1, 0.9) : 0.5, first, second };
    }
    if (Array.isArray(n.open)) {
      // diff 가상 문서 키는 복원 제외(영속도 안 하지만 과거 저장분 방어) — diffText 원본이 없다.
      const open = n.open.filter((r: unknown) => typeof r === 'string' && r && !isDiffDoc(r));
      const active = open.length ? clampN(typeof n.active === 'number' ? n.active : 0, 0, open.length - 1) : -1;
      return { id: newGid(), open, active };
    }
    return null;
  };
  return rec(input);
}

interface FileBuf { content: string; dirty: boolean }

// 파일 탭 드래그 메타/드롭(PC _beginTabDrag/_applyTabDrop 미러).
interface FDragMeta { gid: string; index: number; rel: string }
type FDropMode = 'tabbar' | 'center' | 'split-left' | 'split-right' | 'split-top' | 'split-bottom';
interface FDrop { gid: string; mode: FDropMode; index?: number; lineX?: number }

const TABBAR_H = 32;

// ── 롱프레스 픽업 드래그 훅(공용) — PaneView useDragHandle 과 같은 capture 패턴 ──
//  시작 시엔 responder 를 안 잡아 탭/스크롤이 정상 동작하고, 롱프레스 성립 후 move(capture)에서 탈취.
function useLongPressDrag(cb: { onStart: (x: number, y: number) => void; onMove: (x: number, y: number) => void; onEnd: (x: number, y: number) => void }, delay = 300) {
  const cbRef = useRef(cb); cbRef.current = cb;
  const armed = useRef(false);
  const granted = useRef(false);
  const started = useRef(false);
  const startXY = useRef({ x: 0, y: 0 });
  const lastXY = useRef({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (e) => {
        armed.current = false; granted.current = false; started.current = false; clear();
        startXY.current = lastXY.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        timer.current = setTimeout(() => {
          armed.current = true; started.current = true;
          haptic.select();
          cbRef.current.onStart(lastXY.current.x, lastXY.current.y);
        }, delay);
        return false;
      },
      onMoveShouldSetPanResponderCapture: (e) => {
        lastXY.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        if (armed.current) return true;
        const dx = lastXY.current.x - startXY.current.x;
        const dy = lastXY.current.y - startXY.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clear(); // 스크롤/스와이프 의도 → 픽업 취소
        return false;
      },
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => armed.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => { granted.current = true; cbRef.current.onMove(e.nativeEvent.pageX, e.nativeEvent.pageY); },
      onPanResponderMove: (e) => cbRef.current.onMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: (e) => {
        clear(); armed.current = false; granted.current = false; started.current = false;
        cbRef.current.onEnd(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderTerminate: () => {
        clear(); armed.current = false; granted.current = false;
        if (started.current) { started.current = false; cbRef.current.onEnd(NaN, NaN); }
      },
    }),
  ).current;
  const onTouchEnd = () => {
    clear();
    if (started.current && !granted.current) { started.current = false; armed.current = false; cbRef.current.onEnd(NaN, NaN); }
    armed.current = false;
  };
  return { panHandlers: pan.panHandlers, onTouchEnd };
}

export default function IdeBody({
  root, host = null, treeVisible, onToggleTree, paneActive = true, initialOpenPath, onOpenPathChange, initialLayout, onLayoutChange, controlKey,
}: {
  root: string;                 // 워크스페이스 절대경로
  host?: number | null;         // 이 워크스페이스의 호스트 PC(hostDeviceId) — 활성 러너 무관 직결
  treeVisible: boolean;
  onToggleTree?: () => void;    // 파일 탭 바 우측 탐색기 토글(pane 헤더 대신 IDE 안 — 혼합 탭에서도 보임)
  paneActive?: boolean;         // 이 IDE 가 현재 포커스된 표면인가 — 파일 탭 활성 텍스트를 이때만 밝게(포커스 풀리면 같이 풀림)
  initialOpenPath?: string | null;      // 레거시 복원(그룹 레이아웃 없을 때 파일 1개)
  onOpenPathChange?: (rel: string | null) => void;
  initialLayout?: unknown;              // 에디터 그룹 레이아웃 복원
  onLayoutChange?: (layout: unknown) => void;
  controlKey?: string;                  // ui_command 브리지 제어 키(leaf id 또는 혼합 탭 tid)
}) {
  const full = useCallback((rel: string) => (root ? `${root}/${rel}` : rel), [root]);
  const [items, setItems] = useState<{ path: string; text: boolean }[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<DaemonGrepMatch[] | null>(null); // null = 검색 모드 아님
  const [menuNode, setMenuNode] = useState<{ rel: string; dir: boolean } | null>(null);
  const [prompt, setPrompt] = useState<{ mode: 'newFile' | 'newDir' | 'rename'; base: string } | null>(null);
  const [promptInput, setPromptInput] = useState('');
  const [toast, setToast] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchToken = useRef(0);

  // ── 파일 버퍼 스토어(공유 문서) — rel → {content, dirty}. 그룹들은 rel 참조만 가진다. ──
  const [files, setFiles] = useState<Record<string, FileBuf>>({});
  const filesRef = useRef(files); filesRef.current = files;

  // ── 에디터 그룹 상태(복원은 최초 1회) ──
  const initialRoot = useMemo<EgNode>(() => {
    const restored = restoreEg(initialLayout);
    if (restored) return restored;
    return { id: newGid(), open: initialOpenPath ? [initialOpenPath] : [], active: initialOpenPath ? 0 : -1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [egRoot, setEgRoot] = useState<EgNode>(initialRoot);
  const [activeGid, setActiveGid] = useState<string>(() => egFirst(initialRoot).id);
  const egRootRef = useRef(egRoot); egRootRef.current = egRoot;
  const activeGidRef = useRef(activeGid); activeGidRef.current = activeGid;
  const editorRefs = useRef(new Map<string, CodeEditorHandle>());
  const pendingJump = useRef(new Map<string, number>()); // gid → 에디터 마운트 후 점프할 라인

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); }, []);

  const reload = useCallback(async () => {
    try {
      const t = await daemonService.fsTree(root, host);
      setItems(t.items || []);
    } catch (e) { showToast(String(e)); }
  }, [root, showToast]);
  useEffect(() => { void reload(); }, [reload]);

  const tree = useMemo(() => buildTree(items), [items]);

  // 파일 내용 확보(스토어 미적재 시 fsRead) — 열기/복원/이동 공용.
  const ensureFile = useCallback(async (rel: string) => {
    if (isDiffDoc(rel)) return; // diff 가상 문서 — 내용은 openDiff 가 직접 주입(디스크에 실체 없음)
    if (filesRef.current[rel]) return;
    try {
      const r = await daemonService.fsRead(full(rel), { host });
      const content = typeof r.content === 'string' ? r.content : '';
      setFiles((cur) => (cur[rel] ? cur : { ...cur, [rel]: { content, dirty: false } }));
    } catch (e) { showToast(String(e)); }
  }, [full, showToast]);

  // 그룹 트리 변화 뒤처리: 활성 그룹 유효화 + 미적재 파일 로드 + 어느 그룹에도 없는 버퍼 정리(닫힌 파일).
  useEffect(() => {
    const gids = new Set<string>();
    const rels = new Set<string>();
    egEach(egRoot, (g) => { gids.add(g.id); g.open.forEach((r) => rels.add(r)); });
    if (!gids.has(activeGidRef.current)) setActiveGid(egFirst(egRoot).id);
    rels.forEach((r) => { if (!filesRef.current[r]) void ensureFile(r); });
    setFiles((cur) => {
      const stale = Object.keys(cur).filter((k) => !rels.has(k));
      if (!stale.length) return cur;
      const next = { ...cur };
      stale.forEach((k) => {
        // 닫히는 파일에 미저장 편집이 있으면 버리지 않고 플러시(자동 저장 정책 — 편집분 유실 방지).
        //  diff 가상 문서는 디스크 실체가 없어 절대 쓰지 않는다(dirty 도 되지 않지만 이중 가드).
        if (next[k].dirty && !isDiffDoc(k)) void daemonService.fsWrite(full(k), next[k].content, host).catch(() => {});
        delete next[k];
      });
      return next;
    });
  }, [egRoot, ensureFile, full]);

  // 활성 에디터가 바뀌면 이전 활성 에디터를 명시 blur — iOS 는 다른 웹뷰로 포커스가 넘어가도
  //  이전 웹뷰 DOM 에 blur 를 안 알려 stale focused 가 되고, 되돌아온 뒤 탭의 focus() 가 no-op
  //  (커서/키보드 안 돌아오는 무반응)이 된다. 미리 blur 해 두면 재탭이 신선한 포커스 경로를 탄다.
  const prevActiveEditorKey = useRef<string | null>(null);
  useEffect(() => {
    const g = egFind(egRoot, activeGid) || egFirst(egRoot);
    const rel = g ? g.open[g.active] : null;
    const key = g && rel ? `${g.id}::${rel}` : null;
    if (prevActiveEditorKey.current && prevActiveEditorKey.current !== key) {
      editorRefs.current.get(prevActiveEditorKey.current)?.blur();
    }
    prevActiveEditorKey.current = key;
  }, [egRoot, activeGid]);

  // 레이아웃 영속(디바운스) + 레거시 openPath(활성 파일) 갱신.
  const onLayoutChangeRef = useRef(onLayoutChange); onLayoutChangeRef.current = onLayoutChange;
  const onOpenPathChangeRef = useRef(onOpenPathChange); onOpenPathChangeRef.current = onOpenPathChange;
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; } // 최초 복원 렌더는 저장 안 함
    const t = setTimeout(() => {
      // diff 가상 문서는 영속 제외 — 재시작 후엔 diffText 원본이 없어 복원 불가(세션 휘발).
      const cleaned = egPruneEmpty(egMapAll(egRootRef.current, (g) => {
        const open = g.open.filter((r) => !isDiffDoc(r));
        if (open.length === g.open.length) return g;
        const activeRel = g.open[g.active];
        const active = open.length ? Math.max(0, open.indexOf(activeRel)) : -1;
        return { ...g, open, active };
      }));
      onLayoutChangeRef.current?.(serializeEg(cleaned));
      const g = egFind(egRootRef.current, activeGidRef.current) || egFirst(egRootRef.current);
      const rel = g?.open[g.active] ?? null;
      onOpenPathChangeRef.current?.(rel && !isDiffDoc(rel) ? rel : null);
    }, 800);
    return () => clearTimeout(t);
  }, [egRoot, activeGid]);

  // ── 열기/전환/닫기 ──
  const openFile = useCallback((rel: string, line?: number) => {
    const root0 = egRootRef.current;
    const g = egFind(root0, activeGidRef.current) || egFirst(root0);
    const idx = g.open.indexOf(rel);
    if (idx >= 0) {
      if (idx !== g.active) setEgRoot(egMapGroup(root0, g.id, (gg) => ({ ...gg, active: idx })));
      setActiveGid(g.id);
      if (line) {
        pendingJump.current.set(g.id, line);
        setTimeout(() => { editorRefs.current.get(`${g.id}::${rel}`)?.gotoLine(line); pendingJump.current.delete(g.id); }, 150);
      }
      return;
    }
    void ensureFile(rel);
    if (line) pendingJump.current.set(g.id, line);
    setEgRoot(egMapGroup(root0, g.id, (gg) => ({ ...gg, open: [...gg.open, rel], active: gg.open.length })));
    setActiveGid(g.id);
  }, [ensureFile]);

  const closeFile = useCallback((gid: string, i: number) => {
    setEgRoot((r) => egRemoveAt(r, gid, i));
  }, []);

  // diff 가상 문서 열기/갱신(ui.ideDiff) — 같은 path 문서가 이미 열려있으면 내용 갱신+활성화(중복 탭 금지).
  //  버퍼는 dirty=false 고정 — 자동저장/플러시/워치 리로드 어느 경로에도 걸리지 않는다.
  const openDiff = useCallback((path: string, diffText: string, truncated?: boolean) => {
    const rel = DIFF_PREFIX + path;
    const content = diffText + (truncated ? '\n… (diff 가 256KB 를 넘어 잘렸어요)' : '');
    setFiles((c) => ({ ...c, [rel]: { content, dirty: false } }));
    const root0 = egRootRef.current;
    let hit: { gid: string; i: number } | null = null;
    egEach(root0, (g) => { if (!hit) { const i = g.open.indexOf(rel); if (i >= 0) hit = { gid: g.id, i }; } });
    if (hit) {
      const h = hit as { gid: string; i: number };
      setEgRoot(egMapGroup(root0, h.gid, (gg) => (gg.active === h.i ? gg : { ...gg, active: h.i })));
      setActiveGid(h.gid);
      // 이미 마운트된(숨김 포함) 에디터에 새 diffText 반영 — setValue 는 동일 내용이면 no-op.
      egEach(root0, (g) => { if (g.open.includes(rel)) editorRefs.current.get(`${g.id}::${rel}`)?.setValue(content); });
    } else {
      const g = egFind(root0, activeGidRef.current) || egFirst(root0);
      setEgRoot(egMapGroup(root0, g.id, (gg) => ({ ...gg, open: [...gg.open, rel], active: gg.open.length })));
      setActiveGid(g.id);
    }
  }, []);

  // ui_command 브리지 제어 채널 — ideOpen/close-file/list 를 이 인스턴스로 중계(키 = controlKey).
  useEffect(() => {
    if (!controlKey) return;
    return registerIdeControl(controlKey, {
      openFile: (rel, line) => openFile(rel, line),
      // git diff 가상 문서(ui.ideDiff) — 읽기 전용 표시/갱신.
      openDiff: (path, diffText, truncated) => openDiff(path, diffText, truncated),
      // 열린 파일 탭 하나 닫기 — 활성 그룹 우선, 없으면 아무 그룹에서 rel 제거.
      closeFile: (rel) => {
        const root0 = egRootRef.current;
        let hit: { gid: string; i: number } | null = null;
        const ag = egFind(root0, activeGidRef.current);
        if (ag) { const i = ag.open.indexOf(rel); if (i >= 0) hit = { gid: ag.id, i }; }
        if (!hit) egEach(root0, (g) => { if (!hit) { const i = g.open.indexOf(rel); if (i >= 0) hit = { gid: g.id, i }; } });
        if (!hit) return false;
        closeFile(hit.gid, hit.i);
        return true;
      },
      // 지금 열린 파일 목록(중복 제거) — 활성 그룹의 활성 파일을 active 로 표시. diff 가상 문서 제외.
      listOpenFiles: () => {
        const root0 = egRootRef.current;
        const g = egFind(root0, activeGidRef.current) || egFirst(root0);
        const activeRel = g ? g.open[g.active] : null;
        const seen = new Set<string>();
        const list: { path: string; active: boolean }[] = [];
        egEach(root0, (gg) => gg.open.forEach((r) => { if (!isDiffDoc(r) && !seen.has(r)) { seen.add(r); list.push({ path: r, active: r === activeRel }); } }));
        return list;
      },
    });
  }, [controlKey, openFile, closeFile, openDiff]);

  // ── 편집/저장 — 스토어가 원천, 같은 파일을 보는 다른 그룹 에디터에 라이브 반영(공유 문서) ──
  //  자동 저장(VS Code afterDelay): 타이핑이 멈추고 800ms 뒤 디스크에 기록 → 다른 기기(PC 포함)에
  //  곧바로 반영된다(터미널 라이브 미러와 같은 체감). ⌘S 즉시 저장은 그대로 유지.
  const autosaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const scheduleAutosaveRef = useRef<(rel: string) => void>(() => {});
  const autosaveRel = useCallback(async (rel: string) => {
    const buf = filesRef.current[rel];
    if (!buf || !buf.dirty) return;
    const text = buf.content;
    try { await daemonService.fsWrite(full(rel), text, host); } catch (e) { showToast(String(e)); return; }
    const cur = filesRef.current[rel];
    if (!cur) return;
    if (cur.content !== text) { scheduleAutosaveRef.current(rel); return; } // 쓰는 동안 추가 편집 — 다음 저장으로
    setFiles((c) => (c[rel] && !autosaveTimers.current.has(rel) ? { ...c, [rel]: { ...c[rel], dirty: false } } : c));
  }, [full, showToast]);
  const scheduleAutosave = useCallback((rel: string) => {
    const m = autosaveTimers.current;
    const t = m.get(rel);
    if (t) clearTimeout(t);
    m.set(rel, setTimeout(() => { m.delete(rel); void autosaveRel(rel); }, 800));
  }, [autosaveRel]);
  useEffect(() => { scheduleAutosaveRef.current = scheduleAutosave; }, [scheduleAutosave]);
  // 언마운트 시 대기 중 저장 즉시 플러시(편집분 유실 방지).
  useEffect(() => () => {
    autosaveTimers.current.forEach((t) => clearTimeout(t));
    autosaveTimers.current.clear();
    Object.entries(filesRef.current).forEach(([rel, buf]) => {
      if (buf.dirty && !isDiffDoc(rel)) void daemonService.fsWrite(full(rel), buf.content, host).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEditorChange = useCallback((gid: string, rel: string, v: string) => {
    if (isDiffDoc(rel)) return; // diff 가상 문서 = 읽기 전용(nocursor) — 변경 자체가 없지만 이중 가드
    const cur = filesRef.current[rel];
    if (cur && cur.content === v) return; // 라이브 반영 에코 차단
    setFiles((c) => ({ ...c, [rel]: { content: v, dirty: true } }));
    scheduleAutosave(rel);
    egEach(egRootRef.current, (g) => {
      if (g.id !== gid && g.open[g.active] === rel) editorRefs.current.get(`${g.id}::${rel}`)?.setValue(v);
    });
  }, [scheduleAutosave]);

  // 숨겨져 있던 에디터가 다시 활성될 때 최신 버퍼 주입(동일 내용이면 no-op — 커서/스크롤 보존).
  const syncEditor = useCallback((gid: string, rel: string) => {
    const buf = filesRef.current[rel];
    if (buf) editorRefs.current.get(`${gid}::${rel}`)?.setValue(buf.content);
  }, []);

  // gid 명시 가능 — ⌘S 는 setActiveGid 리렌더 전에 실행되므로 이벤트가 난 그룹을 직접 저장한다.
  const save = useCallback(async (gid?: string) => {
    const g = egFind(egRootRef.current, gid || activeGidRef.current);
    const rel = g ? g.open[g.active] : null;
    if (!rel || isDiffDoc(rel)) return; // diff 가상 문서는 저장 대상 아님
    const buf = filesRef.current[rel];
    if (!buf || !buf.dirty) return;
    const t = autosaveTimers.current.get(rel);
    if (t) { clearTimeout(t); autosaveTimers.current.delete(rel); }
    try {
      await daemonService.fsWrite(full(rel), buf.content, host);
      // 쓰는 동안 추가 편집됐으면 dirty 유지(자동 저장이 이어서 기록).
      setFiles((c) => (c[rel] && c[rel].content === buf.content ? { ...c, [rel]: { ...c[rel], dirty: false } } : c));
    } catch (e) { showToast(String(e)); }
  }, [full, showToast]);

  // ── 라이브 동기화 — 다른 기기 IDE/PC/터미널/에이전트의 파일 변경을 즉시 반영(터미널 미러와 같은 체감) ──
  //  데몬이 워크스페이스 루트를 감시(chokidar)하고 fs_event 를 push → 열린 버퍼 중 dirty 아닌 것만
  //  다시 읽어 교체(내가 편집 중인 파일은 보호 — 마지막 저장 승리). 구조 변화는 트리 갱신(디바운스).
  useEffect(() => {
    let alive = true;
    // 감시 등록은 주기 재시도 — 데몬이 재시작되면 watcher 가 사라지므로(단일 watcher) 살아있는 동안 유지.
    const watch = () => daemonService.fsWatch(root, host).catch(() => { /* 감시 미지원/실패해도 IDE 는 정상 동작 */ });
    void watch();
    const watchTimer = setInterval(watch, 60_000);
    let treeTimer: ReturnType<typeof setTimeout> | null = null;
    const prefix = root ? root + '/' : '';
    const unsub = daemonService.streamDaemonEvents((ev) => {
      if (!alive) return;
      const p = ev.path || '';
      if (root && !p.startsWith(prefix)) return; // 다른 워크스페이스 이벤트 무시
      const rel = root ? p.slice(prefix.length) : p;
      if ((ev.event === 'change' || ev.event === 'add') && filesRef.current[rel] && !filesRef.current[rel].dirty) {
        void (async () => {
          try {
            const r = await daemonService.fsRead(p, { host });
            const content = typeof r.content === 'string' ? r.content : '';
            const cur = filesRef.current[rel];
            if (!alive || !cur || cur.dirty || cur.content === content) return; // 편집 시작했거나 이미 같은 내용이면 보류
            setFiles((c) => (c[rel] && !c[rel].dirty ? { ...c, [rel]: { content, dirty: false } } : c));
            // 이 파일을 연 모든 그룹 에디터에 반영(setValue 는 커서/스크롤 보존 + 동일값 no-op)
            egEach(egRootRef.current, (g) => {
              if (g.open.includes(rel)) editorRefs.current.get(`${g.id}::${rel}`)?.setValue(content);
            });
          } catch (_) { /* noop */ }
        })();
      }
      if (ev.event !== 'change') {
        if (treeTimer) clearTimeout(treeTimer);
        treeTimer = setTimeout(() => { if (alive) void reload(); }, 500);
      }
    });
    return () => {
      alive = false;
      clearInterval(watchTimer);
      if (treeTimer) clearTimeout(treeTimer);
      unsub();
    };
  }, [root, reload]);

  // ── 검색(프로젝트 전체, 파일 내용) — PC _renderSearch 미러 ──
  const onQuery = useCallback((q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setHits(null); return; }
    searchTimer.current = setTimeout(async () => {
      const token = ++searchToken.current;
      const r = await daemonService.fsGrep(root, q, host);
      if (token === searchToken.current) setHits(r.matches || []);
    }, 220);
  }, [root]);

  // ── 경로 변경 공통(이름 변경/트리 드래그 이동): 스토어 키 + 모든 그룹 open 경로 재지정 ──
  const retargetPaths = useCallback((from: string, to: string) => {
    const mapRel = (r: string) => (r === from ? to : r.startsWith(from + '/') ? to + r.slice(from.length) : r);
    setFiles((cur) => {
      const next: Record<string, FileBuf> = {};
      for (const [k, v] of Object.entries(cur)) next[mapRel(k)] = v;
      return next;
    });
    setEgRoot((r) => egMapAll(r, (g) => ({ ...g, open: g.open.map(mapRel) })));
  }, []);

  // ── 파일 조작(컨텍스트 메뉴/트리 헤더) ──
  const submitPrompt = useCallback(async () => {
    if (!prompt) return;
    const name = promptInput.trim();
    const p = prompt; setPrompt(null); setPromptInput('');
    if (!name) return;
    try {
      if (p.mode === 'newFile' || p.mode === 'newDir') {
        const rel = p.base ? `${p.base}/${name}` : name;
        if (p.mode === 'newDir') await daemonService.fsMkdir(full(rel), host);
        else await daemonService.fsCreateFile(full(rel), host);
        if (p.base) setExpanded((s) => new Set(s).add(p.base));
        await reload();
        if (p.mode === 'newFile') openFile(rel);
      } else {
        const dir = parentOf(p.base);
        const rel = dir ? `${dir}/${name}` : name;
        await daemonService.fsRename(full(p.base), full(rel), host);
        retargetPaths(p.base, rel);
        await reload();
      }
    } catch (e) { showToast(String(e)); }
  }, [prompt, promptInput, full, reload, openFile, retargetPaths, showToast]);

  const doDelete = useCallback(async (rel: string) => {
    setMenuNode(null);
    try {
      await daemonService.fsDelete(full(rel), host);
      const match = (r: string) => r === rel || r.startsWith(rel + '/');
      setFiles((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => !match(k))));
      setEgRoot((r) => {
        const mapped = egMapAll(r, (g) => {
          const activeRel = g.open[g.active];
          const open = g.open.filter((o) => !match(o));
          const active = open.length ? Math.max(0, open.indexOf(activeRel)) : -1;
          return { ...g, open, active };
        });
        return egPruneEmpty(mapped);
      });
      await reload();
    } catch (e) { showToast(String(e)); }
  }, [full, reload, showToast]);

  // ── 트리 드래그(파일/폴더 이동) — 롱프레스 픽업 → 폴더 행(또는 빈 영역=루트)에 드롭 = fsRename ──
  const rowViews = useRef(new Map<string, { ref: React.RefObject<View | null>; dir: boolean }>());
  const rowRects = useRef(new Map<string, { x: number; y: number; w: number; h: number; dir: boolean }>());
  const panelRef = useRef<View>(null);
  const panelRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ rel: string; dir: boolean } | null>(null);
  const [dropDir, setDropDir] = useState<string | null>(null); // '' = 루트, null = 드롭 불가 위치
  const dragRef = useRef(drag);
  const dropDirRef = useRef(dropDir); dropDirRef.current = dropDir;
  const overTermRef = useRef<string | null>(null); // 트리 밖 터미널 pane 위(파일 경로 삽입 대상)
  // 셸 안전 작은따옴표 감싸기(PC os-drop shq 와 동일 규칙).
  const shq = (p: string) => "'" + String(p).replace(/'/g, "'\\''") + "'";
  const ghostPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const computeTreeDrop = (src: string, x: number, y: number): string | null => {
    const p = panelRect.current;
    if (!p || x < p.x || x > p.x + p.w || y < p.y || y > p.y + p.h) return null;
    let hit: { rel: string; dir: boolean } | null = null;
    for (const [r, rc] of rowRects.current) {
      if (y >= rc.y && y <= rc.y + rc.h && x >= rc.x && x <= rc.x + rc.w) { hit = { rel: r, dir: rc.dir }; break; }
    }
    const dst = hit ? (hit.dir ? hit.rel : parentOf(hit.rel)) : '';
    if (dst === src || dst.startsWith(src + '/') || dst === parentOf(src)) return null;
    return dst;
  };

  const moveNode = useCallback(async (src: string, dstDir: string) => {
    if (dstDir === src || dstDir.startsWith(src + '/') || dstDir === parentOf(src)) return;
    const name = baseName(src);
    const dstRel = dstDir ? `${dstDir}/${name}` : name;
    // fsTree 는 파일 flat 목록 — 같은 경로 파일 또는 그 하위 파일 존재 = 이름 충돌.
    if (items.some((it) => it.path === dstRel || it.path.startsWith(dstRel + '/'))) {
      showToast('같은 이름이 이미 있어요: ' + dstRel);
      return;
    }
    try {
      await daemonService.fsRename(full(src), full(dstRel), host);
      retargetPaths(src, dstRel);
      if (dstDir) setExpanded((s) => new Set(s).add(dstDir));
      await reload();
    } catch (e) { showToast(String(e)); }
  }, [items, full, retargetPaths, reload, showToast]);
  const moveNodeRef = useRef(moveNode); moveNodeRef.current = moveNode;

  const onTreeDragStart = useCallback((rel: string, dir: boolean, x: number, y: number) => {
    paneRegistry.measureAll(); // 터미널 pane rect 최신화(파일→터미널 드롭 히트테스트용)
    overTermRef.current = null;
    rowRects.current.clear();
    for (const [r, v] of rowViews.current) {
      // measure 의 pageX/pageY = 터치 좌표와 같은 계(Android measureInWindow 는 상태바만큼 어긋남).
      v.ref.current?.measure((_x, _y, rw, rh, rx, ry) => { if (rw && rh) rowRects.current.set(r, { x: rx, y: ry, w: rw, h: rh, dir: v.dir }); });
    }
    panelRef.current?.measure((_x, _y, pw, ph, px, py) => {
      panelRect.current = { x: px, y: py, w: pw, h: ph };
      ghostPos.setValue({ x: x - px, y: y - py }); // 정지 롱프레스에서도 고스트가 제자리에 뜨게
    });
    dragRef.current = { rel, dir };
    setDrag(dragRef.current);
    setDropDir(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTreeDragMove = useCallback((x: number, y: number) => {
    const d = dragRef.current; const p = panelRect.current;
    if (!d || !p) return;
    ghostPos.setValue({ x: x - p.x, y: y - p.y });
    const dst = computeTreeDrop(d.rel, x, y);
    if (dst !== dropDirRef.current) setDropDir(dst);
    // 트리 밖(dst=null) + 파일 → 터미널 pane 위면 경로 삽입 대상으로(폴더는 이동 전용).
    if (dst == null && !d.dir) {
      const pid = paneRegistry.paneAt(x, y);
      overTermRef.current = pid && getTermInsert(pid) ? pid : null;
    } else {
      overTermRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTreeDragEnd = useCallback((x: number, y: number) => {
    const d = dragRef.current;
    dragRef.current = null; setDrag(null);
    const dst = dropDirRef.current; setDropDir(null);
    const termPid = overTermRef.current; overTermRef.current = null;
    if (!d || !isFinite(x) || !isFinite(y)) return;
    if (dst != null) { void moveNodeRef.current(d.rel, dst); return; } // 트리 내 폴더 위 드롭 = 파일 이동
    if (d.dir) return; // 폴더는 터미널 삽입 안 함(이동 전용)
    // 트리 밖 드롭 = 파일 경로를 터미널에 삽입(외부 파일 드롭과 동일 UX). 손가락 아래 터미널 pane(태블릿
    //  분할) 우선, 없으면(폰=한 pane 만 보임) 포커스/최근 터미널로 폴백해 어느 기기에서나 동작하게.
    const ch = (termPid ? getTermInsert(termPid) : null) || pickTermInsert();
    if (ch) ch.insert(shq(full(d.rel)) + ' ');
  }, [full]);

  const treeDragCb = { onStart: onTreeDragStart, onMove: onTreeDragMove, onEnd: onTreeDragEnd };

  // ── 파일 탭 드래그(에디터 그룹 분할/이동/순서변경) — PC _beginTabDrag/_applyTabDrop 미러 ──
  const egGroupViews = useRef(new Map<string, React.RefObject<View | null>>());
  const egGroupRects = useRef(new Map<string, { x: number; y: number; w: number; h: number }>());
  const egTabViews = useRef(new Map<string, React.RefObject<View | null>>()); // `${gid}#${i}`
  const egTabRects = useRef(new Map<string, { x: number; y: number; w: number; h: number }>());
  const areaRef = useRef<View>(null);
  const areaOrigin = useRef({ x: 0, y: 0 });
  const [fdrag, setFdrag] = useState<FDragMeta | null>(null);
  const [fdrop, setFdrop] = useState<FDrop | null>(null);
  const fdragRef = useRef(fdrag);
  const fdropRef = useRef(fdrop); fdropRef.current = fdrop;
  const fGhostPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const computeFileDrop = (x: number, y: number): FDrop | null => {
    let gid: string | null = null;
    let rect: { x: number; y: number; w: number; h: number } | null = null;
    for (const [g, r] of egGroupRects.current) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { gid = g; rect = r; break; }
    }
    if (!gid || !rect) return null;
    if (y <= rect.y + TABBAR_H) {
      // 탭바 — 삽입 인덱스/인서트 라인(탭 midX 기준).
      const g = egFind(egRootRef.current, gid);
      const n = g ? g.open.length : 0;
      let index = n;
      let lineX = rect.x + 6;
      let lastRight = rect.x + 4;
      for (let i = 0; i < n; i++) {
        const tr = egTabRects.current.get(`${gid}#${i}`);
        if (!tr) continue;
        lastRight = tr.x + tr.w;
        if (x < tr.x + tr.w / 2) { index = i; lineX = tr.x; break; }
      }
      if (index === n) lineX = lastRight;
      return { gid, mode: 'tabbar', index, lineX };
    }
    const bx = rect.y + TABBAR_H;
    const fx = (x - rect.x) / Math.max(1, rect.w);
    const fy = (y - bx) / Math.max(1, rect.h - TABBAR_H);
    const cands: Array<[number, FDropMode]> = [[fx, 'split-left'], [1 - fx, 'split-right'], [fy, 'split-top'], [1 - fy, 'split-bottom']];
    cands.sort((a, b) => a[0] - b[0]);
    const mode: FDropMode = cands[0][0] < 0.25 ? cands[0][1] : 'center';
    return { gid, mode };
  };

  const applyFileDrop = useCallback((meta: FDragMeta, drop: FDrop) => {
    const root0 = egRootRef.current;
    const src = egFind(root0, meta.gid);
    if (!src) return;
    const rel = src.open[meta.index];
    if (rel == null) return;

    // 같은 그룹 탭바 = 순서 재배치(활성 파일 유지).
    if (drop.mode === 'tabbar' && drop.gid === meta.gid) {
      let to = drop.index ?? src.open.length;
      to = to > meta.index ? to - 1 : to;
      to = clampN(to, 0, src.open.length - 1);
      if (to === meta.index) return;
      const activeRel = src.open[src.active];
      const open = [...src.open];
      const [m] = open.splice(meta.index, 1);
      open.splice(to, 0, m);
      setEgRoot(egMapGroup(root0, src.id, (g) => ({ ...g, open, active: Math.max(0, open.indexOf(activeRel)) })));
      return;
    }
    if (drop.mode === 'center' && drop.gid === meta.gid) return;

    // 다른 그룹 탭바/가운데 = 그 그룹으로 이동(이미 있으면 활성화로 대체 — 공유 버퍼라 내용 동일).
    if (drop.mode === 'tabbar' || drop.mode === 'center') {
      const dst = egFind(root0, drop.gid);
      if (!dst) return;
      const existIdx = dst.open.indexOf(rel);
      let tree: EgNode;
      if (existIdx >= 0) {
        tree = egMapGroup(root0, dst.id, (g) => ({ ...g, active: existIdx }));
      } else {
        const at = drop.mode === 'tabbar' ? clampN(drop.index ?? dst.open.length, 0, dst.open.length) : dst.open.length;
        tree = egMapGroup(root0, dst.id, (g) => {
          const open = [...g.open];
          open.splice(at, 0, rel);
          return { ...g, open, active: at };
        });
      }
      setEgRoot(egRemoveAt(tree, meta.gid, meta.index));
      setActiveGid(drop.gid);
      return;
    }

    // 가장자리 = 그 방향으로 분할해 새 그룹 생성(PC split-*). 자기 그룹 단일 파일 분할은 무의미.
    if (drop.gid === meta.gid && src.open.length <= 1) return;
    const dir: 'h' | 'v' = drop.mode === 'split-left' || drop.mode === 'split-right' ? 'h' : 'v';
    const before = drop.mode === 'split-left' || drop.mode === 'split-top';
    const newG: EgGroup = { id: newGid(), open: [rel], active: 0 };
    const tree = egSplit(root0, drop.gid, dir, newG, before);
    setEgRoot(egRemoveAt(tree, meta.gid, meta.index));
    setActiveGid(newG.id);
  }, []);

  const onFileDragStart = useCallback((gid: string, index: number, x: number, y: number) => {
    const g = egFind(egRootRef.current, gid);
    const rel = g?.open[index];
    if (rel == null) return;
    egGroupRects.current.clear();
    for (const [id, ref] of egGroupViews.current) {
      ref.current?.measure((_x, _y, rw, rh, rx, ry) => { if (rw && rh) egGroupRects.current.set(id, { x: rx, y: ry, w: rw, h: rh }); });
    }
    egTabRects.current.clear();
    for (const [key, ref] of egTabViews.current) {
      ref.current?.measure((_x, _y, rw, rh, rx, ry) => { if (rw && rh) egTabRects.current.set(key, { x: rx, y: ry, w: rw, h: rh }); });
    }
    areaRef.current?.measure((_x, _y, _w, _h, ax, ay) => {
      areaOrigin.current = { x: ax, y: ay };
      fGhostPos.setValue({ x: x - ax, y: y - ay });
    });
    fdragRef.current = { gid, index, rel };
    setFdrag(fdragRef.current);
    setFdrop(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFileDragMove = useCallback((x: number, y: number) => {
    if (!fdragRef.current) return;
    fGhostPos.setValue({ x: x - areaOrigin.current.x, y: y - areaOrigin.current.y });
    const d = computeFileDrop(x, y);
    const cur = fdropRef.current;
    if (!d && !cur) return;
    if (d && cur && d.gid === cur.gid && d.mode === cur.mode && d.index === cur.index && d.lineX === cur.lineX) return;
    setFdrop(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFileDragEnd = useCallback((x: number, y: number) => {
    const meta = fdragRef.current;
    fdragRef.current = null; setFdrag(null);
    const drop = fdropRef.current; setFdrop(null);
    if (!meta || !drop || !isFinite(x) || !isFinite(y)) return;
    applyFileDrop(meta, drop);
  }, [applyFileDrop]);

  const fileDragCb = { onStart: onFileDragStart, onMove: onFileDragMove, onEnd: onFileDragEnd };

  // ── 트리 렌더(재귀) — PC _renderNodes 미러 ──
  const groupCount = egCount(egRoot);
  const activeGroup = egFind(egRoot, activeGid) || egFirst(egRoot);
  const activeRel = activeGroup ? activeGroup.open[activeGroup.active] ?? null : null;
  const openRels = useMemo(() => {
    const s = new Set<string>();
    egEach(egRoot, (g) => g.open.forEach((r) => s.add(r)));
    return s;
  }, [egRoot]);

  const renderNodes = (nodes: TNode[], depth: number): React.ReactNode => nodes.map((n) => {
    const isOpen = expanded.has(n.rel);
    return (
      <React.Fragment key={n.rel}>
        <TreeRow
          n={n} depth={depth} isOpen={isOpen}
          isActive={!n.dir && activeRel === n.rel}
          isOpened={!n.dir && openRels.has(n.rel)}
          dropTarget={!!drag && dropDir === n.rel}
          draggingSelf={drag?.rel === n.rel}
          rows={rowViews.current}
          dragCb={treeDragCb}
          onRowPress={() => {
            if (n.dir) setExpanded((s) => { const ns = new Set(s); if (ns.has(n.rel)) ns.delete(n.rel); else ns.add(n.rel); return ns; });
            else openFile(n.rel);
          }}
          onMenu={() => setMenuNode({ rel: n.rel, dir: n.dir })}
        />
        {n.dir && isOpen ? renderNodes(n.children, depth + 1) : null}
      </React.Fragment>
    );
  });

  // ── 검색 결과 렌더 — PC ide-search-results 미러(파일 그룹 + 라인) ──
  const renderSearch = () => {
    if (hits === null) return null;
    if (!hits.length) return <Text style={{ color: C.textDim, fontSize: 12.5, padding: 14 }}>일치하는 결과가 없어요</Text>;
    const byFile = new Map<string, DaemonGrepMatch[]>();
    for (const h of hits) { if (!byFile.has(h.path)) byFile.set(h.path, []); byFile.get(h.path)!.push(h); }
    const out: React.ReactNode[] = [];
    for (const [rel, list] of byFile) {
      const dir = parentOf(rel);
      out.push(
        <Pressable key={'f:' + rel} onPress={() => openFile(rel)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 25, paddingHorizontal: 10 }}>
          <FileTypeIcon name={baseName(rel)} size={14} />
          <Text style={{ color: C.text2, fontSize: 12.5 }} numberOfLines={1}>{baseName(rel)}</Text>
          {dir ? <Text style={{ color: C.textDim, fontSize: 10.5, fontFamily: v2.font.mono, flexShrink: 1 }} numberOfLines={1}>{dir}</Text> : null}
          <View style={{ marginLeft: 'auto', backgroundColor: C.elevated2, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
            <Text style={{ color: C.textDim, fontSize: 10, fontWeight: '700' }}>{list.length}</Text>
          </View>
        </Pressable>,
      );
      for (const h of list) {
        out.push(
          <Pressable key={`l:${rel}:${h.line}:${h.col}`} onPress={() => openFile(rel, h.line)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22, paddingLeft: 28, paddingRight: 8, paddingVertical: 2 }}>
            <Text style={{ color: C.textDim, fontSize: 11.5, fontFamily: v2.font.mono, minWidth: 26, textAlign: 'right' }}>{h.line}</Text>
            <Text style={{ color: C.text3, fontSize: 11.5, fontFamily: v2.font.mono, flex: 1 }} numberOfLines={1}>{h.text}</Text>
          </Pressable>,
        );
      }
    }
    return out;
  };

  const Mini = ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
    <Pressable onPress={onPress} hitSlop={5} style={{ padding: 3, borderRadius: 4 }}>{children}</Pressable>
  );

  // 파일 드래그 오버레이(존 하이라이트/인서트 라인) 좌표 — 그룹 rect(window) → 에디터 영역 로컬.
  let fHl: { left: number; top: number; width: number; height: number } | null = null;
  let fIns: { left: number; top: number } | null = null;
  if (fdrag && fdrop) {
    const r = egGroupRects.current.get(fdrop.gid);
    if (r) {
      const ao = areaOrigin.current;
      if (fdrop.mode === 'tabbar' && typeof fdrop.lineX === 'number') {
        fIns = { left: fdrop.lineX - ao.x - 1, top: r.y - ao.y + 4 };
      } else {
        let lx = r.x - ao.x, ly = r.y - ao.y, lw = r.w, lh = r.h;
        if (fdrop.mode === 'split-left') lw = r.w / 2;
        else if (fdrop.mode === 'split-right') { lx += r.w / 2; lw = r.w / 2; }
        else if (fdrop.mode === 'split-top') lh = r.h / 2;
        else if (fdrop.mode === 'split-bottom') { ly += r.h / 2; lh = r.h / 2; }
        fHl = { left: lx, top: ly, width: lw, height: lh };
      }
    }
  }

  const egCtx: EgCtx = {
    files, activeGid, groupCount,
    treeVisible, onToggleTree, paneActive,
    setActiveGid,
    onTabPress: (gid, i) => {
      setActiveGid(gid);
      setEgRoot((r) => egMapGroup(r, gid, (g) => (g.active === i ? g : { ...g, active: i })));
    },
    onTabClose: closeFile,
    onEditorChange, save, syncEditor,
    editorRefs: editorRefs.current,
    groupViews: egGroupViews.current,
    tabViews: egTabViews.current,
    dragCb: fileDragCb,
    draggingTab: fdrag,
    pendingJump: pendingJump.current,
    setRatioAt: (path, ratio) => setEgRoot((r) => egSetRatio(r, path, ratio)),
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.base }}>
      {/* ── 파일트리(PC .ide-tree 미러) ── */}
      {treeVisible ? (
        <View ref={panelRef} style={{ width: 210, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border }}>
          {/* 트리 헤더: 타이틀 + [새 파일][새 폴더][새로고침] — 드래그 중 루트 드롭 대상이면 하이라이트 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 6, paddingVertical: 7, backgroundColor: drag && dropDir === '' ? C.accentTint : 'transparent' }}>
            <Text numberOfLines={1} style={{ flex: 1, color: C.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {baseName(root) || 'workspace'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
              <Mini onPress={() => { setPrompt({ mode: 'newFile', base: '' }); setPromptInput(''); }}><Plus size={14} color={C.textDim} /></Mini>
              <Mini onPress={() => { setPrompt({ mode: 'newDir', base: '' }); setPromptInput(''); }}><FolderIcn size={14} color={C.textDim} /></Mini>
              <Mini onPress={() => void reload()}><ArrowClockwise size={14} color={C.textDim} /></Mini>
            </View>
          </View>
          {/* 전체 검색(파일 내용) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 8, marginBottom: 6, paddingHorizontal: 8, height: 26, backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.sm }}>
            <MagnifyingGlass size={13} color={C.textDim} />
            <KeyTextInput
              value={query}
              onChangeText={onQuery}
              placeholder="프로젝트 전체 검색 (파일 내용)"
              placeholderTextColor={C.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, color: C.text, fontSize: 12, padding: 0 }}
            />
            {query ? (
              <Pressable hitSlop={6} onPress={() => { setQuery(''); setHits(null); }}><X size={12} color={C.textDim} /></Pressable>
            ) : null}
          </View>
          <ScrollView scrollEnabled={!drag} contentContainerStyle={{ paddingBottom: 8 }}>
            {hits !== null ? renderSearch() : renderNodes(tree, 0)}
            {hits === null && !tree.length ? <Text style={{ color: C.textDim, fontSize: 12.5, padding: 14 }}>파일을 불러오는 중…</Text> : null}
          </ScrollView>
          {/* 드래그 고스트(이동 중인 파일/폴더 이름) — Animated 라 move 마다 리렌더 없음 */}
          {drag ? (
            <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, zIndex: 20, transform: ghostPos.getTranslateTransform() }}>
              <View style={{ marginLeft: 12, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.elevated2, borderRadius: 6, borderWidth: 1, borderColor: C.border }}>
                {drag.dir ? <FolderTypeIcon open={false} size={13} name={baseName(drag.rel)} /> : <FileTypeIcon name={baseName(drag.rel)} size={13} />}
                <Text style={{ color: C.text, fontSize: 11.5, maxWidth: 150 }} numberOfLines={1}>{baseName(drag.rel)}</Text>
              </View>
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {/* ── 에디터 영역(PC .ide-main 미러): 에디터 그룹 분할 트리 ── */}
      <View ref={areaRef} style={{ flex: 1, minWidth: 0 }}>
        <EgSplitView node={egRoot} path={[]} ctx={egCtx} />
        {/* 파일 탭 드래그 오버레이(존 하이라이트 + 인서트 라인 + 고스트) — 상위 pane 드래그 미러 */}
        {fdrag ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 30 }}>
            {fHl ? (
              <View style={{ position: 'absolute', left: fHl.left, top: fHl.top, width: fHl.width, height: fHl.height, backgroundColor: C.accentTint, borderWidth: 2, borderColor: C.accent, borderRadius: 4 }} />
            ) : null}
            {fIns ? (
              <View style={{ position: 'absolute', left: fIns.left, top: fIns.top, width: 2, height: TABBAR_H - 8, backgroundColor: C.accent, borderRadius: 2 }} />
            ) : null}
            <Animated.View style={{ position: 'absolute', left: 0, top: 0, transform: fGhostPos.getTranslateTransform() }}>
              <View style={{ marginLeft: 12, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: C.elevated2, borderRadius: 6, borderWidth: 1, borderColor: C.border }}>
                <FileTypeIcon name={baseName(fdrag.rel)} size={13} />
                <Text style={{ color: C.text, fontSize: 11.5, maxWidth: 170 }} numberOfLines={1}>{baseName(fdrag.rel)}</Text>
              </View>
            </Animated.View>
          </View>
        ) : null}
        {toast ? (
          <View style={{ position: 'absolute', bottom: 12, alignSelf: 'center', backgroundColor: C.error, borderRadius: v2.radius.md, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: '#fff', fontSize: 12 }}>{toast}</Text>
          </View>
        ) : null}
      </View>

      {/* ── 컨텍스트 메뉴(행 우측 ... 버튼) — 파일=이름 변경/삭제, 폴더=+새 파일/새 폴더 ── */}
      <Modal visible={!!menuNode} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={() => setMenuNode(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setMenuNode(null)}>
          <Pressable style={{ width: 250, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11, paddingHorizontal: 14, paddingVertical: 6, fontFamily: v2.font.mono }}>{menuNode?.rel}</Text>
            {menuNode?.dir ? (
              <>
                <MenuItem icon={<FilePlus size={16} color={C.text2} />} label="새 파일" onPress={() => { const b = menuNode!; setMenuNode(null); setPrompt({ mode: 'newFile', base: b.rel }); setPromptInput(''); }} />
                <MenuItem icon={<FolderIcn size={16} color={C.text2} />} label="새 폴더" onPress={() => { const b = menuNode!; setMenuNode(null); setPrompt({ mode: 'newDir', base: b.rel }); setPromptInput(''); }} />
              </>
            ) : null}
            <MenuItem icon={<PencilSimple size={16} color={C.text2} />} label="이름 변경" onPress={() => { const b = menuNode!; setMenuNode(null); setPrompt({ mode: 'rename', base: b.rel }); setPromptInput(baseName(b.rel)); }} />
            <MenuItem icon={<Trash size={16} color={C.error} />} label="삭제" danger onPress={() => menuNode && void doDelete(menuNode.rel)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 이름 입력(새 파일/새 폴더/이름 변경) ── */}
      <Modal visible={!!prompt} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={() => setPrompt(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setPrompt(null)}>
          <Pressable style={{ width: 290, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>
              {prompt?.mode === 'rename' ? '이름 변경' : prompt?.mode === 'newDir' ? '새 폴더' : '새 파일'}
            </Text>
            <KeyTextInput
              value={promptInput}
              onChangeText={setPromptInput}
              onSubmitEditing={submitPrompt}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={prompt?.mode === 'rename' ? '새 이름' : prompt?.mode === 'newDir' ? '폴더 이름' : '파일 이름 (예: index.js)'}
              placeholderTextColor={C.textDim}
              style={{ color: C.text, fontSize: 13, fontFamily: v2.font.mono, backgroundColor: C.elevated2, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <Pressable onPress={() => setPrompt(null)} style={{ paddingHorizontal: 14, paddingVertical: 8 }}><Text style={{ color: C.textDim, fontSize: 13 }}>취소</Text></Pressable>
              <Pressable onPress={submitPrompt} style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.cta, borderRadius: 6 }}><Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>확인</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
        {/* 네이티브 Modal 은 별도 윈도 — 전역 액세서리 오버레이를 이 안에도 마운트해야 위에 뜬다 */}
        <KeyAssistOverlay />
      </Modal>
    </View>
  );
}

// ── 에디터 그룹 렌더(재귀 분할 + 그룹 뷰) — WorkspaceView SplitBranch 미러 ──
interface EgCtx {
  files: Record<string, FileBuf>;
  activeGid: string;
  groupCount: number;
  treeVisible: boolean;
  onToggleTree?: () => void;
  paneActive: boolean;
  setActiveGid: (gid: string) => void;
  onTabPress: (gid: string, i: number) => void;
  onTabClose: (gid: string, i: number) => void;
  onEditorChange: (gid: string, rel: string, v: string) => void;
  save: (gid?: string) => void;
  // 활성 파일 전환 시 숨김 에디터에 최신 버퍼 주입(스테일 방지).
  syncEditor: (gid: string, rel: string) => void;
  // 에디터 핸들 — `${gid}::${rel}` 키(파일별 에디터 유지).
  editorRefs: Map<string, CodeEditorHandle>;
  groupViews: Map<string, React.RefObject<View | null>>;
  tabViews: Map<string, React.RefObject<View | null>>;
  dragCb: { onStart: (gid: string, index: number, x: number, y: number) => void; onMove: (x: number, y: number) => void; onEnd: (x: number, y: number) => void };
  draggingTab: FDragMeta | null;
  pendingJump: Map<string, number>;
  setRatioAt: (path: Array<'first' | 'second'>, ratio: number) => void;
}

function EgSplitView({ node, path, ctx }: { node: EgNode; path: Array<'first' | 'second'>; ctx: EgCtx }) {
  // key=그룹 id — 트리 재구성 시 위치 기반 재사용으로 그룹 로컬 상태(mounted/찾기 바)가 엉뚱한
  //  그룹에 붙는 것을 방지.
  if (isEgGroup(node)) return <EgGroupView key={node.id} g={node} ctx={ctx} />;
  return <EgBranchView node={node} path={path} ctx={ctx} />;
}

function EgBranchView({ node, path, ctx }: { node: EgBranch; path: Array<'first' | 'second'>; ctx: EgCtx }) {
  const isRow = node.dir === 'h';
  const sizeRef = useRef(0);
  const startRatioRef = useRef(node.ratio);
  const [dragging, setDragging] = useState(false);
  const [liveRatio, setLiveRatio] = useState<number | null>(null);
  const ratio = liveRatio ?? node.ratio;

  const ratioRef = useRef(node.ratio); ratioRef.current = node.ratio;
  const pathRef = useRef(path); pathRef.current = path;
  const setRatioRef = useRef(ctx.setRatioAt); setRatioRef.current = ctx.setRatioAt;
  const isRowRef = useRef(isRow); isRowRef.current = isRow;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    sizeRef.current = isRow ? e.nativeEvent.layout.width : e.nativeEvent.layout.height;
  }, [isRow]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(isRowRef.current ? g.dx : g.dy) > 2,
      onPanResponderGrant: () => { startRatioRef.current = ratioRef.current; setDragging(true); },
      onPanResponderMove: (_e, g) => {
        const size = sizeRef.current || 1;
        const delta = (isRowRef.current ? g.dx : g.dy) / size;
        setLiveRatio(clampN(startRatioRef.current + delta, 0.1, 0.9));
      },
      onPanResponderRelease: (_e, g) => {
        const size = sizeRef.current || 1;
        const delta = (isRowRef.current ? g.dx : g.dy) / size;
        setRatioRef.current(pathRef.current, clampN(startRatioRef.current + delta, 0.1, 0.9));
        setLiveRatio(null);
        setDragging(false);
      },
      onPanResponderTerminate: () => { setLiveRatio(null); setDragging(false); },
    }),
  ).current;

  const HIT = 14;
  return (
    <View style={{ flex: 1, flexDirection: isRow ? 'row' : 'column' }} onLayout={onLayout}>
      <View style={{ flex: ratio }}>
        <EgSplitView node={node.first} path={[...path, 'first']} ctx={ctx} />
      </View>
      <View
        {...pan.panHandlers}
        style={{
          width: isRow ? HIT : undefined,
          height: isRow ? undefined : HIT,
          marginLeft: isRow ? -HIT / 2 : 0,
          marginTop: isRow ? 0 : -HIT / 2,
          alignItems: 'center', justifyContent: 'center', zIndex: 10,
        }}
      >
        <View style={{
          width: isRow ? (dragging ? 2 : 1) : '100%',
          height: isRow ? '100%' : (dragging ? 2 : 1),
          backgroundColor: dragging ? C.borderControl : C.border, // 잡았을 때 = 중립 테두리색으로 굵게만
        }} />
      </View>
      <View style={{ flex: 1 - ratio }}>
        <EgSplitView node={node.second} path={[...path, 'second']} ctx={ctx} />
      </View>
    </View>
  );
}

function EgGroupView({ g, ctx }: { g: EgGroup; ctx: EgCtx }) {
  const vRef = useRef<View>(null);
  useEffect(() => {
    ctx.groupViews.set(g.id, vRef);
    return () => { ctx.groupViews.delete(g.id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.id]);
  const rel = g.active >= 0 ? g.open[g.active] : null;
  // 활성화된 적 있는 파일의 에디터는 유지(absolute+opacity 토글) — 탭 전환마다 웹뷰를 재마운트하면
  //  깜빡임 + 스크롤/커서 초기화가 생긴다(터미널 혼합 탭과 동일 패턴). 닫힌 파일은 내린다.
  const mounted = useRef<Set<string>>(new Set());
  if (rel) mounted.current.add(rel);
  for (const r of [...mounted.current]) if (!g.open.includes(r)) mounted.current.delete(r);

  // 활성 파일 전환 시 숨겨져 있던 에디터에 최신 버퍼 주입 — 같은 파일을 다른 그룹에서 편집하는 동안
  //  숨김 에디터는 라이브 반영을 안 받아 스테일할 수 있다(setValue 는 동일 내용이면 no-op).
  useEffect(() => {
    if (rel) ctx.syncEditor(g.id, rel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel]);

  // ── 파일 내 찾기(⌘F/Ctrl+F → 찾기 바) — VS Code 미러(활성 파일 대상) ──
  const [find, setFind] = useState(false);
  const [findQ, setFindQ] = useState('');
  const [findInfo, setFindInfo] = useState({ idx: 0, total: 0 });
  const ed = () => (rel ? ctx.editorRefs.get(g.id + '::' + rel) : undefined);
  const openFind = () => { ctx.setActiveGid(g.id); setFindInfo({ idx: 0, total: 0 }); setFind(true); };
  const closeFind = () => { setFind(false); setFindQ(''); ed()?.clearSearch(); };
  const onFindQ = (q: string) => {
    setFindQ(q);
    if (q) ed()?.find(q);
    else { ed()?.clearSearch(); setFindInfo({ idx: 0, total: 0 }); }
  };

  // 활성 그룹 표시는 "포커스 그룹의 활성 파일탭 상단 라인"만 — 그룹 전체 테두리는 쓰지 않는다(사용자 확정).
  return (
    <View
      ref={vRef}
      style={{ flex: 1, minWidth: 0, minHeight: 0 }}
    >
      {/* 파일 탭바 — ScrollView 를 쓰지 않는다(스크롤 제스처가 롱프레스 드래그를 가로챔, PaneHeader 동일). */}
      <View style={{ flexDirection: 'row', alignItems: 'stretch', height: TABBAR_H, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, overflow: 'hidden' }}>
        {g.open.map((r, i) => (
          <FileTab
            key={`${g.id}:${r}`}
            gid={g.id} i={i} rel={r}
            active={i === g.active}
            groupFocused={ctx.activeGid === g.id}
            paneActive={ctx.paneActive}
            dirty={!!ctx.files[r]?.dirty}
            dimmed={ctx.draggingTab?.gid === g.id && ctx.draggingTab?.index === i}
            tabViews={ctx.tabViews}
            dragCb={ctx.dragCb}
            onPress={() => ctx.onTabPress(g.id, i)}
            onClose={() => ctx.onTabClose(g.id, i)}
          />
        ))}
        {/* 맨 우측 = 탐색기(파일 트리) 토글 — pane 헤더 대신 여기 둬서 IDE 가 혼합 탭으로 들어가도 보인다 */}
        {ctx.onToggleTree ? (
          <Pressable
            onPress={ctx.onToggleTree}
            hitSlop={4}
            style={{ marginLeft: 'auto', width: 36, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: C.border }}
          >
            {/* 색이 아니라 채움 유무로 열림/닫힘 표현(열림=fill, 닫힘=regular) */}
            <SidebarSimple size={15} color={C.textDim} weight={ctx.treeVisible ? 'fill' : 'regular'} />
          </Pressable>
        ) : null}
      </View>
      {/* 본문 — 활성화된 적 있는 파일 에디터를 전부 유지(absolute), opacity 로만 전환 */}
      <View style={{ flex: 1 }}>
        {g.open.map((r) => {
          if (!mounted.current.has(r)) return null;
          const isActive = r === rel;
          const buf = ctx.files[r];
          const key = `${g.id}::${r}`;
          return (
            <View
              key={key}
              pointerEvents={isActive ? 'auto' : 'none'}
              // 숨김에 opacity:0 을 쓰지 않는다 — iOS 는 투명해진 WKWebView 를 잠재워(터치 이벤트
              //  계층 suspend) 재표시 후 스크롤은 되는데 탭→커서 배치(JS 터치 이벤트)만 죽는다
              //  (파일 탭 A→B→A 재활성 무반응의 근원). 전부 불투명하게 겹쳐 두고 활성만 zIndex 로
              //  위에 — 웹뷰가 항상 "보이는 상태"라 잠들지 않고, 에디터 배경이 불투명해 아래는 안 비친다.
              style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: isActive ? 1 : 0, elevation: isActive ? 1 : 0 }}
            >
              {!buf ? (
                <Pressable onPress={() => ctx.setActiveGid(g.id)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.base }}>
                  <Text style={{ color: C.textDim, fontSize: 12.5 }}>불러오는 중…</Text>
                </Pressable>
              ) : (
                <CodeEditorWebView
                  ref={(h) => { if (h) ctx.editorRefs.set(key, h); else ctx.editorRefs.delete(key); }}
                  value={buf.content}
                  language={isDiffDoc(r) ? 'diff' : langFor(r)}
                  // diff 가상 문서 = 읽기 전용(nocursor) — 저장/자동저장 경로에 진입 자체가 없다.
                  readOnly={isDiffDoc(r)}
                  theme={v2Scheme === 'light' ? 'default' : 'material-darker'}
                  fontSize={12.5}
                  onChange={(v) => ctx.onEditorChange(g.id, r, v)}
                  onReady={() => {
                    const line = ctx.pendingJump.get(g.id);
                    if (line) { ctx.pendingJump.delete(g.id); setTimeout(() => ctx.editorRefs.get(key)?.gotoLine(line), 60); }
                  }}
                  onShortcut={(a) => {
                    if (a === 'save') { ctx.setActiveGid(g.id); ctx.save(g.id); }
                    else if (a === 'find') openFind();
                  }}
                  onFindCount={(info) => setFindInfo(info)}
                  onFocusChange={(f) => {
                    if (f) { ctx.setActiveGid(g.id); setKeyTarget(makeEditorTarget(key, ctx.editorRefs)); }
                    else blurKeyTarget('ed:' + key);
                  }}
                  // 커서 컨텍스트(스코프) → 전역 보조바의 컨텍스트 키셋
                  onContextChange={(c) => setKeyTargetCtx('ed:' + key, c)}
                  // 모디파이어 조합키 실행됨 → once 해제
                  onVmodConsume={consumeKeyMods}
                  // 이미 포커스된 에디터는 focus 이벤트가 다시 안 뜨므로(웹뷰별 독립 포커스),
                  //  내부 터치 자체로 활성 그룹을 옮긴다 — 포커스 테두리가 안 따라오던 원인.
                  onInteract={() => ctx.setActiveGid(g.id)}
                />
              )}
            </View>
          );
        })}
        {!rel ? (
          <Pressable onPress={() => ctx.setActiveGid(g.id)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.base }}>
            <Text style={{ color: C.textDim, fontSize: 12.5 }}>왼쪽에서 파일을 선택하세요</Text>
          </Pressable>
        ) : null}
        {/* 찾기 바 — 우상단 오버레이(VS Code 위치). Enter=다음, 캐럿=이전/다음, X=닫기 */}
        {find ? (
          <View style={{ position: 'absolute', top: 6, right: 10, zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.md }}>
            <MagnifyingGlass size={13} color={C.textDim} />
            <KeyTextInput
              value={findQ}
              onChangeText={onFindQ}
              onSubmitEditing={() => ed()?.findNext()}
              blurOnSubmit={false}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="찾기"
              placeholderTextColor={C.textDim}
              style={{ width: 150, color: C.text, fontSize: 12.5, padding: 0 }}
            />
            <Text style={{ color: C.textDim, fontSize: 11, minWidth: 34, textAlign: 'center' }}>{findInfo.total ? `${findInfo.idx}/${findInfo.total}` : '0/0'}</Text>
            <Pressable hitSlop={6} onPress={() => ed()?.findPrev()}><CaretUp size={14} color={C.text2} /></Pressable>
            <Pressable hitSlop={6} onPress={() => ed()?.findNext()}><CaretDown size={14} color={C.text2} /></Pressable>
            <Pressable hitSlop={6} onPress={closeFind}><X size={13} color={C.textDim} /></Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// 파일 탭 — 탭=전환, x=닫기, 롱프레스+드래그=그룹 간 이동/분할/순서변경(PC ide-tab pointerdown 드래그 미러).
function FileTab({ gid, i, rel, active, groupFocused, paneActive, dirty, dimmed, tabViews, dragCb, onPress, onClose }: {
  gid: string; i: number; rel: string; active: boolean; groupFocused: boolean; paneActive: boolean; dirty: boolean; dimmed: boolean;
  tabViews: Map<string, React.RefObject<View | null>>;
  dragCb: { onStart: (gid: string, index: number, x: number, y: number) => void; onMove: (x: number, y: number) => void; onEnd: (x: number, y: number) => void };
  onPress: () => void; onClose: () => void;
}) {
  const vRef = useRef<View>(null);
  useEffect(() => {
    const key = `${gid}#${i}`;
    tabViews.set(key, vRef);
    return () => { tabViews.delete(key); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gid, i]);
  const gidRef = useRef(gid); gidRef.current = gid;
  const iRef = useRef(i); iRef.current = i;
  const drag = useLongPressDrag({
    onStart: (x, y) => dragCb.onStart(gidRef.current, iRef.current, x, y),
    onMove: dragCb.onMove,
    onEnd: dragCb.onEnd,
  });
  return (
    <View ref={vRef} {...drag.panHandlers} onTouchEnd={drag.onTouchEnd} style={{ flexShrink: 1, minWidth: 44, opacity: dimmed ? 0.4 : 1 }}>
      <Pressable
        onPress={onPress}
        style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11,
          backgroundColor: active ? C.base : 'transparent',
          borderRightWidth: 1, borderRightColor: C.border,
        }}
      >
        {/* 파일 탭 활성 표시는 상단선(top border) 대신 텍스트 색으로 — 활성 파일은 밝게, 나머지는 dim.
            단 이 IDE 가 포커스된 표면이 아니면(다른 터미널 활성 등) 활성 파일도 dim 으로 "풀린다". */}
        {/* diff 가상 문서는 원본 파일의 타입 아이콘 + `diff: <파일명>` 라벨(계약 §3). */}
        <FileTypeIcon name={baseName(isDiffDoc(rel) ? diffPathOf(rel) : rel)} size={13} />
        <Text style={{ color: active ? (paneActive && groupFocused ? C.text : C.text3) : C.text3, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{tabLabelOf(rel)}</Text>
        {dirty ? <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: C.accent }} /> : null}
        <Pressable hitSlop={6} onPress={onClose}><X size={11} color={C.textDim} /></Pressable>
      </Pressable>
    </View>
  );
}

// 트리 행 — 탭=열기/토글, 우측 ...=메뉴, 롱프레스(300ms)+드래그=이동(폴더/루트로 드롭).
interface TreeDragCb { onStart: (rel: string, dir: boolean, x: number, y: number) => void; onMove: (x: number, y: number) => void; onEnd: (x: number, y: number) => void }
function TreeRow({ n, depth, isOpen, isActive, isOpened, dropTarget, draggingSelf, rows, dragCb, onRowPress, onMenu }: {
  n: TNode; depth: number; isOpen: boolean; isActive: boolean; isOpened: boolean;
  dropTarget: boolean; draggingSelf: boolean;
  rows: Map<string, { ref: React.RefObject<View | null>; dir: boolean }>;
  dragCb: TreeDragCb;
  onRowPress: () => void; onMenu: () => void;
}) {
  const vRef = useRef<View>(null);
  useEffect(() => {
    rows.set(n.rel, { ref: vRef, dir: n.dir });
    return () => { rows.delete(n.rel); };
  }, [n.rel, n.dir, rows]);
  const relRef = useRef(n.rel); relRef.current = n.rel;
  const dirRef = useRef(n.dir); dirRef.current = n.dir;
  const drag = useLongPressDrag({
    onStart: (x, y) => dragCb.onStart(relRef.current, dirRef.current, x, y),
    onMove: dragCb.onMove,
    onEnd: dragCb.onEnd,
  });
  return (
    <View ref={vRef} {...drag.panHandlers} onTouchEnd={drag.onTouchEnd} style={{ opacity: draggingSelf ? 0.4 : 1 }}>
      <Pressable
        onPress={onRowPress}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 4, height: 26,
          paddingLeft: 6 + depth * 12, paddingRight: 4,
          backgroundColor: dropTarget || isActive ? C.accentTint : 'transparent',
          borderWidth: 1, borderColor: dropTarget ? C.accent : 'transparent', borderRadius: dropTarget ? 4 : 0,
        }}
      >
        <View style={{ width: 14, alignItems: 'center', transform: [{ rotate: n.dir && isOpen ? '90deg' : '0deg' }] }}>
          {n.dir ? <CaretRight size={11} color={C.textDim} /> : null}
        </View>
        {n.dir ? <FolderTypeIcon open={isOpen} size={16} name={n.name} /> : <FileTypeIcon name={n.name} size={15} />}
        <Text numberOfLines={1} style={{ flex: 1, color: isActive ? C.text : isOpened ? C.text2 : C.text3, fontSize: 12.5 }}>{n.name}</Text>
        <Pressable hitSlop={6} onPress={onMenu} style={{ paddingHorizontal: 3, paddingVertical: 2 }}>
          <DotsThree size={16} color={C.textDim} weight="bold" />
        </Pressable>
      </Pressable>
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
      {icon}
      <Text style={{ color: danger ? C.error : C.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
