import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, PanResponder, TextInput, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  TerminalWindow, X, Code, Globe, SidebarSimple,
  SquareSplitHorizontal, SquareSplitVertical,
  ArrowClockwise, ArrowSquareOut, FloppyDisk, File as FileIcon,
  FilePlus, PencilSimple, Trash, Sparkle,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import TerminalWebView, { TerminalHandle } from '../components/module/ide/TerminalWebView';
import CodeEditorWebView from '../components/module/ide/CodeEditorWebView';
import daemonService from '../services/daemonService';
import { useAiControl, AI_HYBRID_HIDDEN } from '../contexts/AiControlContext';
import { setPaneRect, removePaneRect } from './paneRegistry';
import type { Leaf, TerminalLeaf, TerminalTab, PreviewLeaf, IdeLeaf } from './tiling';
import type { WorkspaceMeta } from '../services/workspaceService';
import { haptic } from '../animations/haptics';

const C = v2.colors;

// 롱프레스-활성 드래그 핸들 — 탭/헤더를 "꾹 눌러" 잡아야 드래그 시작.
//  탭은 가로 ScrollView 안이라 즉시 드래그(dx>8)면 스크롤이 제스처를 가로채 드래그가 안 걸린다.
//  → 롱프레스(220ms) 전엔 responder 를 안 잡아 탭/스크롤이 정상 동작하고, 롱프레스 후 이동하면 이 핸들이
//    제스처를 잡아(부모 ScrollView 를 이겨) pane 드래그가 확실히 시작된다(PC 의 pointerdown 드래그 대체).
function useDragHandle(id: string, label: string, cb: PaneCallbacks) {
  const cbRef = useRef(cb); cbRef.current = cb;
  const idRef = useRef(id); idRef.current = id;
  const labelRef = useRef(label); labelRef.current = label;
  const armed = useRef(false);
  const down = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        armed.current = false; down.current = true; clear();
        timer.current = setTimeout(() => { if (down.current) { armed.current = true; haptic.select(); } }, 220);
        return false; // 시작 시엔 안 잡음(탭/스크롤 허용). 롱프레스 후 move 에서 잡는다.
      },
      onMoveShouldSetPanResponder: (_e, g) => {
        if (armed.current) return true;                                  // 롱프레스됨 → 드래그 시작
        if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) clear();           // 먼저 움직임=스크롤/탭 → 픽업 취소
        return false;
      },
      onPanResponderGrant: (e) => { cbRef.current.onDragStart(idRef.current, labelRef.current); cbRef.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY); },
      onPanResponderMove: (e) => cbRef.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: (e) => { down.current = false; armed.current = false; clear(); cbRef.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY); },
      onPanResponderTerminate: (e) => { down.current = false; armed.current = false; clear(); cbRef.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY); },
    }),
  ).current;
  // 롱프레스 전에 손을 떼면(탭) 타이머 취소 — 안 그러면 탭 후 220ms 뒤 헛 햅틱.
  const onTouchEnd = () => { down.current = false; clear(); };
  return { panHandlers: pan.panHandlers, onTouchEnd };
}

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
  // 터미널 OSC/벨 알림.
  onNotify: (paneId: string, title: string, body: string) => void;
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
      style={{ flex: 1, backgroundColor: C.base, borderRadius: 4, overflow: 'hidden' }}
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

