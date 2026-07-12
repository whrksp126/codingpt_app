import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, PanResponder } from 'react-native';
import {
  Terminal as TerminalIcon, Plus, X, Code, Globe,
  ColumnsPlusRight, RowsPlusBottom, DotsSixVertical,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import TerminalWebView, { TerminalHandle } from '../components/module/ide/TerminalWebView';
import daemonService from '../services/daemonService';
import { setPaneRect, removePaneRect } from './paneRegistry';
import type { Leaf, TerminalLeaf, TerminalTab } from './tiling';
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
      ) : (
        <PlaceholderPane node={node} cb={cb} />
      )}
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

// ── IDE/프리뷰 플레이스홀더(P4) ──
function PlaceholderPane({ node, cb }: { node: Leaf; cb: PaneCallbacks }) {
  const isIde = node.kind === 'ide';
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, paddingRight: 10, gap: 6 }}>
        <DragGrip paneId={node.id} label={isIde ? 'IDE' : '프리뷰'} cb={cb} />
        {isIde ? <Code size={13} color={C.text2} /> : <Globe size={13} color={C.text2} />}
        <Text style={{ color: C.text2, fontSize: 12, flex: 1 }}>{isIde ? 'IDE' : '프리뷰'}</Text>
        <HBtn onPress={() => cb.onClosePane(node.id)}><X size={15} color={C.textDim} /></HBtn>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.textDim, fontSize: 12 }}>{isIde ? 'IDE pane (P4)' : '프리뷰 pane (P4)'}</Text>
      </View>
    </>
  );
}
