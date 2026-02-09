import React, { ReactNode } from 'react';
import { View, Image, ImageSourcePropType } from 'react-native';

interface CharacterSpeechBubbleProps {
  children: ReactNode;
  characterImage?: ImageSourcePropType;
  characterSize?: { width: number; height: number };
  bubbleColor?: string;
}

export default function CharacterSpeechBubble({
  children,
  characterImage = require('../assets/images/teacher_full.png'),
  characterSize = { width: 80, height: 80 },
  bubbleColor = '#F8F9FC', // Background-White_Primary
}: CharacterSpeechBubbleProps) {
  return (
    <View className="w-full items-end relative" style={{ paddingBottom: characterSize.height - 50 }}>
      <View className="items-end pr-[44px]">
        <View
          className="rounded-[15px] px-[18px] py-[12px]"
          style={{
            backgroundColor: bubbleColor,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.2,
            shadowRadius: 5,
            elevation: 5,
          }}
        >
          {children}
        </View>
      </View>

      {/* Character */}
      <View
        className="absolute right-0 bottom-0"
        style={{ width: characterSize.width, height: characterSize.height }}
      >
        <Image
          source={characterImage}
          className="w-full h-full"
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

