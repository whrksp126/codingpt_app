import React from 'react';
import { View, Text, ScrollView, StatusBar, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Play } from '../../assets/SvgIcon';

export default function LessonButtonExecuteScreen() {
  return (
    <SafeAreaView className="flex-1 bg-Background-White_Base" edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* NOTE: Figma는 그라데이션 배경이지만, RN에서는 추가 라이브러리 없이 단색(토큰)으로 근사 */}
      <View className="flex-1 bg-Purple-100_Background">
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          {/* 상단 진행바 + 헤더 */}
          <View className="px-4 pb-1">
            <View className="flex-row gap-1 mb-[10px]">
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-700_Default" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-700_Default" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-700_Default" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            </View>

            <View className="flex-row justify-between items-center">
              <Text className="font-pretendard text-[16px] font-bold leading-[24px] tracking-[-0.02em] text-Text-Black_Secondary">
                04. 버튼 태그 실행
              </Text>
              <View className="w-6 h-6 items-center justify-center">
                <Text className="text-[18px] text-Text-Black_Secondary">✕</Text>
              </View>
            </View>
          </View>

          {/* 본문 */}
          <View className="px-4 py-[60px] items-center gap-[80px]">
            {/* 코드 카드 + 실행 버튼 */}
            <View className="w-full items-center gap-[30px]">
              <View className="w-full rounded-[16px] bg-Background-Black_Base px-4 pt-4 pb-[26px] gap-4">
                <View className="flex-row items-center gap-[6px]">
                  <View className="w-2 h-2 rounded-full bg-Danger-700_Default" />
                  <View className="w-2 h-2 rounded-full bg-Warning-700_Default" />
                  <View className="w-2 h-2 rounded-full bg-Success-700_Default" />
                </View>

                <View className="flex-row flex-wrap items-center">
                  <Text className="font-pretendard text-[14px] font-bold leading-[24px] text-Text-White_Primary">{'<'}</Text>
                  <Text className="font-pretendard text-[14px] font-bold leading-[24px] text-[#FB64B6]">button</Text>
                  <Text className="font-pretendard text-[14px] font-bold leading-[24px] text-Text-White_Primary">{'>'}</Text>

                  <View className="mx-2 bg-Background-Black_Secondary border-[1.5px] border-dashed border-Line-White rounded-[4px] min-w-[50px] min-h-[24px] px-2 items-center justify-center">
                    <Text className="font-pretendard text-[14px] font-bold leading-[24px] text-Text-White_Primary">
                      송금하기
                    </Text>
                  </View>

                  <Text className="font-pretendard text-[14px] font-bold leading-[24px] text-Text-White_Primary">{'</'}</Text>
                  <Text className="font-pretendard text-[14px] font-bold leading-[24px] text-[#FB64B6]">button</Text>
                  <Text className="font-pretendard text-[14px] font-bold leading-[24px] text-Text-White_Primary">{'>'}</Text>
                </View>
              </View>

              <Pressable className="w-[160px] h-[50px] rounded-[10px] bg-Blue-700_Default shadow-sm items-center justify-center flex-row gap-3">
                <Play width={24} height={24} fill="#FFFFFF" />
                <Text className="font-pretendard text-[16px] font-bold leading-[24px] tracking-[-0.02em] text-Text-White_Primary">
                  코드 실행
                </Text>
              </Pressable>
            </View>

            {/* 결과 카드 + 말풍선 */}
            <View className="w-full gap-[30px]">
              <View className="w-full rounded-[16px] bg-Background-White_Primary shadow-sm">
                {/* 상단 바 */}
                <View className="px-4 pt-4">
                  <View className="h-2 flex-row items-center">
                    <View className="flex-row items-center gap-2">
                      <View className="w-2 h-2 rounded-full bg-Danger-700_Default" />
                      <View className="w-2 h-2 rounded-full bg-Warning-700_Default" />
                      <View className="w-2 h-2 rounded-full bg-Success-700_Default" />
                    </View>
                    <View className="flex-1 ml-3 h-[2px] rounded-full bg-Line-White" />
                  </View>
                </View>

                <View className="px-[25px] pb-5 pt-4 gap-5">
                  <View className="gap-3">
                    <View className="gap-1">
                      <Text className="font-pretendard text-[14px] font-normal leading-[21px] tracking-[-0.02em] text-Text-Black_Disabled">
                        보내는 분
                      </Text>
                      <Text className="font-pretendard text-[18px] font-bold leading-[27px] tracking-[-0.02em] text-Text-Black_Secondary">
                        1호 회원
                      </Text>
                    </View>
                    <View className="gap-1">
                      <Text className="font-pretendard text-[14px] font-normal leading-[21px] tracking-[-0.02em] text-Text-Black_Disabled">
                        받는 분
                      </Text>
                      <Text className="font-pretendard text-[18px] font-bold leading-[27px] tracking-[-0.02em] text-Text-Black_Secondary">
                        너구리 PT쌤
                      </Text>
                    </View>
                    <View className="gap-1">
                      <Text className="font-pretendard text-[14px] font-normal leading-[21px] tracking-[-0.02em] text-Text-Black_Disabled">
                        송금액
                      </Text>
                      <Text className="font-pretendard text-[18px] font-bold leading-[27px] tracking-[-0.02em] text-Text-Black_Secondary">
                        500,000원
                      </Text>
                    </View>
                  </View>

                  <View className="w-full h-[50px] rounded-[10px] bg-Success-700_Default items-center justify-center">
                    <Text className="font-pretendard text-[16px] font-bold leading-[24px] tracking-[-0.02em] text-Text-White_Primary">
                      송금하기
                    </Text>
                  </View>
                </View>
              </View>

              <View className="w-full items-end pb-[110px] relative">
                <View className="items-end pr-[60px]">
                  <View className="bg-Background-White_Primary rounded-[15px] px-[18px] py-3 shadow-sm">
                    <Text className="font-pretendard text-[15px] font-semibold leading-[22.5px] tracking-[-0.02em] text-Text-Black_Primary">
                      우와! 송금하기 버튼이 생겼어!
                    </Text>
                  </View>
                </View>

                <View className="absolute right-0 bottom-0 w-[160px] h-[160px]">
                  <Image source={require('../../assets/images/turtle.png')} className="w-full h-full" resizeMode="contain" />
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}