// 프리뷰/IDE 공용 헤더 — PC pane.js 미러: 그립 없음, 정적 탭(아이콘+라벨+x=닫기)=드래그 핸들, 오른쪽=컨트롤(children).
function SimpleHeader({ paneId, label, icon, cb, children }: { paneId: string; label: string; icon: React.ReactNode; cb: PaneCallbacks; children?: React.ReactNode }) {
  const drag = useDragHandle(paneId, label, cb);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <View {...drag.panHandlers} onTouchEnd={drag.onTouchEnd} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, borderTopWidth: 2, borderTopColor: C.accent, alignSelf: 'flex-start' }}>
          {icon}
          <Text style={{ color: C.text, fontSize: 12 }} numberOfLines={1}>{label}</Text>
          <Pressable onPress={() => cb.onClosePane(paneId)} hitSlop={6}><X size={11} color={C.textDim} /></Pressable>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, gap: 1 }}>
        {children}
        <HBtn onPress={() => cb.onSplit(paneId, 'h')}><SquareSplitHorizontal size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onSplit(paneId, 'v')}><SquareSplitVertical size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onOpenIde(paneId)}><Code size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onOpenPreview(paneId)}><Globe size={15} color={C.textDim} /></HBtn>
      </View>
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
  const startedRef = useRef(false);
  // 활성 탭이 표시할 window. 'new'(분할로 갓 생긴 pane)면 아직 미확보.
  const activeWin = node.tabs[node.active]?.win;

  // 포커스된 pane 은 명시적으로 xterm 포커스 → iOS 소프트 키보드가 확실히 뜬다(탭-포커스만으론 불안정).
  //  keyboardDisplayRequiresUserAction={false} 라 프로그램적 focus 로 키보드 노출됨.
  useEffect(() => {
    if (focused && wsUrl) { const t = setTimeout(() => termRef.current?.focus(), 120); return () => clearTimeout(t); }
  }, [focused, wsUrl]);

  // 1) win 확보 — 활성 탭이 'new'면 실제 tmux window 를 먼저 만든다(PC _ensureWin 미러).
  //    스트림보다 먼저 window 를 확정해야, grouped view 가 엉뚱한(형제와 같은) window 를 상속하지 않는다.
  useEffect(() => {
    const active = node.tabs[node.active];
    if (!active || typeof active.win === 'number') return;
    if (ensuringRef.current) return;
    ensuringRef.current = true;
    let alive = true;
    (async () => {
      try {
        const { index } = await daemonService.newTerminal(cwd);
        if (!alive) return;
        const tabs = node.tabs.map((t, i) => (i === node.active ? { ...t, win: index } : t));
        cb.onTabsChange(node.id, tabs, node.active);
      } catch (_) { /* noop */ } finally { ensuringRef.current = false; }
    })();
    return () => { alive = false; };
  }, [node.active, node.tabs, cwd, node.id, cb]);

  // 2) win 이 확정된 뒤 스트림을 딱 한 번 연다. startTerminal 에 win 을 넘겨 데몬이 attach 와 동시에
  //    그 window 로 select → 여러 pane 이 같은 터미널을 보는 문제를 원천 차단(PC ptyOpen(win) 미러).
  useEffect(() => {
    if (startedRef.current) return;
    if (typeof activeWin !== 'number') return;
    startedRef.current = true;
    let alive = true;
    (async () => {
      try {
        const token = await daemonService.startTerminal(cwd, node.id, activeWin);
        if (alive) setWsUrl(daemonService.buildTerminalWsUrl(token));
      } catch (e) {
        if (alive) { setErr(String(e)); startedRef.current = false; }
      }
    })();
    return () => { alive = false; };
  }, [activeWin, cwd, node.id]);

  // 3) 스트림이 살아있는 상태에서 활성 탭이 바뀌면 이 pane 의 view 세션에서 그 window 로 전환(다른 pane 미영향).
  useEffect(() => {
    if (!wsUrl || typeof activeWin !== 'number') return;
    daemonService.selectTerminal(cwd, activeWin, node.id).catch(() => { /* noop */ });
  }, [activeWin, wsUrl, cwd, node.id]);

  // 새 탭 = 새 window('new'). effect 1 이 window 를 확보하고 effect 3 이 전환한다.
  const addTab = useCallback(() => {
    const tabs: TerminalTab[] = [...node.tabs, { win: 'new', title: '' }];
    cb.onTabsChange(node.id, tabs, tabs.length - 1);
  }, [node, cb]);

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
      {/* WebView 를 Pressable 로 감싸면 iOS 에서 터치가 가로채져 xterm textarea 가 포커스를 못 받아
          키보드 입력이 안 됨(라이브미러 무입력 버그). 포커스는 WebView 의 onFocusChange 로만 처리. */}
      <View style={{ flex: 1 }}>
        {err ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <Text style={{ color: C.error, fontSize: 12, textAlign: 'center' }}>터미널 연결 실패{'\n'}{err}</Text>
          </View>
        ) : !wsUrl ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : (
          <TerminalWebView ref={termRef} wsUrl={wsUrl} onFocusChange={(f) => { if (f) cb.onFocus(node.id); }} onNotify={(t, b) => cb.onNotify(node.id, t, b)} />
        )}
      </View>
    </>
  );
}

