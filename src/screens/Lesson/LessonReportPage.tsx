import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StatusBar, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
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
import { RadialBurst } from '../../components/effects/RadialBurst';
import { LightSweep } from '../../components/effects/LightSweep';
import { SparkleShower } from '../../components/effects/SparkleShower';
import { TypographyReveal } from '../../components/effects/TypographyReveal';
import { CountUpNumber } from '../../components/effects/CountUpNumber';
import { SPRING_BOUNCY } from '../../animations/presets';
import { haptic } from '../../animations/haptics';

type Props = NativeStackScreenProps<LessonFlowStackParamList, 'LessonReport'>;

const { width: SW, height: SH } = Dimensions.get('window');

const LessonReportPage: React.FC<Props> = ({ route, navigation }) => {
  const { curLesson, nextLessonId } = (route.params as any);
  const { user, setUser, refreshUser } = useUser();
  const { activeProductId } = useLesson();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';

  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
    }, [isDark])
  );

  // 트로피 등장 spring
  const trophyScale = useSharedValue(0);
  const trophyOpacity = useSharedValue(0);

  // 아이콘 idle bobbing (기존 유지, 약간 톤다운)
  const lightningScale = useSharedValue(1);
  const lightningRotation = useSharedValue(0);
  const targetScale = useSharedValue(1);
  const targetRotation = useSharedValue(0);

  const [earnedXp, setEarnedXp] = useState(0);

  const startLightningAnimation = () => {
    lightningScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 500, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 500, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
    lightningRotation.value = withRepeat(
      withSequence(
        withTiming(8, { duration: 600, easing: Easing.out(Easing.back(1.2)) }),
        withTiming(-8, { duration: 600, easing: Easing.out(Easing.back(1.2)) }),
        withTiming(0, { duration: 600, easing: Easing.in(Easing.back(1.2)) }),
      ),
      -1,
      false,
    );
  };

  const startTargetAnimation = () => {
    targetScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 600, easing: Easing.out(Easing.elastic(1)) }),
        withTiming(1, { duration: 600, easing: Easing.in(Easing.elastic(1)) }),
      ),
      -1,
      false,
    );
  };

  const handleConfirmPress = () => {
    if (nextLessonId) {
      navigation.replace('LessonLearning', { lessonId: nextLessonId });
      return;
    }
    navigation.getParent()?.navigate('Tabs', { screen: 'home', params: { screen: 'HomeScreen' } });
  };

  useEffect(() => {
    // 트로피 spring 등장
    trophyOpacity.value = withTiming(1, { duration: 300 });
    trophyScale.value = withSpring(1, SPRING_BOUNCY);

    // 마운트 500ms 후 success haptic — 컨페티는 사용자 요청으로 제거
    const hapticTimer = setTimeout(() => {
      haptic.success();
    }, 500);

    startLightningAnimation();
    startTargetAnimation();

    if (!user?.id || !curLesson) {
      return () => {
        clearTimeout(hapticTimer);
        cancelAnimation(lightningScale);
        cancelAnimation(lightningRotation);
        cancelAnimation(targetScale);
        cancelAnimation(targetRotation);
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
      clearTimeout(hapticTimer);
      cancelAnimation(lightningScale);
      cancelAnimation(lightningRotation);
      cancelAnimation(targetScale);
      cancelAnimation(targetRotation);
      cancelAnimation(trophyScale);
      cancelAnimation(trophyOpacity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trophyStyle = useAnimatedStyle(() => ({
    opacity: trophyOpacity.value,
    transform: [{ scale: trophyScale.value }],
  }));
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
      {/* 배경 효과 — 가장 뒤 */}
      <RadialBurst delay={150} duration={800} rayCount={14} color="#FFD700" origin={{ x: SW / 2, y: SH * 0.28 }} />
      <LightSweep delay={350} duration={1200} />
      <SparkleShower count={18} loop area={{ x: 0, y: 0, width: SW, height: SH * 0.6 }} />

      <View className="flex-1 gap-[20px] pt-[70px] items-center">
        <View className="relative w-[260px] h-[260px] items-center justify-center">
          <Animated.View style={trophyStyle}>
            <LottieView
              source={require('../../assets/lottie/Trophy.json')}
              autoPlay
              loop={false}
              speed={0.6}
              style={{ width: 320, height: 320 }}
            />
          </Animated.View>
        </View>
        <View className="min-h-[30px] items-center flex-row">
          <TypographyReveal
            text="레슨을 완료 했어요!"
            startDelayMs={250}
            charDelayMs={45}
            className="text-[24px] font-[700] text-[#FFC800]"
          />
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
              <CountUpNumber
                value={earnedXp}
                prefix="+"
                duration={900}
                delay={600}
                className="text-[22px] font-[700] text-[#FFC800]"
              />
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
              <CountUpNumber
                value={100}
                duration={900}
                delay={600}
                className="text-[22px] font-[700] text-[#58CC02]"
              />
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
