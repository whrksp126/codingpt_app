import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { View, Text, Pressable, ScrollView, Animated, Keyboard, KeyboardAvoidingView, BackHandler, Platform, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Keyboard as KeyboardIcon, CaretDown } from 'phosphor-react-native';

import { haptic } from '../../animations/haptics';
import KeyButton, { POPUP_CELL, type PopupInfo } from '../module/ide/KeyButton';
import SpecialKeyPanel, { type SpecialKeyName, type KeyboardOS } from './SpecialKeyPanel';
import { MOD_IDS, type ModId, type ModMap, type ModFlags } from './modifierKeys';
import { useKeyboardOS } from '../../utils/keyboardOSSetting';
import { getKeyAssistEnabled, subscribeKeyAssistEnabled, useKeyAssistEnabled } from '../../utils/keyAssistEnabledSetting';
import { setSoftInputMode } from '../../utils/softInputMode';
import { useKaTheme, useKaKeySize, useKaPanelKeySize, kaPalette, kaSizes, type KaPalette } from './keyAssistSettings';
import { keysFor, ctxKeyOf, DEFAULT_CTX, type EditorContext, type KeyDef } from '../module/ide/keyContexts';
import { bump as bumpKeyFreq, boostOrder, loadFreq } from '../module/ide/keyFrequency';

// ── 전역 키보드 액세서리(보조키바 + 실물키보드 특수키 패널) ──
// 기존엔 옛 MobileIDEScreen 한 화면에만 있던 것을 앱 전역으로 확장:
//  · 어떤 입력이든 포커스되면 그 위에 보조바(⌨︎ 토글 + 모디파이어 칩 + 키셋)가 뜨고,
//    ⌨︎ 로 OS 키보드 ↔ 특수키 패널(esc/tab/방향/멀티락 모디파이어)을 전환한다.
//  · 대상은 "포커스된 입력"이 KeyTarget 으로 등록(setKeyTarget) — 터미널(xterm)/에디터(CM)/일반 TextInput.
//  · 상태(모디파이어·패널모드·타깃)는 모듈 레벨 싱글턴 — 네이티브 Modal(별도 윈도)마다
//    <KeyAssistOverlay/> 인스턴스를 두어도 하나의 상태를 공유한다(keyboardOSSetting 과 같은 패턴).
//  · 옛 MobileIDEScreen 은 자체 바를 가지므로 그 화면이 보이는 동안엔 suppress.

// 코딩에 자주 쓰는 특수문자 — 터미널/일반 인풋 보조바에 노출.
const SPECIAL_CHARS = [
  '<', '>', '/', '"', "'", '`', '-', '_', '=', '+', '.', ',', ':', ';',
  '(', ')', '{', '}', '[', ']', '|', '&', '!', '?', '#', '@', '$', '*', '\\', '~',
];
// 실물키보드 특수키 패널의 원샷 키 → 터미널 PTY 로 보낼 ANSI/제어 시퀀스.
export const TERM_SEQ: Record<SpecialKeyName, string> = {
  Escape: '\x1b', Tab: '\t', Enter: '\r', Backspace: '\x7f',
  ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
  Home: '\x1b[H', End: '\x1b[F',
  PageUp: '\x1b[5~', PageDown: '\x1b[6~', Delete: '\x1b[3~',
};

// 모디파이어 잠금 + 패널 키 → 셸 표준 편집 시퀀스(터미널 전용).
//  mac: ⌘=라인 단위, ⌥=단어 단위 / win: Ctrl=단어 단위 — 실물 키보드 관례와 동일.
//  Enter+shift/alt = ESC CR — Claude Code 등 REPL 의 멀티라인 개행(전송 아님).
export function termSeqFor(name: SpecialKeyName, flags?: Partial<ModFlags>, os: KeyboardOS = 'mac'): string | undefined {
  const f = flags || {};
  const line = os === 'mac' && f.meta;                    // 라인 단위(mac ⌘만)
  const word = os === 'mac' ? f.alt : f.ctrl;             // 단어 단위
  if (name === 'Backspace') {
    if (line) return '\x15';                              // 라인 앞쪽 전체 삭제(^U)
    if (word) return '\x1b\x7f';                          // 단어 삭제
  }
  if (name === 'Delete' && (word || line)) return '\x1bd'; // 앞 방향 단어 삭제(ESC d)
  if (name === 'ArrowLeft') {
    if (line) return '\x01';                              // 라인 처음(^A)
    if (word) return '\x1bb';                             // 단어 왼쪽
  }
  if (name === 'ArrowRight') {
    if (line) return '\x05';                              // 라인 끝(^E)
    if (word) return '\x1bf';                             // 단어 오른쪽
  }
  if (name === 'Enter' && (f.shift || f.alt)) return '\x1b\r'; // 멀티라인 개행
  return TERM_SEQ[name];
}


