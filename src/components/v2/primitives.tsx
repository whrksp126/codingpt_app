import React from 'react';
import { View, Text, TextInput, StyleProp, ViewStyle, TextStyle } from 'react-native';
import PressableScale from '../ui/PressableScale';
import Button, { type ButtonVariant } from '../ui/Button';
import { v2, currentScheme } from '../../theme/v2Tokens';

const C = v2.colors;
const R = v2.radius;

// 스택 점 색 — 무채색(2026-09-30 §0.8: 액센트는 상태 신호 전용, 브랜드 색 점 폐기).
//  값은 렌더 시점 토큰을 읽는 getter(테마 전환 대응). 두 단계 명암만 쓴다(text2 / text3).
export const STACK_DOT: Record<string, string> = Object.defineProperties({} as Record<string, string>, {
  React: { enumerable: true, get: () => v2.colors.text2 },
  'Next.js': { enumerable: true, get: () => v2.colors.text3 },
  Node: { enumerable: true, get: () => v2.colors.text2 },
  Python: { enumerable: true, get: () => v2.colors.text3 },
  Vue: { enumerable: true, get: () => v2.colors.text2 },
  Expo: { enumerable: true, get: () => v2.colors.text3 },
});
// 배지에 표기할 짧은 브랜드 이니셜
const TECH_INITIAL: Record<string, string> = {
  React: 'Re', 'Next.js': 'Nx', Node: 'No', Python: 'Py', Vue: 'Vu', Expo: 'Ex',
};

// ── Btn — 구 API 호환 래퍼. 모양은 ui/Button 정본(§0.8)을 그대로 쓴다 ──────────
//  primary·accent → Button primary(text 채움 / base 글씨) · ghost·outline → Button secondary(hover + borderControl).
//  sm → Button sm(36) · full → 가로로 늘림(alignSelf stretch). 글자가 아닌 children 은 같은 규격의 상자에 담는다.
type BtnVariant = 'primary' | 'accent' | 'ghost' | 'outline';
const BTN_VARIANT: Record<BtnVariant, ButtonVariant> = { primary: 'primary', accent: 'primary', ghost: 'secondary', outline: 'secondary' };
export function Btn({
  children, variant = 'primary', full, sm, icon, onPress, style, disabled,
}: {
  children?: React.ReactNode; variant?: BtnVariant; full?: boolean; sm?: boolean;
  icon?: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean;
}) {
  const bv = BTN_VARIANT[variant];
  if (typeof children === 'string' || children == null) {
    return (
      <Button
        label={typeof children === 'string' ? children : ''}
        variant={bv}
        size={sm ? 'sm' : 'md'}
        icon={icon}
        onPress={onPress}
        disabled={disabled}
        style={[full ? { alignSelf: 'stretch' } : null, style]}
      />
    );
  }
  const primary = bv === 'primary';
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      baseOpacity={disabled ? 0.34 : 1}
      style={[{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: sm ? 36 : 44, paddingHorizontal: sm ? 12 : 16,
        alignSelf: full ? 'stretch' : 'flex-start',
        borderRadius: R.md, borderWidth: primary ? 0 : 1, borderColor: C.borderControl,
        backgroundColor: primary ? C.text : C.hover,
      }, style]}
    >
      {icon}
      {children}
    </PressableScale>
  );
}

// ── Chip — 헤어라인 아웃라인, 모노크롬 기본 ─────────────────────────
export function Chip({
  children, tone = 'neutral', icon, style,
}: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'info'; icon?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const fg = tone === 'accent' ? C.text2 : tone === 'info' ? C.info : C.text3;
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: R.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: 'transparent',
    }, style]}>
      {icon}
      <Text style={{ color: fg, fontSize: v2.font.size.caption, fontWeight: '500', fontFamily: v2.font.sans }}>{children}</Text>
    </View>
  );
}

// 스택 칩(브랜드 점 + 이름)
export function StackChip({ name }: { name: string }) {
  return (
    <Chip icon={<View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: STACK_DOT[name] || C.textDim }} />}>
      {name}
    </Chip>
  );
}

