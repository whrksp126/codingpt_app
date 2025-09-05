import React from 'react';
import { View, Text } from 'react-native';
import DefaultBtn from '../Button/DefaultBtn';
import DefaultIconBtn from '../Button/DefaultIconBtn';
import { X } from '../../assets/SvgIcon';

interface ConfirmModalProps {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onClose: (result?: any) => void;
  modalId?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title = '확인',
  message,
  confirmText = '확인',
  cancelText = '취소',
  onClose,
  modalId,
}) => {
  const handleConfirm = () => {
    onClose({ confirmed: true, action: 'confirm' });
  };

  const handleCancel = () => {
    onClose({ confirmed: false, action: 'cancel' });
  };

  return (
    <View className="flex-col gap-[20px] w-[300px] p-[24px] rounded-[16px] bg-white">
      {/* 헤더 */}
      <View className="flex-row items-center justify-between">
        <Text className="text-[20px] font-[700] text-[#111]">{title}</Text>
        <DefaultIconBtn
          onPress={handleCancel}
          size={24}
          enableHapticFeedback={true}
          enableSound={false}
        >
          <X width={24} height={24} fill="#999" />
        </DefaultIconBtn>
      </View>

      {/* 메시지 */}
      <Text className="text-[16px] text-[#666] leading-[24px]">
        {message}
      </Text>

      {/* 버튼들 */}
      <View className="flex-row gap-[12px]">
        <View className="flex-1">
          <DefaultBtn
            onPress={handleCancel}
            text={cancelText}
            buttonClassName="flex items-center justify-center h-[44px] rounded-[8px] bg-[#F5F5F5]"
            textClassName="text-[16px] font-[600] text-[#666]"
            enableHapticFeedback={true}
            enableSound={true}
          />
        </View>
        <View className="flex-1">
          <DefaultBtn
            onPress={handleConfirm}
            text={confirmText}
            buttonClassName="flex items-center justify-center h-[44px] rounded-[8px] bg-[#58CC02]"
            textClassName="text-[16px] font-[600] text-white"
            enableHapticFeedback={true}
            enableSound={true}
          />
        </View>
      </View>
    </View>
  );
};

export default ConfirmModal;