// 드래그 가능한 탭 — PC 처럼 탭 자체가 드래그 핸들(별도 그립 없음). 탭=이동 없으면 전환, 이동 시 pane 드래그.
function DraggableTab({ node, i, active, label, onTabPress, onTabClose, cb }: {
  node: TerminalLeaf; i: number; active: boolean; label: string;
  onTabPress: (i: number) => void; onTabClose: (i: number) => void; cb: PaneCallbacks;
}) {
  // 롱프레스로 잡아야 드래그 시작(가만히 탭=전환, 좌우 스와이프=탭바 스크롤). 가로 ScrollView 와 공존.
  const drag = useDragHandle(node.id, label, cb);
  return (
    <View {...drag.panHandlers} onTouchEnd={drag.onTouchEnd}>
      <Pressable onPress={() => onTabPress(i)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, backgroundColor: active ? C.base : 'transparent', borderTopWidth: 2, borderTopColor: active ? C.accent : 'transparent' }}>
        <TerminalWindow size={13} color={active ? C.text2 : C.textDim} />
        <Text style={{ color: active ? C.text : C.textDim, fontSize: 12 }} numberOfLines={1}>{label}</Text>
        <Pressable onPress={() => onTabClose(i)} hitSlop={6}><X size={11} color={C.textDim} /></Pressable>
      </Pressable>
    </View>
  );
}

