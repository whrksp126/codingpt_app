// IdeBody — PC codingpt_pc/src/js/ide.js 미러(모바일 적응).
//  파일트리(폴더 계층·Material 아이콘·컨텍스트 메뉴) + 트리 헤더(새 파일/새 폴더/새로고침)
//  + 프로젝트 전체 검색(파일 내용, fsGrep) + 파일 탭(dirty 도트) + CodeMirror material-darker.
//  PC 와 다른 점(모바일 적응): 에디터 그룹 분할 없음(단일 그룹), 저장은 하드웨어 키보드 ⌘S/Ctrl+S
//  (fsWrite — PC 파일에 즉시 반영), 컨텍스트 메뉴는 행 우측 ... 버튼 → 모달,
//  트리 행 롱프레스+드래그 = 파일/폴더 이동(fsRename — 폴더 행/빈 영역=루트로 드롭).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, Animated, PanResponder } from 'react-native';
import { CaretRight, Plus, Folder as FolderIcn, ArrowClockwise, MagnifyingGlass, X, DotsThree, PencilSimple, Trash, FilePlus } from 'phosphor-react-native';
import { haptic } from '../animations/haptics';
import { v2 } from '../theme/v2Tokens';
import daemonService, { DaemonGrepMatch } from '../services/daemonService';
import CodeEditorWebView, { CodeEditorHandle } from '../components/module/ide/CodeEditorWebView';
import { FileTypeIcon, FolderTypeIcon } from './fileIcons';

const C = v2.colors;

const baseName = (p: string) => p.split('/').pop() || p;
const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');

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

interface OpenFile { rel: string; content: string; dirty: boolean }

