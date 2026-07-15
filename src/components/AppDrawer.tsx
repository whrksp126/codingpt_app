import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, PanResponder, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useWorkspaceStore } from '../contexts/WorkspaceStoreContext';
import SidebarContent from './SidebarContent';
import { useSidebarWidth, setSidebarWidth, getSidebarWidth, SB_MIN } from '../workspace/sidebarWidth';

const C = v2.colors;

// 폰(좁은 화면) 전용 오버레이 드로어 — 본문은 SidebarContent 공용.
// 태블릿(큰 화면)에서는 렌더하지 않고, 셸이 SidebarContent 를 좌측에 도킹한다.
// 폭은 도킹 사이드바와 같은 저장값(app:sidebarW)을 공유하되 폰 화면의 86% 를 상한으로 클램프.
export default function AppDrawer() {
  const { open, closeDrawer } = useDrawer();
  const { reload } = useWorkspaceStore();
  const { width: winW } = useWindowDimensions();
  const phoneMax = Math.round(winW * 0.86);
  const W = Math.max(SB_MIN, Math.min(phoneMax, useSidebarWidth()));

  const tx = useSharedValue(-W);
  const fade = useSharedValue(0);
  useEffect(() => {
    tx.value = withTiming(open ? 0 : -W, { duration: 260, easing: Easing.out(Easing.cubic) });
    fade.value = withTiming(open ? 1 : 0, { duration: 240 });
  }, [open, W, tx, fade]);

  // 열릴 때 워크스페이스/세션 조용히 갱신.
  useEffect(() => { if (open) void reload(true); }, [open, reload]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value * 0.62 }));

  // 우측 테두리 드래그로 폭 조절(도킹 사이드바와 동일 UX, 값 공유).
  const winWRef = useRef(winW); winWRef.current = winW;
  const startW = useRef(0);
  const [drag, setDrag] = useState(false);
  const clamp = (w: number) => Math.max(SB_MIN, Math.min(Math.round(winWRef.current * 0.86), Math.round(w)));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startW.current = clamp(getSidebarWidth()); setDrag(true); },
      onPanResponderMove: (_e, g) => { setSidebarWidth(clamp(startW.current + g.dx), false); },
      onPanResponderRelease: (_e, g) => { setSidebarWidth(clamp(startW.current + g.dx)); setDrag(false); },
      onPanResponderTerminate: () => setDrag(false),
    }),
  ).current;

  return (
    <View pointerEvents={open ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#05070C' }, backdropStyle]}>
        <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
      </Animated.View>

      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, bottom: 0, width: W, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border }, panelStyle]}>
        <SidebarContent overlay />
        <View {...pan.panHandlers} style={{ position: 'absolute', top: 0, bottom: 0, right: -7, width: 14, zIndex: 40 }}>
          {drag ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: 5, width: 3, backgroundColor: C.accent, opacity: 0.6 }} /> : null}
        </View>
      </Animated.View>
    </View>
  );
}