// ── 헤더(탭 + 컨트롤) — PC pane.js 미러: 그립 없음, 오른쪽 [새터미널·splitRight·splitDown·IDE·프리뷰]. 닫기는 탭 x. ──
function PaneHeader({
  node, onTabPress, onTabClose, onNewTab, cb,
}: {
  node: TerminalLeaf;
  onTabPress: (i: number) => void;
  onTabClose: (i: number) => void;
  onNewTab: () => void;
  cb: PaneCallbacks;
}) {
  // AI 실행 버튼 — 에이전트가 실행 중이 아닐 때만 노출(실행되면 숨김). 우측 하단 FAB 대체.
  const ai = useAiControl();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center' }}>
        {node.tabs.map((t, i) => (
          <DraggableTab key={`${node.id}-${i}`} node={node} i={i} active={i === node.active}
            label={t.title || (typeof t.win === 'number' ? `터미널 ${t.win}` : '터미널')}
            onTabPress={onTabPress} onTabClose={onTabClose} cb={cb} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, gap: 1 }}>
        {!AI_HYBRID_HIDDEN && !ai.hasSession ? (
          <HBtn onPress={ai.openOrStart}><Sparkle size={15} color={C.accent} weight="fill" /></HBtn>
        ) : null}
        <HBtn onPress={onNewTab}><TerminalWindow size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onSplit(node.id, 'h')}><SquareSplitHorizontal size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onSplit(node.id, 'v')}><SquareSplitVertical size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onOpenIde(node.id)}><Code size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => cb.onOpenPreview(node.id)}><Globe size={15} color={C.textDim} /></HBtn>
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
      const ports = await daemonService.previewPorts(cwd);
      if (ports.length) void load(String(ports[0]));
    } catch (_) { /* noop */ }
  }, [load, cwd]);

  return (
    <>
      <SimpleHeader paneId={node.id} label="프리뷰" icon={<Globe size={13} color={C.text2} />} cb={cb} />
      {/* 주소창 (PC preview-bar 미러: 입력 + 새로고침 + 외부 열기) */}
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
        <HBtn onPress={detectPort}><ArrowSquareOut size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => webRef.current?.reload()}><ArrowClockwise size={15} color={C.textDim} /></HBtn>
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
  const [menuPath, setMenuPath] = useState<string | null>(null);          // 롱프레스 항목
  const [prompt, setPrompt] = useState<{ mode: 'newFile' | 'rename'; base: string } | null>(null);
  const [promptInput, setPromptInput] = useState('');

  const full = useCallback((rel: string) => (root ? `${root}/${rel}` : rel), [root]);

  const reloadTree = useCallback(async () => {
    try {
      const t = await daemonService.fsTree(root);
      setItems(t.items || []);
    } catch (_) { /* noop */ }
  }, [root]);

  useEffect(() => { void reloadTree(); }, [reloadTree]);

  const openFile = useCallback(async (rel: string) => {
    try {
      const r = await daemonService.fsRead(full(rel));
      // content 를 먼저 세팅한 뒤 openPath(에디터 key) 변경 → 리마운트가 새 내용으로 렌더.
      setContent(typeof r.content === 'string' ? r.content : '');
      setDirty(false);
      setOpenPath(rel);
      cb.onPatch(node.id, { openPath: rel });
    } catch (_) { setContent(''); setOpenPath(rel); }
  }, [full, node.id, cb]);

  // 저장된 openPath 복원.
  useEffect(() => { if (node.openPath) void openFile(node.openPath); /* eslint-disable-next-line */ }, []);

  const save = useCallback(async () => {
    if (!openPath) return;
    setSaving(true);
    try {
      await daemonService.fsWrite(full(openPath), content);
      setDirty(false);
    } catch (_) { /* noop */ } finally { setSaving(false); }
  }, [openPath, full, content]);

  const doDelete = useCallback(async (rel: string) => {
    setMenuPath(null);
    try {
      await daemonService.fsDelete(full(rel));
      if (openPath === rel) { setOpenPath(null); setContent(''); }
      await reloadTree();
    } catch (_) { /* noop */ }
  }, [full, openPath, reloadTree]);

  const submitPrompt = useCallback(async () => {
    if (!prompt) return;
    const name = promptInput.trim();
    const p = prompt; setPrompt(null); setPromptInput('');
    if (!name) return;
    try {
      if (p.mode === 'newFile') {
        const rel = p.base ? `${p.base}/${name}` : name;
        await daemonService.fsCreateFile(full(rel));
        await reloadTree();
        void openFile(rel);
      } else {
        // rename: 같은 디렉토리 내 이름 변경.
        const dir = p.base.includes('/') ? p.base.slice(0, p.base.lastIndexOf('/')) : '';
        const rel = dir ? `${dir}/${name}` : name;
        await daemonService.fsRename(full(p.base), full(rel));
        if (openPath === p.base) { setOpenPath(rel); cb.onPatch(node.id, { openPath: rel }); }
        await reloadTree();
      }
    } catch (_) { /* noop */ }
  }, [prompt, promptInput, full, reloadTree, openFile, openPath, cb, node.id]);

  return (
    <>
      <SimpleHeader paneId={node.id} label={openPath ? openPath.split('/').pop() || 'IDE' : 'IDE'} icon={<Code size={13} color={C.text2} />} cb={cb}>
        {dirty ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, marginRight: 4 }} /> : null}
        <HBtn onPress={() => { setPrompt({ mode: 'newFile', base: '' }); setPromptInput(''); }}><FilePlus size={15} color={C.textDim} /></HBtn>
        <HBtn onPress={() => setTreeOpen((v) => !v)}><SidebarSimple size={15} color={treeOpen ? C.accent : C.textDim} /></HBtn>
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
                  <Pressable key={it.path} onPress={() => it.text && openFile(it.path)} onLongPress={() => setMenuPath(it.path)} delayLongPress={300}
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

      {/* 파일 롱프레스 메뉴 */}
      <Modal visible={!!menuPath} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={() => setMenuPath(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setMenuPath(null)}>
          <Pressable style={{ width: 240, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, paddingVertical: 6 }}>
            <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11, paddingHorizontal: 14, paddingVertical: 6, fontFamily: v2.font.mono }}>{menuPath}</Text>
            <TreeMenuItem icon={<PencilSimple size={16} color={C.text2} />} label="이름 변경" onPress={() => { const b = menuPath!; setMenuPath(null); setPrompt({ mode: 'rename', base: b }); setPromptInput(b.split('/').pop() || ''); }} />
            <TreeMenuItem icon={<Trash size={16} color={C.error} />} label="삭제" danger onPress={() => menuPath && doDelete(menuPath)} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* 이름 입력(새 파일/이름 변경) */}
      <Modal visible={!!prompt} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} onRequestClose={() => setPrompt(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setPrompt(null)}>
          <Pressable style={{ width: 280, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{prompt?.mode === 'rename' ? '이름 변경' : '새 파일'}</Text>
            <TextInput
              value={promptInput}
              onChangeText={setPromptInput}
              onSubmitEditing={submitPrompt}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={prompt?.mode === 'newFile' ? '파일명 (예: index.js)' : '새 이름'}
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
    </>
  );
}

function TreeMenuItem({ icon, label, onPress, danger }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} android_ripple={{ color: C.elevated2 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
      {icon}
      <Text style={{ color: danger ? C.error : C.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
