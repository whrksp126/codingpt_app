// SectionHeader — 목록 섹션 머리글 단일 정본(설계 §0.3·§0.8). 13/600 text3, 문장형
//  (대문자 변환·자간 금지). 우측에 IconButton 하나를 둘 수 있다.
import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import IconButton, { IconComponent } from './IconButton';
import { v2 } from '../../theme/v2Tokens';

export type SectionHeaderProps = {
  title: string;
  /** 우측 아이콘 버튼(선택) */
  trailing?: { icon: IconComponent; accessibilityLabel: string; onPress: () => void };
  /** 우측에 임의 노드(선택 — trailing 보다 우선) */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function SectionHeader({ title, trailing, right, style }: SectionHeaderProps) {
  const C = v2.colors;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', minHeight: 32, paddingHorizontal: 12 }, style]}>
      <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, fontSize: v2.font.size.small, fontWeight: '600', color: C.text3, fontFamily: v2.font.sans }}>{title}</Text>
      {right ?? (trailing ? (
        <IconButton icon={trailing.icon} accessibilityLabel={trailing.accessibilityLabel} onPress={trailing.onPress} size={28} iconSize={16} color={C.text3} />
      ) : null)}
    </View>
  );
}
