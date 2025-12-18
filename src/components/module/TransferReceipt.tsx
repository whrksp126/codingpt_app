import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  module: {
    type: 'transferReceipt';
    sender: string;
    receiver: string;
    amount: string;
    showMissingBox?: boolean;
    showGreenButton?: boolean;
    buttonText?: string;
  };
}

export const TransferReceiptComponent: React.FC<Props> = ({ module }) => {
  return (
    <View className="rounded-[22px] bg-white border border-[#E6E6E6] px-[22px] py-[20px]">
      <Text className="text-[14px] font-[700] text-[#8C8C8C]">보내는 분</Text>
      <Text className="text-[26px] font-[900] text-[#4A4A4A] mt-[6px]">{module.sender}</Text>

      <Text className="text-[14px] font-[700] text-[#8C8C8C] mt-[16px]">받는 분</Text>
      <Text className="text-[26px] font-[900] text-[#4A4A4A] mt-[6px]">{module.receiver}</Text>

      <Text className="text-[14px] font-[700] text-[#8C8C8C] mt-[16px]">송금액</Text>
      <Text className="text-[30px] font-[900] text-[#4A4A4A] mt-[6px]">{module.amount}</Text>

      {module.showMissingBox ? (
        <View className="mt-[18px] rounded-[14px] border-2 border-dashed border-[#FF5A5A] bg-[#FFF1F1] px-[14px] py-[14px]">
          <Text className="text-[18px] font-[900] text-[#FF3B3B] text-center">버튼이 사라졌어요!</Text>
        </View>
      ) : null}

      {module.showGreenButton ? (
        <View className="mt-[18px] rounded-[14px] bg-[#0B8F63] py-[16px]">
          <Text className="text-white text-[20px] font-[900] text-center">
            {module.buttonText ?? '송금하기'}
          </Text>
        </View>
      ) : null}
    </View>
  );
};
