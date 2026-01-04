import React from 'react';
import { View, Text } from 'react-native';
import BrowserHeader from '../BrowserHeader';

interface CardField {
  label: string;
  value: string;
}

interface ErrorBox {
  visible: boolean;
  icon?: string;
  text: string;
  style?: 'dashed' | 'solid';
}

interface ButtonConfig {
  text: string;
  style?: {
    backgroundColor?: string;
    textColor?: string;
  };
}

interface CardModule {
  type: 'card';
  variant?: 'default' | 'browser';
  header?: {
    type: 'browserHeader';
  };
  content: {
    fields?: CardField[];
    errorBox?: ErrorBox;
    button?: ButtonConfig;
  };
}

interface Props {
  module: CardModule;
}

export const CardComponent: React.FC<Props> = ({ module }) => {
  const { variant = 'default', header, content } = module;
  const { fields, errorBox, button } = content;

  return (
    <View
      className="w-full rounded-[16px] bg-white overflow-hidden"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      }}
    >
      {/* Browser Header */}
      {header?.type === 'browserHeader' && (
        <BrowserHeader />
      )}

      {/* Content */}
      <View className="p-5 gap-3">
        {/* Fields */}
        {fields?.map((field, index) => (
          <View key={`field-${index}`} className="gap-1">
            <Text className="regular-14 text-Text-Black_Disabled tracking-[-0.28px]">
              {field.label}
            </Text>
            <Text className="bold-18 text-Text-Black_Secondary tracking-[-0.36px]">
              {field.value}
            </Text>
          </View>
        ))}

        {/* Error Box */}
        {errorBox?.visible && (
          <View
            className="flex-row items-center justify-center gap-2 h-[60px] rounded-[10px]"
            style={{
              backgroundColor: '#FEE2E2',
              borderWidth: errorBox.style === 'dashed' ? 2 : 1,
              borderStyle: errorBox.style === 'dashed' ? 'dashed' : 'solid',
              borderColor: '#DC2626',
            }}
          >
            {errorBox.icon && (
              <View className="w-5 h-5 rounded-full bg-[#DC2626] justify-center items-center">
                <Text className="bold-14 text-white">{errorBox.icon}</Text>
              </View>
            )}
            <Text className="bold-16 text-[#DC2626] tracking-[-0.32px]">
              {errorBox.text}
            </Text>
          </View>
        )}

        {/* Button */}
        {button && (
          <View
            className="w-full h-[50px] rounded-[10px] items-center justify-center"
            style={{
              backgroundColor: button.style?.backgroundColor || '#08875D',
            }}
          >
            <Text
              className="bold-16"
              style={{ color: button.style?.textColor || '#FFFFFF' }}
            >
              {button.text}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

