// 승인·질문 카드 공용 부품(2026-09-30 디자인 리프레시 §0.7·§0.8) — ApprovalCard(모달)·QuestionDock(도크)가
//  같은 시각 언어를 쓰도록 한 벌로 둔다(PC `.apc-qopt` 와 같은 규칙).
//
//  · 선택지 = 세로 번호 행 h44 · 반경 md. 기본은 헤어라인 테두리만, 고른 행 = `selected` 워시 + 글자 text
//    (예전의 hover 파랑 + text3 테두리 조합은 폐기). 1번(주 선택) = Button primary 규격(text 채움 / base 글씨),
//    거절 = Button danger 규격(글씨 error).
//  · 카드 = elevated · 반경 lg · 헤어라인. 막고 있는 요청은 왼쪽 2px `warn` 막대(색이 붙는 유일한 신호).
//  · ★ 행은 PressableScale 이다 — 대화 테스트(convBody)가 '허용' 행을 PressableScale 타입으로 집는다.
import React, { useState } from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { Check } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import KeyTextInput from '../keyboard/KeyTextInput';

export type OptionTone = 'plain' | 'primary' | 'danger';

/** 선택지 행 바탕 — 렌더 시점 토큰. */
export function optionRowStyle(tone: OptionTone, selected: boolean): ViewStyle {
  const C = v2.colors;
  return {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: v2.radius.md,
    backgroundColor: tone === 'primary' ? C.text : selected ? C.selected : 'transparent',
    borderWidth: 1,
    borderColor: tone === 'primary' ? 'transparent' : selected ? C.borderControl : C.border,
  };
}

/** 선택지 행 글자색. */
export function optionLabelColor(tone: OptionTone): string {
  const C = v2.colors;
  return tone === 'primary' ? C.base : tone === 'danger' ? C.error : C.text;
}

/** 번호 선택지 행 — `N` 이 앞에(TUI 배치), 라벨 15 · 설명 13 textDim, 고르면 뒤에 체크. `right` 는 행내 코멘트 등. */
export function OptionRow({
  num, label, desc, tone = 'plain', selected = false, disabled, onPress, right, labelLines = 2,
}: {
  num: number | string;
  label: string;
  desc?: string;
  tone?: OptionTone;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  right?: React.ReactNode;
  labelLines?: number;
}) {
  const C = v2.colors;
  const fg = optionLabelColor(tone);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.98}
      baseOpacity={disabled ? 0.5 : 1}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      style={optionRowStyle(tone, selected)}
    >
      <Text style={{ color: tone === 'primary' ? C.base : C.textDim, opacity: tone === 'primary' ? 0.7 : 1, fontSize: v2.font.size.caption, fontFamily: v2.font.mono as string, minWidth: 14 }}>{num}</Text>
      <View style={{ flexShrink: 1, flexGrow: right ? 0 : 1 }}>
        <Text style={{ color: fg, fontSize: v2.font.size.body, fontWeight: selected || tone === 'primary' ? '500' : '400' }} numberOfLines={labelLines}>{label}</Text>
        {desc ? (
          <Text style={{ color: tone === 'primary' ? C.base : C.textDim, opacity: tone === 'primary' ? 0.75 : 1, fontSize: v2.font.size.small, marginTop: 1 }} numberOfLines={2}>{desc}</Text>
        ) : null}
      </View>
      {right !== undefined ? right : null}
      {selected && tone === 'plain' ? <Check size={16} color={C.text} weight="bold" /> : null}
    </PressableScale>
  );
}

/** 행내 코멘트 입력(TUI 인라인 입력 동치) — 밑줄형. 주 선택 행 위에서는 글자색을 반전한다. */
export function RowComment({ value, onChange, onSubmit, editable, placeholder, tone = 'plain' }: {
  value: string; onChange: (t: string) => void; onSubmit: () => void; editable: boolean; placeholder: string; tone?: OptionTone;
}) {
  const C = v2.colors;
  const inv = tone === 'primary';
  return (
    <KeyTextInput
      value={value}
      onChangeText={onChange}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={inv ? C.base : C.textDim}
      returnKeyType="send"
      onSubmitEditing={onSubmit}
      style={{
        flex: 1, minWidth: 56, color: inv ? C.base : C.text, fontSize: v2.font.size.small, padding: 0, paddingBottom: 2,
        borderBottomWidth: 1, borderBottomColor: inv ? C.base : C.borderControl, minHeight: 20, opacity: inv ? 0.9 : 1,
      }}
    />
  );
}

/** 자유 입력 칸 — elevated · 반경 md · 헤어라인, 포커스 = borderStrong(설계 §0.7 입력 1체계). */
export function FreeInput({ value, onChangeText, editable, placeholder, multiline, style }: {
  value: string; onChangeText: (t: string) => void; editable: boolean; placeholder: string; multiline?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const C = v2.colors;
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{
      borderWidth: 1, borderColor: focused ? C.borderStrong : C.borderControl, backgroundColor: C.elevated,
      borderRadius: v2.radius.md, paddingHorizontal: 12, paddingVertical: 9,
    }, style]}>
      <KeyTextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={C.textDim}
        style={{ color: C.text, fontSize: v2.font.size.body, padding: 0, minHeight: 20, maxHeight: multiline ? 96 : undefined, textAlignVertical: multiline ? 'top' : undefined }}
      />
    </View>
  );
}

/** 막는 중 표시 — 카드 왼쪽 2px warn 막대(카드가 overflow:hidden 이어야 모서리가 맞는다). */
export function BlockingBar() {
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, backgroundColor: v2.colors.warn }} />;
}

/** 도구 칩 — elevated2 · 반경 xs · 모노 12. */
export function ToolChip({ name }: { name: string }) {
  const C = v2.colors;
  return (
    <View style={{ backgroundColor: C.elevated2, borderRadius: v2.radius.xs, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text numberOfLines={1} style={{ color: C.text2, fontSize: v2.font.size.caption, fontFamily: v2.font.mono as string }}>{name}</Text>
    </View>
  );
}
