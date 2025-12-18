import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

interface Props {
  module: {
    type: 'codeRunnerMock';
    codeLine: string;
  };
  onRun?: () => void;
}

export const CodeRunnerMockComponent: React.FC<Props> = ({ module, onRun }) => {
  const [ran, setRan] = useState(false);

  return (
    <View className="gap-[14px]">
      {/* 코드 박스 */}
      <View className="rounded-[16px] bg-[#0F172A] px-[16px] py-[14px] border border-[#1F2937]">
        <Text className="text-[#FF4FD8] font-[900] text-[18px]">{'<button>'}</Text>
        <Text className="text-white font-[900] text-[18px] ml-[10px]">{'송금하기'}</Text>
        <Text className="text-[#FF4FD8] font-[900] text-[18px] ml-[10px]">{'</button>'}</Text>
      </View>

      {/* 실행 버튼 */}
      <Pressable
        onPress={() => {
          setRan(true);
          onRun?.();
        }}
        className="rounded-[14px] bg-[#2F6BFF] py-[16px] items-center justify-center"
      >
        <Text className="text-white text-[18px] font-[900]">▶  코드 실행</Text>
      </Pressable>

      {/* 안내 */}
      {!ran ? (
        <Text className="text-[14px] font-[700] text-[#7A7A7A] text-center">
          실행을 눌러 결과를 확인해보세요.
        </Text>
      ) : null}
    </View>
  );
};
