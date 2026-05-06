import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StatusBar } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useUser } from '../../contexts/UserContext';
import { useLesson } from '../../contexts/LessonContext';
import { useTheme } from '../../contexts/ThemeContext';
import userService from '../../services/userService';
import lessonService from '../../services/lessonService';
import { Lightning, Target } from '../../assets/SvgIcon';
import DefaultBtn from '../../components/Button/DefaultBtn';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LessonFlowStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<LessonFlowStackParamList, 'LessonReport'>;

const LessonReportPage: React.FC<Props> = ({ route, navigation }) => {
  const { curLesson } = (route.params as any);
  const { user, setUser, refreshUser } = useUser();
  const { activeProductId } = useLesson();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  // 리포트 화면 배경은 light 모드 흰색 / dark 모드 검정.
  // 포커스 시 테마에 맞는 StatusBar 텍스트 색상을 imperative하게 강제하여
  // 직전에 학습 화면이 dark-content로 바꿔둔 값이 남아있어도 올바르게 보이도록 한다.
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
    }, [isDark])
  );

  // 아이콘 애니메이션 (UI 스레드 무한 반복)
  const lightningScale = useSharedValue(1);
  const lightningRotation = useSharedValue(0);
  const targetScale = useSharedValue(1);
  const targetRotation = useSharedValue(0);
  const cursorOpacity = useSharedValue(1);

  // 타이핑 효과 상태
  const [typingText, setTypingText] = useState('');
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [earnedXp, setEarnedXp] = useState(0);

  const startCursorBlink = () => {
    cursorOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 500 }),
        withTiming(1, { duration: 500 }),
      ),
      -1,
      false,
    );
  };

  const startTypingAnimation = () => {
    const text = '레슨을 완료 했어요!';
    let index = 0;
    const typeText = () => {
      setTypingText(text.substring(0, index + 1));
      index++;
      if (index < text.length) {
        typingTimeoutRef.current = setTimeout(typeText, 120);
      } else {
        startCursorBlink();
      }
    };
    typingTimeoutRef.current = setTimeout(typeText, 500);
  };

  const startLightningAnimation = () => {
    lightningScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 400, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 400, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
    lightningRotation.value = withRepeat(
      withSequence(
        withTiming(10, { duration: 500, easing: Easing.out(Easing.back(1.2)) }),
        withTiming(-10, { duration: 500, easing: Easing.out(Easing.back(1.2)) }),
        withTiming(0, { duration: 500, easing: Easing.in(Easing.back(1.2)) }),
      ),
      -1,
      false,
    );
  };

  const startTargetAnimation = () => {
    targetScale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 500, easing: Easing.out(Easing.elastic(1)) }),
        withTiming(1, { duration: 500, easing: Easing.in(Easing.elastic(1)) }),
      ),
      -1,
      false,
    );
    targetRotation.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 600, easing: Easing.out(Easing.bounce) }),
        withTiming(-8, { duration: 600, easing: Easing.out(Easing.bounce) }),
        withTiming(0, { duration: 600, easing: Easing.in(Easing.bounce) }),
      ),
      -1,
      false,
    );
  };

  const handleConfirmPress = () => {
    navigation.getParent()?.navigate('Tabs', { screen: 'home', params: { screen: 'HomeScreen' } });
  };

  useEffect(() => {
    startTypingAnimation();
    startLightningAnimation();
    startTargetAnimation();

    if (!user?.id || !curLesson) {
      return () => {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        cancelAnimation(lightningScale);
        cancelAnimation(lightningRotation);
        cancelAnimation(targetScale);
        cancelAnimation(targetRotation);
        cancelAnimation(cursorOpacity);
      };
    }

    if (curLesson.isCompleted === true) {
      lessonService.completeLessonWithResult({
        userId: user.id,
        myclassId: curLesson.myclassId,
        lessonId: curLesson.lessonId,
        result: curLesson.sliders,
      }).then((res) => {
        if (res) {
          setEarnedXp(res.addedXp);
          setUser((prev) => prev ? { ...prev, xp: res.totalXp } : prev);
        }
      }).catch((err) => console.error('학습 기록 저장 실패:', err));

      userService.postStudyHeatmap({
        userId: user.id,
        productId: activeProductId ?? 0,
        sectionId: curLesson.sectionId,
        lessonId: curLesson.lessonId,
      }).then(async () => {
        await refreshUser();
      }).catch((err) => console.log('학습 일수 업데이트 실패:', err));
    }

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      cancelAnimation(lightningScale);
      cancelAnimation(lightningRotation);
      cancelAnimation(targetScale);
      cancelAnimation(targetRotation);
      cancelAnimation(cursorOpacity);
    };
  }, []);

  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));
  const lightningStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: lightningScale.value },
      { rotate: `${interpolate(lightningRotation.value, [-10, 10], [-10, 10])}deg` },
    ],
  }));
  const targetStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: targetScale.value },
      { rotate: `${interpolate(targetRotation.value, [-8, 8], [-8, 8])}deg` },
    ],
  }));

  return (
    <View className="relative flex-1 bg-white dark:bg-[#0A0D14]">
      <View className="flex-1 gap-[20px] pt-[70px] items-center">
        <View className="relative w-[260px] h-[260px] items-center justify-center">
          <LottieView
            source={require('../../assets/lottie/Trophy.json')}
            autoPlay
            loop={false}
            speed={0.6}
            style={{ width: 320, height: 320 }}
          />
        </View>
        <View className="min-h-[30px] items-center flex-row">
          <Text className="text-[24px] font-[700] text-[#FFC800]">{typingText}</Text>
          <Animated.Text
            className="text-[24px] font-[700] text-[#FFC800]"
            style={cursorStyle}
          >
            |
          </Animated.Text>
        </View>

        <View className="flex-row gap-[20px] p-[20px]">
          <View className="flex flex-col items-center justify-center flex-1 p-[2px] rounded-[16px] bg-[#FFC800]">
            <View className="pt-[2px] pb-[4px]">
              <Text className="text-[14px] font-[700] text-[#fff]">경험치</Text>
            </View>
            <View className="flex flex-row items-center justify-center gap-[4px] w-full h-[55px] p-[10px] bg-[#fff] dark:bg-[#1B1F27] rounded-[15px]">
              <Animated.View style={lightningStyle}>
                <Lightning width={24} height={24} fill="#FFC800" />
              </Animated.View>
              <Text className="text-[22px] font-[700] text-[#FFC800]">+{earnedXp}</Text>
            </View>
          </View>
          <View className="flex flex-col items-center justify-center flex-1 p-[2px] rounded-[16px] bg-[#58CC02] ">
            <View className="pt-[2px] pb-[4px]">
              <Text className="text-[14px] font-[700] text-[#fff]">정답률</Text>
            </View>
            <View className="flex flex-row items-center justify-center gap-[4px] w-full h-[55px] p-[10px] bg-[#fff] dark:bg-[#1B1F27] rounded-[15px]">
              <Animated.View style={targetStyle}>
                <Target width={24} height={24} fill="#58CC02" />
              </Animated.View>
              <Text className="text-[22px] font-[700] text-[#58CC02]">100</Text>
            </View>
          </View>
        </View>
      </View>

      <View className="flex-row items-center gap-[16px] p-[16px]">
        <DefaultBtn
          onPress={handleConfirmPress}
          text="확인"
          buttonClassName="flex items-center justify-center h-[50px] rounded-[10px] bg-[#58CC02]"
          textClassName="text-[18px] font-[700] text-center text-[#fff]"
          enableHapticFeedback={true}
          enableSound={true}
        />
      </View>
    </View>
  );
};

export default LessonReportPage;
