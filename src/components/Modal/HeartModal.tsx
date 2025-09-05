// src/components/HeartModal.tsx
import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { useNavigation } from '../../contexts/NavigationContext';
import { useHearts } from '../../contexts/HeartContext';
import { HeartStraight } from '../../assets/SvgIcon';

type Variant = 'info' | 'depleted';

interface HeartModalProps {
  visible: boolean;
  onClose: () => void;
  variant?: Variant;
  onPressGoBack?: () => void; // depleted에서 '돌아가기' 동작 덮어쓰기 가능
}

const prettyMMSS = (seconds: number | null) => {
  if (seconds == null) return '-';
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

const HeartModal: React.FC<HeartModalProps> = ({
  visible,
  onClose,
  variant = 'info',
  onPressGoBack,
}) => {
  const { hearts, secondsToRefill } = useHearts();
  const { navigate } = useNavigation();

  const heartRow = Array.from({ length: 5 }, (_, i) => i < hearts);

  const handleGoBack = () => {
    if (onPressGoBack) onPressGoBack();
    else navigate('home');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 bg-black/40 justify-center items-center">
        <View className="flex-col gap-[10px] w-[322px] p-[20px] rounded-[20px] bg-[#FAFAFA]">
          {/* 헤더 */}
          <View className="flex-row items-center gap-[10px]">
            <View className="flex-1 flex-col gap-[6px]">
              <Text className="text-[12px] font-[700] text-[#606060]">하트</Text>
            </View>
          </View>

          {/* 하트 5칸 표시 */}
          <View className="flex-row items-center justify-center gap-[8px] py-[6px]">
            {heartRow.map((filled, i) => (
              <Text key={i} className="text-[28px]">
                <HeartStraight 
                  width={28} 
                  height={28} 
                  fill={filled ? "#EE5555" : "#FFDFE0"} 
                />
              </Text>
            ))}
          </View>

          {/* 안내 */}
          {variant === 'depleted' ? (
            <Text className="text-[14px] text-center text-[#606060]">
              다음 하트 생성까지 남은 시간 :{' '}
              <Text className="font-[700] text-[#111]">{prettyMMSS(secondsToRefill)}</Text>
            </Text>
          ) : hearts < 5 ? (
            <Text className="text-[14px] text-center text-[#606060]">
              다음 하트 생성까지 남은 시간 :{' '}
              <Text className="font-[700] text-[#111]">{prettyMMSS(secondsToRefill)}</Text>
            </Text>
          ) : (
            <Text className="text-[14px] text-center text-[#606060]">하트가 가득 찼어요! ✨</Text>
          )}

          {/* 버튼 */}
          {variant === 'depleted' ? (
            <Pressable
              onPress={handleGoBack}
              className="flex items-center justify-center h-[40px] p-[10px] rounded-[10px] bg-[#FE4C4A]"
            >
              <Text className="text-[16px] font-[700] text-[#fff]">돌아가기</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onClose}
              className="flex items-center justify-center h-[40px] p-[10px] rounded-[10px] bg-[#FE4C4A]"
            >
              <Text className="text-[16px] font-[700] text-[#fff]">확인</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};

export default HeartModal;