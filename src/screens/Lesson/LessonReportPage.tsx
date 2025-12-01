import { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
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
  const { user, setUser, refreshUser } = useUser();
  const { activeProductId } = useLesson();

  // 아이콘 애니메이션 값들
  const lightningScale = useRef(new Animated.Value(1)).current;
  const lightningRotation = useRef(new Animated.Value(0)).current;
  const targetScale = useRef(new Animated.Value(1)).current;
  const targetRotation = useRef(new Animated.Value(0)).current;

  // 커서 애니메이션 값 (깜빡임, 렌더링 없이 네이티브 스레드에서 처리)
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  // 애니메이션 인스턴스들 (언마운트 시 stop용)
  const lightningScaleAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const lightningRotationAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const targetScaleAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const targetRotationAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const cursorAnimation = useRef<Animated.CompositeAnimation | null>(null);

  // 타이핑 효과 상태
  const [typingText, setTypingText] = useState('');

  // 타이핑 타이머 (cleanup에서 정리)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 계산된 경험치 - useMemo로 최적화하여 curLesson이 변경될 때만 재계산
  const earnedXp = useMemo(() => {
    const slideCount = curLesson?.sliders?.length || 0;
    return slideCount * 2;
  }, [curLesson]);

  // 커서 깜빡임 애니메이션 (state 사용하지 않고 Animated.loop 사용)
  const startCursorBlink = () => {
    if (cursorAnimation.current) return; // 중복 실행 방지

    cursorAnimation.current = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );

    cursorAnimation.current.start();
  };

  // 타이핑 애니메이션 함수
  const startTypingAnimation = () => {
    const text = "레슨을 완료 했어요!";
    let index = 0;
    
    const typeText = () => {
      // 언마운트 후에도 호출되는 것을 방지하기 위해 ref를 통해 관리
      setTypingText(text.substring(0, index + 1));
      index++;

      if (index < text.length) {
        typingTimeoutRef.current = setTimeout(typeText, 120); // 120ms마다 한 글자씩
      } else {
        // 타이핑 완료 후 커서 깜빡임 시작
        startCursorBlink();
      }
    };
    
    // 처음 진입 시 0.5초 딜레이 후 타이핑 시작
    typingTimeoutRef.current = setTimeout(typeText, 500)
  };

  // 번개 아이콘 애니메이션
  const startLightningAnimation = () => {
    // scale
    lightningScaleAnimation.current = Animated.loop(
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
      ])
    );

    // rotation
    lightningRotationAnimation.current = Animated.loop(
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
      ])
    );

    lightningScaleAnimation.current.start();
    lightningRotationAnimation.current.start();
  };

  // 타겟 아이콘 애니메이션
  const startTargetAnimation = () => {
    // scale
    targetScaleAnimation.current = Animated.loop(
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
      ])
    );

    // rotation
    targetRotationAnimation.current = Animated.loop(
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
      ])
    );

    targetScaleAnimation.current.start();
    targetRotationAnimation.current.start();
  };

  // 버튼 클릭 핸들러
  const handleConfirmPress = () => {
    // 탭 홈으로 이동
    navigation.getParent()?.navigate('Tabs', { screen: 'home', params: { screen: 'HomeScreen' } });
  };

  // 마운트 시 애니메이션 & API 호출 처리
  useEffect(() => {
    // 애니메이션 시작
    startTypingAnimation();
    startLightningAnimation();
    startTargetAnimation();

    // user 또는 curLesson이 없으면 API 호출 스킵
    if (!user?.id || !curLesson) {
      return () => {
        // cleanup만 실행
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        lightningScaleAnimation.current?.stop();
        lightningRotationAnimation.current?.stop();
        targetScaleAnimation.current?.stop();
        targetRotationAnimation.current?.stop();
        cursorAnimation.current?.stop();
      };
    }

    // 레슨 완료 시에만 기록 저장
    if (curLesson.isCompleted === true) {
      // 경험치 업데이트
      userService.updateXp(user.id, earnedXp).then((res) => {
        if (res && res.xp !== undefined) {
          setUser((prev) => prev ? { ...prev, xp: res.xp } : prev);
        }
      }).catch((err) => console.log("XP 업데이트 실패:", err));
      
      // 학습 기록 저장
      lessonService.completeLessonWithResult({
        userId: user.id,
        myclassId: curLesson.myclassId,
        lessonId: curLesson.lessonId,
        result: curLesson.sliders,
      }).catch((err) => console.error("학습 기록 저장 실패:", err));

      // 잔디(스터디 히트맵) 기록
      userService.postStudyHeatmap({
        userId: user.id,
        productId: activeProductId ?? 0,
        sectionId: curLesson.sectionId,
        lessonId: curLesson.lessonId,
      }).then(async () => {
        await refreshUser();
      }).catch((err) => console.log("학습 일수 업데이트 실패:", err));
    }
    // 언마운트 시 타이머 & 애니메이션 정리
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      lightningScaleAnimation.current?.stop();
      lightningRotationAnimation.current?.stop();
      targetScaleAnimation.current?.stop();
      targetRotationAnimation.current?.stop();
      cursorAnimation.current?.stop();
    };
  }, []); // 이 페이지는 진입할 때 한 번만 동작하도록 유지

  return (
    <View className="relative flex-1">
      <View className="flex-1 gap-[20px] pt-[70px] items-center">
        <View className="relative w-[260px] h-[260px] items-center justify-center">
          {/* Lottie Animation */}
          <LottieView
            source={require('../../assets/lottie/Trophy.json')}
            autoPlay
            loop={false}
            speed={0.6}
            style={{ width: 320, height: 320 }}
          />
        </View>
        {/* 레슨 완료 텍스트 - 타이핑 효과 */}
        <View className="min-h-[30px] items-center flex-row">
          <Text className="text-[24px] font-[700] text-[#FFC800]">
            {typingText}
          </Text>
          {/* 커서(깜빡임은 Animated로 처리, 렌더링 없음) */}
          <Animated.Text
            className="text-[24px] font-[700] text-[#FFC800]"
            style={{ opacity: cursorOpacity }}
          >
            |
          </Animated.Text>
        </View>

        <View className="flex-row gap-[20px] p-[20px]">
          {/* 경험치 카드 */}
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