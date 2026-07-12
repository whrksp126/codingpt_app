import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, PanResponder, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  Terminal as TerminalIcon, Plus, X, Code, Globe,
  ColumnsPlusRight, RowsPlusBottom, DotsSixVertical,
  ArrowClockwise, TreeStructure, FloppyDisk, File as FileIcon, CaretRight, CaretDown,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import TerminalWebView, { TerminalHandle } from '../components/module/ide/TerminalWebView';
import CodeEditorWebView from '../components/module/ide/CodeEditorWebView';
import daemonService from '../services/daemonService';
import { setPaneRect, removePaneRect } from './paneRegistry';
import type { Leaf, TerminalLeaf, TerminalTab, PreviewLeaf, IdeLeaf } from './tiling';
import type { WorkspaceMeta } from '../services/workspaceService';

const C = v2.colors;

export interface PaneCallbacks {
  onFocus: (paneId: string) => void;
  onSplit: (paneId: string, dir: 'h' | 'v') => void;
  onOpenIde: (paneId: string) => void;
  onOpenPreview: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  // 터미널 탭(window) 변경을 상위(런타임)에 반영.
  onTabsChange: (paneId: string, tabs: TerminalTab[], active: number) => void;
  // pane 드래그(그립) — 화면좌표(pageX/Y)로 상위가 히트테스트·이동 적용.
  onDragStart: (paneId: string, label: string) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  // leaf 필드 영속(프리뷰 url, IDE openPath).
  onPatch: (paneId: string, patch: Record<string, unknown>) => void;
}

// PaneView — PC codingpt_pc/src/js/pane.js 미러.
//   per-pane 탭 헤더 + 본문(terminal=TerminalWebView 라이브미러 / ide·preview=P4).
export default function PaneView({
  node, ws, focused, cb,
}: {
  node: Leaf;
  ws: WorkspaceMeta;
  focused: boolean;
  cb: PaneCallbacks;
}) {
  const rootRef = useRef<View>(null);
  // 화면(window) 좌표를 등록 → 드래그 히트테스트(paneRegistry).
  const measure = useCallback(() => {
    rootRef.current?.measureInWindow((x, y, w, h) => { if (w && h) setPaneRect(node.id, { x, y, w, h }); });
  }, [node.id]);
  useEffect(() => () => removePaneRect(node.id), [node.id]);

  return (
    <View
      ref={rootRef}
      onLayout={measure}
      style={{ flex: 1, backgroundColor: C.base, borderWidth: focused ? 1 : 0, borderColor: focused ? C.accent : 'transparent', borderRadius: 4, overflow: 'hidden' }}
    >
      {node.kind === 'terminal' ? (
        <TerminalPane node={node as TerminalLeaf} ws={ws} focused={focused} cb={cb} />
      ) : node.kind === 'preview' ? (
        <PreviewPane node={node} ws={ws} cb={cb} />
      ) : (
        <IdePane node={node} ws={ws} cb={cb} />
      )}
    </View>
  );
}

// 프리뷰/IDE 공용 헤더(그립 + 제목 + 컨트롤 + 닫기).
function SimpleHeader({ paneId, label, icon, cb, children }: { paneId: string; label: string; icon: React.ReactNode; cb: PaneCallbacks; children?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <DragGrip paneId={paneId} label={label} cb={cb} />
      {icon}
      <Text style={{ color: C.text2, fontSize: 12, flex: 1, marginLeft: 6 }} numberOfLines={1}>{label}</Text>
      {children}
      <HBtn onPress={() => cb.onClosePane(paneId)}><X size={15} color={C.textDim} /></HBtn>
    </View>
  );
}

// 드래그 그립 — 이 pane 을 잡아 다른 pane 으로 이동/분할(터치 안정: WebView 와 겹치지 않는 네이티브 핸들).
function DragGrip({ paneId, label, cb }: { paneId: string; label: string; cb: PaneCallbacks }) {
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => { cb.onDragStart(paneId, label); cb.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY); },
      onPanResponderMove: (e) => cb.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: (e) => cb.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderTerminate: (e) => cb.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
    }),
  ).current;
  return (
    <View {...pan.panHandlers} style={{ width: 30, height: 34, alignItems: 'center', justifyContent: 'center' }}>
      <DotsSixVertical size={16} color={C.textDim} />
    </View>
  );
}

