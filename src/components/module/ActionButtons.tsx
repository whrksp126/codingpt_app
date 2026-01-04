import React from 'react';
import { View, Pressable, Text } from 'react-native';

interface ButtonConfig {
  id: string;
  text: string;
  style?: {
    backgroundColor?: string;
    textColor?: string;
    shadowColor?: string;
  };
  action?: {
    type: 'navigate' | 'custom';
    target?: string;
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

export const ActionButtonsComponent: React.FC<Props> = ({
  module,
  onButtonPress,
}) => {
  const { buttons } = module;

  return (
    <View className="w-full gap-5">
      {buttons.map((button) => (
        <Pressable
          key={button.id}
          onPress={() => onButtonPress?.(button.id, button.action)}
          className="w-full h-14 rounded-[10px] justify-center items-center"
          style={{
            backgroundColor: button.style?.backgroundColor || '#08875D',
            shadowColor: button.style?.shadowColor || '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: button.style?.shadowColor ? 0.3 : 0.1,
            shadowRadius: 4,
            elevation: 4,
          }}
        >
          <Text
            className="bold-16"
            style={{ color: button.style?.textColor || '#FFFFFF' }}
          >
            {button.text}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

