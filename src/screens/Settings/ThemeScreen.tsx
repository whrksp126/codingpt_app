import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CheckCircle, Circle } from 'phosphor-react-native';
import { CaretLeft } from '../../assets/SvgIcon';
import DefaultIconBtn from '../../components/Button/DefaultIconBtn';
import RippleButton from '../../components/Button/RippleButton';
import { useTheme, ThemePreference } from '../../contexts/ThemeContext';

const OPTIONS: Array<{ value: ThemePreference; label: string; description: string }> = [
  { value: 'system', label: '시스템', description: '기기 설정에 맞춰요' },
  { value: 'light', label: '라이트', description: '항상 라이트 모드' },
  { value: 'dark', label: '다크', description: '항상 다크 모드' },
];

const Header: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View className="w-full bg-white dark:bg-[#0A0D14] border-b border-[#cccccc] dark:border-[#3F444D]">
      <View
        className="flex-row items-center px-[16px] pt-[4px] pb-[10px]"
        style={{ paddingTop: Math.max(insets.top, 10) }}
      >
        <DefaultIconBtn
          onPress={() => navigation.goBack()}
          size={35}
          enableHapticFeedback={true}
          enableSound={true}
          pressScale={0.85}
          pressOpacity={0.6}
          bounceScale={1.15}
        >
          <CaretLeft width={35} height={35} fill="#CCCCCC" />
        </DefaultIconBtn>
        <View className="flex-1 items-center justify-center">
          <Text className="text-[22px] font-bold text-[#111111] dark:text-white">테마</Text>
        </View>
        <View className="w-[35px]" />
      </View>
    </View>
  );
};

const ThemeScreen: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <View className="flex-1 bg-white dark:bg-[#0A0D14]">
      <Header />
      <View className="px-[16px] pt-[20px]">
        <View className="rounded-[10px] border border-[#cccccc] dark:border-[#3F444D] overflow-hidden">
          {OPTIONS.map((opt, idx) => {
            const active = theme === opt.value;
            const isLast = idx === OPTIONS.length - 1;
            return (
              <RippleButton
                key={opt.value}
                onPress={() => setTheme(opt.value)}
                className={`flex-row items-center justify-between px-[14px] py-[14px] ${isLast ? '' : 'border-b border-[#cccccc] dark:border-[#3F444D]'}`}
              >
                <View className="flex-1">
                  <Text className="text-[18px] font-bold text-[#3c3c3c] dark:text-[#E1E6EF]">
                    {opt.label}
                  </Text>
                  <Text className="text-[13px] text-[#777777] dark:text-[#9CA3AF] mt-[2px]">
                    {opt.description}
                  </Text>
                </View>
                {active ? (
                  <CheckCircle size={26} color="#FFC700" weight="fill" />
                ) : (
                  <Circle size={26} color="#CCCCCC" weight="regular" />
                )}
              </RippleButton>
            );
          })}
        </View>
      </View>
    </View>
  );
};

export default ThemeScreen;