export default function IdeBody({
  root, treeVisible, initialOpenPath, onOpenPathChange,
}: {
  root: string;                 // 워크스페이스 절대경로
  treeVisible: boolean;
  initialOpenPath?: string | null;
  onOpenPathChange?: (rel: string | null) => void;
}) {
  const full = useCallback((rel: string) => (root ? `${root}/${rel}` : rel), [root]);
  const [items, setItems] = useState<{ path: string; text: boolean }[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<OpenFile[]>([]);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<DaemonGrepMatch[] | null>(null); // null = 검색 모드 아님
  const [menuNode, setMenuNode] = useState<{ rel: string; dir: boolean } | null>(null);
  const [prompt, setPrompt] = useState<{ mode: 'newFile' | 'newDir' | 'rename'; base: string } | null>(null);
  const [promptInput, setPromptInput] = useState('');
  const [toast, setToast] = useState('');
  const editorRef = useRef<CodeEditorHandle>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchToken = useRef(0);
  const pendingLine = useRef(0);

  const tree = useMemo(() => buildTree(items), [items]);
  const activeFile = active >= 0 ? tabs[active] : null;

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); }, []);

  const reload = useCallback(async () => {
    try {
      const t = await daemonService.fsTree(root);
      setItems(t.items || []);
    } catch (e) { showToast(String(e)); }
  }, [root, showToast]);
  useEffect(() => { void reload(); }, [reload]);

  const openFile = useCallback(async (rel: string, line?: number) => {
    setTabs((cur) => {
      const idx = cur.findIndex((f) => f.rel === rel);
      if (idx >= 0) { setActive(idx); return cur; }
      return cur; // 미열림 — 아래 비동기 read 후 push
    });
    const existing = tabs.findIndex((f) => f.rel === rel);
    if (existing >= 0) {
      setActive(existing);
      if (line) setTimeout(() => editorRef.current?.gotoLine(line), 120);
      onOpenPathChange?.(rel);
      return;
    }
    try {
      const r = await daemonService.fsRead(full(rel));
      const content = typeof r.content === 'string' ? r.content : '';
      pendingLine.current = line || 0;
      setTabs((cur) => {
        const idx = cur.findIndex((f) => f.rel === rel);
        if (idx >= 0) { setActive(idx); return cur; }
        setActive(cur.length);
        return [...cur, { rel, content, dirty: false }];
      });
      onOpenPathChange?.(rel);
    } catch (e) { showToast(String(e)); }
  }, [tabs, full, onOpenPathChange, showToast]);

  // 에디터 마운트 후 검색 결과 라인 점프.
  const onEditorReady = useCallback(() => {
    if (pendingLine.current > 0) {
      const l = pendingLine.current; pendingLine.current = 0;
      setTimeout(() => editorRef.current?.gotoLine(l), 60);
    }
  }, []);

  // 저장된 openPath 복원(최초 1회).
  useEffect(() => { if (initialOpenPath) void openFile(initialOpenPath); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const closeTab = useCallback((i: number) => {
    setTabs((cur) => {
      const next = cur.filter((_, k) => k !== i);
      setActive((a) => {
        const na = a > i ? a - 1 : a >= next.length ? next.length - 1 : a;
        onOpenPathChange?.(na >= 0 && next[na] ? next[na].rel : null);
        return na;
      });
      return next;
    });
  }, [onOpenPathChange]);

  const save = useCallback(async () => {
    const f = active >= 0 ? tabs[active] : null;
    if (!f || !f.dirty) return;
    try {
      await daemonService.fsWrite(full(f.rel), f.content);
      setTabs((cur) => cur.map((t, k) => (k === active ? { ...t, dirty: false } : t)));
    } catch (e) { showToast(String(e)); }
  }, [active, tabs, full, showToast]);

  const onChange = useCallback((v: string) => {
    setTabs((cur) => cur.map((t, k) => (k === active ? { ...t, content: v, dirty: true } : t)));
  }, [active]);

  // ── 검색(프로젝트 전체, 파일 내용) — PC _renderSearch 미러 ──
  const onQuery = useCallback((q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setHits(null); return; }
    searchTimer.current = setTimeout(async () => {
      const token = ++searchToken.current;
      const r = await daemonService.fsGrep(root, q);
      if (token === searchToken.current) setHits(r.matches || []);
    }, 220);
  }, [root]);

  // ── 파일 조작(컨텍스트 메뉴/트리 헤더) ──
  const submitPrompt = useCallback(async () => {
    if (!prompt) return;
    const name = promptInput.trim();
    const p = prompt; setPrompt(null); setPromptInput('');
    if (!name) return;
    try {
      if (p.mode === 'newFile' || p.mode === 'newDir') {
        const rel = p.base ? `${p.base}/${name}` : name;
        if (p.mode === 'newDir') await daemonService.fsMkdir(full(rel));
        else await daemonService.fsCreateFile(full(rel));
        if (p.base) setExpanded((s) => new Set(s).add(p.base));
        await reload();
        if (p.mode === 'newFile') void openFile(rel);
      } else {
        const dir = parentOf(p.base);
        const rel = dir ? `${dir}/${name}` : name;
        await daemonService.fsRename(full(p.base), full(rel));
        setTabs((cur) => cur.map((t) => (t.rel === p.base ? { ...t, rel } : t)));
        if (activeFile?.rel === p.base) onOpenPathChange?.(rel);
        await reload();
      }
    } catch (e) { showToast(String(e)); }
  }, [prompt, promptInput, full, reload, openFile, activeFile, onOpenPathChange, showToast]);

  const doDelete = useCallback(async (rel: string) => {
    setMenuNode(null);
    try {
      await daemonService.fsDelete(full(rel));
      setTabs((cur) => {
        const next = cur.filter((t) => t.rel !== rel && !t.rel.startsWith(rel + '/'));
        setActive((a) => Math.min(a, next.length - 1));
        return next;
      });
      await reload();
    } catch (e) { showToast(String(e)); }
  }, [full, reload, showToast]);

  // ── 트리 드래그(파일/폴더 이동) — 롱프레스 픽업 → 폴더 행(또는 빈 영역=루트)에 드롭 = fsRename ──
  //  행 rect 는 드래그 시작 시 일괄 측정(스크롤로 절대좌표가 변하므로 상시 측정은 스테일).
  //  고스트는 Animated 로만 이동(매 move 마다 트리 전체 리렌더 방지), 대상 폴더 변화 시에만 setState.
  const rowViews = useRef(new Map<string, { ref: React.RefObject<View | null>; dir: boolean }>());
  const rowRects = useRef(new Map<string, { x: number; y: number; w: number; h: number; dir: boolean }>());
  const panelRef = useRef<View>(null);
  const panelRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ rel: string; dir: boolean } | null>(null);
  const [dropDir, setDropDir] = useState<string | null>(null); // '' = 루트, null = 드롭 불가 위치
  const dragRef = useRef(drag);
  const dropDirRef = useRef(dropDir); dropDirRef.current = dropDir;
  const ghostPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // 손가락 좌표 → 목적지 폴더. 폴더 행=그 폴더, 파일 행=그 파일의 부모, 빈 영역=루트.
  //  자기 자신/자기 하위/현재 위치(부모 동일)는 null(하이라이트 없음 = 이동 없음).
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
      await daemonService.fsRename(full(src), full(dstRel));
      // 열린 탭의 경로 추적(파일 자신 + 폴더 이동 시 하위 파일들).
      setTabs((cur) => cur.map((t) => (
        t.rel === src ? { ...t, rel: dstRel }
        : t.rel.startsWith(src + '/') ? { ...t, rel: dstRel + t.rel.slice(src.length) } : t
      )));
      if (activeFile?.rel === src) onOpenPathChange?.(dstRel);
      else if (activeFile && activeFile.rel.startsWith(src + '/')) onOpenPathChange?.(dstRel + activeFile.rel.slice(src.length));
      if (dstDir) setExpanded((s) => new Set(s).add(dstDir));
      await reload();
    } catch (e) { showToast(String(e)); }
  }, [items, full, activeFile, onOpenPathChange, reload, showToast]);
  const moveNodeRef = useRef(moveNode); moveNodeRef.current = moveNode;

  const onTreeDragStart = useCallback((rel: string, dir: boolean, x: number, y: number) => {
    rowRects.current.clear();
    for (const [r, v] of rowViews.current) {
      v.ref.current?.measureInWindow((rx, ry, rw, rh) => { if (rw && rh) rowRects.current.set(r, { x: rx, y: ry, w: rw, h: rh, dir: v.dir }); });
    }
    panelRef.current?.measureInWindow((px, py, pw, ph) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTreeDragEnd = useCallback((x: number, y: number) => {
    const d = dragRef.current;
    dragRef.current = null; setDrag(null);
    const dst = dropDirRef.current; setDropDir(null);
    if (!d || dst == null || !isFinite(x) || !isFinite(y)) return;
    void moveNodeRef.current(d.rel, dst);
  }, []);

  const treeDragCb = { onStart: onTreeDragStart, onMove: onTreeDragMove, onEnd: onTreeDragEnd };

  // ── 트리 렌더(재귀) — PC _renderNodes 미러 ──
  const openRels = useMemo(() => new Set(tabs.map((t) => t.rel)), [tabs]);
  const renderNodes = (nodes: TNode[], depth: number): React.ReactNode => nodes.map((n) => {
    const isOpen = expanded.has(n.rel);
    return (
      <React.Fragment key={n.rel}>
        <TreeRow
          n={n} depth={depth} isOpen={isOpen}
          isActive={!n.dir && activeFile?.rel === n.rel}
          isOpened={!n.dir && openRels.has(n.rel)}
          dropTarget={!!drag && dropDir === n.rel}
          draggingSelf={drag?.rel === n.rel}
          rows={rowViews.current}
          dragCb={treeDragCb}
          onRowPress={() => {
            if (n.dir) setExpanded((s) => { const ns = new Set(s); if (ns.has(n.rel)) ns.delete(n.rel); else ns.add(n.rel); return ns; });
            else void openFile(n.rel);
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
        <Pressable key={'f:' + rel} onPress={() => void openFile(rel)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 25, paddingHorizontal: 10 }}>
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
          <Pressable key={`l:${rel}:${h.line}:${h.col}`} onPress={() => void openFile(rel, h.line)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22, paddingLeft: 28, paddingRight: 8, paddingVertical: 2 }}>
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
            <TextInput
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

      {/* ── 에디터 영역(PC .ide-main 미러): 파일 탭바 + CodeMirror ── */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'stretch', height: 32, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'stretch' }} style={{ flex: 1 }}>
            {tabs.map((f, i) => (
              <Pressable
                key={f.rel}
                onPress={() => { setActive(i); onOpenPathChange?.(f.rel); }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11,
                  backgroundColor: i === active ? C.base : 'transparent',
                  borderRightWidth: 1, borderRightColor: C.border,
                  borderTopWidth: 2, borderTopColor: i === active ? C.accent : 'transparent',
                }}
              >
                <FileTypeIcon name={baseName(f.rel)} size={13} />
                <Text style={{ color: i === active ? C.text : C.text3, fontSize: 12 }}>{baseName(f.rel)}</Text>
                {f.dirty ? <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: C.accent }} /> : null}
                <Pressable hitSlop={6} onPress={() => closeTab(i)}><X size={11} color={C.textDim} /></Pressable>
              </Pressable>
            ))}
          </ScrollView>
          {/* 저장 버튼 없음 — PC 처럼 ⌘S/Ctrl+S(하드웨어 키보드, CodeEditorWebView onShortcut)가 저장 */}
        </View>
        {activeFile ? (
          <CodeEditorWebView
            key={activeFile.rel}
            ref={editorRef}
            value={activeFile.content}
            language={langFor(activeFile.rel)}
            theme="material-darker"
            fontSize={12.5}
            onChange={onChange}
            onReady={onEditorReady}
            onShortcut={(a) => { if (a === 'save') void save(); }}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.textDim, fontSize: 12.5 }}>왼쪽에서 파일을 선택하세요</Text>
          </View>
        )}
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
            <TextInput
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
      </Modal>
    </View>
  );
}

