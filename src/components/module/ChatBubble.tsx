import React from 'react';
import { View, Text, Image } from 'react-native';

type Character = 'turtle' | 'raccoon';

interface Props {
  module: {
    type: 'chatBubble';
    text: string;
    character?: Character;
  };
}

const characterMap: Record<Character, any> = {
  turtle: require('../../assets/images/turtle.png'),
  raccoon: require('../../assets/images/raccoon.png'),
};

export const ChatBubbleComponent: React.FC<Props> = ({ module }) => {
  const character = module.character ?? 'raccoon';

  return (
    <View className="flex-row items-end justify-between">
      <View className="max-w-[76%] rounded-[16px] bg-white px-[16px] py-[12px] border border-[#E5E5E5]">
        <Text className="text-[16px] font-[700] text-[#333] leading-[22px]">
          {module.text}
        </Text>
      </View>

      <View className="w-[90px] h-[90px] items-center justify-center">
        <Image source={characterMap[character]} className="w-[90px] h-[90px]" resizeMode="contain" />
      </View>
    </View>
  );
};
