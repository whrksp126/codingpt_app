import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, PanResponder, Modal, AppState, Image, Linking, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  TerminalWindow, X, Code, Globe, SidebarSimple,
  ArrowClockwise, ArrowSquareOut, Sparkle,
  CaretLeft, CaretRight, Sun, Wrench,
} from 'phosphor-react-native';
import { v2 } from '../theme/v2Tokens';
import TerminalWebView, { TerminalHandle } from '../components/module/ide/TerminalWebView';
import { setKeyTarget, blurKeyTarget, consumeKeyMods, termSeqFor, type KeyTarget } from '../components/keyboard/KeyAssist';
import KeyTextInput from '../components/keyboard/KeyTextInput';
import IdeBody from './IdeBody';
import daemonService from '../services/daemonService';
import { useAiControl, AI_HYBRID_HIDDEN } from '../contexts/AiControlContext';
import { setPaneRect, removePaneRect, setTabRect, removeTabRect, registerMeasurer, unregisterMeasurer, getDragSrc, subscribeDragSrc, registerTabScroller, unregisterTabScroller, type DragSrc } from './paneRegistry';
import { registerPreviewControl } from './uiControls';
import { registerAutomation, isAutomationAllowedOrigin, AUTOMATION_MUTATING } from '../services/previewAutomation';
import { PAGE_AGENT_JS } from './pageAgent';
import { isTermTab } from './tiling';
import { useWorkspaceShell } from '../contexts/WorkspaceShellContext';
import type { Leaf, TerminalLeaf, TerminalTab, PreviewLeaf, IdeLeaf } from './tiling';
import type { WorkspaceMeta } from '../services/workspaceService';
import { haptic } from '../animations/haptics';

const C = v2.colors;

// 혼합 탭 식별 키 — tid 우선(없으면 kind+경로/URL 파생). 본문 마운트/메타 키 공용.
const keyOf = (t: TerminalTab) => t.tid || `${t.kind}:${t.openPath ?? t.url ?? ''}`;

// 터미널 탭 라벨 — 이름 + 실행 중 명령 부제("터미널 1 · claude"). 셸 자체(zsh 등)는 생략(cmux 미러).
const IDLE_CMDS = new Set(['zsh', 'bash', 'sh', 'fish', 'login', '-zsh', '-bash']);
function termTabLabel(t: TerminalTab): string {
  const base = t.title || (typeof t.win === 'number' ? `터미널 ${t.win}` : '터미널');
  const cmd = (t.cmd || '').trim();
  return cmd && !IDLE_CMDS.has(cmd) ? `${base} · ${cmd}` : base;
}

// ── 프리뷰 페이지 메타(제목/파비콘) — 탭/헤더 라벨용 모듈 스토어(레이아웃 영속과 분리) ──
//  key = 혼합 탭 키(keyOf) 또는 독립 pane id. cmux 처럼 탭이 "열린 페이지"를 표현한다.
const previewMeta = new Map<string, { title?: string; favicon?: string }>();
const previewMetaListeners = new Set<() => void>();
function setPreviewMetaFor(key: string, m: { title?: string; favicon?: string }) {
  const cur = previewMeta.get(key) || {};
  if (cur.title === m.title && cur.favicon === m.favicon) return;
  previewMeta.set(key, m);
  previewMetaListeners.forEach((l) => l());
}
// 버전 구독 — 컴포넌트는 이 훅으로 리렌더만 트리거하고 previewMeta 를 직접 읽는다.
function usePreviewMetaVersion() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((v) => v + 1);
    previewMetaListeners.add(l);
    return () => { previewMetaListeners.delete(l); };
  }, []);
}

// ── 프리뷰 승격 레이어 — WebView 를 pane 트리 밖(그리드 절대배치 레이어)에 상주시킨다 ──
//  pane 안에는 위치만 재는 빈 슬롯(PreviewSlot)을 두고, 실제 PreviewBody 는 PreviewHostLayer 가
//  슬롯 rect 위에 띄운다(PC 네이티브 webview sync 미러). 탭 재배치/분할 이동 = 슬롯만 옮겨져
//  WebView 인스턴스(페이지·테마·개발자도구)가 그대로 유지된다. 키 = 표면 ID(tid, pane↔탭 승계).
interface PvEntry {
  ref: React.RefObject<View | null>;
  props: { cwd: string; url: string; onUrlChange: (u: string) => void };
  active: boolean;
  orphanAt: number | null; // 슬롯 언마운트 시각 — 드래그 이동 중 잠깐 사라지므로 유예 후 파기
}
const pvEntries = new Map<string, PvEntry>();
const pvListeners = new Set<() => void>();
const pvNotify = () => pvListeners.forEach((l) => l());

export function PreviewSlot({ k, cwd, url, active, onUrlChange }: {
  k: string; cwd: string; url: string; active: boolean; onUrlChange: (u: string) => void;
}) {
  const ref = useRef<View>(null);
  const onUrlRef = useRef(onUrlChange); onUrlRef.current = onUrlChange;
  useEffect(() => {
    const cur = pvEntries.get(k);
    const entry: PvEntry = cur || {
      ref,
      props: { cwd, url, onUrlChange: (u: string) => onUrlRef.current(u) },
      active,
      orphanAt: null,
    };
    entry.ref = ref;
    entry.props.cwd = cwd;
    entry.props.onUrlChange = (u: string) => onUrlRef.current(u);
    entry.active = active;
    entry.orphanAt = null; // 재마운트 = 유예 해제(같은 표면 재사용)
    pvEntries.set(k, entry);
    pvNotify();
    return () => {
      const e = pvEntries.get(k);
      if (e && e.ref === ref) { e.orphanAt = Date.now(); pvNotify(); }
    };
  }, [k, cwd, url, active]);
  return <View ref={ref} collapsable={false} style={{ flex: 1 }} />;
}

export function PreviewHostLayer() {
  const [, force] = useState(0);
  const layerRef = useRef<View>(null);
  const rectsRef = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  useEffect(() => {
    const l = () => force((v) => v + 1);
    pvListeners.add(l);
    const tick = setInterval(() => {
      // 고아 파기(탭/pane 이 정말 닫힘) — 이동 재마운트는 수 ms 라 1.2s 유예면 충분.
      let changed = false;
      pvEntries.forEach((e, key) => {
        if (e.orphanAt && Date.now() - e.orphanAt > 1200) { pvEntries.delete(key); delete rectsRef.current[key]; changed = true; }
      });
      if (changed) pvNotify();
      // 슬롯 위치 추적(레이어 로컬 좌표) — 분할선 드래그/리사이즈를 따라간다.
      layerRef.current?.measureInWindow((lx, ly) => {
        if (!Number.isFinite(lx) || !Number.isFinite(ly)) return; // 미부착 측정 = NaN 방지
        pvEntries.forEach((e, key) => {
          if (e.orphanAt || !e.active) return;
          e.ref.current?.measureInWindow((x, y, w, h) => {
            if (![x, y, w, h].every(Number.isFinite)) return;
            const nr = { x: Math.round(x - lx), y: Math.round(y - ly), w: Math.round(w), h: Math.round(h) };
            const r = rectsRef.current[key];
            if (!r || Math.abs(r.x - nr.x) > 1 || Math.abs(r.y - nr.y) > 1 || Math.abs(r.w - nr.w) > 1 || Math.abs(r.h - nr.h) > 1) {
              rectsRef.current[key] = nr;
              force((v) => v + 1);
            }
          });
        });
      });
    }, 150);
    return () => { pvListeners.delete(l); clearInterval(tick); };
  }, []);
  return (
    <View ref={layerRef} pointerEvents="box-none" collapsable={false} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      {[...pvEntries.entries()].map(([key, e]) => {
        const r = rectsRef.current[key];
        const show = !!r && e.active && !e.orphanAt && r.w > 2 && r.h > 2;
        return (
          <View
            key={key}
            pointerEvents={show ? 'auto' : 'none'}
            // 숨김/이동 중엔 화면 밖으로 옮겨 인스턴스 유지(unmount 금지 — WebView 상태 보존).
            style={show
              ? { position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, backgroundColor: C.base }
              : { position: 'absolute', left: -20000, top: 0, width: 500, height: 500, opacity: 0 }}
          >
            <PreviewBody cwd={e.props.cwd} url={e.props.url} metaKey={key} onUrlChange={(u) => e.props.onUrlChange(u)} />
          </View>
        );
      })}
    </View>
  );
}

// 프리뷰 탭 아이콘 — 페이지 파비콘(로드 실패/부재 시 지구본 폴백).
function TabFavicon({ uri, active }: { uri?: string; active: boolean }) {
  const [err, setErr] = useState(false);
  useEffect(() => { setErr(false); }, [uri]);
  if (!uri || err) return <Globe size={13} color={active ? C.text2 : C.textDim} />;
  return <Image source={{ uri }} onError={() => setErr(true)} style={{ width: 13, height: 13, borderRadius: 3 }} />;
}

// 드래그 원본 구독 — 드래그 중 탭바 스크롤 잠금 + 원본 탭 흐리기(전역 스토어 paneRegistry).
function useDragSrc(): DragSrc | null {
  return useSyncExternalStore(subscribeDragSrc, getDragSrc);
}

