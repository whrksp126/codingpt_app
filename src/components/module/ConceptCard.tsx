import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  module: {
    type: 'conceptCard';
    items: Array<{
      chip: string;   // "<button>", "text", "</button>"
      title: string;  // 설명 문장
    }>;
  };
}

export const ConceptCardComponent: React.FC<Props> = ({ module }) => {
  return (
    <View className="rounded-[22px] bg-white border border-[#E6E6E6] px-[18px] py-[18px]">
      <View className="gap-[16px]">
        {module.items.map((it, idx) => (
          <View key={`${it.chip}-${idx}`} className="gap-[10px]">
            {/* chip */}
            <View className="self-start rounded-[12px] bg-[#EEF4FF] px-[12px] py-[8px]">
              <Text className="text-[16px] font-[900] text-[#2F6BFF]">
                {it.chip}
              </Text>
            </View>

            {/* description */}
            <Text className="text-[16px] font-[800] text-[#3A3A3A] leading-[22px]">
              {it.title}
            </Text>

            {/* divider (마지막 제외) */}
            {idx !== module.items.length - 1 ? (
              <View className="h-[1px] bg-[#EDEDED] mt-[6px]" />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
};
