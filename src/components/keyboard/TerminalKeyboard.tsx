import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Animated, Keyboard, BackHandler, useWindowDimensions } from 'react-native';
import { Keyboard as KeyboardIcon } from 'phosphor-react-native';

import { haptic } from '../../animations/haptics';
import KeyButton, { POPUP_CELL, type PopupInfo } from '../module/ide/KeyButton';
import SpecialKeyPanel, { type SpecialKeyName } from './SpecialKeyPanel';
import { useModifierKeys, type ModId } from './modifierKeys';
import { useKeyboardOS } from '../../utils/keyboardOSSetting';
import type { TerminalHandle } from '../module/ide/TerminalWebView';

// ── 터미널 전용 보조키바 + 실물키보드 특수키 패널 (MobileIDE 터미널 모드에서 추출한 공유 모듈) ──
// MobileIDEScreen 의 터미널 브랜치와 동일 동작:
//  · 보조바: ⌨︎ 토글 / 활성 모디파이어 칩 / 스티키 Ctrl(탭=원샷·길게=락) / Tab·Esc·방향키 / ^조합 / 특수문자(롱프레스 팝업)
//  · 특수키 패널: OS 키보드 자리를 그대로 덮는 절대배치(⌨︎로 전환) — 멀티락 모디파이어 + 원샷 특수키
//  · 좌표 공식: top = fullH − barH − keyboardHeight (adjustResize 전제 — IDE 와 동일)
// 사용처: 화면 루트 View 에 onContainerLayout, TerminalWebView 에 terminalProps 를 물리고
//         spacer(flow) / overlay·popup(절대배치 형제) 를 렌더한다.

// 코딩에 자주 쓰는 특수문자 — 키보드 위에 가로 스크롤로 노출.
// (Ctrl/Tab/Esc/방향키 등 네비게이션·모디파이어 키는 실물키보드 특수키 패널에 있으므로 보조바에선 뺀다.)
const SPECIAL_CHARS = [
  '<', '>', '/', '"', "'", '`', '-', '_', '=', '+', '.', ',', ':', ';',
  '(', ')', '{', '}', '[', ']', '|', '&', '!', '?', '#', '@', '$', '*', '\\', '~',
];
// 실물키보드 특수키 패널의 원샷 키 → 터미널 PTY 로 보낼 ANSI/제어 시퀀스.
const TERM_SEQ: Record<SpecialKeyName, string> = {
  Escape: '\x1b', Tab: '\t', Enter: '\r', Backspace: '\x7f',
  ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
  Home: '\x1b[H', End: '\x1b[F',
  PageUp: '\x1b[5~', PageDown: '\x1b[6~', Delete: '\x1b[3~',
};

// 마운트 시 페이드(+선택적 위로 슬라이드)
const FadeView = ({ children, style, dy = 0 }: { children: React.ReactNode; style?: any; dy?: number }) => {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 120, useNativeDriver: true }).start(); }, [a]);
  const transform = dy ? [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }] : [];
  return <Animated.View style={[style, { opacity: a, transform }]}>{children}</Animated.View>;
};

