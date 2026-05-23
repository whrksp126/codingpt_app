import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import * as SvgIcon from '../../assets/SvgIcon';
import { useScaleOnPress } from '../../animations/hooks';

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
    type: 'executeCode' | 'navigate_next_lesson' | 'end_lesson' | 'nextStep' | 'navigate' | 'custom';
    target?: string;
    s3Path?: string;
    targetWebViewId?: string;
  };
}

interface Props {
  module: ActionButtonModule;
  onPress?: () => void;
}

export const ActionButtonComponent: React.FC<Props> = ({ module, onPress }) => {
  const { text, icon, style } = module;
  const { style: scaleStyle, onPressIn, onPressOut } = useScaleOnPress({ pressed: 0.95 });

  const IconComponent = icon ? (SvgIcon as any)[icon] : null;

  const buttonStyle = {
    backgroundColor: style?.backgroundColor || '#2F6FED',
    width: style?.width || 160,
    height: style?.height || 50,
    shadowColor: style?.shadowColor || style?.backgroundColor || '#2F6FED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  };

  return (
    <View className="items-center">
      <Animated.View style={scaleStyle}>
        <Pressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }}
          className="rounded-[10px] flex-row items-center justify-center gap-3 overflow-hidden"
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
      </Animated.View>
    </View>
  );
};

