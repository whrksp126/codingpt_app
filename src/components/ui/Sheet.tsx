// Sheet — 바텀시트 단일 정본(설계 §0.4·§0.8).
//  · RN Modal(transparent, animationType none) + 스크림 `scrim` 150ms 페이드 + spring 슬라이드
//    (stiffness 322 · damping 30 · mass 1).
//  · 컨테이너 elevated · 윗모서리 radius.sheet(16) · 그래버 36×4 borderControl.
//  · 그래버/헤더 드래그로 닫기(110px 또는 속도 650 — V2Sheet 계승). 본문 스크롤과 충돌하지 않게
//    드래그는 상단(그래버+헤더) 영역에만 붙인다.
//  · KeyboardAvoidingView(SheetFrame 방식) · 하단 여백 max(insets.bottom,16)+8 자동.
//  · Modal 은 독립 네이티브 레이어 — `<KeyAssistOverlay inModal />` 를 자동 마운트한다.
//  · 닫힘 애니메이션까지 재생한 뒤 언마운트 — 부모는 visible 만 토글하면 된다.
//  색은 렌더 시점 조회(테마 전환). StyleSheet.create 에 색을 굳히지 않는다.
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleProp, Text, View, ViewStyle, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { v2 } from '../../theme/v2Tokens';
import { KeyAssistOverlay } from '../keyboard/KeyAssist';

/** 모든 Modal 공통 — iPad 회전에서 Modal 이 세로로 고정되지 않게. */
export const MODAL_ORIENTATIONS: ('portrait' | 'portrait-upside-down' | 'landscape' | 'landscape-left' | 'landscape-right')[] =
  ['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right'];

export const SHEET_SPRING = { stiffness: 322, damping: 30, mass: 1 } as const;
const SCRIM_MS = 150;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 650;

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** 0~1, 시트 최대 높이 비율(기본 0.88) */
  maxHeightPct?: number;
  /** 스크림 탭·드래그·뒤로가기로 닫기 허용(기본 true) */
  dismissable?: boolean;
  /** 헤더 제목(16/600). 드래그 영역에 포함된다 */
  title?: string;
  /** 제목 대신/옆에 둘 커스텀 헤더(드래그 영역에 포함) */
  header?: React.ReactNode;
  /** 본문 좌우 안쪽 여백(기본 16). 전폭 목록이면 0 */
  paddingHorizontal?: number;
  /** 하단 세이프에어리어 여백 자동 적용(기본 true) */
  padBottom?: boolean;
  /** 컨테이너 추가 스타일(배경·반경은 덮지 말 것) */
  style?: StyleProp<ViewStyle>;
  /** 닫힘 애니메이션이 끝나 언마운트된 뒤 */
  onClosed?: () => void;
};

export default function Sheet({
  visible, onClose, children, maxHeightPct = 0.88, dismissable = true, title, header,
  paddingHorizontal = 16, padBottom = true, style, onClosed,
}: SheetProps) {
  const C = v2.colors;
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const hidden = Math.max(winH, 800);
  const [mounted, setMounted] = useState(visible);
  const ty = useSharedValue(hidden);
  const scrim = useSharedValue(0);
  const startY = useSharedValue(0);

  const finishClose = () => { setMounted(false); onClosed?.(); };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      ty.value = hidden;
      scrim.value = 0;
      ty.value = withSpring(0, SHEET_SPRING);
      scrim.value = withTiming(1, { duration: SCRIM_MS });
    } else if (mounted) {
      scrim.value = withTiming(0, { duration: SCRIM_MS });
      ty.value = withTiming(hidden, { duration: 200, easing: Easing.in(Easing.cubic) }, (fin) => {
        if (fin) runOnJS(finishClose)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = Gesture.Pan()
    .enabled(dismissable)
    .onStart(() => { startY.value = ty.value; })
    .onUpdate((e) => { ty.value = Math.max(0, startY.value + e.translationY); })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) runOnJS(onClose)();
      else ty.value = withSpring(0, SHEET_SPRING);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={MODAL_ORIENTATIONS}
      onRequestClose={dismissable ? onClose : () => {}}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim }, scrimStyle]}>
          <Pressable
            style={{ flex: 1 }}
            onPress={dismissable ? onClose : undefined}
            importantForAccessibility="no"
            accessible={false}
          />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              {
                maxHeight: `${Math.round(maxHeightPct * 100)}%` as any,
                backgroundColor: C.elevated,
                borderTopLeftRadius: v2.radius.sheet,
                borderTopRightRadius: v2.radius.sheet,
                borderTopWidth: 1,
                borderColor: C.border,
                paddingBottom: padBottom ? Math.max(insets.bottom, 16) + 8 : 0,
              },
              style,
              sheetStyle,
            ]}
          >
            {/* 스프링 오버슈트 때 시트 아래가 비치지 않도록 같은 색으로 연장 */}
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '100%', height: 400, backgroundColor: C.elevated }} />
            {/* 드래그 닫기 영역 = 그래버 + 헤더(본문 스크롤과 충돌 방지) */}
            <GestureDetector gesture={pan}>
              <View style={{ paddingHorizontal: 16 }}>
                <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: title || header ? 8 : 12 }}>
                  <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl }} />
                </View>
                {header ?? (title ? (
                  <Text numberOfLines={1} accessibilityRole="header" style={{ fontSize: v2.font.size.h2, fontWeight: '600', color: C.text, fontFamily: v2.font.sans, paddingBottom: 12 }}>{title}</Text>
                ) : null)}
              </View>
            </GestureDetector>
            <View style={{ paddingHorizontal, flexShrink: 1 }}>{children}</View>
          </Animated.View>
        </KeyboardAvoidingView>
        {/* Modal 은 독립 네이티브 레이어 — 보조키 오버레이를 여기에도 마운트(전역 규칙) */}
        <KeyAssistOverlay inModal />
      </GestureHandlerRootView>
    </Modal>
  );
}
