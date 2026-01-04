import React from 'react';
import { View, Text } from 'react-native';

/**
 * 개념 설명 아이템 컴포넌트 (ex. 햄버거)
*/
interface ConceptExplanationItemProps {
  code: string;
  description: string;
  codeBgColor?: string;
  codeTextColor?: string;
  showBorder?: boolean;
}

export default function ConceptExplanationItem({
  code,
  description,
  codeBgColor = 'bg-Blue-Background-100',
  codeTextColor = 'text-Blue-Default-700',
  showBorder = true,
}: ConceptExplanationItemProps) {
  return (
    <View className={`gap-[10px] ${showBorder ? 'border-b-[0.75px] border-Line-White pb-[15.75px]' : ''}`}>
      <View className={`${codeBgColor} rounded-[6px] px-2 py-1 self-start`}>
        <Text className={`bold-14 ${codeTextColor} tracking-[-0.28px]`}>
          {code}
        </Text>
      </View>
      <Text className="regular-15 text-Text-Black_Primary leading-[22.5px] tracking-[-0.3px]">
        {description}
      </Text>
    </View>
  );
}

