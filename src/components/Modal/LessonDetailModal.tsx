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
    if(curLessonData === lessonData){
      console.log('일반 학습 모드');
      console.log('lessonData : ', lessonData);
      navigation.navigate('LessonLearning', { /* 타입 호환을 위해 lessonData 전달 */ } as any);
      (navigation as any).navigate('LessonLearning', { lessonData });
    } else {
      console.log('복습 모드');
      console.log('lessonData : ', lessonData);
      navigation.navigate('LessonLearning', { /* 타입 호환을 위해 lessonData 전달 */ } as any);
      (navigation as any).navigate('LessonLearning', { lessonData });
    }
    onClose(); 
  }

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      contentClassName="flex-col gap-[10px] w-[322px] p-[20px] rounded-[20px] bg-[#FAFAFA]"
    >
      <View className="flex-row items-center gap-[10px]">
        <View className="flex-1 flex-col gap-[6px]">
          <Text className="text-[12px] font-[700] text-[#606060]">학습</Text>
          <Text className="text-[16px] font-[700] text-[#111]">{lessonData?.title}</Text>
        </View>

        <View>
          <Star width={42} height={42} fill={lessonData.isCompleted || curLessonData === lessonData ? '#93D333' : '#cccccc'} />
        </View>
      </View>
      <View className="flex-col gap-[6px]">
        <View className="flex-row items-center justify-between">
          <Text className="text-[12px] font-[700] text-[#606060]">CHAPTER</Text>
          <Text className="text-[12px] font-[700] text-[#606060]" >{lessonData.isCompleted ? '1' : '0'}/1</Text>
        </View>
        <View className="h-[10px] bg-[#F5F5F5] rounded-[10px] overflow-hidden">
          <View className="h-[10px] bg-[#93D333] rounded-[10px]" style={{width: `${lessonData.isCompleted ? '100%' : '0%'}`}}></View>
        </View>
      </View>

      <DefaultModalBtn
        onPress={onPressStart}
        text={lessonData.isCompleted ? '복습' : curLessonData !== lessonData ? '복습' : '시작'}
        buttonClassName="flex items-center justify-center h-[40px] p-[10px] rounded-[10px] bg-[#93D333]"
        textClassName="text-[18px] font-[700] text-[#fff] text-center leading-[20px]"
        enableHapticFeedback={true}
        enableSound={true}
        disabled={!lessonData.isCompleted && curLessonData !== lessonData}
      />
    </BaseModal>
  );
};

export default LessonDetailModal;