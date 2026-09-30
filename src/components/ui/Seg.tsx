// Seg — 세그먼트 선택 단일 정본(설계 §0.8). 선택 = `selected` 워시 + 글씨 text, 나머지 text2.
//  무채색(2026-07-28 사용자 확정 — 상호작용 요소에 액센트 금지). 트랙 elevated2 · 반경 sm.
//  `icon` 을 주면 글자 대신 아이콘을 그린다 — 접근성은 accessibilityLabel(label) 로 유지.
//  (SettingsModal 의 지역 정의를 2026-09-30 이 파일로 옮겼다)
import React from 'react';
import { Text, View } from 'react-native';
import PressableScale from './PressableScale';
import { v2 } from '../../theme/v2Tokens';

export type SegOption<T extends string> = { v: T; label: string; icon?: (color: string) => React.ReactNode };

export default function Seg<T extends string>({ value, options, onChange }: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
}) {
  const C = v2.colors;
  const R = v2.radius;
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.elevated2, borderRadius: R.sm, padding: 2, gap: 2 }}>
      {options.map((o) => {
        const on = value === o.v;
        const fg = on ? C.text : C.text2;
        return (
          <PressableScale
            key={o.v}
            onPress={() => onChange(o.v)}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            scaleTo={0.97}
            style={{
              minWidth: 34, minHeight: 32, paddingHorizontal: o.icon ? 10 : 12, paddingVertical: 5, borderRadius: R.sm - 1,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? C.selected : 'transparent',
            }}
          >
            {o.icon ? o.icon(fg) : <Text style={{ fontSize: v2.font.size.small, fontWeight: on ? '500' : '400', color: fg }}>{o.label}</Text>}
          </PressableScale>
        );
      })}
    </View>
  );
}
