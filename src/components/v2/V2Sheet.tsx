import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SPRING_SOFT } from '../../animations/presets';
import { v2 } from '../../theme/v2Tokens';

const C = v2.colors;
const HIDDEN = 1000;

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** 0~1, 시트 최대 높이 비율 (기본 0.88) */
  maxHeightPct?: number;
  /** 시트 배경색 (기본 elevated 카드 톤) */
  background?: string;
  /** 백드롭 탭 / 드래그 다운으로 닫기 허용 (기본 true) */
  dismissable?: boolean;
  /** 하단 세이프에어리어 패딩 적용 (기본 true) */
  padBottom?: boolean;
}

/**
 * 공통 바텀시트 셸 — 하단에서 위로 슬라이드 등장 + 핸들 드래그 다운으로 닫기 + 백드롭 탭 닫기.
 * reanimated + gesture-handler. v2 다크 토큰. 닫힘(exit) 애니메이션을 위해 내부에서 mount 수명 관리:
 * 부모는 visible 만 토글하면 됨(언마운트 전 슬라이드 다운까지 재생).
 *
 * 드래그 제스처는 상단 핸들 영역에만 부착 → 내부 ScrollView 스크롤과 충돌하지 않음.
 */
const V2Sheet: React.FC<Props> = ({
  visible,
  onClose,
  children,
  maxHeightPct = 0.88,
  background = C.elevated,
  dismissable = true,
  padBottom = true,
}) => {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const translateY = useSharedValue(HIDDEN);
  const overlay = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = HIDDEN;
      overlay.value = 0;
      translateY.value = withSpring(0, SPRING_SOFT);
      overlay.value = withTiming(1, { duration: 220 });
    } else {
      overlay.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(
        HIDDEN,
        { duration: 230, easing: Easing.in(Easing.cubic) },
        (fin) => { if (fin) runOnJS(setMounted)(false); },
      );
    }
  }, [visible, translateY, overlay]);

  const startY = useSharedValue(0);
  const pan = Gesture.Pan()
    .enabled(dismissable)
    .onStart(() => { startY.value = translateY.value; })
    .onUpdate((e) => { translateY.value = Math.max(0, startY.value + e.translationY); })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 650) runOnJS(onClose)();
      else translateY.value = withSpring(0, SPRING_SOFT);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.value }));

  if (!mounted) return null;

  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.wrapper}>
          <Animated.View style={[styles.overlay, overlayStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined} />
          </Animated.View>

          <Animated.View
            style={[
              styles.sheet,
              {
                maxHeight: (`${Math.round(maxHeightPct * 100)}%` as any),
                borderColor: C.border, // 테마 전환 대응 — StyleSheet.create 에 굳히지 않는다
                backgroundColor: background,
                paddingBottom: padBottom ? Math.max(insets.bottom, 12) + 6 : 0,
              },
              sheetStyle,
            ]}
          >
            {/* 스프링 오버슈트 시 아래쪽 빈 공간이 비치지 않도록 시트색 확장 영역 */}
            <View pointerEvents="none" style={[styles.bottomExt, { backgroundColor: background }]} />
            {/* 드래그 핸들 — 이 영역에서만 드래그 닫기(스크롤 충돌 방지) */}
            <GestureDetector gesture={pan}>
              <View style={styles.handleArea}>
                <View style={[styles.handle, { backgroundColor: C.borderControl }]} />
              </View>
            </GestureDetector>
            {children}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  wrapper: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
  },
  bottomExt: { position: 'absolute', left: 0, right: 0, top: '100%', height: 400 },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  handle: { width: 40, height: 4, borderRadius: 999 },
});

export default V2Sheet;
