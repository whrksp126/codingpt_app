import React from 'react';
import { View, Text, Image } from 'react-native';
import { Lock } from 'phosphor-react-native';
import BaseModal from './BaseModal';

export interface AchievementDetail {
  code: string;
  name: string;
  icon: any;
  unlocked: boolean;
  condition: string;
  unlockedDescription: string;
}

interface Props {
  achievement: AchievementDetail | null;
  visible: boolean;
  onClose: () => void;
}

const AchievementDetailModal: React.FC<Props> = ({ achievement, visible, onClose }) => {
  if (!achievement) return null;

  return (
    <BaseModal visible={visible} onClose={onClose}>
      <View className="px-[24px] pt-[6px] pb-[16px] items-center gap-[14px]">
        <View className="relative w-[120px] h-[120px] items-center justify-center">
          <Image
            source={achievement.icon}
            className="w-[120px] h-[120px]"
            resizeMode="contain"
            style={{ opacity: achievement.unlocked ? 1 : 0.3 }}
          />
          {!achievement.unlocked && (
            <View className="absolute inset-0 items-center justify-center">
              <Lock size={42} color="#888" weight="fill" />
            </View>
          )}
        </View>

        <Text className="text-[22px] font-bold text-[#111111] dark:text-white">
          {achievement.name}
        </Text>

        <View
          className={`px-[12px] py-[4px] rounded-full ${
            achievement.unlocked
              ? 'bg-[#F0FFE5] dark:bg-[#1F3A1A]'
              : 'bg-[#F5F5F5] dark:bg-[#23272F]'
          }`}
        >
          <Text
            className={`text-[12px] font-bold ${
              achievement.unlocked
                ? 'text-[#58CC02]'
                : 'text-[#777777] dark:text-[#9CA3AF]'
            }`}
          >
            {achievement.unlocked ? '획득' : '잠금'}
          </Text>
        </View>

        <Text className="text-[15px] text-[#3c3c3c] dark:text-[#E1E6EF] text-center leading-[22px]">
          {achievement.unlocked
            ? achievement.unlockedDescription
            : achievement.condition}
        </Text>
      </View>
    </BaseModal>
  );
};

export default AchievementDetailModal;