// ── Field — 검색/입력 ──────────────────────────────────────────────
export function Field({
  placeholder, icon, value, onChangeText, mono, style, onPressIn,
}: {
  placeholder?: string; icon?: React.ReactNode; value?: string;
  onChangeText?: (t: string) => void; mono?: boolean; style?: StyleProp<ViewStyle>; onPressIn?: () => void;
}) {
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12,
      borderRadius: R.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated,
    }, style]}>
      {icon}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onPressIn={onPressIn}
        placeholder={placeholder}
        placeholderTextColor={C.textDim}
        keyboardAppearance={currentScheme()}
        style={{ flex: 1, color: C.text, fontSize: v2.font.size.body, fontFamily: mono ? v2.font.mono : v2.font.sans, padding: 0 }}
      />
    </View>
  );
}

// ── Label — 섹션 라벨(§0.3: 12/600 text3 문장형 — 대문자·자간·모노 금지) ─────────
export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[{
      fontFamily: v2.font.sans, fontSize: v2.font.size.caption, fontWeight: '600', letterSpacing: 0, color: C.text3,
    }, style]}>{String(children)}</Text>
  );
}

// ── SecHead — 섹션 라벨 + 액션 ─────────────────────────────────────
export function SecHead({ children, action, onAction }: { children: React.ReactNode; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
      <Label>{children}</Label>
      {action ? (
        <Text onPress={onAction} style={{ fontSize: v2.font.size.small, color: C.text2, fontWeight: '500', fontFamily: v2.font.sans }}>{action}</Text>
      ) : null}
    </View>
  );
}

// ── TechBadge — 스택 배지 + 미확인 카운트(무채색 — §0.6: 빨강 배지 폐기, text 채움 / base 글씨) ─────────
export function TechBadge({ tech, unread = 0, size = 44 }: { tech: string; unread?: number; size?: number }) {
  const dot = STACK_DOT[tech] || C.text3;
  const initial = TECH_INITIAL[tech] || (tech ? tech[0] : '?');
  return (
    <View style={{ width: size, height: size, borderRadius: R.lg, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: dot, fontSize: Math.round(size * 0.34), fontWeight: '600', fontFamily: v2.font.mono }}>{initial}</Text>
      {unread > 0 && (
        <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 999, backgroundColor: C.text, borderWidth: 2, borderColor: C.base, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: C.base }}>{unread}</Text>
        </View>
      )}
    </View>
  );
}

// ── Thumb — 절제된 모노크롬 와이어 프리뷰 썸네일(사진 아님) ─────────
export function Thumb({ kind = 'list', size = 56 }: { kind?: 'list' | 'page' | 'chart'; size?: number }) {
  const dim = C.borderControl;
  const acc = C.text; // 강조 막대 — 액센트 대신 1차 글자색(무채색)
  const bar = (w: number | string, c: string, key?: number) => (
    <View key={key} style={{ height: 3, width: w as any, borderRadius: 2, backgroundColor: c }} />
  );
  return (
    <View style={{ width: size, height: size, borderRadius: R.md, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, overflow: 'hidden', padding: 7, gap: 4, justifyContent: kind === 'chart' ? 'flex-end' : 'flex-start' }}>
      {kind === 'list' && <>{bar(18, acc, 1)}{bar('100%', dim, 2)}{bar('100%', dim, 3)}{bar('70%', dim, 4)}</>}
      {kind === 'page' && <><View style={{ height: 9, backgroundColor: dim, borderRadius: 2, marginBottom: 2 }} />{bar('60%', acc, 1)}{bar('100%', dim, 2)}{bar('85%', dim, 3)}</>}
      {kind === 'chart' && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, flex: 1 }}>
          {[40, 70, 50, 90, 60].map((v, i) => (
            <View key={i} style={{ flex: 1, height: `${v}%`, backgroundColor: i === 3 ? acc : dim, borderRadius: 1 }} />
          ))}
        </View>
      )}
    </View>
  );
}

export const v2c = C;
