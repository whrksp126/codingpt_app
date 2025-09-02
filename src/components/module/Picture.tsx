import React from 'react';
import { View, Image } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface PictureComponentProps {
  module: {
    id: number;
    type: string;
    src: string;
    size: string;
    visibility: { type: string; value: number };
  };
}

export const PictureComponent: React.FC<PictureComponentProps> = ({ module }) => {

  // 모듈 샘플
  // {
  //   id: 11, 
  //   type: 'image', 
  //   src: 'https://s3.ghmate.com/codingpt/mascot/mascot_001.png', 
  //   size: 'lg' 
  //   visibility: { type: 'step', value: 2 }
  // }



  // width만 고정, height는 비율에 맞게 자동 조정
  let widthStyle = {};
  if (module.size === 'sm') {
    widthStyle = { width: 100 };
  } else if (module.size === 'md') {
    widthStyle = { width: 200 };
  } else {
    widthStyle = { width: '100%' };
  }

  return (
    <Image
      source={{ uri: module.src }}
      style={[widthStyle, { aspectRatio: 1, resizeMode: 'contain' }]}
    />
  );
};