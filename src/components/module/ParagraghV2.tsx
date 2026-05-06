import React, { useEffect, useState } from 'react';
import { View, Image, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import RenderHTML from 'react-native-render-html';
import * as SvgIcons from '../../assets/SvgIcon';
import { htmlTagsStyles, classesStyles } from '../../utils/htmlStyles';

/**
 * props 타입은 기존 구조에 맞춰 사용
 */
interface ParagraghComponentProps {
  module: {
    id: number;
    type: string;
    visibility: {
      type: string;
      value?: number;
      showDelay?: number;  // time 타입일 때 사용
      hideDelay?: number;  // time 타입일 때 사용
    };
    content: string;        // ✅ HTML 문자열
    icon?: {
      name: string;         // SvgIcon.tsx에 정의된 아이콘 이름
      size?: number;        // 아이콘 크기 (기본값: 32)
      fill?: string;        // 아이콘 색상 (기본값: '#08875D')
      backgroundSize?: number; // 원형 배경 크기 (기본값: 64)
      backgroundColor?: string; // 원형 배경 색상 (기본값: '#EDFDF8')
    };
  };
  skipAnimation?: boolean;
}

export const ParagraghComponentV2: React.FC<ParagraghComponentProps> = React.memo(
  ({ module, skipAnimation }) => {
    const { width } = useWindowDimensions();
    const isTimeType = module.visibility?.type === 'time';
    // If skipAnimation is true, we force visibility to true regardless of type
    const [isVisible, setIsVisible] = useState(skipAnimation ? true : !isTimeType);

    const fadeAnim = useSharedValue(skipAnimation ? 1 : 0);
    const slideAnim = useSharedValue(skipAnimation ? 0 : 12);
    const scaleAnim = useSharedValue(skipAnimation ? 1 : 0.97);

    useEffect(() => {
      if (skipAnimation) return;

      const visibility = module.visibility;

      const playEnter = (duration: number) => {
        fadeAnim.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
        slideAnim.value = withSpring(0, { damping: 15, stiffness: 100 });
        scaleAnim.value = withSpring(1, { damping: 15, stiffness: 110 });
      };

      if (isTimeType && visibility?.showDelay !== undefined) {
        const showDelay = visibility.showDelay ?? 0;
        const showTimer = setTimeout(() => {
          setIsVisible(true);
          playEnter(450);
        }, showDelay);

        let hideTimer: NodeJS.Timeout | undefined;
        if (visibility.hideDelay !== undefined) {
          hideTimer = setTimeout(() => {
            fadeAnim.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
          }, visibility.hideDelay);
        }

        return () => {
          clearTimeout(showTimer);
          if (hideTimer) clearTimeout(hideTimer);
        };
      } else {
        const timer = setTimeout(() => playEnter(420), 60);
        return () => clearTimeout(timer);
      }
    }, [fadeAnim, slideAnim, scaleAnim, isTimeType, module.visibility, skipAnimation]);

    const cardAnimStyle = useAnimatedStyle(() => ({
      opacity: fadeAnim.value,
      transform: [{ translateY: slideAnim.value }, { scale: scaleAnim.value }],
    }));

    // time 타입이고 아직 보이지 않으면 null 반환
    if (isTimeType && !isVisible) {
      return null;
    }

    const htmlSource = { html: module.content };
    const stretchStyle = { alignSelf: 'stretch' as const };

    // 아이콘 렌더링 함수
    const renderIcon = () => {
      if (!module.icon) return null;

      const {
        name,
        size = 32,
        fill = '#08875D',
        backgroundSize = 64,
        backgroundColor = '#EDFDF8'
      } = module.icon;

      // SVG 아이콘 컴포넌트 가져오기
      const SvgIcon = (SvgIcons as any)[name] as React.ComponentType<{
        width?: number;
        height?: number;
        fill?: string;
      }>;

      if (!SvgIcon) {
        console.warn(`SVG icon "${name}" not found in SvgIcon.tsx`);
        return null;
      }

      return (
        <View
          style={{
            width: '100%',
            alignItems: 'center',
            marginTop: 40,
            marginBottom: 20,
          }}
        >
          <View
            style={{
              width: backgroundSize,
              height: backgroundSize,
              backgroundColor: backgroundColor,
              borderRadius: backgroundSize / 2,
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            <SvgIcon width={size} height={size} fill={fill} />
          </View>
        </View>
      );
    };

    return (
      <Animated.View style={[cardAnimStyle, stretchStyle]}>
        {renderIcon()}
        <RenderHTML
          contentWidth={width - 48}
          source={htmlSource}
          tagsStyles={htmlTagsStyles}
          classesStyles={classesStyles}
        />
      </Animated.View>
    );
  }
);
