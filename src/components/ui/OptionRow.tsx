import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Check } from 'phosphor-react-native';
import { IconProps } from 'phosphor-react-native';
import { v2Colors, v2Radius, v2Font } from '../../theme/v2Tokens';
import PressableScale from './PressableScale';

interface OptionRowProps {
  Icon?: React.ComponentType<IconProps>;
  label: string;
  sub?: string;
  selected?: boolean;
  multi?: boolean;       // true=복수(라운드 사각 체크), false=단일(라디오)
  onPress?: () => void;
}

// 리스트 행(아이콘 박스 + 라벨/보조 + 라디오/체크). 선택 시 accentTint 배경 + 민트 보더.
const OptionRow: React.FC<OptionRowProps> = ({ Icon, label, sub, selected, multi, onPress }) => {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      dim={0.08}
      android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
      style={[
        styles.row,
        {
          backgroundColor: selected ? v2Colors.accentTint : v2Colors.surface,
          borderColor: selected ? v2Colors.accent : v2Colors.borderControl,
        },
      ]}
    >
      {Icon && (
        <View
          style={[
            styles.iconBox,
            { backgroundColor: selected ? v2Colors.accentTintStrong : v2Colors.elevated2 },
          ]}
        >
          <Icon size={18} color={selected ? v2Colors.accent : v2Colors.text3} weight="regular" />
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
            borderColor: selected ? v2Colors.accent : v2Colors.borderControl,
            backgroundColor: selected ? v2Colors.accent : 'transparent',
          },
        ]}
      >
        {selected && <Check size={12} color={v2Colors.onAccent} weight="bold" />}
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
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
