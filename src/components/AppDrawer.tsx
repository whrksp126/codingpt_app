import React, { useEffect } from 'react';
import { View, Pressable, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { v2 } from '../theme/v2Tokens';
import { useDrawer } from '../contexts/DrawerContext';
import { useWorkspaceStore } from '../contexts/WorkspaceStoreContext';
import SidebarContent from './SidebarContent';

const C = v2.colors;
const SCREEN_W = Dimensions.get('window').width;
const W = Math.min(330, Math.round(SCREEN_W * 0.86));

// 폰(좁은 화면) 전용 오버레이 드로어 — 본문은 SidebarContent 공용.
// 태블릿(큰 화면)에서는 렌더하지 않고, 셸이 SidebarContent 를 좌측에 도킹한다.
export default function AppDrawer() {
  const { open, closeDrawer } = useDrawer();
  const { reload } = useWorkspaceStore();

  const tx = useSharedValue(-W);
  const fade = useSharedValue(0);
  useEffect(() => {
    tx.value = withTiming(open ? 0 : -W, { duration: 260, easing: Easing.out(Easing.cubic) });
    fade.value = withTiming(open ? 1 : 0, { duration: 240 });
  }, [open, tx, fade]);

  // 열릴 때 워크스페이스/세션 조용히 갱신.
  useEffect(() => { if (open) void reload(true); }, [open, reload]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value * 0.62 }));

  return (
    <View pointerEvents={open ? 'auto' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#05070C' }, backdropStyle]}>
        <Pressable style={{ flex: 1 }} onPress={closeDrawer} />
      </Animated.View>

      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, bottom: 0, width: W, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border }, panelStyle]}>
        <SidebarContent overlay />
      </Animated.View>
    </View>
  );
}
