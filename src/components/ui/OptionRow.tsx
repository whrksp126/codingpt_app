import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Check } from 'phosphor-react-native';
import { IconProps } from 'phosphor-react-native';
import { v2Colors, v2Radius, v2Font } from '../../theme/v2Tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';
import PressableScale from './PressableScale';

interface OptionRowProps {
  Icon?: React.ComponentType<IconProps>;
  label: string;
  sub?: string;
  selected?: boolean;
  multi?: boolean;       // true=복수(라운드 사각 체크), false=단일(라디오)
  onPress?: () => void;
}

// 리스트 행(아이콘 박스 + 라벨/보조 + 라디오/체크). 선택 = 무채색 selected 워시(§0.5 — 액센트 금지).
const OptionRow: React.FC<OptionRowProps> = ({ Icon, label, sub, selected, multi, onPress }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      dim={0.08}
      android_ripple={{ color: v2Colors.pressed }}
      style={[
        styles.row,
        {
          backgroundColor: selected ? v2Colors.selected : v2Colors.surface,
          borderColor: v2Colors.borderControl,
        },
      ]}
    >
      {Icon && (
        <View
          style={[
            styles.iconBox,
            { backgroundColor: v2Colors.elevated2 },
          ]}
        >
          <Icon size={18} color={selected ? v2Colors.text : v2Colors.text3} weight="regular" />
        </View>
      )}
      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        {sub && <Text style={styles.sub}>{sub}</Text>}
      </View>
      <View
        style={[
          styles.check,
          {
            borderRadius: multi ? 6 : v2Radius.pill,
            borderWidth: selected ? 1 : 1.5,
            borderColor: selected ? v2Colors.text : v2Colors.borderControl,
            backgroundColor: selected ? v2Colors.text : 'transparent',
          },
        ]}
      >
        {selected && <Check size={12} color={v2Colors.base} weight="bold" />}
      </View>
    </PressableScale>
  );
};

// 색·글꼴은 렌더 시점 값 — 테마 전환 때 useThemedStyles 가 다시 만든다(모듈 로드 시 굳히기 금지).
const makeStyles = () => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: v2Radius.lg,
    borderWidth: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: v2Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: v2Font.sans,
    fontSize: 14,
    fontWeight: v2Font.weight.semibold,
    color: v2Colors.text,
    letterSpacing: -0.14,
  },
  sub: {
    fontFamily: v2Font.sans,
    fontSize: 11.5,
    color: v2Colors.textDim,
    marginTop: 2,
  },
  check: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default OptionRow;
