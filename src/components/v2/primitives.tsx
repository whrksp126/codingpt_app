import React from 'react';
import { View, Text, TextInput, StyleProp, ViewStyle, TextStyle } from 'react-native';
import PressableScale from '../ui/PressableScale';
import { v2 } from '../../theme/v2Tokens';

const C = v2.colors;
const R = v2.radius;

// 스택 브랜드 컬러(배지 액센트). 디자인 STACK_DOT 기반.
export const STACK_DOT: Record<string, string> = {
  React: '#34D399', 'Next.js': '#94A3B8', Node: '#34D399',
  Python: '#60A5FA', Vue: '#34D399', Expo: '#60A5FA',
};
// 배지에 표기할 짧은 브랜드 이니셜
const TECH_INITIAL: Record<string, string> = {
  React: 'Re', 'Next.js': 'Nx', Node: 'No', Python: 'Py', Vue: 'Vu', Expo: 'Ex',
};

// ── Btn — primary(딥그린)/accent(민트)/ghost/outline ───────────────
type BtnVariant = 'primary' | 'accent' | 'ghost' | 'outline';
export function Btn({
  children, variant = 'primary', full, sm, icon, onPress, style, disabled,
}: {
  children?: React.ReactNode; variant?: BtnVariant; full?: boolean; sm?: boolean;
  icon?: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean;
}) {
  const variants: Record<BtnVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: C.cta, fg: '#fff', border: 'transparent' },
    accent: { bg: C.accent, fg: C.onAccent, border: 'transparent' },
    ghost: { bg: C.elevated2, fg: C.text, border: C.border },
    outline: { bg: 'transparent', fg: C.text, border: C.borderControl },
  };
  const v = variants[variant];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={[{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
        height: sm ? 34 : 42, paddingHorizontal: sm ? 12 : 16,
        alignSelf: full ? 'stretch' : 'flex-start',
        borderRadius: R.md, borderWidth: 1, borderColor: v.border, backgroundColor: v.bg,
        opacity: disabled ? 0.5 : 1,
      }, style]}
    >
      {icon}
      {typeof children === 'string'
        ? <Text style={{ color: v.fg, fontSize: sm ? 13 : 14, fontWeight: '600', fontFamily: v2.font.sans, letterSpacing: -0.1 }}>{children}</Text>
        : children}
    </PressableScale>
  );
}

// ── Chip — 헤어라인 아웃라인, 모노크롬 기본 ─────────────────────────
export function Chip({
  children, tone = 'neutral', icon, style,
}: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'info'; icon?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const fg = tone === 'accent' ? C.accent : tone === 'info' ? C.info : C.text3;
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: R.sm, borderWidth: 1, borderColor: C.borderControl, backgroundColor: 'transparent',
    }, style]}>
      {icon}
      <Text style={{ color: fg, fontSize: 12, fontWeight: '500', fontFamily: v2.font.sans }}>{children}</Text>
    </View>
  );
}

// 스택 칩(브랜드 점 + 이름)
export function StackChip({ name }: { name: string }) {
  return (
    <Chip icon={<View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: STACK_DOT[name] || '#64748B' }} />}>
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
      flexDirection: 'row', alignItems: 'center', gap: 9, height: 42, paddingHorizontal: 12,
      borderRadius: R.md, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.surface,
    }, style]}>
      {icon}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onPressIn={onPressIn}
        placeholder={placeholder}
        placeholderTextColor={C.textDim}
        style={{ flex: 1, color: C.text, fontSize: 14, fontFamily: mono ? v2.font.mono : v2.font.sans, padding: 0 }}
      />
    </View>
  );
}

// ── Label — 작은 모노 대문자 dim ───────────────────────────────────
export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[{
      fontFamily: v2.font.mono, fontSize: 11, letterSpacing: 0.4, color: C.textDim,
    }, style]}>{String(children).toUpperCase()}</Text>
  );
}

// ── SecHead — 섹션 라벨 + 액션 ─────────────────────────────────────
export function SecHead({ children, action, onAction }: { children: React.ReactNode; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
      <Label>{children}</Label>
      {action ? (
        <Text onPress={onAction} style={{ fontSize: 12, color: C.accent, fontWeight: '600', fontFamily: v2.font.sans }}>{action}</Text>
      ) : null}
    </View>
  );
}

// ── TechBadge — 스택 브랜드 배지 + AI 수정 미확인 빨강 배지 ─────────
export function TechBadge({ tech, unread = 0, size = 44 }: { tech: string; unread?: number; size?: number }) {
  const dot = STACK_DOT[tech] || C.text3;
  const initial = TECH_INITIAL[tech] || (tech ? tech[0] : '?');
  return (
    <View style={{ width: size, height: size, borderRadius: 11, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: dot, fontSize: Math.round(size * 0.34), fontWeight: '700', fontFamily: v2.font.mono }}>{initial}</Text>
      {unread > 0 && (
        <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 999, backgroundColor: C.error, borderWidth: 2, borderColor: C.base, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{unread}</Text>
        </View>
      )}
    </View>
  );
}

// ── Thumb — 절제된 모노크롬 와이어 프리뷰 썸네일(사진 아님) ─────────
export function Thumb({ kind = 'list', size = 56 }: { kind?: 'list' | 'page' | 'chart'; size?: number }) {
  const dim = C.borderControl;
  const acc = 'rgba(52,211,153,0.5)';
  const bar = (w: number | string, c: string, key?: number) => (
    <View key={key} style={{ height: 3, width: w as any, borderRadius: 2, backgroundColor: c }} />
  );
  return (
    <View style={{ width: size, height: size, borderRadius: 9, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, overflow: 'hidden', padding: 7, gap: 4, justifyContent: kind === 'chart' ? 'flex-end' : 'flex-start' }}>
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
