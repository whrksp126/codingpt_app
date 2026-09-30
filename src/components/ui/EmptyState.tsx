// EmptyState — 빈 상태 단일 패턴(설계 §0.6·§0.8). 화면 위쪽 1/3 지점에 제목 15/500 text2 +
//  설명 13 textDim 한 줄 + 버튼 최대 1개. 아이콘·일러스트는 넣지 않는다.
import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import Button, { ButtonVariant } from './Button';
import { v2 } from '../../theme/v2Tokens';

export type EmptyStateProps = {
  title: string;
  sub?: string;
  /** 버튼 1개(선택) */
  action?: { label: string; onPress: () => void; variant?: ButtonVariant };
  /** 위쪽 1/3 배치 대신 가운데 정렬(좁은 패널 안 등) */
  centered?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function EmptyState({ title, sub, action, centered, style }: EmptyStateProps) {
  const C = v2.colors;
  return (
    <View
      style={[
        centered
          ? { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }
          : { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: '30%' as any },
        style,
      ]}
    >
      <Text style={{ fontSize: v2.font.size.body, fontWeight: '500', color: C.text2, textAlign: 'center', fontFamily: v2.font.sans }}>{title}</Text>
      {sub ? (
        <Text numberOfLines={2} style={{ marginTop: 6, fontSize: v2.font.size.small, lineHeight: 18, color: C.textDim, textAlign: 'center', fontFamily: v2.font.sans }}>{sub}</Text>
      ) : null}
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant={action.variant ?? 'secondary'} size="sm" style={{ marginTop: 16, alignSelf: 'center' }} />
      ) : null}
    </View>
  );
}