// ── 타깃(포커스된 입력) 계약 ──
export type KeyTargetKind = 'terminal' | 'editor' | 'text';
export interface KeyTarget {
  id: string;
  kind: KeyTargetKind;
  focus: () => void;
  blur: () => void;
  /** 모디파이어 활성 상태 주입 — 웹뷰(터미널/에디터)가 OS 키보드 글자와의 조합을 자체 처리 */
  setVmods?: (flags: ModFlags) => void;
  /** 패널 원샷 특수키(esc/tab/방향/…) 적용 */
  applyKey?: (name: SpecialKeyName, flags: ModFlags, os: KeyboardOS) => void;
  /** 보조바 특수문자/스니펫 삽입. caret = 삽입 끝 기준 커서 오프셋(음수=왼쪽) */
  insertText?: (text: string, caret?: number) => void;
  /** (에디터) 패널 모드에서 inputmode=none 으로 OS 키보드 억제 */
  setImeSuppressed?: (on: boolean) => void;
  /** (에디터) blur→재포커스로 OS 키보드 복귀 */
  refocusKeyboard?: () => void;
}

// ── 모듈 레벨 스토어 ──
interface KAState {
  target: KeyTarget | null;
  focused: boolean;               // 입력 포커스(보조바 노출 조건)
  kbMode: 'os' | 'panel';
  kbSwitching: boolean;           // 패널→OS 전환 중(검정 번쩍임 방지)
  keyboardVisible: boolean;
  imeOverlay: boolean; // Android: adjustNothing 세션 중(창이 키보드에 안 줄어드는 상태 — 패널~복원 사이)
  panelPinTop: number | null; // Android 패널 세션: 바를 화면 y 절대 고정(top 기준 — 1px 도 안 움직이게)
  keyboardHeight: number;
  mods: ModMap;
  suppressed: boolean;            // 옛 MobileIDEScreen(자체 바 보유)이 보이는 동안 true
  barH: number;
  editorCtx: EditorContext;       // 에디터 타깃의 커서 컨텍스트(컨텍스트 키셋)
}

const OFF_MODS: ModMap = { ctrl: 'off', alt: 'off', meta: 'off', shift: 'off', caps: 'off', fn: 'off' };
const st: KAState = {
  target: null, focused: false, kbMode: 'os', kbSwitching: false,
  keyboardVisible: false,
  imeOverlay: false, panelPinTop: null, keyboardHeight: 300, mods: OFF_MODS,
  suppressed: false, barH: 47, editorCtx: DEFAULT_CTX,
};

