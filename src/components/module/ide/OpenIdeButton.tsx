import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CodeBracketsIcon } from './ideIcons';
import { useIdeProject } from '../../../contexts/IdeProjectContext';
import * as i18n from '../../../i18n/index.ts';

interface OpenIdeButtonProps {
  module: any;
  lessonId?: number;
}

// 모듈(code/terminal/codeFillTheGapV2) 우상단의 "모바일 IDE로 열기" 버튼.
// module.ide.enabled 일 때만 노출. 누르면 IDE 오버레이를 띄운다(언마운트 없이 상태 유지).
export const OpenIdeButton: React.FC<OpenIdeButtonProps> = ({ module, lessonId }) => {
  const { openIde } = useIdeProject();
  const ide = module?.ide;
  if (!ide?.enabled || !ide?.projectId) return null;

  const open = () => {
    openIde({
      lessonId,
      ide: {
        projectId: ide.projectId,
        projectName: ide.projectName,
        entryFile: ide.entryFile,
        initialTabs: ide.initialTabs,
        activeTab: ide.activeTab,
        highlights: ide.highlights,
      },
    });
  };

  return (
    <Pressable
      onPress={open}
      hitSlop={8}
      // 함수형 style 금지(NativeWind 가 삼킨다 — AddTerminalMenu 주석 참조). 눌림은 className 으로.
      className="flex-row items-center gap-[5px] rounded-[8px] bg-[#1F2430] px-[10px] py-[5px] active:opacity-70"
    >
      <CodeBracketsIcon size={14} color="#E5E7EB" />
      <Text className="text-[#E5E7EB] text-[11px] font-[600]">{i18n.t('IDE로 열기')}</Text>
    </Pressable>
  );
};

export default OpenIdeButton;
