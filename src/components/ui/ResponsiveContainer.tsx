import React from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';

// 큰 화면(태블릿/가로)에서만 콘텐츠를 가운데 정렬 + 최대폭 제한한다.
//  폰에서는 래핑 없이 children 을 그대로 반환 → 폰 레이아웃은 100% 동일(변화 없음).
//  · fill: 세로로 꽉 채워야 하는 컨테이너(flex:1)면 true.
//  · align: 큰 화면에서 콘텐츠 수평 정렬(기본 center).
export default function ResponsiveContainer({
  children,
  maxWidth,
  style,
  innerStyle,
  fill = false,
  align = 'center',
}: {
  children: React.ReactNode;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
  fill?: boolean;
  align?: 'center' | 'flex-start' | 'flex-end';
}) {
  const { isWide, width } = useResponsive(maxWidth);
  if (!isWide) return <>{children}</>;
  const selfAlign = align === 'center' ? 'center' : align === 'flex-end' ? 'flex-end' : 'flex-start';
  // ScrollView/stretch 컨테이너 안에서 width:'100%'+maxWidth 는 콘텐츠 폭으로 shrink-wrap 되어 왼쪽 치우침이 생긴다.
  //  → 바깥은 전체폭(stretch)+alignItems 로 정렬만, 안쪽은 숫자 폭을 확정해 확실히 가운데 배치.
  const cap = maxWidth ?? 600;
  const w = Math.min(cap, width - 24);
  return (
    <View style={[{ alignSelf: 'stretch', alignItems: selfAlign }, fill && { flex: 1 }, style]}>
      <View style={[{ width: w }, fill && { flex: 1 }, innerStyle]}>
        {children}
      </View>
    </View>
  );
}
