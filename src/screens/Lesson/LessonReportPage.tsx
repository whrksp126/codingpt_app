import { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, Image, Animated, Easing } from 'react-native';
import LottieView from 'lottie-react-native';
import { useUser } from '../../contexts/UserContext';
import { useLesson } from '../../contexts/LessonContext';
import userService from '../../services/userService';
import lessonService from '../../services/lessonService';
import { Lightning, Target } from '../../assets/SvgIcon';
import DefaultBtn from '../../components/Button/DefaultBtn';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LessonFlowStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<LessonFlowStackParamList, 'LessonReport'>;

const LessonReportPage: React.FC<Props> = ({ route, navigation }) => {
  const { curLesson } = (route.params as any);
  // console.log('curLesson', curLesson);
  const { user, setUser, refreshUser } = useUser();
  const { activeProductId } = useLesson();

  // 아이콘 애니메이션 값들
  const lightningScale = useRef(new Animated.Value(1)).current;
  const lightningRotation = useRef(new Animated.Value(0)).current;
  const targetScale = useRef(new Animated.Value(1)).current;
  const targetRotation = useRef(new Animated.Value(0)).current;

  // 타이핑 효과 상태
  const [typingText, setTypingText] = useState('');
  const [showCursor, setShowCursor] = useState(true);

  // 계산된 경험치 - useMemo로 최적화하여 curLesson이 변경될 때만 재계산
  const earnedXp = useMemo(() => {
    const slideCount = curLesson?.sliders?.length || 0;
    return slideCount * 2;
  }, [curLesson]);

  // 타이핑 애니메이션 함수
  const startTypingAnimation = () => {
    const text = "레슨을 완료 했어요!";
    let index = 0;
    
    const typeText = () => {
      if (index < text.length) {
        setTypingText(text.substring(0, index + 1));
        index++;
        setTimeout(typeText, 120); // 120ms마다 한 글자씩
      } else {
        // 타이핑 완료 후 커서 깜빡임 시작
        startCursorBlink();
      }
    };
    
    typeText();
  };

  // 커서 깜빡임 애니메이션
  const startCursorBlink = () => {
    const blink = () => {
      setShowCursor(prev => !prev);
      setTimeout(blink, 500); // 500ms마다 깜빡임
    };
    blink();
  };

  // 버튼 클릭 핸들러
  const handleConfirmPress = () => {
    // 탭 홈으로 이동
    navigation.getParent()?.navigate('Tabs', { screen: 'home', params: { screen: 'HomeScreen' } });
  };

  // 아이콘 애니메이션 함수들
  const startLightningAnimation = () => {
    // 번개 아이콘 크기 애니메이션
    const lightningScaleLoop = () => {
      Animated.sequence([
        Animated.timing(lightningScale, {
          toValue: 1.2,
          duration: 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(lightningScale, {
          toValue: 1,
          duration: 400,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(lightningScaleLoop, 3000); // 3초 후 다시 시작
      });
    };

    // 번개 아이콘 회전 애니메이션
    const lightningRotationLoop = () => {
      Animated.sequence([
        Animated.timing(lightningRotation, {
          toValue: 10,
          duration: 500,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(lightningRotation, {
          toValue: -10,
          duration: 500,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(lightningRotation, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(lightningRotationLoop, 4000); // 4초 후 다시 시작
      });
    };

    lightningScaleLoop();
    lightningRotationLoop();
  };

  const startTargetAnimation = () => {
    // 타겟 아이콘 크기 애니메이션
    const targetScaleLoop = () => {
      Animated.sequence([
        Animated.timing(targetScale, {
          toValue: 1.3,
          duration: 500,
          easing: Easing.out(Easing.elastic(1)),
          useNativeDriver: true,
        }),
        Animated.timing(targetScale, {
          toValue: 1,
          duration: 500,
          easing: Easing.in(Easing.elastic(1)),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(targetScaleLoop, 3500); // 3.5초 후 다시 시작
      });
    };

    // 타겟 아이콘 회전 애니메이션
    const targetRotationLoop = () => {
      Animated.sequence([
        Animated.timing(targetRotation, {
          toValue: 8,
          duration: 600,
          easing: Easing.out(Easing.bounce),
          useNativeDriver: true,
        }),
        Animated.timing(targetRotation, {
          toValue: -8,
          duration: 600,
          easing: Easing.out(Easing.bounce),
          useNativeDriver: true,
        }),
        Animated.timing(targetRotation, {
          toValue: 0,
          duration: 600,
          easing: Easing.in(Easing.bounce),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setTimeout(targetRotationLoop, 4500); // 4.5초 후 다시 시작
      });
    };

    targetScaleLoop();
    targetRotationLoop();
  };

  useEffect(() => {
    // 타이핑 애니메이션 시작 (0.5초 후)
    setTimeout(() => {
      startTypingAnimation();
    }, 500);

    // 아이콘 애니메이션 시작 (2초 후)
    setTimeout(() => {
      startLightningAnimation();
      startTargetAnimation();
    }, 2000);
    if (!user?.id) return;

    if (curLesson.isCompleted === true) {
      userService.updateXp(user.id, earnedXp).then((res) => {
        if (res && res.xp !== undefined) {
          setUser((prev) => prev ? { ...prev, xp: res.xp } : prev);
        }
      }).catch((err) => console.log("XP 업데이트 실패:", err));

      const resultData = curLesson.extractedResult;
      
      lessonService.completeLessonWithResult({
        userId: user.id,
        myclassId: curLesson.myclassId,
        lessonId: curLesson.lessonId,
        result: resultData,
      }).catch((err) => console.error("학습 기록 저장 실패:", err));

      userService.postStudyHeatmap({
        userId: user.id,
        productId: activeProductId ?? 0,
        sectionId: curLesson.sectionId,
        lessonId: curLesson.lessonId,
      }).then(async () => {
        await refreshUser();
      }).catch((err) => console.log("학습 일수 업데이트 실패:", err));
    }
  }, []);

  return (
    <View className="relative flex-1">
      <View className="flex-1 gap-[20px] pt-[70px] items-center">
        <View className="relative w-[260px] h-[260px]">
          {/* Lottie Animation */}
          <LottieView
            source={require('../../assets/lottie/Trophy.json')}
            autoPlay
            loop={false}
            speed={0.6}
            style={{ position: 'absolute', top: '50%', left: '50%', width: 320, height: 320, transform: [{ translateX: '-50%'}, { translateY: '-50%' }] }}
          />
        </View>
        {/* 레슨 완료 텍스트 - 타이핑 효과 */}
        <View className="min-h-[30px] items-center">
          <Text className="text-[24px] font-[700] text-[#FFC800]">
            {typingText}
            {showCursor && <Text className="text-[24px] font-[700] text-[#FFC800]">|</Text>}
          </Text>
        </View>

        <View className="flex-row gap-[20px] p-[20px]">
          <View className="flex flex-col items-center justify-center flex-1 p-[2px] rounded-[16px] bg-[#FFC800]">
            <View className="pt-[2px] pb-[4px]">
              <Text className="text-[14px] font-[700] text-[#fff]">경험치</Text>
            </View>
            <View className="flex flex-row items-center justify-center gap-[4px] w-full h-[55px] p-[10px] bg-[#fff] rounded-[15px]">
              <Animated.View
                style={{
                  transform: [
                    { scale: lightningScale },
                    { rotate: lightningRotation.interpolate({
                      inputRange: [-10, 10],
                      outputRange: ['-10deg', '10deg'],
                    })}
                  ],
                }}
              >
                <Lightning width={24} height={24} fill="#FFC800" />
              </Animated.View>
              <Text className="text-[22px] font-[700] text-[#FFC800]">+{earnedXp}</Text>
            </View>
          </View>
          <View className="flex flex-col items-center justify-center flex-1 p-[2px] rounded-[16px] bg-[#58CC02] ">
            <View className="pt-[2px] pb-[4px]">
              <Text className="text-[14px] font-[700] text-[#fff]">정답률</Text>
            </View>
            <View className="flex flex-row items-center justify-center gap-[4px] w-full h-[55px] p-[10px] bg-[#fff] rounded-[15px]">
              <Animated.View
                style={{
                  transform: [
                    { scale: targetScale },
                    { rotate: targetRotation.interpolate({
                      inputRange: [-8, 8],
                      outputRange: ['-8deg', '8deg'],
                    })}
                  ],
                }}
              >
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