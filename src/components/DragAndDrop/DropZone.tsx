import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface DropZoneProps {
  item: { text?: string; [key: string]: any } | null;
  onRemove?: () => void;
  showRemoveButton?: boolean;
  className?: string;
  emptyClassName?: string;
  itemClassName?: string;
  textClassName?: string;
  removeButtonClassName?: string;
}

export default function DropZone({
  item,
  onRemove,
  showRemoveButton = true,
  className = 'bg-Background-White_Base border-[1.5px] border-dashed border-Line-Black h-[40px] rounded-[8px] flex-1 max-w-[100px] justify-center items-center',
  emptyClassName,
  itemClassName = 'flex-row items-center gap-1',
  textClassName = 'bold-14 text-Text-Black_Primary',
  removeButtonClassName = 'text-Text-Black_Secondary text-xs',
}: DropZoneProps) {
  return (
    <View className={className}>
      {item && item.text ? (
        <View className={itemClassName}>
          <Text className={textClassName}>{item.text}</Text>
          {showRemoveButton && onRemove && (
            <Pressable onPress={onRemove}>
              <Text className={removeButtonClassName}>✕</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View className={emptyClassName} />
      )}
    </View>
  );
}

