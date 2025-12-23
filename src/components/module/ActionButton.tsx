import React from 'react';
import { Pressable, Text, View } from 'react-native';
import * as SvgIcon from '../../assets/SvgIcon';

interface ActionButtonModule {
  type: 'actionButton';
  text: string;
  icon?: string;
  style?: {
    backgroundColor?: string;
    textColor?: string;
    width?: number;
    height?: number;
    shadowColor?: string;
  };
  action?: {
    type: 'nextStep' | 'navigate' | 'custom';
    target?: string;
  };
}

interface Props {
  module: ActionButtonModule;
  onPress?: () => void;
}

export const ActionButtonComponent: React.FC<Props> = ({ module, onPress }) => {
  const { text, icon, style } = module;

  const IconComponent = icon ? (SvgIcon as any)[icon] : null;

  const buttonStyle = {
    backgroundColor: style?.backgroundColor || '#2F6FED',
    width: style?.width || 160,
    height: style?.height || 50,
    shadowColor: style?.shadowColor || '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  };

  return (
    <View className="items-center">
      <Pressable
        onPress={onPress}
        className="rounded-[10px] flex-row items-center justify-center gap-3"
        style={buttonStyle}
      >
        {IconComponent && (
          <IconComponent
            width={24}
            height={24}
            fill={style?.textColor || '#FFFFFF'}
          />
        )}
        <Text
          className="bold-16 tracking-[-0.32px]"
          style={{ color: style?.textColor || '#FFFFFF' }}
        >
          {text}
        </Text>
      </Pressable>
    </View>
  );
};

