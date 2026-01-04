import React, { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';

/**
 * 카드 컴포넌트 (ex. 카드)
*/
interface CardProps {
  children: ReactNode;
  header?: ReactNode;
  className?: string;
  contentClassName?: string;
  style?: ViewStyle;
}

export default function Card({
  children,
  header,
  className = '',
  contentClassName = '',
  style,
}: CardProps) {
  return (
    <View
      className={`bg-Background-White_Primary rounded-2xl shadow-lg ${className}`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
        elevation: 5,
        ...style,
      }}
    >
      {header && header}
      <View className={`p-[24px] gap-5 ${contentClassName}`}>{children}</View>
    </View>
  );
}

