import React from 'react';
import { View, Image } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface ParagraghComponentProps {
  module: {
    id: number;
    type: string;
    visibility: { type: string; value: number };
    content: string;
    src?: string;
    srcSize?: string | "sm" | "md" | "lg"; 
  };
}
const srcSizeMap: { [key: string | "sm" | "md" | "lg"]: { parrent: string, image: string } } = {
  sm: {
    parrent: 'flex flex-row gap-[20px]',
    image: 'w-[120px] aspect-square resize-contain',
  },
  md: {
    parrent: 'flex flex-row gap-[20px]',
    image: 'w-[180px] aspect-square resize-contain',
  },
  lg: {
    parrent: 'flex flex-col gap-[20px]',
    image: 'w-full aspect-square resize-contain',
  },
}

export const ParagraghComponent: React.FC<ParagraghComponentProps> = ({ module }) => {


  if(module.src){
    return (
      <View className={`${srcSizeMap[`${module.srcSize}`].parrent}`} >
        <Image
          source={{ uri: module.src }}
          className={`${srcSizeMap[`${module.srcSize}`].image}`} 
        />
        <View className="flex-1">
          <Markdown
            style={{
              body: { fontSize: 14, color: '#333' },
              heading1: { fontSize: 20, fontWeight: 'bold' },
              heading2: { fontSize: 18, fontWeight: 'bold' },
              heading3: { fontSize: 16, fontWeight: 'bold' },
              bullet_list: { marginVertical: 4 },
              ordered_list: { marginVertical: 4 },
              link: { color: '#007AFF' },
              code_inline: {
                backgroundColor: '#f0f0f0',
                paddingHorizontal: 4,
                paddingVertical: 2,
                borderRadius: 4,
                fontFamily: 'monospace',
              },
              fence: {
                backgroundColor: '#f6f8fa',
                padding: 8,
                borderRadius: 6,
                fontFamily: 'monospace',
              },
            }}
          >
            {module.content}
          </Markdown>
        </View>
      </View>    
    );
  }


  return (
    <Markdown
      style={{
        body: { fontSize: 14, color: '#333' },
        heading1: { fontSize: 20, fontWeight: 'bold' },
        heading2: { fontSize: 18, fontWeight: 'bold' },
        heading3: { fontSize: 16, fontWeight: 'bold' },
        bullet_list: { marginVertical: 4 },
        ordered_list: { marginVertical: 4 },
        link: { color: '#007AFF' },
        code_inline: {
          backgroundColor: '#f0f0f0',
          paddingHorizontal: 4,
          paddingVertical: 2,
          borderRadius: 4,
          fontFamily: 'monospace',
        },
        fence: {
          backgroundColor: '#f6f8fa',
          padding: 8,
          borderRadius: 6,
          fontFamily: 'monospace',
        },
      }}
    >
      {module.content}
    </Markdown>

    
  );
};