// 롱프레스-활성 드래그 핸들 — PC pointerdown 드래그의 터치 대체.
//  핵심: RN 응답자 협상에서 자식 Pressable(탭 본체/닫기 버튼)이 터치 시작 시 responder 를 선점하므로,
//  bubble 단계 onStartShouldSetPanResponder 는 아예 호출되지 않는다(이전 구현이 드래그가 전혀 시작
//  안 되던 원인). 반드시 "capture 단계" 콜백으로 롱프레스 타이머를 돌리고, armed 후 move(capture)에서
//  responder 를 탈취해야 한다(자식 Pressable 은 terminate 되어 탭 전환 오발도 없음).
//  · 터치 시작(capture): 타이머(220ms) 시작 + 좌표 기록. false 반환 → 자식 탭/버튼 정상 동작.
//  · 220ms 유지 → armed + 햅틱 + 즉시 onDragStart(고스트/드롭존 표시 — 손 안 떼고 바로 끈다).
//  · armed 전 큰 이동 = 스와이프 의도 → 픽업 취소. armed 후 릴리스 = 드롭 적용.
function useDragHandle(id: string, label: string, tabIndex: number, cb: PaneCallbacks) {
  const cbRef = useRef(cb); cbRef.current = cb;
  const idRef = useRef(id); idRef.current = id;
  const labelRef = useRef(label); labelRef.current = label;
  const tabIndexRef = useRef(tabIndex); tabIndexRef.current = tabIndex;
  const armed = useRef(false);
  const granted = useRef(false);
  const started = useRef(false); // onDragStart 발화 여부(취소 정리 필요 판단)
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
          // 롱프레스 성립 즉시 드래그 시작 표시(정지 상태에서도 고스트/존이 떠서 "잡혔다"가 보인다).
          cbRef.current.onDragStart(idRef.current, labelRef.current, tabIndexRef.current);
          cbRef.current.onDragMove(lastXY.current.x, lastXY.current.y);
        }, 220);
        return false; // 시작 시엔 안 잡음 — 자식 Pressable(탭 전환·닫기)이 정상 동작.
      },
      onMoveShouldSetPanResponderCapture: (e) => {
        lastXY.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        if (armed.current) return true; // 롱프레스됨 → 자식에게서 제스처 탈취(드래그 시작)
        const dx = lastXY.current.x - startXY.current.x;
        const dy = lastXY.current.y - startXY.current.y;
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) clear(); // 뚜렷한 스와이프 → 픽업 취소
        return false;
      },
      // 자식이 responder 를 안 잡는 표면(헤더 여백)용 bubble 폴백.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => armed.current,
      onPanResponderTerminationRequest: () => false, // 드래그 중 다른 뷰(분할선 등)가 못 뺏게
      onPanResponderGrant: (e) => {
        granted.current = true;
        cbRef.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e) => cbRef.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: (e) => {
        clear(); armed.current = false; granted.current = false; started.current = false;
        cbRef.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderTerminate: () => {
        clear(); armed.current = false; granted.current = false;
        if (started.current) { started.current = false; cbRef.current.onDragEnd(NaN, NaN); } // 취소 정리
      },
    }),
  ).current;
  // 롱프레스 전에 손을 뗀 탭(=클릭)이면 타이머 취소. armed 됐지만 responder 미획득으로 뗐으면
  //  드래그 취소(NaN 좌표는 어느 pane 에도 안 맞아 고스트/존 정리만 된다).
  const onTouchEnd = () => {
    clear();
    if (started.current && !granted.current) {
      started.current = false; armed.current = false;
      cbRef.current.onDragEnd(NaN, NaN);
    }
    armed.current = false;
  };
  return { panHandlers: pan.panHandlers, onTouchEnd };
}

