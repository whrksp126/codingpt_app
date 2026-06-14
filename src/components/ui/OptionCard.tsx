import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Check, IconProps } from 'phosphor-react-native';
import { v2Colors, v2Radius, v2Font } from '../../theme/v2Tokens';
import PressableScale from './PressableScale';

interface OptionCardProps {
  Icon: React.ComponentType<IconProps>;
  label: string;
  selected?: boolean;
  multi?: boolean;       // true=복수(체크), false=단일(원형 점)
  onPress?: () => void;
}

// 그리드 카드(아이콘 상단 + 라벨 하단). 선택 시 민트 보더 + accentTint 배경 + 우상단 민트 뱃지.
const OptionCard: React.FC<OptionCardProps> = ({ Icon, label, selected, onPress }) => {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      dim={0.08}
      android_ripple={{ color: 'rgba(255,255,255,0.06)' }}
      style={[
        styles.card,
        {
          backgroundColor: selected ? v2Colors.accentTint : v2Colors.elevated2,
          borderColor: selected ? v2Colors.accent : v2Colors.borderControl,
        },
      ]}
    >
      <Icon size={24} color={selected ? v2Colors.accent : v2Colors.text3} weight="regular" />
      <Text style={styles.label}>{label}</Text>
      {selected && (
        <View style={styles.badge}>
          <Check size={12} color={v2Colors.onAccent} weight="bold" />
        </View>
      )}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  card: {
    minHeight: 96,
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: v2Radius.lg,
    borderWidth: 1,
  },
  label: {
    fontFamily: v2Font.sans,
    fontSize: 15,
    fontWeight: v2Font.weight.semibold,
    color: v2Colors.text,
    letterSpacing: -0.15,
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 20,
    height: 20,
    borderRadius: v2Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: v2Colors.accent,
  },
});

export default OptionCard;