// ── 터미널 pane ──
function TerminalPane({ node, ws, focused, cb }: { node: TerminalLeaf; ws: WorkspaceMeta; focused: boolean; cb: PaneCallbacks }) {
  const termRef = useRef<TerminalHandle>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cwd = ws.localPath || '';
  const ensuringRef = useRef(false);

  // 터미널 스트림 시작(토큰 발급 → WS URL). pane 전용 grouped view 세션에 attach(라이브 미러).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = await daemonService.startTerminal(cwd, node.id);
        if (alive) setWsUrl(daemonService.buildTerminalWsUrl(token));
      } catch (e) {
        if (alive) setErr(String(e));
      }
    })();
    return () => { alive = false; };
  }, [cwd, node.id]);

  // 활성 탭의 window 를 이 pane 의 view 세션에서 select(다른 pane 미영향).
  const selectActive = useCallback(async (win: number | 'new') => {
    if (typeof win === 'number') { try { await daemonService.selectTerminal(cwd, win, node.id); } catch (_) { /* noop */ } }
  }, [cwd, node.id]);

  // 마운트/탭 활성 변화 시 window 동기화. win:'new'(분할로 생긴 pane) 는 새 window 를 생성해 반영.
  useEffect(() => {
    const active = node.tabs[node.active];
    if (!active) return;
    if (typeof active.win === 'number') { void selectActive(active.win); return; }
    if (ensuringRef.current) return;
    ensuringRef.current = true;
    (async () => {
      try {
        const { index } = await daemonService.newTerminal(cwd);
        const tabs = node.tabs.map((t, i) => (i === node.active ? { ...t, win: index } : t));
        cb.onTabsChange(node.id, tabs, node.active);
        await daemonService.selectTerminal(cwd, index, node.id);
      } catch (_) { /* noop */ } finally { ensuringRef.current = false; }
    })();
  }, [node.active, node.tabs, cwd, node.id, cb, selectActive]);

  const addTab = useCallback(async () => {
    try {
      const { index } = await daemonService.newTerminal(cwd);
      const tabs = [...node.tabs, { win: index, title: '' }];
      cb.onTabsChange(node.id, tabs, tabs.length - 1);
      await selectActive(index);
    } catch (_) { /* noop */ }
  }, [cwd, node, cb, selectActive]);

  const switchTab = useCallback((i: number) => {
    if (i === node.active) return;
    cb.onTabsChange(node.id, node.tabs, i);
  }, [node, cb]);

  const closeTab = useCallback(async (i: number) => {
    const tab = node.tabs[i];
    if (typeof tab?.win === 'number') { try { await daemonService.closeTerminal(cwd, tab.win); } catch (_) { /* noop */ } }
    const tabs = node.tabs.filter((_, k) => k !== i);
    if (!tabs.length) { cb.onClosePane(node.id); return; }
    const active = node.active >= tabs.length ? tabs.length - 1 : node.active;
    cb.onTabsChange(node.id, tabs, active);
  }, [node, cwd, cb]);

  return (
    <>
      <PaneHeader node={node} onTabPress={switchTab} onTabClose={closeTab} onNewTab={addTab} cb={cb} />
      <Pressable style={{ flex: 1 }} onPress={() => cb.onFocus(node.id)}>
        {err ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <Text style={{ color: C.error, fontSize: 12, textAlign: 'center' }}>터미널 연결 실패{'\n'}{err}</Text>
          </View>
        ) : !wsUrl ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : (
          <TerminalWebView ref={termRef} wsUrl={wsUrl} onFocusChange={(f) => { if (f) cb.onFocus(node.id); }} />
        )}
      </Pressable>
    </>
  );
}