export interface PaneCallbacks {
  onFocus: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  // 터미널 탭(window) 변경을 상위(런타임)에 반영.
  onTabsChange: (paneId: string, tabs: TerminalTab[], active: number) => void;
  // pane/탭 드래그 — 화면좌표(pageX/Y)로 상위가 히트테스트·드롭 적용. tabIndex<0 = pane 통째(IDE/프리뷰).
  onDragStart: (paneId: string, label: string, tabIndex: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  // leaf 필드 영속(프리뷰 url, IDE openPath).
  onPatch: (paneId: string, patch: Record<string, unknown>) => void;
  // 풀에서 아직 이 레이아웃에 배치되지 않은 터미널 하나를 입양(첫 진입 시 새 터미널 남발 방지). 없으면 null.
  claimPoolWin: () => Promise<{ index: number; name: string } | null>;
  // 터미널 OSC/벨 알림 — win: 이 pane 활성 터미널 탭의 tmux window(숫자 확정 전이면 null).
  onNotify: (paneId: string, win: number | null, title: string, body: string) => void;
  // 사용자가 실제로 이 터미널(win)을 봤을 때 = 그 (cwd,win) 알림 읽음 처리. 프로그램적 포커스가 아닌
  //  실제 터치(onInteract)/탭 클릭에서만 호출한다.
  onTerminalRead: (paneId: string, win: number) => void;
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
  // 화면(window) 좌표를 등록 → 드래그 히트테스트(paneRegistry). measurer 등록으로 드래그 시작 시
  //  일괄 재측정(measureAll) — 다른 분할/사이드바 토글로 절대좌표가 밀려도 onLayout 이 재발화하지
  //  않는 스테일 rect 문제를 막는다.
  const measure = useCallback(() => {
    // measure 의 pageX/pageY = 터치 pageX/pageY 와 같은 좌표계(루트 기준) — Android 에서
    //  measureInWindow(window 기준)는 상태바 높이만큼 어긋나 탭바 밴드 세로 판정이 빗나간다.
    rootRef.current?.measure((_x, _y, w, h, px, py) => { if (w && h) setPaneRect(node.id, { x: px, y: py, w, h }); });
  }, [node.id]);
  useEffect(() => {
    registerMeasurer(node.id, measure);
    return () => { unregisterMeasurer(node.id); removePaneRect(node.id); };
  }, [node.id, measure]);

  // 알림 하이라이트 — 이 터미널 pane 의 탭 중 미읽음 알림이 귀속된 win 이 있으면 테두리를 액티브 처리.
  //  사용자가 그 터미널을 실제로 터치(읽음)하기 전까지 유지.
  const { notifications } = useWorkspaceShell();
  const notified = node.kind === 'terminal' && !!ws.localPath && (node as TerminalLeaf).tabs.some(
    (t) => isTermTab(t) && typeof t.win === 'number'
      && notifications.some((n) => !n.read && n.cwd === ws.localPath && n.win === t.win),
  );

  return (
    <View
      ref={rootRef}
      onLayout={measure}
      style={{
        flex: 1, backgroundColor: C.base, borderRadius: notified ? 6 : 4, overflow: 'hidden',
        borderWidth: notified ? 2 : 0, borderColor: notified ? C.accent : 'transparent',
      }}
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
  const drag = useDragHandle(paneId, label, -1, cb); // tabIndex<0 = pane 통째 이동(PC IDE/프리뷰 미러)
  // pane 통째 드래그 중이면 원본 탭 흐리기 + 라벨 최대폭은 pane 탭과 동일 규칙.
  const dragSrc = useDragSrc();
  const isDragSrc = !!dragSrc && dragSrc.paneId === paneId && dragSrc.tabIndex < 0;
  const { width: winW } = useWindowDimensions();
  const tabMaxW = Math.max(96, Math.min(220, Math.round(winW * 0.26)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <View {...drag.panHandlers} onTouchEnd={drag.onTouchEnd} onTouchCancel={drag.onTouchEnd} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, borderTopWidth: 2, borderTopColor: C.accent, alignSelf: 'flex-start', maxWidth: tabMaxW + 40, opacity: isDragSrc ? 0.35 : 1 }}>
          {icon}
          <Text style={{ color: C.text, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
          <Pressable onPress={() => cb.onClosePane(paneId)} hitSlop={6}><X size={11} color={C.textDim} /></Pressable>
        </View>
      </View>
      {/* 추가류 버튼(분할/IDE/웹)은 워크스페이스 헤더의 통합 추가 버튼으로 이동 — pane 별 컨트롤만 남긴다. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, gap: 1 }}>
        {children}
      </View>
    </View>
  );
}

// ── 터미널 pane ──
function TerminalPane({ node, ws, focused, cb }: { node: TerminalLeaf; ws: WorkspaceMeta; focused: boolean; cb: PaneCallbacks }) {
  const termRef = useRef<TerminalHandle>(null);
  // 전역 키보드 액세서리(보조바+특수키 패널) 타깃 — xterm 포커스 시 등록.
  //  터미널 모디파이어는 Ctrl 만 실효(⌘ 는 일반 타이핑 유지 — 실제 터미널 관례).
  const kaId = `term:${node.id}`;
  const kaTarget = useMemo<KeyTarget>(() => ({
    id: kaId,
    kind: 'terminal',
    focus: () => termRef.current?.focus(),
    blur: () => termRef.current?.blur(),
    setVmods: (f) => termRef.current?.setVmods({ ctrl: f.ctrl }),
    applyKey: (name, flags, os) => { const seq = termSeqFor(name, flags, os); if (seq) termRef.current?.sendKey(seq); },
    insertText: (t) => termRef.current?.sendKey(t),
  }), [kaId]);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cwd = ws.localPath || '';
  const ensuringRef = useRef(false);
  const startedRef = useRef(false);
  // 혼합 탭: 이 pane 의 탭은 터미널(tmux window)뿐 아니라 IDE/프리뷰일 수도 있다.
  const activeTab = node.tabs[node.active];
  const activeIsTerm = isTermTab(activeTab);
  const hasTerm = node.tabs.some((t) => isTermTab(t));
  // 활성 "터미널" 탭이 표시할 window. 'new'(분할로 갓 생긴 pane)면 아직 미확보.
  const activeWin = activeIsTerm ? activeTab?.win : undefined;
  // 혼합 탭 안정 키 — 한 번 활성화된 IDE/프리뷰 탭 본문은 유지(숨김)해 상태 보존.
  // keyOf 는 모듈 스코프 공용(메타 스토어와 키 일치).
  const mountedMixed = useRef<Set<string>>(new Set());
  if (activeTab && !activeIsTerm) mountedMixed.current.add(keyOf(activeTab));
  // IDE 탭별 탐색기 표시 상태(기기 로컬).
  const [ideTree, setIdeTree] = useState<Record<string, boolean>>({});

  // 포커스된 pane 은 명시적으로 xterm 포커스 → iOS 소프트 키보드가 확실히 뜬다(탭-포커스만으론 불안정).
  //  keyboardDisplayRequiresUserAction={false} 라 프로그램적 focus 로 키보드 노출됨.
  useEffect(() => {
    if (focused && wsUrl) { const t = setTimeout(() => termRef.current?.focus(), 120); return () => clearTimeout(t); }
  }, [focused, wsUrl]);

  // 최신 node/cb 참조 — 아래 생성 effect 가 부모 리렌더(cb 재생성/포커스 변화)로 재구독돼도
  //  진행 중이던 RPC 결과를 항상 최신 탭 배열에 적용하기 위함. 이전 구현은 클린업 시 결과를
  //  폐기(alive=false)했는데, 그 사이 아무도 재시도하지 않아 사용자가 화면을 건드릴 때까지
  //  스피너가 영원히 돌고(재렌더가 나야 effect 재실행), 서버엔 고아 터미널이 남았다.
  const latestRef = useRef({ node, cb });
  latestRef.current = { node, cb };

  // 1) win 확보 — 활성 탭이 'new'면 풀의 미배치 터미널을 먼저 입양(첫 진입 시 남발 방지),
  //    없으면 공유 풀에 새 터미널 생성(전 기기에 나타남). 이름("터미널 N")은 풀이 원천.
  //    '+'로 만든 탭(fresh)은 입양 없이 반드시 새로 생성 — 단 재시도부터는 입양 허용
  //    (직전 시도가 생성만 성공하고 응답을 유실한 고아 터미널 회수).
  const retryRef = useRef(0);
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    const active = node.tabs[node.active];
    if (!active || !isTermTab(active) || typeof active.win === 'number') return;
    if (ensuringRef.current) return;
    ensuringRef.current = true;
    // 결과 적용 대상 탭 — setTerminalTabs 가 다른 탭 객체는 identity 를 보존하므로 응답 시점에
    //  같은 객체를 다시 찾을 수 있다(그 사이 탭 전환/추가가 있어도 엉뚱한 탭에 안 쓴다).
    const targetTab = active;
    const applyWin = (win: number, name?: string) => {
      const { node: n, cb: c } = latestRef.current;
      let idx = n.tabs.indexOf(targetTab);
      if (idx < 0) idx = n.tabs.findIndex((t) => isTermTab(t) && typeof t.win !== 'number');
      if (idx < 0) return; // 탭이 사라짐(닫힘/이동) — 고아 터미널은 리컨실러가 회수
      const tabs = n.tabs.map((t, i) => (i === idx ? { win, title: name || t.title } : t));
      c.onTabsChange(n.id, tabs, n.active);
    };
    (async () => {
      try {
        const claimed = (targetTab.fresh && retryRef.current === 0) ? null : await cb.claimPoolWin();
        const r = claimed || await daemonService.newTerminal(cwd, node.id);
        retryRef.current = 0;
        applyWin(r.index, r.name || '');
      } catch (_) {
        // 'new' 고착은 리컨실러(pending 스킵)까지 멈추므로 방치 금지 — 재시도 후 첫 터미널로 폴백
        //  (스트림 open 의 ensureView 가 window 0 을 자가치유 생성).
        retryRef.current += 1;
        if (retryRef.current <= 3) {
          setTimeout(() => setRetryTick((n) => n + 1), 2500);
        } else {
          retryRef.current = 0;
          applyWin(0);
        }
      } finally { ensuringRef.current = false; }
    })();
  }, [node.active, node.tabs, cwd, node.id, cb, retryTick]);

  // 2) win 이 확정된 뒤 스트림을 딱 한 번 연다. startTerminal 에 win 을 넘겨 데몬이 attach 와 동시에
  //    그 window 로 select → 여러 pane 이 같은 터미널을 보는 문제를 원천 차단(PC ptyOpen(win) 미러).
  //    실패(타임아웃 포함) 시 백오프 재시도 — 일시 오류로 pane 이 에러/로딩에 고착되지 않게.
  const startRetryRef = useRef(0);
  useEffect(() => {
    if (startedRef.current) return;
    if (typeof activeWin !== 'number') return;
    startedRef.current = true;
    (async () => {
      try {
        const token = await daemonService.startTerminal(cwd, node.id, activeWin);
        // 리렌더로 effect 가 재구독돼도 결과는 반드시 반영 — 폐기하면 startedRef=true 인 채
        //  아무도 재시도하지 않아 스피너가 고착된다(언마운트 후 setState 는 no-op 이라 무해).
        setWsUrl(daemonService.buildTerminalWsUrl(token)); setErr(null); startRetryRef.current = 0;
      } catch (e) {
        setErr(String(e));
        startedRef.current = false;
        startRetryRef.current += 1;
        const delay = Math.min(2500 * startRetryRef.current, 15000);
        setTimeout(() => setRetryTick((n) => n + 1), delay);
      }
    })();
  }, [activeWin, cwd, node.id, retryTick]);

  // 3) 스트림이 살아있는 상태에서 활성 탭이 바뀌면 이 pane 의 view 세션에서 그 window 로 전환(다른 pane 미영향).
  //    claim 없음 — 리컨실러 입양/타 기기 변경 반영 같은 자동 경로도 이 effect 를 타므로, 여기서
  //    크기를 주장하면 놀고 있는 기기가 사용 중인 기기의 크기를 뺏는다(프롬프트 누적의 근원).
  useEffect(() => {
    if (!wsUrl || typeof activeWin !== 'number') return;
    daemonService.selectTerminal(cwd, activeWin, node.id).catch(() => { /* noop */ });
  }, [activeWin, wsUrl, cwd, node.id]);

  // 4) pane 포커스(사용자 행동) 시 claim — 데몬이 이 pane 클라이언트 크기로 resize-window 하므로
  //    "포커스만 해도" 터미널 크기가 이 기기에 맞춰진다(입력해야 리사이즈되던 문제 해결).
  //    앱이 포그라운드일 때만 — 백그라운드 기기가 같은 창을 보는 다른 기기의 크기를 뺏지 않게.
  useEffect(() => {
    if (!focused || !wsUrl || typeof activeWin !== 'number') return;
    if (AppState.currentState !== 'active') return;
    daemonService.selectTerminal(cwd, activeWin, node.id, true).catch(() => { /* noop */ });
  }, [focused, activeWin, wsUrl, cwd, node.id]);

  const switchTab = useCallback((i: number) => {
    if (i === node.active) return;
    cb.onTabsChange(node.id, node.tabs, i);
    // 탭 클릭 = 사용자 의도 — 이 기기 크기로 창을 주장(claim). effect3 은 자동 경로와 공유라 뷰 전환만 한다.
    const t = node.tabs[i];
    if (isTermTab(t) && typeof t?.win === 'number') daemonService.selectTerminal(cwd, t.win, node.id, true).catch(() => { /* noop */ });
  }, [node, cb, cwd]);

  const closeTab = useCallback((i: number) => {
    const tab = node.tabs[i];
    // 터미널 탭 = 풀에서 완전 삭제(전 기기 공통). IDE/프리뷰 탭 = 이 기기 뷰만 닫힘.
    //  RPC 응답을 기다리지 않고 UI 먼저 갱신(낙관적) — 실패 시 리컨실러가 풀 기준 복원.
    if (isTermTab(tab) && typeof tab?.win === 'number') daemonService.closeTerminal(cwd, tab.win).catch(() => { /* noop */ });
    const tabs = node.tabs.filter((_, k) => k !== i);
    if (!tabs.length) { cb.onClosePane(node.id); return; }
    const active = node.active >= tabs.length ? tabs.length - 1 : node.active;
    cb.onTabsChange(node.id, tabs, active);
  }, [node, cwd, cb]);

  // 혼합 탭 상태 영속(IDE openPath / 프리뷰 url) — tid 키로 최신 탭을 찾아 패치.
  const patchTabByKey = useCallback((key: string, patch: Partial<TerminalTab>) => {
    const { node: n, cb: c } = latestRef.current;
    const idx = n.tabs.findIndex((t) => !isTermTab(t) && keyOf(t) === key);
    if (idx < 0) return;
    const tabs = n.tabs.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    c.onTabsChange(n.id, tabs, n.active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pane 크기 변동(분할/회전) 시 xterm 재맞춤 — RN WebView 는 DOM resize 이벤트를 안 쏘므로
  //  onLayout 에서 fit() 을 직접 호출해야 셀 격자가 pane 을 꽉 채운다(안 하면 아래 여백/잘림 발생).
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBodyLayout = useCallback(() => {
    if (fitTimer.current) clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => termRef.current?.fit(), 60);
  }, []);

  // IDE 탭 활성 시 헤더 우측 탐색기 토글.
  const activeMixedKey = activeTab && !activeIsTerm ? keyOf(activeTab) : null;
  const onToggleIdeTree = useCallback(() => {
    if (!activeMixedKey) return;
    setIdeTree((cur) => ({ ...cur, [activeMixedKey]: !(cur[activeMixedKey] ?? true) }));
  }, [activeMixedKey]);

  return (
    <>
      <PaneHeader
        node={node} focused={focused} onTabPress={switchTab} onTabClose={closeTab} cb={cb}
        ideTreeToggle={activeTab?.kind === 'ide' ? { open: ideTree[activeMixedKey || ''] ?? true, onPress: onToggleIdeTree } : null}
      />
      {/* WebView 를 Pressable 로 감싸면 iOS 에서 터치가 가로채져 xterm textarea 가 포커스를 못 받아
          키보드 입력이 안 됨(라이브미러 무입력 버그). 포커스는 WebView 의 onFocusChange 로만 처리. */}
      <View style={{ flex: 1 }} onLayout={onBodyLayout}>
        {/* 탭 본문 전환은 절대배치 + opacity 토글 — display:none/flex:0 은 다시 보일 때 웹뷰
            리사이즈→xterm/CM 재맞춤이 돌아 전환이 느렸다. 숨겨도 레이아웃을 유지하면 즉시 뜬다. */}
        {/* 터미널 콘텐츠 — term 탭이 있을 때만. 비활성(IDE/프리뷰 탭 표시 중)엔 투명화(스트림 유지). */}
        <View
          pointerEvents={activeIsTerm ? 'auto' : 'none'}
          // opacity:0 숨김 금지 — iOS 가 투명 WKWebView 를 잠재워 재표시 후 터치 이벤트가 죽는다
          //  (IdeBody 파일 탭과 동일 근원). 불투명 겹침 + zIndex 로만 전환.
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: activeIsTerm ? 1 : 0, elevation: activeIsTerm ? 1 : 0 }}
        >
        {!hasTerm ? null : err ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <Text style={{ color: C.error, fontSize: 12, textAlign: 'center' }}>터미널 연결 실패{'\n'}{err}</Text>
          </View>
        ) : !wsUrl ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : (
          <TerminalWebView
            ref={termRef}
            wsUrl={wsUrl}
            // 입력 포커스마다 select 재발행 — focusPane 은 이미 포커스면 no-op 이라 effect4 가
            //  안 타는데, 그 사이 다른 기기가 이 창을 자기 크기로 바꿨을 수 있다(TUI 어긋남).
            //  터치해서 입력하려는 순간이 "이 기기 크기로 봐야 하는" 순간이므로 여기서 회수한다.
            onFocusChange={(f) => {
              if (!f) { blurKeyTarget(kaId); return; }
              setKeyTarget(kaTarget);
              cb.onFocus(node.id);
              const w = node.tabs[node.active]?.win;
              if (typeof w === 'number') daemonService.selectTerminal(cwd, w, node.id, true).catch(() => { /* noop */ });
            }}
            // 실물키보드 패널 모디파이어 조합(Ctrl+글자)이 실제 실행됨 → once 해제
            onVmodConsume={consumeKeyMods}
            // 내부 터치 — 이미 포커스된 터미널은 focus 이벤트가 다시 안 떠서 위 경로가 안 타므로,
            //  터치 자체(웹뷰가 1.2s 스로틀)로도 크기를 회수한다. 포그라운드일 때만.
            onInteract={() => {
              if (AppState.currentState !== 'active') return;
              cb.onFocus(node.id);
              const w = node.tabs[node.active]?.win;
              if (typeof w === 'number') {
                daemonService.selectTerminal(cwd, w, node.id, true).catch(() => { /* noop */ });
                // 사용자가 실제로 이 터미널을 터치 = 알림 읽음(하이라이트 해제).
                cb.onTerminalRead(node.id, w);
              }
            }}
            onNotify={(t, b) => {
              // 알림 발생 시점의 활성 터미널 탭 win 을 함께 — 서버 알림의 pane(cwd,win) 스코프 귀속용.
              const w = node.tabs[node.active]?.win;
              cb.onNotify(node.id, typeof w === 'number' ? w : null, t, b);
            }}
            // (재)접속 성공 시 view/크기 재보정 — 서버가 재시작됐으면 attach 가 폴백 창을 비추는데,
            //  select 를 다시 쏴야 데몬이 실제 표시 창을 이 pane 클라이언트 크기로 resize 한다
            //  (웹뷰는 onopen 에서 resize 를 먼저 보내므로 이 시점 클라이언트 크기는 정확).
            //  포그라운드일 때만 — 백그라운드 기기의 재접속이 사용 중 기기의 크기를 뺏지 않게.
            // claim 없음 — 재접속 보정은 뷰/링크만. 재접속마다 크기를 주장하면 여러 기기의
            //  재접속이 서로 크기를 뺏어 프롬프트가 쌓인다. 크기는 사용자가 만질 때(claim) 회수.
            onWsOpen={() => {
              if (AppState.currentState !== 'active') return;
              const w = node.tabs[node.active]?.win;
              if (typeof w === 'number') daemonService.selectTerminal(cwd, w, node.id).catch(() => { /* noop */ });
            }}
          />
        )}
        </View>
        {/* IDE/프리뷰 탭 본문 — 활성화된 적 있는 탭은 유지(숨김)해 상태 보존. */}
        {node.tabs.map((t) => {
          if (isTermTab(t)) return null;
          const k = keyOf(t);
          if (!mountedMixed.current.has(k)) return null;
          const isActive = activeTab === t;
          return (
            <View
              key={k}
              pointerEvents={isActive ? 'auto' : 'none'}
              style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: isActive ? 1 : 0, elevation: isActive ? 1 : 0 }}
            >
              {t.kind === 'ide' ? (
                <IdeBody
                  root={cwd}
                  controlKey={k}
                  treeVisible={ideTree[k] ?? true}
                  initialOpenPath={t.openPath || null}
                  onOpenPathChange={(rel) => patchTabByKey(k, { openPath: rel })}
                  initialLayout={t.ideLayout}
                  onLayoutChange={(l) => patchTabByKey(k, { ideLayout: l })}
                />
              ) : (
                <PreviewSlot k={k} cwd={cwd} url={t.url || ''} active={isActive} onUrlChange={(u) => patchTabByKey(k, { url: u })} />
              )}
            </View>
          );
        })}
      </View>
    </>
  );
}

