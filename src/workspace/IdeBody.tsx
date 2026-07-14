// IdeBody — PC codingpt_pc/src/js/ide.js 미러(모바일 적응).
//  파일트리(폴더 계층·Material 아이콘·컨텍스트 메뉴) + 트리 헤더(새 파일/새 폴더/새로고침)
//  + 프로젝트 전체 검색(파일 내용, fsGrep) + 파일 탭(dirty 도트) + CodeMirror material-darker.
//  PC 와 다른 점(모바일 적응): 에디터 그룹 분할 없음(단일 그룹), 저장은 탭바 우측 버튼(⌘S 없음),
//  컨텍스트 메뉴는 롱프레스 → 모달.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal } from 'react-native';
import { CaretRight, Plus, Folder as FolderIcn, ArrowClockwise, MagnifyingGlass, X, FloppyDisk, PencilSimple, Trash, FilePlus } from 'phosphor-react-native';
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

  // ── 트리 렌더(재귀) — PC _renderNodes 미러 ──
  const openRels = useMemo(() => new Set(tabs.map((t) => t.rel)), [tabs]);
  const renderNodes = (nodes: TNode[], depth: number): React.ReactNode => nodes.map((n) => {
    const isOpen = expanded.has(n.rel);
    const isActive = !n.dir && activeFile?.rel === n.rel;
    const isOpened = !n.dir && openRels.has(n.rel);
    return (
      <React.Fragment key={n.rel}>
        <Pressable
          onPress={() => {
            if (n.dir) setExpanded((s) => { const ns = new Set(s); if (ns.has(n.rel)) ns.delete(n.rel); else ns.add(n.rel); return ns; });
            else void openFile(n.rel);
          }}
          onLongPress={() => setMenuNode({ rel: n.rel, dir: n.dir })}
          delayLongPress={300}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4, height: 26,
            paddingLeft: 6 + depth * 12, paddingRight: 8,
            backgroundColor: isActive ? C.accentTint : 'transparent',
          }}
        >
          <View style={{ width: 14, alignItems: 'center', transform: [{ rotate: n.dir && isOpen ? '90deg' : '0deg' }] }}>
            {n.dir ? <CaretRight size={11} color={C.textDim} /> : null}
          </View>
          {n.dir ? <FolderTypeIcon open={isOpen} size={16} name={n.name} /> : <FileTypeIcon name={n.name} size={15} />}
          <Text numberOfLines={1} style={{ flex: 1, color: isActive ? C.text : isOpened ? C.text2 : C.text3, fontSize: 12.5 }}>{n.name}</Text>
        </Pressable>
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
        <View style={{ width: 210, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border }}>
          {/* 트리 헤더: 타이틀 + [새 파일][새 폴더][새로고침] */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 6, paddingVertical: 7 }}>
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
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            {hits !== null ? renderSearch() : renderNodes(tree, 0)}
            {hits === null && !tree.length ? <Text style={{ color: C.textDim, fontSize: 12.5, padding: 14 }}>파일을 불러오는 중…</Text> : null}
          </ScrollView>
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
          {/* 저장 — PC 는 ⌘S, 모바일은 버튼(dirty 일 때 강조) */}
          <Pressable onPress={save} hitSlop={4} style={{ width: 32, alignItems: 'center', justifyContent: 'center' }}>
            <FloppyDisk size={15} color={activeFile?.dirty ? C.accent : C.textDim} />
          </Pressable>
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

      {/* ── 컨텍스트 메뉴(롱프레스) — PC 우클릭 메뉴 미러 ── */}
      <Modal visible={!!menuNode} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={() => setMenuNode(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setMenuNode(null)}>
          <Pressable style={{ width: 250, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11, paddingHorizontal: 14, paddingVertical: 6, fontFamily: v2.font.mono }}>{menuNode?.rel}</Text>
            <MenuItem icon={<FilePlus size={16} color={C.text2} />} label="새 파일" onPress={() => { const b = menuNode!; setMenuNode(null); setPrompt({ mode: 'newFile', base: b.dir ? b.rel : parentOf(b.rel) }); setPromptInput(''); }} />
            <MenuItem icon={<FolderIcn size={16} color={C.text2} />} label="새 폴더" onPress={() => { const b = menuNode!; setMenuNode(null); setPrompt({ mode: 'newDir', base: b.dir ? b.rel : parentOf(b.rel) }); setPromptInput(''); }} />
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

function MenuItem({ icon, label, onPress, danger }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
      {icon}
      <Text style={{ color: danger ? C.error : C.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
