import React from 'react';
import { View, ViewStyle } from 'react-native';

/**
 * 브라우저 헤더 컴포넌트 (ex. 브라우저 헤더)
*/
interface BrowserHeaderProps {
  className?: string;
  size?: 'small' | 'default';
  gap?: number;
}

export default function BrowserHeader({ className, size = 'default', gap }: BrowserHeaderProps) {
  const buttonSize = size === 'small' ? 'w-2 h-2' : 'w-3 h-3';
  const padding = size === 'small' ? 'p-0' : 'p-4';
  const gapValue = gap !== undefined ? gap : size === 'small' ? 6 : 8;
  
  const containerStyle: ViewStyle = {};
  if (size === 'small') {
    containerStyle.padding = 0;
  }
  
  return (
    <View className={`${padding} ${className || ''}`} style={containerStyle}>
      <View className="flex-row" style={{ gap: gapValue }}>
        <View className={`${buttonSize} rounded-full bg-Danger-Pressed-900`} />
        <View className={`${buttonSize} rounded-full bg-Warning-Pressed-900`} />
        <View className={`${buttonSize} rounded-full bg-Success-Pressed-900`} />
      </View>
    </View>
  );
}

