import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { CheckCircle, Circle } from 'phosphor-react-native';
import { useTheme, ThemePreference } from '../../contexts/ThemeContext';
import { v2 } from '../../theme/v2Tokens';

const C = v2.colors;
const R = v2.radius;

const OPTIONS: Array<{ value: ThemePreference; label: string; description: string }> = [
  { value: 'system', label: '시스템', description: '기기 설정에 맞춰요' },
  { value: 'light', label: '라이트', description: '항상 라이트 모드' },
  { value: 'dark', label: '다크', description: '항상 다크 모드' },
];

// 테마 — 내 정보 시트의 설정 하위 패널(V2). 헤더는 시트가 제공.
const ThemeContent: React.FC = () => {
  const { theme, setTheme } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.base }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.surface }}>
        {OPTIONS.map((opt, idx) => {
          const active = theme === opt.value;
          const last = idx === OPTIONS.length - 1;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setTheme(opt.value)}
              android_ripple={{ color: C.elevated2 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 15, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.border }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.text }}>{opt.label}</Text>
                <Text style={{ fontSize: 12.5, color: C.textDim, marginTop: 2 }}>{opt.description}</Text>
              </View>
              {active
                ? <CheckCircle size={24} color={C.accent} weight="fill" />
                : <Circle size={24} color={C.borderControl} weight="regular" />}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
};

export default ThemeContent;