let snapshot: KAState = { ...st };
const listeners = new Set<() => void>();
const emit = () => { snapshot = { ...st }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useKeyAssist(): KAState {
  return useSyncExternalStore(subscribe, () => snapshot);
}

const toFlags = (m: ModMap): ModFlags => ({
  ctrl: m.ctrl !== 'off', alt: m.alt !== 'off', meta: m.meta !== 'off',
  shift: m.shift !== 'off', caps: m.caps !== 'off', fn: m.fn !== 'off',
});
export function getKeyModFlags(): ModFlags { return toFlags(st.mods); }

// 모디파이어 변경/타깃 변경 시 타깃에 주입 — OS 키보드 글자와의 조합은 타깃(웹뷰)이 처리.
const injectVmods = () => { st.target?.setVmods?.(toFlags(st.mods)); };

// ── 모디파이어(멀티락) — modifierKeys.ts 의 훅 로직을 전역 스토어로 ──
export function tapKeyMod(id: ModId) {
  st.mods = { ...st.mods, [id]: st.mods[id] === 'off' ? 'once' : 'off' };
  emit(); injectVmods();
}
export function holdKeyMod(id: ModId) {
  st.mods = { ...st.mods, [id]: st.mods[id] === 'lock' ? 'off' : 'lock' };
  emit(); injectVmods();
}
/** 비모디파이어 키 실행 후 once 정리(lock 유지). 웹뷰 vmodConsume 콜백에도 그대로 연결. */
export function consumeKeyMods() {
  if (!MOD_IDS.some((id) => st.mods[id] === 'once')) return;
  const next = { ...st.mods };
  for (const id of MOD_IDS) if (next[id] === 'once') next[id] = 'off';
  st.mods = next;
  emit(); injectVmods();
}

// ── 타깃 등록/해제 ──
let wantPanel = false;
let panelFallback: ReturnType<typeof setTimeout> | null = null;
let switchFallback: ReturnType<typeof setTimeout> | null = null;
// 오버레이 컨테이너 높이 추적 — 핀(top) 계산과 "창 축소 완료" 감지에 쓴다.
let lastOverlayH = 0;      // 최근 레이아웃 높이(축소 감지용)
let pinBaseH = 0;          // 키보드가 떠 있는 os 상태의 창 높이 = 핀 기준(바 화면 y 의 원천)
let pinReleasePending = false; // close 복원 후 창 축소를 기다리는 중(축소 확인 시 핀 해제)
let pinReleaseTimer: ReturnType<typeof setTimeout> | null = null;
function releasePin() {
  if (!pinReleasePending) return;
  pinReleasePending = false;
  if (pinReleaseTimer) { clearTimeout(pinReleaseTimer); pinReleaseTimer = null; }
  st.panelPinTop = null;
  emit();
}
export function reportOverlayHeight(h: number) {
  if (h <= 0) return;
  // 창 축소 감지 — adjustResize 복원이 반영된 프레임. 핀 위치는 창 top 기준이라 해제 전후 픽셀 동일.
  if (pinReleasePending && lastOverlayH > 0 && h < lastOverlayH - 100) releasePin();
  lastOverlayH = h;
  if (st.kbMode === 'os' && st.keyboardVisible && !st.imeOverlay) pinBaseH = h;
}

export function setKeyTarget(t: KeyTarget) {
  if (st.suppressed) return;
  // 다른 입력으로 포커스 이동 = 패널 상태 초기화(새 타깃은 OS 키보드로 시작).
  //  Android 패널 세션(adjustNothing)이었다면 평소 모드 복원(인셋 이벤트가 없어 자동 복원 불가).
  if (st.target && st.target.id !== t.id && st.kbMode === 'panel') {
    st.kbMode = 'os'; wantPanel = false;
    st.panelPinTop = null;
    if (Platform.OS === 'android' && st.imeOverlay) { st.imeOverlay = false; setSoftInputMode('resize'); }
  }
  st.target = t;
  st.focused = true;
  if (t.kind !== 'editor') st.editorCtx = DEFAULT_CTX;
  emit(); injectVmods();
}

/** 입력 blur — 패널 전환 중(blur 가 의도된 것)이면 무시. 현재 타깃일 때만 반영. */
export function blurKeyTarget(id: string) {
  if (st.target?.id !== id) return;
  if (wantPanel || st.kbMode === 'panel' || st.kbSwitching) return;
  // 키보드가 떠 있으면 keyboardDidHide 가 정리(다른 입력으로 이동 시 새 focus 가 덮음).
  if (!st.keyboardVisible) { st.focused = false; emit(); }
}

export function setKeyTargetCtx(id: string, ctx: EditorContext) {
  if (st.target?.id !== id) return;
  st.editorCtx = ctx; emit();
}

/** 옛 MobileIDEScreen(자체 보조바 보유)이 보이는 동안 전역 액세서리 비활성. */
export function setKeyAssistSuppressed(on: boolean) {
  if (st.suppressed === on) return;
  st.suppressed = on;
  if (on) { wantPanel = false; st.kbMode = 'os'; st.kbSwitching = false; st.focused = false; }
  emit();
}

// ── 패널 열기/닫기/내리기 (옛 MobileIDEScreen openKbPanel/closeKbPanel/dismissKbPanel 이식) ──
export function openKbPanel() {
  const t = st.target;
  if (!t || !getKeyAssistEnabled()) return;
  if (Platform.OS === 'ios') {
    wantPanel = true;
    // iOS: 키보드는 앱 위에 뜨는 별도 레이어 — 패널을 지금 바닥(키보드 뒤)에 깔아두면
    //  키보드가 내려가면서 자연스럽게 드러난다(노션과 동일한 네이티브 리빌 효과).
    //  WebView 키보드는 Keyboard.dismiss 로 안 내려감 — 반드시 blur. 에디터는 IME 억제 선행.
    t.setImeSuppressed?.(true);
    t.blur();
    Keyboard.dismiss();
    st.kbMode = 'panel';
    emit();
    if (panelFallback) clearTimeout(panelFallback);
    panelFallback = setTimeout(() => {
      if (wantPanel) { wantPanel = false; st.kbMode = 'panel'; emit(); }
    }, 120);
    return;
  }
  // Android(카카오톡/노션식): 창 리사이즈를 끄고(adjustNothing → 창이 즉시 전체 높이로 확장,
  //  키보드는 그 "위"를 덮는 오버레이가 됨) 패널을 키보드 뒤 바닥에 깐 다음 키보드만 내린다.
  //  → 키보드가 내려가며 뒤에 있던 패널이 그대로 드러나고, 보조바 위치는 한 픽셀도 안 움직인다.
  //  모드 적용(창 확장)과 패널 마운트는 키보드에 가려진 영역에서 일어나 셔플이 보이지 않는다.
  //  한 프레임에 전부(사용자 실측 확정): setMode(nothing)=창 확장 + 패널 즉시 깔기 + 키보드 하강.
  //  창 확장 신호(가짜 didHide)를 기다리는 변형은 반응이 늦고 재그리기 깜빡임이 생겨 기각(실사용 비교).
  // 바의 현재 화면 y 를 핀 — 이후 창 확장/패딩 요동과 무관하게 top 고정(1px 불변).
  //  기준 높이 = "키보드 떠 있는 os 창"(pinBaseH). 세션 중 확장된 창 높이로 오염 금지.
  pinReleasePending = false;
  const baseH = pinBaseH > 0 ? pinBaseH : lastOverlayH;
  if (baseH > 0) st.panelPinTop = Math.max(0, baseH - st.barH);
  setSoftInputMode('nothing');
  st.imeOverlay = true;
  st.kbMode = 'panel';
  emit();
  t.setImeSuppressed?.(true);
  t.blur();
  Keyboard.dismiss();
}

export function closeKbPanel() {
  const t = st.target;
  if (Platform.OS === 'ios') {
    st.kbMode = 'os';
    st.focused = true;           // 전환 갭 동안 바 렌더 유지(재마운트 점프 방지)
    st.kbSwitching = true;       // 키보드 등장 완료까지 패널색 배경 유지(검정 번쩍임 방지)
    emit();
    if (switchFallback) clearTimeout(switchFallback);
    switchFallback = setTimeout(() => { st.kbSwitching = false; emit(); }, 500);
  } else {
    // Android(adjustNothing 세션): 패널을 그대로 둔 채 키보드를 올린다 — 창이 안 변하므로
    //  키보드가 패널을 "덮으며" 등장(보조바 불변). adjustNothing 동안엔 RN 키보드 이벤트가
    //  오지 않으므로(인셋 불변, 실측) 상승 애니메이션이 끝날 시간 뒤 타이머로 정리한다 —
    //  패널 붕괴·창 축소 셔플은 전부 키보드 뒤에서 일어나 보이지 않는다.
    st.focused = true;
    emit();
    if (switchFallback) clearTimeout(switchFallback);
    switchFallback = setTimeout(() => {
      // 키보드가 패널을 완전히 덮은 뒤 os 전환 + adjustResize 복원을 "같은 틱"에 —
      //  복원을 didHide 로 미루는 설계는 adjustNothing 동안 키보드 이벤트가 안 와(실측)
      //  바가 키보드 뒤에 갇히는 고착을 만들었음. 스태거(30ms) 없이 동시 실행해
      //  인셋 축소·창 축소가 최대한 같은 프레임에 붙게 한다.
      st.kbMode = 'os';
      st.keyboardVisible = true;
      st.imeOverlay = false;
      // 핀은 아직 유지 — 창 축소 전에 풀면 KAV 패딩(상태바 오프셋 오차)이 바를 반 칸 밀어올린다(실측).
      //  핀은 창 top 기준이라 축소 전/후 모두 같은 픽셀 → 축소 확인(onLayout) 후 해제. 400ms 폴백.
      emit();
      setSoftInputMode('resize');
      pinReleasePending = true;
      if (pinReleaseTimer) clearTimeout(pinReleaseTimer);
      pinReleaseTimer = setTimeout(() => releasePin(), 400);
    }, 500);
  }
  injectVmods();
  if (t) {
    t.setImeSuppressed?.(false);
    if (t.refocusKeyboard) t.refocusKeyboard(); else t.focus();
  }
}

/** 패널/보조바를 키보드 없이 완전히 내림(하드웨어 백, Esc 등). */
export function dismissKeyAssist() {
  if (switchFallback) { clearTimeout(switchFallback); switchFallback = null; }
  if (panelFallback) { clearTimeout(panelFallback); panelFallback = null; }
  wantPanel = false;
  st.kbSwitching = false; st.kbMode = 'os'; st.focused = false;
  emit();
  st.target?.setImeSuppressed?.(false);
  st.target?.blur();
  st.panelPinTop = null; pinReleasePending = false;
  if (Platform.OS === 'android' && st.imeOverlay) { st.imeOverlay = false; setSoftInputMode('resize'); } // 패널 세션 복원(키보드 없음 — 무깜빡)
}

export function toggleKbPanel() { if (st.kbMode === 'panel') closeKbPanel(); else openKbPanel(); }

/** 바 우측 고정 "접기" — OS 키보드든 특수키 패널이든 무엇이 떠 있든 전부 내린다(사용자 확정 스펙). */
export function collapseKeyAssist() {
  dismissKeyAssist();     // 패널/바 정리 + 타깃 blur(웹뷰 키보드는 blur 로 내려감)
  Keyboard.dismiss();     // 일반 TextInput 키보드 보강
}

// ── 컨트롤러 — 앱에 1개만 마운트(키보드 리스너 + 하드웨어 백) ──
export function KeyAssistController() {
  useEffect(() => subscribeKeyAssistEnabled(() => { if (!getKeyAssistEnabled()) collapseKeyAssist(); }), []);
  useEffect(() => {
    void loadFreq();
    // iOS 는 will* 로 미리(부드럽게), Android 는 did* (adjustResize 완료 시점).
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEv as any, (e: any) => {
      st.keyboardVisible = true;
      const h = e?.endCoordinates?.height;
      if (h && h > 120) st.keyboardHeight = h;
      st.kbMode = 'os';
      if (st.target) st.focused = true;
      st.kbSwitching = false;
      if (switchFallback) { clearTimeout(switchFallback); switchFallback = null; }
      emit();
    });
    const h = Keyboard.addListener(hideEv as any, () => {
      st.keyboardVisible = false; st.kbSwitching = false;
      if (wantPanel) {
        // iOS: 키보드가 사라진 시점에 자리 교대(겹침 방지)
        wantPanel = false;
        if (panelFallback) { clearTimeout(panelFallback); panelFallback = null; }
        st.kbMode = 'panel';
      } else if (st.kbMode !== 'panel') {
        st.focused = false;
        // 혹시 남은 adjustNothing 세션 정리(안전망 — close/dismiss 가 정상 복원 주경로)
        if (Platform.OS === 'android' && st.imeOverlay) { st.imeOverlay = false; st.panelPinTop = null; setSoftInputMode('resize'); }
      }
      emit();
    });
    return () => { s.remove(); h.remove(); };
  }, []);

  // 하드웨어 백: 특수키 패널이 열려 있으면 먼저 내린다(OS 키보드는 IME 가 자체 처리).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!st.suppressed && st.kbMode === 'panel') { dismissKeyAssist(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  return null;
}

