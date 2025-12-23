import React from 'react';
import { View } from 'react-native';
import * as SvgIcon from '../../assets/SvgIcon';

interface IconBadgeModule {
  type: 'iconBadge';
  icon: string;
  iconSize?: number;
  iconColor?: string;
  backgroundColor?: string;
  size?: number;
}

interface Props {
  module: IconBadgeModule;
}

export const IconBadgeComponent: React.FC<Props> = ({ module }) => {
  const {
    icon,
    iconSize = 32,
    iconColor = '#08875D',
    backgroundColor = '#E6F4EF',
    size = 64,
  } = module;

  // 동적으로 아이콘 컴포넌트 가져오기
  const IconComponent = (SvgIcon as any)[icon];

  return (
    <View className="items-center">
      <View
        className="rounded-full justify-center items-center"
        style={{
          width: size,
          height: size,
          backgroundColor,
        }}
      >
        {IconComponent && (
          <IconComponent
            width={iconSize}
            height={iconSize}
            fill={iconColor}
          />
        )}
      </View>
    </View>
  );
};