// 트리 행 — 탭=열기/토글, 우측 ...=메뉴, 롱프레스(300ms)+드래그=이동(폴더/루트로 드롭).
//  PanResponder 는 PaneView useDragHandle 과 같은 capture 패턴: 시작 시 안 잡고(스크롤/탭 정상),
//  롱프레스 성립 후 move(capture)에서 responder 탈취. 콜백/값은 ref 경유(stale 방지).
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
  const cbRef = useRef(dragCb); cbRef.current = dragCb;
  const relRef = useRef(n.rel); relRef.current = n.rel;
  const dirRef = useRef(n.dir); dirRef.current = n.dir;
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
          cbRef.current.onStart(relRef.current, dirRef.current, lastXY.current.x, lastXY.current.y);
        }, 300);
        return false; // 시작 시엔 안 잡음 — 탭(열기/토글)과 ... 버튼 정상 동작
      },
      onMoveShouldSetPanResponderCapture: (e) => {
        lastXY.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        if (armed.current) return true; // 롱프레스됨 → 제스처 탈취(드래그)
        const dx = lastXY.current.x - startXY.current.x;
        const dy = lastXY.current.y - startXY.current.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clear(); // 스크롤 의도 → 픽업 취소
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
  return (
    <View ref={vRef} {...pan.panHandlers} onTouchEnd={onTouchEnd} style={{ opacity: draggingSelf ? 0.4 : 1 }}>
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