// ── 헤더(탭 + 컨트롤) ──
function PaneHeader({
  node, onTabPress, onTabClose, onNewTab, cb,
}: {
  node: TerminalLeaf;
  onTabPress: (i: number) => void;
  onTabClose: (i: number) => void;
  onNewTab: () => void;
  cb: PaneCallbacks;
}) {
  const dragLabel = node.tabs[node.active]?.title || `터미널 ${node.tabs[node.active]?.win ?? ''}`.trim();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <DragGrip paneId={node.id} label={dragLabel} cb={cb} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center' }}>
        {node.tabs.map((t, i) => {
          const active = i === node.active;
          const label = t.title || (typeof t.win === 'number' ? `터미널 ${t.win}` : '터미널');
          return (
            <Pressable key={`${node.id}-${i}`} onPress={() => onTabPress(i)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, backgroundColor: active ? C.base : 'transparent', borderTopWidth: 2, borderTopColor: active ? C.accent : 'transparent' }}>
              <TerminalIcon size={13} color={active ? C.text2 : C.textDim} />
              <Text style={{ color: active ? C.text : C.textDim, fontSize: 12 }} numberOfLines={1}>{label}</Text>
              <Pressable onPress={() => onTabClose(i)} hitSlop={6}><X size={11} color={C.textDim} /></Pressable>
            </Pressable>
          );
        })}
        <Pressable onPress={onNewTab} hitSlop={6} style={{ paddingHorizontal: 8, height: 34, justifyContent: 'center' }}>
          <Plus size={14} color={C.textDim} />
        </Pressable>
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 2 }}>
        <HBtn onPress={() => cb.onSplit(node.id, 'h')}><ColumnsPlusRight size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onSplit(node.id, 'v')}><RowsPlusBottom size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onOpenIde(node.id)}><Code size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onOpenPreview(node.id)}><Globe size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onClosePane(node.id)}><X size={15} color={C.textDim} /></HBtn>
      </View>
    </View>
  );
}

