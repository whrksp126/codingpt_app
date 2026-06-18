import React, { useEffect } from 'react';
import { View, Image } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, Easing, FadeIn } from 'react-native-reanimated';
import { v2 } from '../theme/v2Tokens';

const C = v2.colors;

// 기존 부트스플래시 로고(초록 CodingPT 워드마크) 그대로 + 하단 실제 로딩 진행 바.
const LOGO = require('../assets/bootsplash/logo.png'); // 180x34
const LOGO_W = 200;
const LOGO_H = Math.round((LOGO_W * 34) / 180);
const TRACK = 132;

/**
 * 컨트롤드 스플래시 — 실제 초기 로딩 진행률/현재 단계를 표시.
 * @param progress 0..1 (실 로드 완료 비율) → 바 채움
 * @param message  현재 처리 중인 작업 문구
 */
export default function SplashScreen({ progress = 0, message = '워크스페이스를 준비하고 있어요' }: { progress?: number; message?: string }) {
  // 실제 진행률로 바 채움(부드럽게 보간)
  const w = useSharedValue(0.04);
  useEffect(() => {
    const p = Math.max(0.04, Math.min(1, progress));
    w.value = withTiming(p, { duration: 450, easing: Easing.out(Easing.cubic) });
  }, [progress, w]);
  const fillStyle = useAnimatedStyle(() => ({ width: w.value * TRACK }));

  // 진행 중 "살아있음" 느낌의 미세 펄스(완료 전까지)
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    if (progress < 1) {
      pulse.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [progress, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={{ flex: 1, backgroundColor: C.base, alignItems: 'center', justifyContent: 'center' }}>
      {/* 중앙: 기존 스플래시 로고 — 전체 화면 정중앙 고정(네이티브 스플래시와 동일 위치) */}
      <Image source={LOGO} style={{ width: LOGO_W, height: LOGO_H }} resizeMode="contain" />

      {/* 하단: 실제 진행 바 + 현재 단계 문구(전환 페이드) — absolute 라 로고 위치 불변 */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 56, alignItems: 'center' }}>
        <View style={{ width: TRACK, height: 2, backgroundColor: C.borderControl, borderRadius: 999, overflow: 'hidden' }}>
          <Animated.View style={[{ height: '100%', backgroundColor: C.accent, borderRadius: 999 }, fillStyle, pulseStyle]} />
        </View>
        <View style={{ height: 16, marginTop: 12, justifyContent: 'center' }}>
          <Animated.Text
            key={message}
            entering={FadeIn.duration(260)}
            style={{ textAlign: 'center', fontSize: 11, color: C.textDim }}
          >
            {message}
          </Animated.Text>
        </View>
      </View>
    </View>
  );
}