// ── 인셋 훅 — 오버레이(바+패널)에 가려지는 만큼 콘텐츠가 비켜설 높이 ──
// windowResizes: 이 콘텐츠가 속한 윈도가 키보드에 맞춰 리사이즈되는가
//  (Android 루트 윈도=adjustResize=true / iOS·네이티브 Modal=false 가 일반적).
export function useKeyAssistInset(windowResizes = Platform.OS === 'android') {
  const ka = useKeyAssist();
  const kaEnabled = useKeyAssistEnabled();
  const showing = kaEnabled && !ka.suppressed && !!ka.target && (ka.focused || ka.kbMode === 'panel' || ka.kbSwitching);
  if (!showing) return 0;
  const panelMode = ka.kbMode === 'panel' || (Platform.OS === 'ios' && ka.kbSwitching);
  const overlayH = ka.barH + (panelMode ? ka.keyboardHeight : 0);
  // imeOverlay(Android adjustNothing 세션): 창이 안 줄어든 상태로 키보드가 덮으므로 겹침 보정 필요.
  const noResize = !windowResizes || ka.imeOverlay;
  const kbOverlap = !panelMode && noResize && ka.keyboardVisible ? ka.keyboardHeight : 0;
  return overlayH + kbOverlap;
}

/** KAV 등으로 키보드 회피가 이미 되는 콘텐츠용 — 오버레이 자체 높이만(바 또는 바+패널). */
export function useKeyAssistOverlayHeight() {
  const ka = useKeyAssist();
  const kaEnabled = useKeyAssistEnabled();
  const showing = kaEnabled && !ka.suppressed && !!ka.target && (ka.focused || ka.kbMode === 'panel' || ka.kbSwitching);
  if (!showing) return 0;
  const panelMode = ka.kbMode === 'panel' || (Platform.OS === 'ios' && ka.kbSwitching);
  return ka.barH + (panelMode ? ka.keyboardHeight : 0);
}

