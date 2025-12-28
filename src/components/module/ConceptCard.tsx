import React from 'react';
import { View, Text } from 'react-native';

interface ConceptItem {
  code: string;
  codeStyle?: {
    backgroundColor?: string;
    textColor?: string;
  };
  description: string;
}

interface ConceptCardModule {
  type: 'conceptCard';
  items: ConceptItem[];
  tts?: string;
}

interface Props {
  module: ConceptCardModule;
}

export const ConceptCardComponent: React.FC<Props> = ({ module }) => {
  const { items } = module;

  return (
    <View
      className="w-full rounded-[16px] bg-white p-5"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 10,
      }}
    >
      <View className="gap-[15px]">
        {items.map((item, index) => (
          <View key={`concept-${index}`}>
            <View className="gap-[10px]">
              {/* Code Chip */}
              <View
                className="self-start rounded-[8px] px-[10px] py-[4px]"
                style={{
                  backgroundColor: item.codeStyle?.backgroundColor || '#E8F0FE',
                }}
              >
                <Text
                  className="bold-14"
                  style={{
                    color: item.codeStyle?.textColor || '#2F6FED',
                  }}
                >
                  {item.code}
                </Text>
              </View>

              {/* Description */}
              <Text className="regular-15 text-Text-Black_Primary leading-[22.5px]">
                {item.description}
              </Text>
            </View>

            {/* Divider (마지막 제외) */}
            {index !== items.length - 1 && (
              <View className="h-[1px] bg-Line-White mt-[15px]" />
            )}
          </View>
        ))}
      </View>
    </View>
  );
};

