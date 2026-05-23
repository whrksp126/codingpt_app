import React from 'react';
import { View, Pressable, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { useScaleOnPress } from '../../animations/hooks';

interface ButtonConfig {
  id: string;
  text: string;
  style?: {
    backgroundColor?: string;
    textColor?: string;
    shadowColor?: string;
  };
  action?: {
    type: 'executeCode' | 'navigate_next_lesson' | 'end_lesson' | 'navigate' | 'custom';
    target?: string;
    s3Path?: string;
    targetWebViewId?: string;
  };
}

interface ActionButtonsModule {
  type: 'actionButtons';
  buttons: ButtonConfig[];
}

interface Props {
  module: ActionButtonsModule;
  onButtonPress?: (buttonId: string, action?: ButtonConfig['action']) => void;
}

const ActionButtonItem: React.FC<{
  button: ButtonConfig;
  onPress: () => void;
}> = ({ button, onPress }) => {
  const { style: scaleStyle, onPressIn, onPressOut } = useScaleOnPress({ pressed: 0.96 });

  return (
    <Animated.View style={scaleStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
        className="w-full h-14 rounded-[10px] justify-center items-center overflow-hidden"
        style={{
          backgroundColor: button.style?.backgroundColor || '#08875D',
          shadowColor: button.style?.shadowColor || button.style?.backgroundColor || '#08875D',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 6,
        }}
      >
        <Text className="bold-16" style={{ color: button.style?.textColor || '#FFFFFF' }}>
          {button.text}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

export const ActionButtonsComponent: React.FC<Props> = ({ module, onButtonPress }) => {
  const { buttons } = module;

  return (
    <View className="w-full gap-5">
      {buttons.map((button) => (
        <ActionButtonItem
          key={button.id}
          button={button}
          onPress={() => onButtonPress?.(button.id, button.action)}
        />
      ))}
    </View>
  );
};
