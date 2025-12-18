import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  module: {
    type: 'missionCard';
    title: string;
    rightText?: string;
    sparkle?: boolean;
    items: Array<{ text: string; checked: boolean }>;
  };
}

export const MissionCardComponent: React.FC<Props> = ({ module }) => {
  return (
    <View className="rounded-[18px] bg-white border border-[#E6E6E6] px-[18px] py-[18px]">
      <View className="flex-row items-center justify-between mb-[14px]">
        <Text className="text-[24px] font-[900] text-[#2B2B2B]">{module.title}</Text>
        <View className="flex-row items-center gap-[8px]">
          <Text className="text-[18px] font-[800] text-[#0B8F63]">
            {module.rightText ?? ''}
          </Text>
          {module.sparkle ? <Text className="text-[18px]">✨</Text> : null}
        </View>
      </View>

      <View className="gap-[14px]">
        {module.items.map((it, idx) => (
          <View key={`${it.text}-${idx}`} className="flex-row items-center gap-[10px]">
            <View
              className={`w-[26px] h-[26px] rounded-full items-center justify-center border ${
                it.checked ? 'border-[#0B8F63]' : 'border-[#CFCFCF]'
              }`}
            >
              <Text className={`${it.checked ? 'text-[#0B8F63]' : 'text-[#CFCFCF]'} text-[16px] font-[900]`}>
                ✓
              </Text>
            </View>
            <Text className="text-[18px] font-[800] text-[#4A4A4A]">{it.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};
