import React from 'react';
import { View, Text } from 'react-native';
import DefaultBtn from '../Button/DefaultBtn';
import { useModal } from '../../contexts/ModalContext';
import SampleSecondModal from './SampleSecondModal';

interface SampleFirstModalProps {
  onClose: (result?: any) => void;
  modalId?: string;
}

const SampleFirstModal: React.FC<SampleFirstModalProps> = ({
  onClose,
  modalId,
}) => {
  const { pushModal } = useModal();

  const handleConfirm = async () => {
    try {
      // 두 번째 모달을 push로 열기
      const secondResult = await pushModal(SampleSecondModal, {}, {
        enableBackdropClose: false, // 두 번째 모달은 배경 클릭으로 닫기 비활성화
        backgroundColor: 'bg-black/50',
        contentClassName: '',
      });

      console.log('두 번째 모달 결과:', secondResult);

      // 두 번째 모달의 결과를 첫 번째 모달의 결과로 전달
      onClose(secondResult);
    } catch (error) {
      console.error('두 번째 모달 열기 실패:', error);
      onClose({ 
        action: 'error',
        message: '모달 열기 실패',
        data: { error }
      });
    }
  };

  const handleCancel = () => {
    onClose({ 
      action: 'cancel',
      message: '모달을 취소했습니다.',
      data: { step: 1, confirmed: false }
    });
  };

  return (
    <View className="flex-col gap-[20px] w-[320px] p-[24px] rounded-[16px] bg-white">
      {/* 헤더 */}
      <View className="flex-col gap-[8px]">
        <Text className="text-[24px] font-[700] text-[#111] text-center">
          모달을 열겠습니까?
        </Text>
        <Text className="text-[16px] text-[#666] text-center leading-[22px]">
          이 버튼을 클릭하면 모달 스택 기능을 테스트할 수 있습니다.
        </Text>
      </View>

      {/* 아이콘 영역 */}
      <View className="items-center py-[20px]">
        <View className="w-[80px] h-[80px] rounded-full bg-[#93D333] items-center justify-center">
          <Text className="text-[32px]">📱</Text>
        </View>
      </View>

      {/* 설명 */}
      <View className="flex-col gap-[8px]">
        <Text className="text-[14px] text-[#888] text-center">
          다음 단계에서는:
        </Text>
        <Text className="text-[14px] text-[#666] text-center leading-[20px]">
          • 모달 스택 기능 확인{'\n'}
          • 이전 모달로 돌아가기{'\n'}
          • 최종 결과 반환
        </Text>
      </View>

      {/* 버튼들 */}
      <View className="flex-row gap-[12px]">
        <View className="flex-1">
          <DefaultBtn
            onPress={handleCancel}
            text="취소"
            buttonClassName="flex items-center justify-center h-[48px] rounded-[8px] bg-[#F5F5F5]"
            textClassName="text-[16px] font-[600] text-[#666]"
            enableHapticFeedback={true}
            enableSound={true}
            flex={false}
          />
        </View>
        <View className="flex-1">
          <DefaultBtn
            onPress={handleConfirm}
            text="확인"
            buttonClassName="flex items-center justify-center h-[48px] rounded-[8px] bg-[#93D333]"
            textClassName="text-[16px] font-[600] text-white"
            enableHapticFeedback={true}
            enableSound={true}
            flex={false}
          />
        </View>
      </View>
    </View>
  );
};

export default SampleFirstModal;