// 보조바 ⌨︎ 토글 — OS 키보드 ↔ 실물키보드 특수키 패널 전환. active=패널 열림(강조).
const KbToggleKey = ({ active, onPress }: { active: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    hitSlop={3}
    style={{ minWidth: 40, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: active ? '#2A2F3A' : '#FFFFFF', elevation: 1 }}
  >
    <KeyboardIcon size={20} color={active ? '#E2E8F0' : '#2B2D31'} weight={active ? 'fill' : 'regular'} />
  </Pressable>
);

export function useTerminalKeyboard({ termRef, enabled }: {
  termRef: React.RefObject<TerminalHandle | null>;
  /** 터미널이 화면에 살아 있을 때만 바/패널 활성(연결 전·에러 화면에선 숨김) */
  enabled: boolean;
}) {
  const { width: winWidth } = useWindowDimensions();
  const keyboardOS = useKeyboardOS();
  const modApi = useModifierKeys();

  const [kbMode, setKbMode] = useState<'os' | 'panel'>('os');
  const [keyboardHeight, setKeyboardHeight] = useState(300);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [kbSwitching, setKbSwitching] = useState(false);
  const [barH, setBarH] = useState(48);
  const [keyPopup, setKeyPopup] = useState<PopupInfo | null>(null);
  const wantPanelRef = useRef(false);
  const panelFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullHRef = useRef(0); // 키보드 내려간 상태의 컨테이너 높이(관측 최댓값)

  // OS 키보드 등장/소멸 — 패널은 키보드가 "완전히 사라진 뒤" 자리 교대(겹침 방지, adjustResize 전제)
  useEffect(() => {
    const s = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardVisible(true);
      const h = e?.endCoordinates?.height;
      if (h && h > 120) setKeyboardHeight(h);
      setKbMode('os');
      setInputFocused(true);
      setKbSwitching(false);
      if (switchFallbackRef.current) { clearTimeout(switchFallbackRef.current); switchFallbackRef.current = null; }
    });
    const h = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false); setInputFocused(false); setKbSwitching(false);
      if (wantPanelRef.current) {
        wantPanelRef.current = false;
        if (panelFallbackRef.current) { clearTimeout(panelFallbackRef.current); panelFallbackRef.current = null; }
        setKbMode('panel');
      }
    });
    return () => { s.remove(); h.remove(); };
  }, []);

  // 특수문자 키 → PTY stdin. (Ctrl 조합은 실물키보드 패널의 Ctrl 모디파이어 + OS 키보드 글자로 처리)
  const sendTermChar = useCallback((s: string) => { termRef.current?.sendKey(s); }, [termRef]);

  // 모디파이어(vmod) 변경 시 터미널에 주입 — OS 키보드 글자와 조합(^문자).
  useEffect(() => {
    if (enabled) termRef.current?.setVmods({ ctrl: modApi.flags.ctrl });
  }, [modApi.flags, enabled, termRef]);

  // ⌨︎ 열기 — WebView blur(삼성/구글 키보드는 Keyboard.dismiss 로 안 내려감) 후 즉시 패널 전환.
  const openKbPanel = useCallback(() => {
    wantPanelRef.current = true;
    termRef.current?.blur();
    Keyboard.dismiss();
    setKbMode('panel');
    if (panelFallbackRef.current) clearTimeout(panelFallbackRef.current);
    panelFallbackRef.current = setTimeout(() => {
      if (wantPanelRef.current) { wantPanelRef.current = false; setKbMode('panel'); }
    }, 120);
  }, [termRef]);
  // 패널 → OS 키보드 복귀. 포커스 직전 vmod 재주입으로 타이밍 갭 제거.
  const closeKbPanel = useCallback(() => {
    setKbMode('os');
    setInputFocused(true); // 전환 갭 동안 바 렌더 유지(재마운트 점프 방지)
    setKbSwitching(true);  // 키보드 등장 완료까지 패널색 배경 유지(검정 번쩍임 방지)
    if (switchFallbackRef.current) clearTimeout(switchFallbackRef.current);
    switchFallbackRef.current = setTimeout(() => setKbSwitching(false), 500);
    termRef.current?.setVmods({ ctrl: modApi.flags.ctrl });
    termRef.current?.focus();
  }, [modApi, termRef]);
  // 패널/보조바를 키보드 없이 완전히 내림(하드웨어 백 등).
  const dismiss = useCallback(() => {
    if (switchFallbackRef.current) { clearTimeout(switchFallbackRef.current); switchFallbackRef.current = null; }
    if (panelFallbackRef.current) { clearTimeout(panelFallbackRef.current); panelFallbackRef.current = null; }
    wantPanelRef.current = false;
    setKbSwitching(false); setKbMode('os'); setInputFocused(false);
    termRef.current?.blur();
  }, [termRef]);
  const toggleKbPanel = useCallback(() => { if (kbMode === 'panel') closeKbPanel(); else openKbPanel(); }, [kbMode, closeKbPanel, openKbPanel]);

  // 하드웨어 백 우선순위: 특수키 패널 > OS 키보드 > (화면 자체 뒤로가기)
  useEffect(() => {
    if (!enabled) return;
    const onBack = () => {
      if (kbMode === 'panel') { dismiss(); return true; }
      if (keyboardVisible || inputFocused) { dismiss(); Keyboard.dismiss(); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [enabled, kbMode, keyboardVisible, inputFocused, dismiss]);

  // 패널 원샷 특수키 → ANSI 시퀀스 전송 후 once 모디파이어 정리.
  const onPanelKey = useCallback((name: SpecialKeyName) => {
    const seq = TERM_SEQ[name];
    if (seq) termRef.current?.sendKey(seq);
    modApi.consume();
  }, [modApi, termRef]);

  // 활성(once/lock) 모디파이어 칩 — 탭하면 해제(패널 재오픈 없이).
  const MOD_ORDER: ModId[] = ['ctrl', 'meta', 'alt', 'shift', 'caps', 'fn'];
  const modLabel = (id: ModId): string => (keyboardOS === 'mac'
    ? ({ ctrl: '⌃', meta: '⌘', alt: '⌥', shift: '⇧', caps: 'caps', fn: 'fn' } as Record<ModId, string>)
    : ({ ctrl: 'Ctrl', meta: 'Win', alt: 'Alt', shift: 'Shift', caps: 'Caps', fn: 'Fn' } as Record<ModId, string>))[id];
  const renderModChips = () => {
    const active = MOD_ORDER.filter((id) => modApi.mods[id] !== 'off');
    if (!active.length) return null;
    return (
      <>
        {active.map((id) => {
          const locked = modApi.mods[id] === 'lock';
          return (
            <Pressable
              key={'mc' + id}
              onPress={() => { haptic.keyTap(); modApi.tap(id); }}
              hitSlop={3}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 37, paddingHorizontal: 9, borderRadius: 6, backgroundColor: locked ? '#1D4ED8' : '#3B82F6', elevation: 1 }}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{modLabel(id)}</Text>
              <Text style={{ color: '#DBEAFE', fontSize: 12, fontWeight: '700' }}>✕</Text>
            </Pressable>
          );
        })}
        <View style={{ width: 1, height: 26, backgroundColor: '#9AA3B5', marginHorizontal: 3, alignSelf: 'center' }} />
      </>
    );
  };

  const renderBar = () => (
    <View style={{ backgroundColor: '#D2D7E1', flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ paddingLeft: 5, paddingVertical: 5 }}>
        <KbToggleKey active={kbMode === 'panel'} onPress={toggleKbPanel} />
      </View>
      <View style={{ width: 1, height: 26, backgroundColor: '#9AA3B5', marginHorizontal: 3, alignSelf: 'center' }} />
      <ScrollView
        horizontal
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 5, paddingVertical: 5, gap: 5, alignItems: 'center' }}
      >
        {/* 실물키보드 패널에서 락한 모디파이어(Ctrl/Alt 등) 상태 표시 — 탭하면 해제 */}
        {renderModChips()}
        {/* 코딩 특수문자만 — 네비게이션/모디파이어 키는 ⌨︎ 특수키 패널에 있음 */}
        {SPECIAL_CHARS.map((ch) => (
          <KeyButton
            key={'t' + ch}
            def={{ id: 't' + ch, label: ch, text: ch }}
            onCommit={(text) => sendTermChar(text)}
            onPopupOpen={setKeyPopup}
            onPopupMove={(i) => setKeyPopup((p) => (p ? { ...p, activeIndex: i } : p))}
            onPopupClose={() => setKeyPopup(null)}
          />
        ))}
      </ScrollView>
    </View>
  );

  const barShowing = enabled && (inputFocused || kbMode === 'panel' || kbSwitching);
  const panelShowing = kbMode === 'panel' || kbSwitching;

  // 콘텐츠(터미널) 높이를 flex 가변이 아니라 "고정"으로 준다 — 이게 팅김 해결의 핵심.
  //  OS 키보드와 특수키 패널은 같은 높이(keyboardHeight)라 두 모드에서 터미널 목표 높이는 동일하다:
  //    contentHeight = fullH - barH - keyboardHeight.
  //  flex:1 로 두면 전환 중 window(adjustResize)가 애니메이션으로 변하는 동안 컨테이너가 따라 늘었다
  //  줄었다 해서 터미널이 튄다. 고정 높이면 window 가 어떻든 터미널은 그대로 — 남는/모자란 하단 영역은
  //  절대배치 overlay(바+패널)가 덮어 안 보인다.
  const contentHeight = Math.max(120, (fullHRef.current || 700) - barH - keyboardHeight);
  const contentStyle = barShowing ? { height: contentHeight } : { flex: 1 };
  const spacer = null; // 고정 높이 컨테이너로 대체(하위 호환용 no-op)

  // 콘텐츠 높이가 바뀌면 xterm 재맞춤(WebView resize 이벤트가 늦을 수 있어 명시 호출).
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => { try { termRef.current?.fit(); } catch (_) { /* noop */ } }, 60);
    return () => clearTimeout(t);
  }, [barShowing, contentHeight, enabled, termRef]);

  // 보조바 + 특수키 패널 — 단일 절대배치(컨테이너의 형제로 렌더).
  const overlay = barShowing ? (
    <View style={{
      position: 'absolute', left: 0, right: 0,
      ...(kbMode === 'panel' || kbSwitching
        ? { top: Math.max(0, (fullHRef.current || 700) - barH - keyboardHeight), bottom: 0, backgroundColor: '#C9CFDA' }
        : { bottom: 0 }),
    }}>
      <View onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h > 0 && Math.abs(h - barH) > 1) setBarH(h); }}>
        {renderBar()}
      </View>
      {kbMode === 'panel' && (
        <View style={{ flex: 1 }}>
          <SpecialKeyPanel
            height={keyboardHeight}
            os={keyboardOS}
            mods={modApi.mods}
            onTapMod={modApi.tap}
            onHoldMod={modApi.hold}
            onKey={onPanelKey}
          />
        </View>
      )}
    </View>
  ) : null;

  // 롱프레스 대체키 팝업 오버레이 — 바 ScrollView 밖(형제)으로 띄워 클리핑 회피.
  const popup = keyPopup ? (() => {
    const n = keyPopup.items.length;
    const popW = n * POPUP_CELL + 8;
    let left = keyPopup.x + keyPopup.width / 2 - POPUP_CELL / 2 - 4;
    left = Math.max(4, Math.min(left, (winWidth || 400) - popW - 4));
    const bottom = kbMode === 'panel' ? keyboardHeight + 4 : 50; // 패널 모드에선 패널 위(바 바로 위)로
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom, zIndex: 1000, elevation: 1000 }}>
        <FadeView dy={6}
          style={{ position: 'absolute', left, flexDirection: 'row', backgroundColor: '#2A2F3A', borderRadius: 10, padding: 4,
            shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 14 }}
        >
          {keyPopup.items.map((it, i) => (
            <View key={it.id} style={{ width: POPUP_CELL, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 7,
              backgroundColor: i === keyPopup.activeIndex ? '#094771' : 'transparent' }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{it.label}</Text>
            </View>
          ))}
        </FadeView>
      </View>
    );
  })() : null;

  // 컨테이너(키보드 리사이즈를 받는 루트 View)의 최대 높이 추적 — 패널 top 계산의 기준.
  const onContainerLayout = useCallback((e: any) => {
    const h = e.nativeEvent.layout.height;
    if (h > fullHRef.current) fullHRef.current = h;
  }, []);

  // TerminalWebView 에 그대로 스프레드할 props.
  const terminalProps = {
    onVmodConsume: modApi.consume,
    onFocusChange: setInputFocused,
  };

  return { contentStyle, spacer, overlay, popup, onContainerLayout, terminalProps, dismiss, kbMode, barShowing };
}
