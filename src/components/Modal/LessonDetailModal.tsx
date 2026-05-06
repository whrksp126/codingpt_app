import { View, Text } from 'react-native';
import { Star } from '../../assets/SvgIcon';
import DefaultModalBtn from '../Button/DefaultModalBtn';
import BaseModal from './BaseModal';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { LessonFlowStackParamList } from '../../navigation/types';

interface LessonDetailModalProps {
  lessonData: any;
  curLessonData: any;
  visible: boolean;
  onClose: () => void;
}

const LessonDetailModal = ({ lessonData, curLessonData, visible, onClose }: LessonDetailModalProps) => {
  const navigation = useNavigation<NativeStackNavigationProp<LessonFlowStackParamList>>();

  const onPressStart = () => {
    (navigation as any).navigate('LessonLearning', { lessonData });
    onClose();
  }

  return (
    <BaseModal visible={visible} onClose={onClose}>
      <View className="flex-col gap-[10px] px-[20px] pb-[10px]">
      <View className="flex-row items-center gap-[10px]">
        <View className="flex-1 flex-col gap-[6px]">
          <Text className="text-[12px] font-[700] text-[#606060] dark:text-[#9CA3AF]">학습</Text>
          <Text className="text-[16px] font-[700] text-[#111] dark:text-white">{lessonData?.title}</Text>
        </View>

        <View>
          <Star width={42} height={42} fill={lessonData.isCompleted || curLessonData === lessonData ? '#93D333' : '#cccccc'} />
        </View>
      </View>
      <View className="flex-col gap-[6px]">
        <View className="flex-row items-center justify-between">
          <Text className="text-[12px] font-[700] text-[#606060] dark:text-[#9CA3AF]">CHAPTER</Text>
          <Text className="text-[12px] font-[700] text-[#606060] dark:text-[#9CA3AF]" >{lessonData.isCompleted ? '1' : '0'}/1</Text>
        </View>
        <View className="h-[10px] bg-[#F5F5F5] dark:bg-[#3F444D] rounded-[10px] overflow-hidden">
          <View className="h-[10px] bg-[#93D333] rounded-[10px]" style={{width: `${lessonData.isCompleted ? '100%' : '0%'}`}}></View>
        </View>
      </View>

      <DefaultModalBtn
        onPress={onPressStart}
        text={lessonData.isCompleted ? '복습' : curLessonData !== lessonData ? '복습' : '시작'}
        buttonClassName="flex items-center justify-center h-[56px] p-[10px] rounded-[12px] bg-[#93D333]"
        textClassName="text-[20px] font-[700] text-[#fff] text-center leading-[24px]"
        enableHapticFeedback={true}
        enableSound={true}
        disabled={!lessonData.isCompleted && curLessonData !== lessonData}
      />
      </View>
    </BaseModal>
  );
};

export default LessonDetailModal;