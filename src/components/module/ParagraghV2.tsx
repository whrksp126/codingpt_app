import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing, useWindowDimensions } from 'react-native';
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
}

export const ParagraghComponentV2: React.FC<ParagraghComponentProps> = React.memo(
  ({ module }) => {
    const { width } = useWindowDimensions();
    const isTimeType = module.visibility?.type === 'time';
    const [isVisible, setIsVisible] = useState(!isTimeType); // time 타입이면 초기값 false

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(12)).current;
    const scaleAnim = useRef(new Animated.Value(0.97)).current;

    useEffect(() => {
      const visibility = module.visibility;

      // time 타입일 때 showDelay 처리
      if (isTimeType && visibility?.showDelay !== undefined) {
        const showDelay = visibility.showDelay ?? 0;

        const showTimer = setTimeout(() => {
          setIsVisible(true);
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 500,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
              toValue: 0,
              tension: 60,
              friction: 12,
              useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
              toValue: 1,
              tension: 60,
              friction: 12,
              useNativeDriver: true,
            }),
          ]).start();
        }, showDelay);

        // hideDelay 처리 (있는 경우)
        let hideTimer: NodeJS.Timeout | undefined;
        if (visibility.hideDelay !== undefined) {
          hideTimer = setTimeout(() => {
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 300,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }).start();
          }, visibility.hideDelay);
        }

        return () => {
          clearTimeout(showTimer);
          if (hideTimer) clearTimeout(hideTimer);
        };
      } else {
        // step 타입이거나 visibility가 없는 경우 즉시 표시
        const timer = setTimeout(() => {
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 450,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
              toValue: 0,
              tension: 60,
              friction: 12,
              useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
              toValue: 1,
              tension: 60,
              friction: 12,
              useNativeDriver: true,
            }),
          ]).start();
        }, 60);

        return () => clearTimeout(timer);
      }
    }, [fadeAnim, slideAnim, scaleAnim, isTimeType, module.visibility]);

    // time 타입이고 아직 보이지 않으면 null 반환
    if (isTimeType && !isVisible) {
      return null;
    }

    const htmlSource = { html: module.content };
    const cardBaseStyle = {
      opacity: fadeAnim,
      transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
      alignSelf: 'stretch' as const,
    };

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
      <Animated.View style={cardBaseStyle}>
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