function HBtn({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={{ width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </Pressable>
  );
}

// ── 프리뷰 pane — 데브서버 포트 프록시 + 임의 URL ──
function PreviewPane({ node, ws, cb }: { node: PreviewLeaf; ws: WorkspaceMeta; cb: PaneCallbacks }) {
  const [input, setInput] = useState(node.url || '');
  const [webUrl, setWebUrl] = useState<string | null>(null); // 실제 WebView 에 로드할 URL(데브서버는 프록시)
  const [busy, setBusy] = useState(false);
  const webRef = useRef<WebView>(null);

  const load = useCallback(async (raw: string) => {
    const u = (raw || '').trim();
    if (!u) return;
    setBusy(true);
    try {
      const portOnly = /^\d+$/.test(u);
      const localMatch = /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::(\d+))?/i.exec(u);
      const isUrl = /^https?:\/\//i.test(u);
      const isDomain = /^[\w-]+(\.[\w-]+)+([:/?#]|$)/.test(u);
      if (portOnly || localMatch) {
        // 원격 호스트 데브서버 → 프록시 토큰 URL 로드.
        const port = portOnly ? parseInt(u, 10) : parseInt((localMatch && localMatch[1]) || '80', 10);
        const { token } = await daemonService.previewStart(port);
        setWebUrl(daemonService.buildDaemonPreviewUrl(token));
        cb.onPatch(node.id, { url: ':' + port });
        setInput(':' + port);
      } else {
        const full = isUrl ? u : (isDomain ? 'https://' + u : 'https://www.google.com/search?q=' + encodeURIComponent(u));
        setWebUrl(full);
        cb.onPatch(node.id, { url: full });
      }
    } catch (e) {
      // noop — 잘못된 포트/오프라인
    } finally {
      setBusy(false);
    }
  }, [node.id, cb]);

  // 저장된 url 복원(데브서버 포트면 재프록시).
  useEffect(() => { if (node.url) void load(node.url); /* 최초 1회 */ /* eslint-disable-next-line */ }, []);

  const cwd = ws.localPath || '';
  const detectPort = useCallback(async () => {
    try {
      const ports = await daemonService.previewPorts();
      if (ports.length) void load(String(ports[0]));
    } catch (_) { /* noop */ }
  }, [load]);

  return (
    <>
      <SimpleHeader paneId={node.id} label="프리뷰" icon={<Globe size={13} color={C.text2} />} cb={cb}>
        <HBtn onPress={detectPort}><TreeStructure size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => webRef.current?.reload()}><ArrowClockwise size={15} color={C.textDim} /></HBtn>
      </SimpleHeader>
      {/* 주소창 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => load(input)}
          placeholder="URL 또는 포트 (예: 3000 · localhost:3000 · 날씨)"
          placeholderTextColor={C.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, color: C.text, fontSize: 12, fontFamily: v2.font.mono, backgroundColor: C.elevated2, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
        />
        <Pressable onPress={() => load(input)} style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.cta, borderRadius: 6 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>이동</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {busy ? <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} /> : null}
        {webUrl ? (
          <WebView ref={webRef} source={{ uri: webUrl }} style={{ flex: 1 }} originWhitelist={['*']} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.base }}>
            <Text style={{ color: C.textDim, fontSize: 12, textAlign: 'center' }}>URL 또는 데브서버 포트를 입력하세요{cwd ? '' : ''}</Text>
          </View>
        )}
      </View>
    </>
  );
}

// ── IDE pane — 파일트리 + CodeMirror(CodeEditorWebView) ──
const langFor = (path: string): string => {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', json: 'json', html: 'htmlmixed', htm: 'htmlmixed',
    css: 'css', scss: 'css', md: 'markdown', py: 'python', java: 'java', sh: 'shell',
    yml: 'yaml', yaml: 'yaml',
  };
  return map[ext] || 'text';
};

function IdePane({ node, ws, cb }: { node: IdeLeaf; ws: WorkspaceMeta; cb: PaneCallbacks }) {
  const root = ws.localPath || '';
  const [items, setItems] = useState<{ path: string; text: boolean }[]>([]);
  const [treeOpen, setTreeOpen] = useState(true);
  const [openPath, setOpenPath] = useState<string | null>(node.openPath || null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await daemonService.fsTree(root);
        if (alive) setItems(t.items || []);
      } catch (_) { /* noop */ }
    })();
    return () => { alive = false; };
  }, [root]);

  const openFile = useCallback(async (rel: string) => {
    try {
      const full = root ? `${root}/${rel}` : rel;
      const r = await daemonService.fsRead(full);
      // content 를 먼저 세팅한 뒤 openPath(에디터 key) 변경 → 리마운트가 새 내용으로 렌더.
      setContent(typeof r.content === 'string' ? r.content : '');
      setDirty(false);
      setOpenPath(rel);
      cb.onPatch(node.id, { openPath: rel });
    } catch (_) { setContent(''); setOpenPath(rel); }
  }, [root, node.id, cb]);

  // 저장된 openPath 복원.
  useEffect(() => { if (node.openPath) void openFile(node.openPath); /* eslint-disable-next-line */ }, []);

  const save = useCallback(async () => {
    if (!openPath) return;
    setSaving(true);
    try {
      const full = root ? `${root}/${openPath}` : openPath;
      await daemonService.fsWrite(full, content);
      setDirty(false);
    } catch (_) { /* noop */ } finally { setSaving(false); }
  }, [openPath, root, content]);

  return (
    <>
      <SimpleHeader paneId={node.id} label={openPath ? openPath.split('/').pop() || 'IDE' : 'IDE'} icon={<Code size={13} color={C.text2} />} cb={cb}>
        {dirty ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, marginRight: 4 }} /> : null}
        <HBtn onPress={() => setTreeOpen((v) => !v)}><TreeStructure size={15} color={treeOpen ? C.accent : C.textDim} /></HBtn>
        <HBtn onPress={save}><FloppyDisk size={15} color={dirty ? C.accent : C.textDim} /></HBtn>
      </SimpleHeader>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {treeOpen ? (
          <View style={{ width: 180, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: C.surface }}>
            <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
              {items.map((it) => {
                const depth = it.path.split('/').length - 1;
                const name = it.path.split('/').pop() || it.path;
                const active = it.path === openPath;
                return (
                  <Pressable key={it.path} onPress={() => it.text && openFile(it.path)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingRight: 8, paddingLeft: 8 + depth * 12, backgroundColor: active ? C.accentTint : 'transparent' }}>
                    <FileIcon size={12} color={active ? C.accent : C.textDim} />
                    <Text numberOfLines={1} style={{ color: active ? C.text : C.text2, fontSize: 11.5, flex: 1, fontFamily: v2.font.mono }}>{name}</Text>
                  </Pressable>
                );
              })}
              {items.length === 0 ? <Text style={{ color: C.textDim, fontSize: 11, padding: 10 }}>파일을 불러오는 중…</Text> : null}
            </ScrollView>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          {openPath ? (
            <CodeEditorWebView
              key={openPath}
              value={content}
              language={langFor(openPath)}
              onChange={(v) => { setContent(v); setDirty(true); }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.textDim, fontSize: 12 }}>{saving ? '저장 중…' : '파일을 선택하세요'}</Text>
            </View>
          )}
        </View>
      </View>
    </>
  );
}