// 드래그 가능한 탭 — PC 처럼 탭 자체가 드래그 핸들(별도 그립 없음). 탭=이동 없으면 전환, 롱프레스+이동=탭 드래그.
function DraggableTab({ node, i, active, focused, label, kind, favicon, maxW, dragSrc, onTabPress, onTabClose, cb }: {
  node: TerminalLeaf; i: number; active: boolean; focused: boolean; label: string;
  kind: 'term' | 'ide' | 'preview';
  favicon?: string;
  maxW: number;
  dragSrc: DragSrc | null;
  onTabPress: (i: number) => void; onTabClose: (i: number) => void; cb: PaneCallbacks;
}) {
  const drag = useDragHandle(node.id, label, i, cb);
  // 드래그 중인 원본 탭은 흐리게 — "이 자리는 비워질 것"을 표현(예상 위치와 결과 일치감).
  const isDragSrc = !!dragSrc && dragSrc.paneId === node.id && dragSrc.tabIndex === i;
  // 탭 rect 등록 — 탭바 드롭(순서 재배치 인서트 라인) 히트테스트용. 드래그 시작 시 measureAll 로 재측정.
  const tabRef = useRef<View>(null);
  const measure = useCallback(() => {
    tabRef.current?.measure((_x, _y, w, h, px, py) => { if (w && h) setTabRect(node.id, i, { x: px, y: py, w, h }); });
  }, [node.id, i]);
  useEffect(() => {
    registerMeasurer(`${node.id}#${i}`, measure);
    return () => { unregisterMeasurer(`${node.id}#${i}`); removeTabRect(node.id, i); };
  }, [node.id, i, measure]);
  // 액티브 상단선(초록)은 "이 pane 이 포커스됐고 + 그 pane 의 활성 탭"일 때만 — PC 처럼 포커스된 하나만.
  const hot = active && focused;
  return (
    <View ref={tabRef} onLayout={measure} {...drag.panHandlers} onTouchEnd={drag.onTouchEnd} onTouchCancel={drag.onTouchEnd}
      style={{ flexShrink: 0, maxWidth: maxW, opacity: isDragSrc ? 0.35 : 1 }}>
      {/* 탭을 누르면 그 pane 을 포커스(초록 상단선 이동) + 탭 전환 — PC 처럼 탭 클릭이 곧 pane 포커스. */}
      <Pressable onPress={() => {
          cb.onFocus(node.id); onTabPress(i);
          // 탭 클릭 = 그 터미널을 직접 열어봄 → 알림 읽음.
          const t = node.tabs[i];
          if (isTermTab(t) && typeof t?.win === 'number') cb.onTerminalRead(node.id, t.win);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 34, backgroundColor: active ? C.base : 'transparent', borderTopWidth: 2, borderTopColor: hot ? C.accent : 'transparent' }}>
        {kind === 'ide' ? (
          <Code size={13} color={active ? C.text2 : C.textDim} />
        ) : kind === 'preview' ? (
          <TabFavicon uri={favicon} active={active} />
        ) : (
          <TerminalWindow size={13} color={active ? C.text2 : C.textDim} />
        )}
        <Text style={{ color: active ? C.text : C.textDim, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
        <Pressable onPress={() => onTabClose(i)} hitSlop={6}><X size={11} color={C.textDim} /></Pressable>
      </Pressable>
    </View>
  );
}

// ── 헤더(탭 + 컨트롤) — PC pane.js 미러: 그립 없음, 오른쪽 [새터미널·splitRight·splitDown·IDE·프리뷰]. 닫기는 탭 x. ──
function PaneHeader({
  node, focused, onTabPress, onTabClose, cb, ideTreeToggle,
}: {
  node: TerminalLeaf;
  focused: boolean;
  onTabPress: (i: number) => void;
  onTabClose: (i: number) => void;
  cb: PaneCallbacks;
  // 활성 탭이 IDE 일 때 탐색기 토글(혼합 탭 전용 — PC pane 헤더의 IDE 토글 미러).
  ideTreeToggle?: { open: boolean; onPress: () => void } | null;
}) {
  // AI 실행 버튼 — 에이전트가 실행 중이 아닐 때만 노출(실행되면 숨김). 우측 하단 FAB 대체.
  const ai = useAiControl();
  // 프리뷰 탭 메타(제목/파비콘) 변경 시 리렌더 — cmux 처럼 탭이 열린 페이지를 표현.
  usePreviewMetaVersion();
  // 탭 최대폭 = 화면 폭 비례(회전하면 따라 변함) — 넘치면 탭바가 가로 스크롤.
  const { width: winW } = useWindowDimensions();
  const tabMaxW = Math.max(96, Math.min(220, Math.round(winW * 0.26)));
  // 스크롤 vs 롱프레스 드래그 공존: 픽업은 220ms 정지 후 성립(빠른 스와이프=스크롤로 넘어가고
  //  픽업 타이머는 취소됨), 픽업 성립 순간 dragSrc 가 세팅돼 scrollEnabled 를 끈다.
  //  네이티브 스크롤이 터치를 가로채면 탭의 onTouchCancel 이 타이머를 정리한다(유령 드래그 방지).
  const dragSrc = useDragSrc();
  // 드래그 중 끝단 자동 스크롤용 — 스크롤러 등록(오프셋/범위는 ref, scrollBy 는 클램프 이동).
  const svRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const contentWRef = useRef(0);
  const viewWRef = useRef(0);
  useEffect(() => {
    registerTabScroller(node.id, {
      scrollBy: (dx: number) => {
        const max = Math.max(0, contentWRef.current - viewWRef.current);
        const nx = Math.max(0, Math.min(max, scrollXRef.current + dx));
        if (Math.abs(nx - scrollXRef.current) < 0.5) return false;
        scrollXRef.current = nx;
        svRef.current?.scrollTo({ x: nx, animated: false });
        return true;
      },
    });
    return () => unregisterTabScroller(node.id);
  }, [node.id]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 34, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
      <ScrollView
        ref={svRef}
        horizontal
        style={{ flex: 1 }}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!dragSrc}
        keyboardShouldPersistTaps="always"
        bounces={false}
        alwaysBounceHorizontal={false}
        overScrollMode="never"
        scrollEventThrottle={32}
        onScroll={(e) => { scrollXRef.current = e.nativeEvent.contentOffset.x; }}
        onContentSizeChange={(w) => { contentWRef.current = w; }}
        onLayout={(e) => { viewWRef.current = e.nativeEvent.layout.width; }}
      >
        {node.tabs.map((t, i) => (
          <DraggableTab key={`${node.id}-${i}`} node={node} i={i} active={i === node.active} focused={focused}
            kind={t.kind && t.kind !== 'term' ? t.kind : 'term'}
            label={
              t.kind === 'ide' ? 'IDE'
              : t.kind === 'preview' ? (previewMeta.get(keyOf(t))?.title || '프리뷰')
              : termTabLabel(t)
            }
            favicon={t.kind === 'preview' ? previewMeta.get(keyOf(t))?.favicon : undefined}
            maxW={tabMaxW} dragSrc={dragSrc}
            onTabPress={onTabPress} onTabClose={onTabClose} cb={cb} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, gap: 1 }}>
        {ideTreeToggle ? (
          <HBtn onPress={ideTreeToggle.onPress}><SidebarSimple size={15} color={ideTreeToggle.open ? C.accent : C.textDim} /></HBtn>
        ) : null}
        {!AI_HYBRID_HIDDEN && !ai.hasSession ? (
          <HBtn onPress={ai.openOrStart}><Sparkle size={15} color={C.accent} weight="fill" /></HBtn>
        ) : null}
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

// ── 프리뷰 본문(cmux식 툴바 + WebView) — 독립 pane 과 혼합 탭이 공용 ──
//  툴바: ‹ › ↻ [주소창] ☀(페이지 다크) 🛠(개발자도구=Chrome DevTools) ↗(외부 브라우저) — PC preview-bar 와 동일 구성.
// html 배경은 filter 로 함께 반전되므로 밝은색(#fff)을 지정해야 결과가 어두워진다.
const PREVIEW_DARK_ON = `(function(){var d=document.documentElement;if(document.getElementById('__cpt_dark'))return;var s=document.createElement('style');s.id='__cpt_dark';s.textContent='html{filter:invert(1) hue-rotate(180deg)!important;background:#fff!important}img,video,canvas,iframe,embed,object,svg image{filter:invert(1) hue-rotate(180deg)!important}';(document.head||d).appendChild(s);})();true;`;
const PREVIEW_DARK_OFF = `(function(){var s=document.getElementById('__cpt_dark');if(s)s.remove();})();true;`;
// 페이지 메타(제목/파비콘) 보고 — 로드/SPA 전환 대비 저빈도 반복.
const PREVIEW_META_JS = `(function(){function send(){try{var l=document.querySelector('link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]');var f=l&&l.href?l.href:(location.origin+'/favicon.ico');window.ReactNativeWebView.postMessage(JSON.stringify({__cptMeta:1,title:document.title||'',favicon:f}));}catch(e){}}send();setTimeout(send,1200);setInterval(send,4000);})();true;`;
// ── 개발자 도구(PC 수준) — 진짜 Chrome DevTools 프론트엔드(chii) + 페이지 내 CDP 구현체(chobitsu) ──
//  구조: 프리뷰 페이지에 chobitsu 를 주입(CSP 우회: RN fetch 소스를 injectJavaScript — eruda 때와 동일 경로)하고,
//  DevTools 프론트엔드는 "별도 WebView" 에 상주시켜 RN 이 CDP 메시지를 양방향 릴레이한다.
//  → 프리뷰를 새로고침해도 DevTools WebView 는 그대로(PC WebKit 인스펙터와 동일 UX),
//    요소 선택(inspect)·엘리먼트 트리·콘솔·네트워크 등 실제 DevTools 기능이 동작한다.
const CDN_CHOBITSU = 'https://cdn.jsdelivr.net/npm/chobitsu@1.8.6';
const CDN_CHII_FE = 'https://cdn.jsdelivr.net/npm/chii@1.15.5/public/front_end/';
let chobitsuSrcCache: string | null = null;
async function loadChobitsuSource(): Promise<string | null> {
  if (chobitsuSrcCache) return chobitsuSrcCache;
  try {
    const r = await fetch(CDN_CHOBITSU);
    if (!r.ok) return null;
    chobitsuSrcCache = await r.text();
    return chobitsuSrcCache;
  } catch (_) { return null; }
}
// 프리뷰 페이지 부트 — chobitsu 전역 로드 + 나가는 CDP 를 RN 으로 중계.
function chobitsuBootJs(src: string): string {
  return (
    '(function(){if(window.__cptCdp)return;try{' + src +
    '\n;window.__cptCdp=1;window.chobitsu.setOnMessage(function(s){window.ReactNativeWebView.postMessage(JSON.stringify({__cptCdpOut:String(s)}));});' +
    '}catch(e){}})();true;'
  );
}
// DevTools 프론트엔드 브리지 — chii_app.html 최상단에 삽입:
//  ① ?ws=cpt 위장(replaceState) → 프론트엔드가 WebSocket 트랜스포트를 선택
//  ② window.WebSocket 을 RN 릴레이 FakeWebSocket 으로 교체(진짜 소켓 없이 CDP 를 RN 경유로)
//  ③ __cptDeliver(문자열) = RN → 프론트엔드 CDP 수신 진입점
const DEVTOOLS_BRIDGE = `<script>
(function(){
  function rlog(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify({ __cptDt: 'log', msg: String(m).slice(0, 400) })); } catch (e) {} }
  window.addEventListener('error', function (e) { rlog('err: ' + (e.message || (e.target && (e.target.src || e.target.href)) || '') + ' @' + (e.filename || '') + ':' + (e.lineno || 0)); }, true);
  // 도킹 레이아웃 통지 — DevTools 는 자기 창 전체를 차지하고 "페이지가 놓일 영역"을
  //  setInspectedPageBounds 로 알린다(실제 Chrome 구조). RN 이 그 rect 에 프리뷰를 겹쳐 놓는다.
  var biv = setInterval(function () {
    var h = window.InspectorFrontendHost;
    if (!h || !h.setInspectedPageBounds || h.__cptPatched) return;
    h.__cptPatched = true;
    clearInterval(biv);
    var ob = h.setInspectedPageBounds.bind(h);
    h.setInspectedPageBounds = function (b) {
      window.__cptB = b; // 최신 인스펙티드 영역(진단·경계 계산용)
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ __cptDt: 'bounds', b: b })); } catch (e) {}
      return ob(b);
    };
    // 도킹 툴바의 ✕(닫기) — 임베더 창 닫기 요청을 패널 닫기로 매핑.
    h.closeWindow = function () {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ __cptDt: 'dock', side: 'undocked' })); } catch (e) {}
    };
  }, 50);
  // RN 경계 손잡이 → DevTools 루트 리사이저 합성 포인터 드라이브.
  //  경계 좌표(bx,by)에서 가장 가까운 리사이저를 잡고, 이후 move/end 는 델타만 정확하면 된다
  //  (SplitWidget 드래그 수학은 시작점 대비 델타 기반).
  function cptFindResizer(x, y, vertBoundary) {
    var best = null, bd = 1e9;
    (function walk(root) {
      var els = root.querySelectorAll('.shadow-split-widget-resizer');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (String(el.className).indexOf('hidden') >= 0) continue;
        var v = getComputedStyle(el).cursor === 'ew-resize';
        if (v !== !!vertBoundary) continue;
        var r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        var d = v ? Math.abs((r.x + r.width / 2) - x) : Math.abs((r.y + r.height / 2) - y);
        if (d < bd) { bd = d; best = el; }
      }
      var all = root.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) if (all[j].shadowRoot) walk(all[j].shadowRoot);
    })(document);
    return bd <= 60 ? best : null;
  }
  // 합성 pointerId 에 setPointerCapture 가 NotFoundError 를 던져 드래그 핸들러가 죽는 것 방지.
  try {
    var ospc = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function (id) { try { return ospc.call(this, id); } catch (e) {} };
    var orpc = Element.prototype.releasePointerCapture;
    Element.prototype.releasePointerCapture = function (id) { try { return orpc.call(this, id); } catch (e) {} };
  } catch (e) {}
  function cptPE(type, x, y, down) {
    // composed:true 필수 — 리사이저가 shadow DOM 안이라 이게 없으면 document 레벨
    //  드래그 리스너(pointermove/up)까지 전파되지 않는다.
    return new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, pointerType: 'mouse', clientX: x, clientY: y, pointerId: 9999, isPrimary: true, button: down ? 0 : (type === 'pointerup' ? 0 : -1), buttons: down ? 1 : 0 });
  }
  window.__cptResizeStart = function (x, y, vertBoundary) {
    try {
      var el = cptFindResizer(x, y, vertBoundary);
      if (!el) return;
      window.__cptRz = el;
      el.dispatchEvent(cptPE('pointerdown', x, y, true));
    } catch (e) {}
  };
  window.__cptResizeMove = function (x, y) {
    var el = window.__cptRz;
    if (!el) return;
    try { el.dispatchEvent(cptPE('pointermove', x, y, true)); } catch (e) {}
  };
  window.__cptResizeEnd = function (x, y) {
    var el = window.__cptRz;
    window.__cptRz = null;
    if (!el) return;
    try { el.dispatchEvent(cptPE('pointerup', x, y, false)); } catch (e) {}
  };
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; rlog('rej: ' + (r && (r.message || r)) ); });
  try { localStorage.setItem('uiTheme', '"dark"'); } catch (e) {}
  // 모바일 정리 — ① 외부창 열기 차단(undock 등이 외부 브라우저로 새는 것 방지)
  //  ② chii 의 screencast 토글(프리뷰가 바로 옆이라 무용, 디바이스 모드 아이콘과 중복돼 보임)과
  //  ③ Dock side 의 undock 버튼(모바일에선 별도 창이 없음)을 숨긴다. 메뉴는 열릴 때 생기므로 주기 스캔.
  try { window.open = function () { return null; }; } catch (e) {}
  function cptSweep(root, acc) {
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var a = (el.getAttribute && el.getAttribute('aria-label')) || '';
      if (a && (a === 'Toggle screencast' || /undock|도킹 해제/i.test(a))) el.style.display = 'none';
      var cls = String(el.className || '');
      // 도킹/패널 경계 리사이저(기본 6px)는 터치로 못 잡는다 — 22px 히트존 + 손잡이 필.
      //  도킹 방향이 바뀌면 같은 요소가 방향만 바뀌어 재사용되므로 방향 변화 시 재적용.
      if (cls.indexOf('shadow-split-widget-resizer') >= 0 && cls.indexOf('hidden') < 0) {
        var vert = getComputedStyle(el).cursor === 'ew-resize';
        if (el.__cptFatV !== vert) {
          el.__cptFatV = vert;
          el.style.width = vert ? '22px' : '';
          el.style.marginLeft = vert ? '-8px' : '';
          el.style.height = vert ? '' : '22px';
          el.style.marginTop = vert ? '' : '-8px';
          if (el.__cptGrip && el.__cptGrip.parentNode) el.__cptGrip.parentNode.removeChild(el.__cptGrip);
          var grip = document.createElement('div');
          grip.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;border-radius:3px;background:rgba(255,255,255,.38);' +
            (vert ? 'width:4px;height:38px;' : 'width:38px;height:4px;');
          el.appendChild(grip);
          el.__cptGrip = grip;
        }
      }
      if (el.tagName === 'BUTTON' && cls.indexOf('toolbar-button') >= 0) acc.tb.push(el);
      if (el.shadowRoot) cptSweep(el.shadowRoot, acc); // 툴바 등은 shadow DOM 안에 있다
    }
  }
  function cptSweepAll() {
    try {
      var acc = { tb: [] };
      cptSweep(document, acc);
      // WebKit: absolute 포지션 툴바 버튼(✕)의 기준 요소 해석이 달라 이웃 버튼(⋮) 위에 겹친다
      //  → 겹침을 감지하면 flow 로 되돌린다(라벨 무관·엔진 무관, 겹칠 때만 발동).
      for (var i = 0; i < acc.tb.length; i++) {
        var el = acc.tb[i];
        if (getComputedStyle(el).position !== 'absolute') continue;
        var r = el.getBoundingClientRect();
        if (!r.width) continue;
        for (var j = 0; j < acc.tb.length; j++) {
          if (i === j) continue;
          var o = acc.tb[j].getBoundingClientRect();
          if (o.width && Math.abs(o.x - r.x) < r.width * 0.7 && Math.abs(o.y - r.y) < r.height * 0.7) {
            el.style.position = 'static';
            break;
          }
        }
      }
    } catch (e) {}
  }
  setInterval(cptSweepAll, 1200);
  // 메뉴(Dock side 등)는 열리는 순간 생성되므로 주기 스캔만으론 undock 이 한 틱 보였다 사라진다
  //  → 포인터다운/클릭 직후 프레임에 즉시 스캔해 뜨기 전에 숨긴다.
  function cptSweepSoon() {
    if (window.requestAnimationFrame) requestAnimationFrame(cptSweepAll);
    setTimeout(cptSweepAll, 0);
    setTimeout(cptSweepAll, 80);
  }
  document.addEventListener('pointerdown', cptSweepSoon, true);
  document.addEventListener('click', cptSweepSoon, true);
  // 정식 Dock side UI(⋮ 메뉴) 활성 — can_dock=true 면 DevTools 가 도킹 버튼을 그린다.
  //  선택 결과는 currentDockState 설정(localStorage)에 저장·복원되므로 setItem 을 가로채 RN 에 알린다.
  try { if (localStorage.getItem('currentDockState') === '"undocked"') localStorage.setItem('currentDockState', '"bottom"'); } catch (e) {}
  try {
    // 주의: localStorage.setItem 에 직접 대입하면 Storage named setter 가 "setItem" 항목으로
    //  저장해 메서드가 문자열로 가려진다(설정 저장 전부 TypeError) → 프로토타입을 패치한다.
    var ols = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      ols.call(this, k, v);
      if (k === 'currentDockState') {
        try { window.ReactNativeWebView.postMessage(JSON.stringify({ __cptDt: 'dock', side: JSON.parse(v) })); } catch (e) {}
      }
    };
  } catch (e) {}
  try { history.replaceState(null, '', location.pathname + '?ws=cpt&can_dock=true'); } catch (e) {}
  function FakeWS(url) {
    var self = this;
    this.url = String(url || '');
    this.readyState = 0;
    this.binaryType = 'blob';
    this._ls = { open: [], message: [], close: [], error: [] };
    window.__cptWs = this;
    setTimeout(function () {
      self.readyState = 1;
      var ev = { type: 'open', target: self };
      if (self.onopen) self.onopen(ev);
      self._ls.open.slice().forEach(function (f) { try { f(ev); } catch (e) {} });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ __cptDt: 'open' }));
    }, 30);
  }
  FakeWS.prototype.send = function (d) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ __cptDt: 'cdp', data: String(d) }));
  };
  FakeWS.prototype.close = function () { this.readyState = 3; };
  FakeWS.prototype.addEventListener = function (t, f) { (this._ls[t] = this._ls[t] || []).push(f); };
  FakeWS.prototype.removeEventListener = function (t, f) { var a = this._ls[t] || []; var i = a.indexOf(f); if (i >= 0) a.splice(i, 1); };
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
  window.__cptDeliver = function (d) {
    var ws = window.__cptWs;
    if (!ws || ws.readyState !== 1) return;
    var ev = { type: 'message', data: d, target: ws };
    if (ws.onmessage) ws.onmessage(ev);
    (ws._ls.message || []).slice().forEach(function (f) { try { f(ev); } catch (e) {} });
  };
})();
</script>`;
// chii_app.html 은 CDN 이 text/plain 으로 서빙해 URL 직접 로드가 안 됨 → fetch 해서
//  브리지를 삽입한 뒤 source={{ html, baseUrl }} 로 로드(모듈 스크립트는 baseUrl 기준 해석).
let devtoolsHtmlCache: string | null = null;
async function loadDevtoolsHtml(): Promise<string | null> {
  if (devtoolsHtmlCache) return devtoolsHtmlCache;
  try {
    const r = await fetch(CDN_CHII_FE + 'chii_app.html');
    if (!r.ok) return null;
    const raw = await r.text();
    // 커스텀 빌트인 엘리먼트 폴리필을 무조건 선로드 — chii 는 UA 의 "Safari" 토큰으로만 로드하는데
    //  RN WKWebView UA 엔 그 토큰이 없어 devtools-button 등이 미업그레이드로 남아 부팅이 죽는다.
    const polyfill = '<script src="./third_party/polyfill/customElement.js"></' + 'script>';
    // viewport 메타가 원본에 없어 Android WebView 가 데스크톱 가상폭(~980px)으로 그려
    //  좁은 화면에서 축소·찌그러짐 + 핀치줌이 생긴다 → 실폭 렌더로 DevTools 자체 반응형을 살린다.
    const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">';
    devtoolsHtmlCache = raw.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + viewport + DEVTOOLS_BRIDGE + polyfill);
    return devtoolsHtmlCache;
  } catch (_) { return null; }
}
// 리로드 리플레이 응답 식별용 id 대역(릴레이에서 프론트엔드로 안 보내고 드랍).
const CDP_REPLAY_ID_BASE = 900000000;

function PvBtn({ onPress, disabled, active, children }: { onPress: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={4}
      style={{ width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1, backgroundColor: active ? C.elevated2 : 'transparent' }}>
      {children}
    </Pressable>
  );
}

function PreviewBody({ cwd, url, metaKey, onUrlChange }: { cwd: string; url: string; metaKey: string; onUrlChange: (u: string) => void }) {
  const [input, setInput] = useState(url || '');
  const [webUrl, setWebUrl] = useState<string | null>(null); // 실제 WebView 에 로드할 URL(데브서버는 프록시)
  const [busy, setBusy] = useState(false);
  const [nav, setNav] = useState({ canBack: false, canFwd: false });
  const [dark, setDark] = useState(false);
  const darkRef = useRef(dark); darkRef.current = dark;
  const webRef = useRef<WebView>(null);
  const editingRef = useRef(false); // 주소창 편집 중엔 내비게이션이 입력을 덮지 않게
  const proxyRef = useRef(false); // 데브서버 프록시면 주소창은 :포트 표기 유지
  const curUrlRef = useRef(''); // 실제 현재 페이지 URL(외부 열기·자동화 오리진 가드용)
  const webUrlRef = useRef(webUrl); webUrlRef.current = webUrl;
  // ── browser.* 자동화(previewAutomation) — 페이지 명령 대기표 + 스크린샷 캡처 대상 ──
  const shotRef = useRef<View>(null); // captureRef 대상 — 프리뷰 WebView 를 감싼 실제 렌더 영역(pv-body)
  const shotSizeRef = useRef({ w: 0, h: 0 });
  // id → resolve/reject(onMessage 의 __cptAgentOut 이 매칭). 30s 타임아웃.
  const agentPendingRef = useRef(new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const agentSeqRef = useRef(0);

  const load = useCallback(async (raw: string) => {
    const u = (raw || '').trim();
    if (!u) return;
    setBusy(true);
    try {
      const portOnly = /^:?\d+$/.test(u);
      const localMatch = /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::(\d+))?/i.exec(u);
      const isUrl = /^https?:\/\//i.test(u);
      const isDomain = /^[\w-]+(\.[\w-]+)+([:/?#]|$)/.test(u);
      if (portOnly || localMatch) {
        // 원격 호스트 데브서버 → 프록시 토큰 URL 로드.
        const port = portOnly ? parseInt(u.replace(':', ''), 10) : parseInt((localMatch && localMatch[1]) || '80', 10);
        const { token } = await daemonService.previewStart(port);
        proxyRef.current = true;
        setWebUrl(daemonService.buildDaemonPreviewUrl(token));
        onUrlChange(':' + port);
        setInput(':' + port);
      } else {
        const full = isUrl ? u : (isDomain ? 'https://' + u : 'https://www.google.com/search?q=' + encodeURIComponent(u));
        proxyRef.current = false;
        setWebUrl(full);
        onUrlChange(full);
        setInput(full);
      }
    } catch (e) {
      // noop — 잘못된 포트/오프라인
    } finally {
      setBusy(false);
    }
  }, [onUrlChange]);

  // 저장된 url 복원(데브서버 포트면 재프록시).
  useEffect(() => { if (url) void load(url); /* 최초 1회 */ /* eslint-disable-next-line */ }, []);

  // ui_command 브리지 제어 채널 — previewOpen/previewNavigate(load)·previewReload(reload)를
  //  이 인스턴스로 중계한다(키 = 표면 ID metaKey).
  useEffect(() => registerPreviewControl(metaKey, {
    load: (u: string) => { void load(u); },
    reload: () => { webRef.current?.reload(); },
  }), [metaKey, load]);

  // browser.* 자동화 등록 — run: pageAgent 주입 후 __cptAgentRun 호출, 결과는 onMessage 매칭.
  //  로드/내비게이션마다 문서가 갈려 에이전트가 사라질 수 있으므로 매 호출 주입(멱등 가드로 안전).
  //  오리진 가드: 페이지를 바꾸는 명령(click/type/fill/eval)은 로컬 개발 서버(localhost/데몬 프록시)만.
  useEffect(() => registerAutomation(metaKey, {
    run: (method, args) => new Promise((resolve, reject) => {
      const w = webRef.current;
      const cur = curUrlRef.current || webUrlRef.current || '';
      if (!w || !cur) { reject(new Error('프리뷰에 로드된 페이지가 없어요')); return; }
      if (AUTOMATION_MUTATING.has(method) && !isAutomationAllowedOrigin(cur)) {
        reject(new Error('허용되지 않은 오리진(로컬 개발 서버만 자동화 가능)')); return;
      }
      const id = 'a' + (++agentSeqRef.current);
      const timer = setTimeout(() => {
        agentPendingRef.current.delete(id);
        reject(new Error('페이지 응답 시간 초과(30초)'));
      }, 30000);
      agentPendingRef.current.set(id, { resolve, reject, timer });
      w.injectJavaScript(PAGE_AGENT_JS);
      w.injectJavaScript('window.__cptAgentRun&&window.__cptAgentRun(' + JSON.stringify(id) + ',' + JSON.stringify(method) + ',' + JSON.stringify(JSON.stringify(args || {})) + ');true;');
    }),
    // screenshot 은 RN 측(captureRef) — pageAgent 가 아니라 여기서 직접 캡처한다.
    screenshot: async () => {
      // 신규 네이티브 의존성(react-native-view-shot)은 지연 require — 미설치 상태에서 다른 기능이 죽지 않게.
      let captureRef: (ref: unknown, opts: Record<string, unknown>) => Promise<string>;
      try {
        captureRef = require('react-native-view-shot').captureRef;
      } catch (_) {
        throw new Error('react-native-view-shot 미설치 — pod install/재빌드가 필요해요');
      }
      const v = shotRef.current;
      if (!v || !webUrlRef.current) throw new Error('프리뷰에 로드된 페이지가 없어요');
      // 긴 변 1200px 리사이즈(비율 유지) — captureRef 의 width/height 는 결과 이미지 크기.
      const { w: cw, h: ch } = shotSizeRef.current;
      const long = Math.max(cw, ch);
      const scale = long > 1200 ? 1200 / long : 1;
      const size = cw > 0 && ch > 0 ? { width: Math.round(cw * scale), height: Math.round(ch * scale) } : {};
      const base64 = await captureRef(v, { format: 'jpg', quality: 0.6, result: 'base64', ...size });
      return { format: 'jpeg' as const, base64 };
    },
  }), [metaKey]);

  const detectPort = useCallback(async () => {
    try {
      const ports = await daemonService.previewPorts(cwd);
      if (ports.length) void load(String(ports[0]));
    } catch (_) { /* noop */ }
  }, [load, cwd]);

  const toggleDark = useCallback(() => {
    setDark((v) => {
      webRef.current?.injectJavaScript(v ? PREVIEW_DARK_OFF : PREVIEW_DARK_ON);
      return !v;
    });
  }, []);

  // 개발자도구(chii DevTools) — 프론트엔드는 별도 WebView 에 상주(프리뷰 리로드와 무관하게 유지).
  const [tools, setTools] = useState(false);
  const toolsRef = useRef(tools); toolsRef.current = tools;
  const [dtHtml, setDtHtml] = useState<string | null>(null);
  const dtRef = useRef<WebView>(null);
  const enableLogRef = useRef<Map<string, string>>(new Map()); // 프론트엔드가 켠 *.enable 명령(리로드 리플레이용)
  const replayIdRef = useRef(CDP_REPLAY_ID_BASE);
  const bodyHRef = useRef(0);
  const bodyWRef = useRef(0);
  // 인스펙티드 페이지 영역 — DevTools(can_dock)가 도킹 전환/divider 리사이즈 때마다
  //  setInspectedPageBounds 로 알려주는 rect(CSS px=dp). 프리뷰 WebView 를 이 위치에 겹친다
  //  (실제 Chrome 도킹 구조: DevTools 가 pane 전체, 빈 영역=페이지 자리 — 도킹 UI/드래그는 DevTools 자체).
  const [dtBounds, setDtBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // 경계 드래그 중 bounds 가 프레임마다 쏟아지면 프리뷰 WebView 네이티브 리사이즈 폭주로 버벅인다
  //  → 트레일링 스로틀(100ms): 드래그 중엔 10fps 로 따라가고 마지막 값은 반드시 반영.
  const dtBoundsPendingRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const dtBoundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueDtBounds = useCallback((b: { x: number; y: number; w: number; h: number }) => {
    dtBoundsPendingRef.current = b;
    if (dtBoundsTimerRef.current) return;
    dtBoundsTimerRef.current = setTimeout(() => {
      dtBoundsTimerRef.current = null;
      if (dtBoundsPendingRef.current) setDtBounds(dtBoundsPendingRef.current);
    }, 100);
  }, []);
  // 도킹 방향 유추(bounds 기하): 페이지가 상단 풀폭=bottom / 좌측 풀높이=right / x>0=left.
  const dtSide: 'bottom' | 'right' | 'left' = !dtBounds
    ? 'bottom'
    : dtBounds.w >= (bodyWRef.current || 0) - 2 ? 'bottom' : dtBounds.x > 1 ? 'left' : 'right';
  const dtSideRef = useRef(dtSide); dtSideRef.current = dtSide;
  const dtBoundsRef = useRef(dtBounds); dtBoundsRef.current = dtBounds;

  // 경계 손잡이 드래그 — RN 이 제스처를 받고 DevTools 루트 리사이저에 합성 포인터로 중계.
  //  좌표는 시작점 대비 델타만 정확하면 된다(SplitWidget 드래그 수학이 델타 기반).
  const dtDragBase = useRef({ x: 0, y: 0, bx: 0, by: 0 });
  const dtHandlePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const b = dtBoundsRef.current;
        if (!b) return;
        const side = dtSideRef.current;
        const vert = side !== 'bottom';
        const bx = side === 'bottom' ? Math.round(b.x + b.w / 2) : side === 'right' ? b.w : b.x;
        const by = side === 'bottom' ? b.h : Math.round(b.y + b.h / 2);
        dtDragBase.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, bx, by };
        dtRef.current?.injectJavaScript('window.__cptResizeStart&&window.__cptResizeStart(' + bx + ',' + by + ',' + vert + ');true;');
      },
      onPanResponderMove: (e) => {
        const d = dtDragBase.current;
        const x = Math.round(d.bx + (e.nativeEvent.pageX - d.x));
        const y = Math.round(d.by + (e.nativeEvent.pageY - d.y));
        dtRef.current?.injectJavaScript('window.__cptResizeMove&&window.__cptResizeMove(' + x + ',' + y + ');true;');
      },
      onPanResponderRelease: (e) => {
        const d = dtDragBase.current;
        const x = Math.round(d.bx + (e.nativeEvent.pageX - d.x));
        const y = Math.round(d.by + (e.nativeEvent.pageY - d.y));
        dtRef.current?.injectJavaScript('window.__cptResizeEnd&&window.__cptResizeEnd(' + x + ',' + y + ');true;');
      },
      onPanResponderTerminate: () => {
        dtRef.current?.injectJavaScript('window.__cptResizeEnd&&window.__cptResizeEnd(0,0);true;');
      },
    }),
  ).current;

  // 프리뷰 페이지에 chobitsu 주입(문서 단위 — 리로드/내비게이션마다 재주입 필요).
  const injectChobitsu = useCallback(async () => {
    const src = await loadChobitsuSource();
    const w = webRef.current;
    if (!src || !w || !toolsRef.current) return;
    w.injectJavaScript(chobitsuBootJs(src));
  }, []);

  // 프리뷰가 새 문서를 로드했을 때 DevTools 를 리로드 없이 재동기화:
  //  chobitsu 재주입 → 켜져 있던 도메인 re-enable(응답은 릴레이가 드랍) → 프론트엔드에
  //  executionContextsCleared + DOM.documentUpdated 를 전달해 패널들이 새 문서를 다시 읽게 한다.
  const resyncDevtools = useCallback(async () => {
    await injectChobitsu();
    const w = webRef.current;
    const dt = dtRef.current;
    if (!w || !dt || !toolsRef.current) return;
    enableLogRef.current.forEach((raw) => {
      try {
        const m = JSON.parse(raw);
        m.id = replayIdRef.current++;
        w.injectJavaScript('window.chobitsu&&window.chobitsu.sendRawMessage(' + JSON.stringify(JSON.stringify(m)) + ');true;');
      } catch (_) { /* noop */ }
    });
    ['{"method":"Runtime.executionContextsCleared","params":{}}', '{"method":"DOM.documentUpdated","params":{}}'].forEach((s) => {
      dt.injectJavaScript('window.__cptDeliver&&window.__cptDeliver(' + JSON.stringify(s) + ');true;');
    });
  }, [injectChobitsu]);

  const toggleDevtools = useCallback(async () => {
    const next = !toolsRef.current;
    setTools(next);
    toolsRef.current = next;
    if (next) {
      void injectChobitsu();
      if (!devtoolsHtmlCache) {
        const h = await loadDevtoolsHtml();
        if (h && toolsRef.current) setDtHtml(h);
      } else {
        setDtHtml(devtoolsHtmlCache);
      }
    }
  }, [injectChobitsu]);

  // DevTools WebView — pane 본문 전체를 깔고(도킹 UI·divider 리사이즈는 DevTools 가 자체 처리),
  //  닫힘엔 0 크기로 접어 인스턴스 유지(콘솔 히스토리·설정 보존).
  const panelEl = dtHtml ? (
    <View key="dt-panel" style={tools ? { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 } : { width: 0, height: 0, overflow: 'hidden' }}>
      <WebView
        ref={dtRef}
        source={{ html: dtHtml, baseUrl: CDN_CHII_FE }}
        style={{ flex: 1, backgroundColor: '#292a2d' }}
        originWhitelist={['*']}
        domStorageEnabled
        javaScriptEnabled
        // Android 핀치줌 차단 — DevTools 는 앱 UI 패널이지 문서가 아니다(줌되면 레이아웃 깨짐).
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        scalesPageToFit={false}
        textZoom={100}
        setSupportMultipleWindows={false}
        onMessage={(ev) => {
          try {
            const d = JSON.parse(ev.nativeEvent.data);
            if (!d || !d.__cptDt) return;
            if (d.__cptDt === 'log') {
              console.log('[CPT-DevTools]', d.msg); // 프론트엔드 오류 필드 디버깅용
            } else if (d.__cptDt === 'dock') {
              // Dock side 선택 자체는 bounds 통지가 레이아웃을 갱신 — undock 만 "패널 닫기"로 매핑.
              if (String(d.side) === 'undocked') { setTools(false); toolsRef.current = false; }
            } else if (d.__cptDt === 'bounds') {
              const b = d.b || {};
              if ([b.x, b.y, b.width, b.height].every((n: unknown) => typeof n === 'number')) {
                queueDtBounds({ x: b.x, y: b.y, w: b.width, h: b.height });
              }
            } else if (d.__cptDt === 'open') {
              void injectChobitsu(); // 프론트엔드 접속 시점에 페이지 쪽 CDP 준비 보장
            } else if (d.__cptDt === 'cdp') {
              const data = String(d.data);
              try {
                const m = JSON.parse(data);
                if (m && typeof m.method === 'string' && m.method.endsWith('.enable')) enableLogRef.current.set(m.method, data);
              } catch (_) { /* noop */ }
              webRef.current?.injectJavaScript('window.chobitsu&&window.chobitsu.sendRawMessage(' + JSON.stringify(data) + ');true;');
            }
          } catch (_) { /* noop */ }
        }}
      />
    </View>
  ) : null;

  return (
    <>
      {/* cmux식 툴바: 뒤로/앞으로/새로고침 + 주소창 + 테마/개발자도구/외부열기 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 5, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <PvBtn onPress={() => webRef.current?.goBack()} disabled={!nav.canBack}><CaretLeft size={15} color={C.text2} /></PvBtn>
        <PvBtn onPress={() => webRef.current?.goForward()} disabled={!nav.canFwd}><CaretRight size={15} color={C.text2} /></PvBtn>
        <PvBtn onPress={() => webRef.current?.reload()} disabled={!webUrl}><ArrowClockwise size={15} color={C.text2} /></PvBtn>
        <KeyTextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => load(input)}
          onFocus={() => { editingRef.current = true; }}
          onBlur={() => { editingRef.current = false; }}
          placeholder="URL 또는 포트 (예: 3000 · localhost:3000 · 날씨)"
          placeholderTextColor={C.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, marginHorizontal: 4, color: C.text, fontSize: 12, fontFamily: v2.font.mono, backgroundColor: C.elevated2, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
        />
        <PvBtn onPress={toggleDark} disabled={!webUrl} active={dark}><Sun size={15} color={dark ? C.accent : C.text2} /></PvBtn>
        <PvBtn onPress={() => { void toggleDevtools(); }} disabled={!webUrl} active={tools}><Wrench size={15} color={tools ? C.accent : C.text2} /></PvBtn>
        <PvBtn onPress={() => { const u = curUrlRef.current || webUrl || ''; if (u) Linking.openURL(u).catch(() => {}); }} disabled={!webUrl}><ArrowSquareOut size={15} color={C.text2} /></PvBtn>
      </View>
      <View
        style={{ flex: 1 }}
        onLayout={(e) => { bodyHRef.current = e.nativeEvent.layout.height; bodyWRef.current = e.nativeEvent.layout.width; }}
      >
        {/* DevTools 가 본문 전체를 깔고, 프리뷰는 DevTools 가 알려준 인스펙티드 영역 rect 위에 겹친다. */}
        {panelEl}
        <View
          key="pv-body"
          // browser.screenshot 캡처 대상 — 실제 WebView 를 감싼 뷰(승격 레이어 안에서도 이 뷰가 렌더 영역).
          ref={shotRef}
          collapsable={false}
          onLayout={(e) => { shotSizeRef.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}
          style={tools && dtHtml
            ? {
                position: 'absolute',
                left: (dtBounds?.x ?? 0),
                top: (dtBounds?.y ?? 0),
                width: dtBounds?.w ?? (bodyWRef.current || 0),
                height: dtBounds?.h ?? Math.round((bodyHRef.current || 0) * 0.5),
                backgroundColor: '#fff',
              }
            : { flex: 1, backgroundColor: '#fff' }}
        >
          {busy ? <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} /> : null}
          {webUrl ? (
            <WebView
              ref={webRef}
              source={{ uri: webUrl }}
              style={{ flex: 1 }}
              originWhitelist={['*']}
              injectedJavaScript={PREVIEW_META_JS}
              onNavigationStateChange={(e) => {
                setNav({ canBack: !!e.canGoBack, canFwd: !!e.canGoForward });
                if (e.url) curUrlRef.current = e.url;
                // 주소창 동기화 — 프록시(데브서버)는 :포트 표기 유지, 편집 중엔 안 덮음.
                if (e.url && !e.loading && !proxyRef.current && !editingRef.current) setInput(e.url);
                if (e.title) setPreviewMetaFor(metaKey, { title: e.title, favicon: previewMeta.get(metaKey)?.favicon });
              }}
              onMessage={(ev) => {
                try {
                  const d = JSON.parse(ev.nativeEvent.data);
                  if (d && d.__cptMeta) {
                    setPreviewMetaFor(metaKey, { title: d.title || previewMeta.get(metaKey)?.title, favicon: d.favicon || previewMeta.get(metaKey)?.favicon });
                  } else if (d && d.__cptAgentOut) {
                    // pageAgent(browser.* 자동화) 회신 — 대기표 매칭 후 resolve/reject.
                    const o = d.__cptAgentOut;
                    const pend = agentPendingRef.current.get(String(o.id));
                    if (pend) {
                      agentPendingRef.current.delete(String(o.id));
                      clearTimeout(pend.timer);
                      if (o.ok) pend.resolve(o.result);
                      else pend.reject(new Error(String(o.error || '페이지 실행 실패')));
                    }
                  } else if (d && d.__cptCdpOut) {
                    // 페이지(chobitsu) → DevTools 프론트엔드. 리플레이 응답(id 대역)은 드랍.
                    const s = String(d.__cptCdpOut);
                    try {
                      const m = JSON.parse(s);
                      if (m && typeof m.id === 'number' && m.id >= CDP_REPLAY_ID_BASE) return;
                    } catch (_) { /* noop */ }
                    dtRef.current?.injectJavaScript('window.__cptDeliver&&window.__cptDeliver(' + JSON.stringify(s) + ');true;');
                  }
                } catch (_) { /* noop */ }
              }}
              // 내비게이션/리로드마다 다크 필터·CDP(chobitsu) 재주입 — 문서가 갈리면 페이지 상태가 사라짐.
              //  DevTools 프론트엔드 WebView 는 그대로 두고 재동기화만(PC 인스펙터처럼 열림 유지).
              onLoadEnd={() => {
                if (darkRef.current) webRef.current?.injectJavaScript(PREVIEW_DARK_ON);
                if (toolsRef.current) void resyncDevtools();
              }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.base }}>
              <Text style={{ color: C.textDim, fontSize: 12, textAlign: 'center' }}>URL 또는 데브서버 포트를 입력하세요</Text>
              <Pressable onPress={detectPort} style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.elevated2, borderRadius: 6 }}>
                <Text style={{ color: C.text2, fontSize: 12 }}>데브서버 포트 감지</Text>
              </Pressable>
            </View>
          )}
        </View>
        {/* 경계 손잡이 — 좌배치=우측 테두리 / 우배치=좌측 테두리 / 하단배치=상단 테두리 위에 그립 칩.
            프리뷰 WebView 가 경계 위 터치를 먹는 문제를 RN 레이어 최상단 스트립으로 해결. */}
        {tools && dtHtml && dtBounds ? (
          <View
            {...dtHandlePan.panHandlers}
            style={
              dtSide === 'bottom'
                ? { position: 'absolute', left: 0, right: 0, top: Math.max(0, dtBounds.h - 14), height: 28, zIndex: 30, alignItems: 'center', justifyContent: 'center' }
                : { position: 'absolute', top: 0, bottom: 0, left: Math.max(0, (dtSide === 'right' ? dtBounds.w : dtBounds.x) - 14), width: 28, zIndex: 30, alignItems: 'center', justifyContent: 'center' }
            }
          >
            <View style={{
              backgroundColor: 'rgba(28,30,34,0.92)', borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
              alignItems: 'center', justifyContent: 'center',
              ...(dtSide === 'bottom' ? { width: 64, height: 18 } : { width: 18, height: 64 }),
            }}>
              <View style={dtSide === 'bottom'
                ? { width: 34, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.8)' }
                : { width: 4, height: 34, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.8)' }} />
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}

// ── 프리뷰 pane — 데브서버 포트 프록시 + 임의 URL. 헤더 탭은 열린 페이지 메타로 표현 ──
function PreviewPane({ node, ws, cb }: { node: PreviewLeaf; ws: WorkspaceMeta; cb: PaneCallbacks }) {
  usePreviewMetaVersion();
  const sid = node.tid || node.id; // 표면 ID — 탭↔pane 전환에도 동일(인스턴스/메타 승계)
  const m = previewMeta.get(sid);
  return (
    <>
      <SimpleHeader paneId={node.id} label={m?.title || '프리뷰'} icon={<TabFavicon uri={m?.favicon} active />} cb={cb} />
      <PreviewSlot k={sid} cwd={ws.localPath || ''} url={node.url || ''} active onUrlChange={(u) => cb.onPatch(node.id, { url: u })} />
    </>
  );
}

// ── IDE pane — PC ide.js 미러 본문(IdeBody: 트리·아이콘·검색·파일탭·material-darker) ──
//  pane 헤더에는 PC 처럼 [탐색기 토글]만 남긴다(새 파일=트리 헤더, 저장=파일 탭바 우측).
function IdePane({ node, ws, cb }: { node: IdeLeaf; ws: WorkspaceMeta; cb: PaneCallbacks }) {
  const [treeOpen, setTreeOpen] = useState(true);
  return (
    <>
      <SimpleHeader paneId={node.id} label="IDE" icon={<Code size={13} color={C.text2} />} cb={cb}>
        <HBtn onPress={() => setTreeOpen((v) => !v)}><SidebarSimple size={15} color={treeOpen ? C.accent : C.textDim} /></HBtn>
      </SimpleHeader>
      <IdeBody
        root={ws.localPath || ''}
        controlKey={node.id}
        treeVisible={treeOpen}
        initialOpenPath={node.openPath || null}
        onOpenPathChange={(rel) => cb.onPatch(node.id, { openPath: rel })}
        initialLayout={node.ideLayout}
        onLayoutChange={(l) => cb.onPatch(node.id, { ideLayout: l })}
      />
    </>
  );
}
