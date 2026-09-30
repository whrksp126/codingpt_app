import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, View, Pressable, PanResponder, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useWorkspaceStore } from '../contexts/WorkspaceStoreContext';
import SidebarContent from './SidebarContent';
import { SHEET_SPRING } from './ui/Sheet';
import { useSidebarWidth, setSidebarWidth, getSidebarWidth, SB_MIN } from '../workspace/sidebarWidth';
import { subscribeTasksUi, getTasksUi } from '../workspace/tasks/tasksUi';
import { subscribeAutomationsUi, getAutomationsUi } from '../workspace/automations/automationsUi';

// 폰(좁은 화면) 전용 오버레이 드로어 — 본문은 SidebarContent 공용.
// 태블릿(큰 화면)에서는 렌더하지 않고, 셸이 SidebarContent 를 좌측에 도킹한다.
// 폭은 도킹 사이드바와 같은 저장값(app:sidebarW)을 공유하되 폰 화면의 86% 를 상한으로 클램프.
//
// 모션(설계 §0.4·§0.8): 시트와 같은 spring(322/30/1, 오버슈트 클램프) 슬라이드 + 스크림 150ms 페이드.
// 동작 줄이기(reduce motion)면 120ms timing. 제스처:
//  · 닫힌 상태 — 화면 왼쪽 가장자리 24px(메인 헤더 아래) 에서 오른쪽으로 끌면 손가락을 따라 열린다.
//  · 열린 상태 — 패널을 왼쪽으로 끌면 따라 닫힌다. 폭의 40% 이상 끌었거나 빠르게 튕기면 닫힘, 아니면 복귀.
//  진행 현황·자동화 장소가 열려 있으면 가장자리 스와이프는 그쪽 "뒤로" 제스처에 양보한다.
const EDGE_W = 24;
const HEADER_H = 44;
const SCRIM_MS = 150;
const CLOSE_FRACTION = 0.4;
const FLING_VX = 0.5;

function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduced(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduced(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduced;
}

const tasksOpen = () => getTasksUi().open;
const autoOpen = () => getAutomationsUi().open;

export default function AppDrawer() {
  const C = v2.colors;
  const { open, openDrawer, closeDrawer } = useDrawer();
  const { reload } = useWorkspaceStore();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const phoneMax = Math.round(winW * 0.86);
  const W = Math.max(SB_MIN, Math.min(phoneMax, useSidebarWidth()));
  const reduced = useReduceMotion();
  const tasksPlace = useSyncExternalStore(subscribeTasksUi, tasksOpen);
  const autoPlace = useSyncExternalStore(subscribeAutomationsUi, autoOpen);
  const placeOpen = tasksPlace || autoPlace;

  const tx = useSharedValue(-W);
  const fade = useSharedValue(0);
  const WRef = useRef(W); WRef.current = W;
  const reducedRef = useRef(reduced); reducedRef.current = reduced;

  const slideTo = useCallback((to: number) => {
    tx.value = reducedRef.current
      ? withTiming(to, { duration: 120, easing: Easing.out(Easing.cubic) })
      : withSpring(to, { ...SHEET_SPRING, overshootClamping: true });
    fade.value = withTiming(to === 0 ? 1 : 0, { duration: reducedRef.current ? 120 : SCRIM_MS });
  }, [tx, fade]);

  useEffect(() => { slideTo(open ? 0 : -W); }, [open, W, slideTo]);

  // 열릴 때 워크스페이스/세션 조용히 갱신.
  useEffect(() => { if (open) void reload(true); }, [open, reload]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // 손가락 위치 → 패널 위치 + 스크림 비율(드래그 중엔 손가락을 그대로 따른다).
  const follow = (x: number) => {
    const w = WRef.current;
    const clamped = Math.max(-w, Math.min(0, x));
    tx.value = clamped;
    fade.value = 1 + clamped / w;
  };

  // 우측 테두리 드래그로 폭 조절(도킹 사이드바와 동일 UX, 값 공유).
  const winWRef = useRef(winW); winWRef.current = winW;
  const startW = useRef(0);
  const resizing = useRef(false);
  const [drag, setDrag] = useState(false);
  const clamp = (w: number) => Math.max(SB_MIN, Math.min(Math.round(winWRef.current * 0.86), Math.round(w)));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => { resizing.current = true; startW.current = clamp(getSidebarWidth()); setDrag(true); },
      onPanResponderMove: (_e, g) => { setSidebarWidth(clamp(startW.current + g.dx), false); },
      onPanResponderRelease: (_e, g) => { setSidebarWidth(clamp(startW.current + g.dx)); resizing.current = false; setDrag(false); },
      onPanResponderTerminate: () => { resizing.current = false; setDrag(false); },
    }),
  ).current;

  // 열린 패널을 왼쪽으로 끌어 닫기 — 캡처 단계에서 가로 우세 이동만 가져간다(세로 스크롤·행 탭은 그대로).
  const openRef = useRef(open); openRef.current = open;
  const closePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        openRef.current && !resizing.current && g.dx < -10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => follow(Math.min(0, g.dx)),
      onPanResponderRelease: (_e, g) => {
        if (-g.dx > WRef.current * CLOSE_FRACTION || g.vx < -FLING_VX) closeDrawer();
        else slideTo(0);
      },
      onPanResponderTerminate: () => slideTo(0),
    }),
  ).current;

  // 닫힌 상태의 가장자리 스와이프로 열기.
  const edgePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => follow(-WRef.current + Math.max(0, g.dx)),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > WRef.current * CLOSE_FRACTION || g.vx > FLING_VX) {
          if (openRef.current) slideTo(0); else openDrawer();
        } else slideTo(-WRef.current);
      },
      onPanResponderTerminate: () => slideTo(-WRef.current),
    }),
  ).current;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {!open && !placeOpen ? (
        <View
          {...edgePan.panHandlers}
          style={{ position: 'absolute', left: 0, width: EDGE_W, top: insets.top + HEADER_H, bottom: 0 }}
        />
      ) : null}

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim }, backdropStyle]}
      >
        <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
      </Animated.View>

      <Animated.View
        {...closePan.panHandlers}
        pointerEvents={open ? 'auto' : 'none'}
        style={[{ position: 'absolute', top: 0, left: 0, bottom: 0, width: W, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border }, panelStyle]}
      >
        <SidebarContent overlay />
        {open ? (
          <View {...pan.panHandlers} style={{ position: 'absolute', top: 0, bottom: 0, right: -7, width: 14, zIndex: 40 }}>
            {drag ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: 5, width: 3, backgroundColor: C.borderControl }} /> : null}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}