// ── UI 조각 ──
const FadeView = ({ children, style, dy = 0 }: { children: React.ReactNode; style?: any; dy?: number }) => {
  const a = React.useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 120, useNativeDriver: true }).start(); }, [a]);
  const transform = dy ? [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }] : [];
  return <Animated.View style={[style, { opacity: a, transform }]}>{children}</Animated.View>;
};

const KbToggleKey = ({ active, onPress, p, h }: { active: boolean; onPress: () => void; p: KaPalette; h: number }) => (
  <Pressable
    onPress={onPress}
    hitSlop={3}
    style={{ minWidth: h + 3, height: h, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: active ? p.toggleActiveBg : p.key, elevation: 1 }}
  >
    <KeyboardIcon size={20} color={active ? p.toggleActiveFg : p.keyText} weight={active ? 'fill' : 'regular'} />
  </Pressable>
);

const MOD_ORDER: ModId[] = ['ctrl', 'meta', 'alt', 'shift', 'caps', 'fn'];
const modLabel = (id: ModId, os: KeyboardOS): string => (os === 'mac'
  ? ({ ctrl: '⌃', meta: '⌘', alt: '⌥', shift: '⇧', caps: 'caps', fn: 'fn' } as Record<ModId, string>)
  : ({ ctrl: 'Ctrl', meta: 'Win', alt: 'Alt', shift: 'Shift', caps: 'Caps', fn: 'Fn' } as Record<ModId, string>))[id];

