// Toggle — 설정용 스위치 단일 정본(설계 §0.8). 네이티브 Switch 는 플랫폼마다 크기·색이 달라 설정 화면의
//  다른 컨트롤과 어긋나므로 쓰지 않는다(2026-07 사용자 확정).
//  무채색: ON 트랙 text · OFF 트랙 borderControl · 노브 base(PC `.tgl` 미러 — 액센트 금지).
//  SettingsModal 의 지역 사본은 2026-09-30 이 파일로 통합했다(한 벌만 둔다).
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable } from 'react-native';

import { v2 } from '../../theme/v2Tokens';

export type ToggleProps = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export default function Toggle({ value, onValueChange, disabled, accessibilityLabel }: ToggleProps) {
  const C = v2.colors;
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, anim]);
  const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: [C.borderControl, C.text] });
  const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });
  return (
    <Pressable
      onPress={() => { if (disabled) return; onValueChange(!value); }}
      hitSlop={9}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={{ opacity: disabled ? (Platform.OS === 'ios' ? 0.34 : 0.38) : 1 }}
    >
      <Animated.View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: trackColor, justifyContent: 'center' }}>
        <Animated.View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.base, transform: [{ translateX: tx }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 }} />
      </Animated.View>
    </Pressable>
  );
}
