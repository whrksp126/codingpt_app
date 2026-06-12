import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CodeBracketsIcon } from './ideIcons';

interface OpenIdeButtonProps {
  module: any;
  lessonId?: number;
}

// 모듈(code/terminal/codeFillTheGapV2) 우상단의 "모바일 IDE로 열기" 버튼.
// module.ide.enabled 일 때만 노출. 누르면 RootStack 의 MobileIDE 모달을 띄운다(레슨 상태 유지).
export const OpenIdeButton: React.FC<OpenIdeButtonProps> = ({ module, lessonId }) => {
  const navigation = useNavigation<any>();
  const ide = module?.ide;
  if (!ide?.enabled || !ide?.projectId) return null;

  const open = () => {
    navigation.navigate('MobileIDE', {
      lessonId,
      moduleId: module?.id,
      ide: { projectId: ide.projectId, projectName: ide.projectName, entryFile: ide.entryFile },
    });
  };

  return (
    <Pressable
      onPress={open}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      className="flex-row items-center gap-[5px] rounded-[8px] bg-[#1F2430] px-[10px] py-[5px]"
    >
      <CodeBracketsIcon size={14} color="#E5E7EB" />
      <Text className="text-[#E5E7EB] text-[11px] font-[600]">IDE로 열기</Text>
    </Pressable>
  );
};

export default OpenIdeButton;