// ── 오버레이 — 윈도(루트/각 네이티브 Modal)마다 1개 마운트 ──
//  같은 스토어를 구독하므로 어느 윈도에 떠 있든 동일 상태. pointerEvents box-none 으로
//  바/패널 영역 외 터치는 아래로 통과.
//  위치는 KeyboardAvoidingView(padding)가 실측 — 윈도가 adjustResize 로 줄어드는지(Android 루트),
//  키보드가 위에 겹치는지(iOS/네이티브 Modal)에 상관없이 바가 항상 키보드 바로 위에 앉는다.
export function KeyAssistOverlay({ inModal = false }: { inModal?: boolean } = {}) {
  const ka = useKeyAssist();
  const keyboardOS = useKeyboardOS();
  const P = kaPalette(useKaTheme());
  const S = kaSizes(useKaKeySize());           // 보조바 키 크기
  const SP = kaSizes(useKaPanelKeySize());     // 특수키 패널 크기(분리 설정)
  const { width: winWidth } = useWindowDimensions();
  const [popup, setPopup] = useState<PopupInfo | null>(null);

  const onBarLayout = useCallback((e: any) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - st.barH) > 1) { st.barH = h; emit(); }
  }, []);

  const t = ka.target;
  const kaEnabled = useKeyAssistEnabled();
  const showing = kaEnabled && !ka.suppressed && !!t && (ka.focused || ka.kbMode === 'panel' || ka.kbSwitching);
  useEffect(() => { if (!showing) setPopup(null); }, [showing]);
  if (!showing || !t) return null;

  // kbSwitching(패널↔OS 전환 갭)의 필러/패딩은 iOS 전용 — Android 는 창 자체가 리사이즈되므로
  //  필러를 그리면 바가 키보드 위로 날아올랐다 내려오는 역방향 깜빡임이 생긴다(실측).
  const panelMode = ka.kbMode === 'panel' || (Platform.OS === 'ios' && ka.kbSwitching);
  const flags = toFlags(ka.mods);

  const commitInsert = (text: string, caret: number | undefined, def: KeyDef) => {
    t.insertText?.(text, caret);
    if (t.kind === 'editor') bumpKeyFreq(ctxKeyOf(ka.editorCtx), def.id);
  };
  const onPanelKey = (name: SpecialKeyName) => {
    t.applyKey?.(name, flags, keyboardOS);
    consumeKeyMods();
  };

  // 활성(once/lock) 모디파이어 칩 — 탭하면 해제.
  const activeMods = MOD_ORDER.filter((id) => ka.mods[id] !== 'off');
  const modChips = activeMods.length ? (
    <>
      {activeMods.map((id) => {
        const locked = ka.mods[id] === 'lock';
        return (
          <Pressable
            key={'mc' + id}
            onPress={() => { haptic.keyTap(); tapKeyMod(id); }}
            hitSlop={3}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: S.keyH, paddingHorizontal: 9, borderRadius: 6, backgroundColor: locked ? '#1D4ED8' : '#3B82F6', elevation: 1 }}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{modLabel(id, keyboardOS)}</Text>
            <Text style={{ color: '#DBEAFE', fontSize: 12, fontWeight: '700' }}>✕</Text>
          </Pressable>
        );
      })}
      <View style={{ width: 1, height: 26, backgroundColor: P.divider, marginHorizontal: 3, alignSelf: 'center' }} />
    </>
  ) : null;

  // 키셋 — 에디터는 커서 컨텍스트 기반(사용빈도 보정), 그 외엔 특수문자.
  const keys: KeyDef[] = t.kind === 'editor'
    ? boostOrder(ctxKeyOf(ka.editorCtx), keysFor(ka.editorCtx))
    : SPECIAL_CHARS.map((ch) => ({ id: 'k' + ch, label: ch, text: ch }));

  const bar = (
    <View style={{ backgroundColor: P.barBg, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ paddingLeft: 5, paddingVertical: 5 }}>
        <KbToggleKey active={ka.kbMode === 'panel'} onPress={() => { haptic.keyPress(); toggleKbPanel(); }} p={P} h={S.keyH} />
      </View>
      <View style={{ width: 1, height: 26, backgroundColor: P.divider, marginHorizontal: 3, alignSelf: 'center' }} />
      <ScrollView
        horizontal
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 5, paddingVertical: 5, gap: 5, alignItems: 'center' }}
      >
        {modChips}
        <FadeView key={t.kind === 'editor' ? ctxKeyOf(ka.editorCtx) : 'chars'} style={{ flexDirection: 'row', gap: 5 }}>
          {keys.map((def) => (
            <KeyButton
              key={def.id}
              def={def}
              fontSize={S.barFont}
              height={S.keyH}
              minWidth={S.keyMinW}
              colors={{ key: P.key, keyDown: P.keyDown, keyText: P.keyText }}
              onCommit={commitInsert}
              onPopupOpen={setPopup}
              onPopupMove={(i) => setPopup((p) => (p ? { ...p, activeIndex: i } : p))}
              onPopupClose={() => setPopup(null)}
            />
          ))}
        </FadeView>
      </ScrollView>
      <View style={{ width: 1, height: 26, backgroundColor: P.divider, marginHorizontal: 3, alignSelf: 'center' }} />
      {/* 접기(고정, 항상 맨 오른쪽) — OS 키보드/특수키 패널 무엇이든 내린다 */}
      <View style={{ paddingRight: 5, paddingVertical: 5 }}>
        <Pressable
          onPress={() => { haptic.keyPress(); collapseKeyAssist(); }}
          hitSlop={3}
          style={{ minWidth: S.keyH + 3, height: S.keyH, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: P.key, elevation: 1 }}
        >
          <CaretDown size={18} color={P.keyText} weight="bold" />
        </Pressable>
      </View>
    </View>
  );

  // 롱프레스 대체키 팝업 — 바 위(형제 절대배치)로 띄워 ScrollView 클리핑 회피.
  //  바+패널 컨테이너 기준 bottom 좌표라 KAV 이동을 자동으로 따라간다.
  const popupEl = popup ? (() => {
    const n = popup.items.length;
    const popW = n * POPUP_CELL + 8;
    let left = popup.x + popup.width / 2 - POPUP_CELL / 2 - 4;
    left = Math.max(4, Math.min(left, (winWidth || 400) - popW - 4));
    const bottom = (ka.kbMode === 'panel' ? ka.keyboardHeight : 0) + ka.barH + 4;
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom, zIndex: 1000, elevation: 1000 }}>
        <FadeView dy={6}
          style={{ position: 'absolute', bottom: 0, left, flexDirection: 'row', backgroundColor: '#2A2F3A', borderRadius: 10, padding: 4,
            shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 14 }}
        >
          {popup.items.map((it, i) => (
            <View key={it.id} style={{ width: POPUP_CELL, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 7,
              backgroundColor: i === popup.activeIndex ? '#094771' : 'transparent' }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{it.label}</Text>
            </View>
          ))}
        </FadeView>
      </View>
    );
  })() : null;

  // 위치 전략 — iOS: 윈도가 키보드로 리사이즈되지 않으므로(루트/Modal 공통) 관측한 키보드 높이만큼
  //  명시적으로 띄운다(KAV 는 이 절대배치 오버레이에서 오프셋을 만들지 못해 키보드 뒤에 깔렸음).
  //  Android: KAV(padding) 실측 — adjustResize 루트(겹침 0)와 리사이즈 안 되는 Modal 윈도를 모두 커버.
  const pinned = Platform.OS === 'android' && ka.panelPinTop != null;
  const inner = (
    <View style={pinned
      ? { position: 'absolute', top: ka.panelPinTop as number, left: 0, right: 0, backgroundColor: panelMode ? P.panelBg : undefined }
      : { backgroundColor: panelMode ? P.panelBg : undefined }}>
      {/* KeyButton 은 RNGH 제스처 — 루트/각 Modal 윈도에 GHRV 가 없을 수 있어 자체 포함.
          기본 flex:1 은 자동높이 부모에서 높이 0 으로 붕괴 → 반드시 auto 로 재정의. */}
      <GestureHandlerRootView style={{ flex: 0 }}>
        <View onLayout={onBarLayout}>{bar}</View>
      </GestureHandlerRootView>
      {/* 패널은 항상 프리마운트(높이 0 숨김) — 스왑 프레임에 마운트 비용 없이 즉시 펼친다.
          panelMode(iOS 전환 갭 포함) 동안 keyboardHeight 로 펼침 = 필러 역할까지 겸함. */}
      <View style={{ height: panelMode ? ka.keyboardHeight : 0, overflow: 'hidden', backgroundColor: P.panelBg }}>
        <SpecialKeyPanel
          height={ka.keyboardHeight}
          os={keyboardOS}
          mods={ka.mods}
          onTapMod={tapKeyMod}
          onHoldMod={holdKeyMod}
          onKey={onPanelKey}
          palette={P}
          sizes={SP}
        />
      </View>
      {popupEl}
    </View>
  );

  return (
    <View pointerEvents="box-none" onLayout={(e) => reportOverlayHeight(e.nativeEvent.layout.height)} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 900, elevation: 30 }}>
      {Platform.OS === 'ios' ? (
        <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: panelMode ? 0 : (ka.keyboardVisible ? ka.keyboardHeight : 0) }}>
          {inner}
        </View>
      ) : inModal ? (
        // Android Modal 창(키보드에 리사이즈 안 됨): KAV 가 겹침을 실측 패딩. 패널 세션엔 비활성.
        <KeyboardAvoidingView enabled={!panelMode && !pinned} behavior="padding" pointerEvents="box-none" style={{ flex: 1, justifyContent: 'flex-end' }}>
          {inner}
        </KeyboardAvoidingView>
      ) : (
        // Android 루트 창(adjustResize): 창 자체가 키보드에 줄어들므로 KAV 는 할 일이 0 —
        //  오히려 전환 프레임에 상태바 오프셋 오차 패딩(1프레임 바 점프)을 만들 수 있어 미사용.
        <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'flex-end' }}>
          {inner}
        </View>
      )}
    </View>
  );
}
