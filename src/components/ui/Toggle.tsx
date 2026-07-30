// Toggle — 설정용 커스텀 스위치. 네이티브 Switch 는 플랫폼마다 크기·색이 달라 설정 화면의 다른
//  컨트롤과 어긋나므로 쓰지 않는다(2026-07 사용자 확정).
//
// SettingsModal.tsx 안에도 같은 구현이 지역 상수로 있다(원본). 이 파일은 **모듈 스코프 공용**판이며
//  트랙/노브 치수·색·지속시간이 원본과 같아야 한다 — 설정 화면 안에서 두 종류 토글이 섞이면 보인다.
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable } from 'react-native';

import { v2 } from '../../theme/v2Tokens';

const C = v2.colors;

export default function Toggle({ value, onValueChange, disabled }: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, anim]);
  const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: [C.borderControl, C.text] });
  const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });
  return (
    <Pressable onPress={() => { if (!disabled) onValueChange(!value); }} hitSlop={6} style={{ opacity: disabled ? 0.5 : 1 }}>
      <Animated.View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: trackColor, justifyContent: 'center' }}>
        <Animated.View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.base, transform: [{ translateX: tx }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 }} />
      </Animated.View>
    </Pressable>
  );
}
