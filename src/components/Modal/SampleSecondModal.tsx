import React from 'react';
import { View, Text } from 'react-native';
import DefaultBtn from '../Button/DefaultBtn';
import DefaultIconBtn from '../Button/DefaultIconBtn';
import { CaretLeft } from '../../assets/SvgIcon';
import { useModal } from '../../contexts/ModalContext';

interface SampleSecondModalProps {
  onClose: (result?: any) => void;
  modalId?: string;
}

const SampleSecondModal: React.FC<SampleSecondModalProps> = ({
  onClose,
  modalId,
}) => {
  const { popModal } = useModal();

  const handleBack = async () => {
    try {
      // 이전 모달로 돌아가기 (popModal 사용)
      const result = await popModal({ 
        action: 'back',
        message: '이전 모달로 돌아갑니다.',
        data: { step: 2, action: 'back' }
      });
      console.log('이전 모달로 돌아가기 결과:', result);
    } catch (error) {
      console.error('이전 모달로 돌아가기 실패:', error);
    }
  };

  const handleConfirm = () => {
    onClose({ 
      action: 'confirm',
      message: '모달을 확인했습니다.',
      data: { step: 2, confirmed: true, finalResult: true }
    });
  };

  return (
    <View className="flex-col gap-[20px] w-[320px] p-[24px] rounded-[16px] bg-white">
      {/* 헤더 */}
      <View className="flex-row items-center justify-between">
        <Text className="text-[20px] font-[700] text-[#111]">
          다음 모달입니다
        </Text>
        <DefaultIconBtn
          onPress={handleBack}
          size={24}
          enableHapticFeedback={true}
          enableSound={false}
        >
          <CaretLeft width={24} height={24} fill="#999" />
        </DefaultIconBtn>
      </View>

      {/* 설명 */}
      <View className="flex-col gap-[12px]">
        <Text className="text-[16px] text-[#666] leading-[22px]">
          이것은 모달 스택의 두 번째 단계입니다.
        </Text>
        <View className="p-[16px] bg-[#F8F9FA] rounded-[8px]">
          <Text className="text-[14px] text-[#555] leading-[20px]">
            • 이전 모달로 돌아가기 버튼{'\n'}
            • 최종 확인 버튼{'\n'}
            • 모달 스택 관리 기능
          </Text>
        </View>
      </View>

      {/* 아이콘 영역 */}
      <View className="items-center py-[16px]">
        <View className="w-[60px] h-[60px] rounded-full bg-[#58CC02] items-center justify-center">
          <Text className="text-[24px]">✅</Text>
        </View>
      </View>

      {/* 버튼들 */}
      <View className="flex-col gap-[12px]">
        <DefaultBtn
          onPress={handleBack}
          text="이전 모달로 돌아가기"
          buttonClassName="flex items-center justify-center h-[48px] rounded-[8px] bg-[#F5F5F5]"
          textClassName="text-[16px] font-[600] text-[#666]"
          enableHapticFeedback={true}
          enableSound={true}
          flex={false}
        />
        <DefaultBtn
          onPress={handleConfirm}
          text="최종 확인"
          buttonClassName="flex items-center justify-center h-[48px] rounded-[8px] bg-[#58CC02]"
          textClassName="text-[16px] font-[600] text-white"
          enableHapticFeedback={true}
          enableSound={true}
          flex={false}
        />
      </View>
    </View>
  );
};

export default SampleSecondModal;

