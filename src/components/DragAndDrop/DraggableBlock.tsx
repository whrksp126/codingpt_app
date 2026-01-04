import React from 'react';
import { View, Text } from 'react-native';

interface DraggableBlockProps {
  text: string;
  isDragging?: boolean;
  className?: string;
  textClassName?: string;
}

export default function DraggableBlock({
  text,
  isDragging = false,
  className = 'bg-Success-Default-700 rounded-[8px] px-[12px] py-[8px]',
  textClassName = 'bold-14 text-Text-White_Primary',
}: DraggableBlockProps) {
  return (
    <View className={className} style={{ opacity: isDragging ? 0.8 : 1 }}>
      <Text className={textClassName}>{text}</Text>
    </View>
  );
}

