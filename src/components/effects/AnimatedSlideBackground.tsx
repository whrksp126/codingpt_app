import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { DURATION_SLIDE_MORPH, EASE_OUT_IOS } from '../../animations/presets';
import { ENABLE_SLIDE_TRANSITION } from '../../utils/featureFlags';

interface Background {
  colors: string[];
  locations?: number[];
  angle?: number;
}

interface Props {
  background?: Background;
  transitionKey: number | string;
  /**
   * false 이면 transitionKey 변화 시 morph 없이 즉시 색 적용. 재방문 슬라이드 깜빡임 방지.
   */
  morphEnabled?: boolean;
}

const computeAxis = (angle: number = 180) => {
  const radians = (angle * Math.PI) / 180;
  const x1 = 0.5 - Math.sin(radians) * 0.5;
  const y1 = 0.5 + Math.cos(radians) * 0.5;
  const x2 = 0.5 + Math.sin(radians) * 0.5;
  const y2 = 0.5 - Math.cos(radians) * 0.5;
  return { x1, y1, x2, y2 };
};

const GradientLayer: React.FC<{
  background?: Background;
  gradientId: string;
}> = ({ background, gradientId }) => {
  if (!background || !Array.isArray(background.colors) || background.colors.length === 0) {
    return null;
  }
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
  const { x1, y1, x2, y2 } = computeAxis(background.angle);
  const locations =
    background.locations ||
    background.colors.map((_, i) => i / Math.max(1, background.colors.length - 1));

  return (
    <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={StyleSheet.absoluteFillObject}>
      <Defs>
        <LinearGradient
          id={gradientId}
          x1={`${x1 * 100}%`}
          y1={`${y1 * 100}%`}
          x2={`${x2 * 100}%`}
          y2={`${y2 * 100}%`}
        >
          {background.colors.map((color, i) => (
            <Stop
              key={i}
              offset={`${(locations[i] ?? i / Math.max(1, background.colors.length - 1)) * 100}%`}
              stopColor={color}
            />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
    </Svg>
  );
};

/**
 * 두 그라디언트 레이어 (A, B) 를 ping-pong 방식으로 swap.
 * - crossfade=0 : A 보임 (opacity 1), B 안 보임 (opacity 0)
 * - crossfade=1 : B 보임, A 안 보임
 *
 * 슬라이드 변경 시: 보이지 않는 레이어에 새 background 를 세팅 → crossfade 를 그쪽으로 보간.
 * 다음 전환 시: 역방향으로 보간.
 * 어느 시점에도 한 프레임 깜빡임 없음 — swap 과 색 변경이 같은 commit 에서 일어남.
 */
export const AnimatedSlideBackground: React.FC<Props> = ({ background, transitionKey, morphEnabled = true }) => {
  const [layerA, setLayerA] = useState<Background | undefined>(background);
  const [layerB, setLayerB] = useState<Background | undefined>(undefined);
  const crossfade = useSharedValue(0); // 0: A, 1: B
  const lastKeyRef = useRef(transitionKey);
  const isFirst = useRef(true);

  useEffect(() => {
    // 첫 마운트는 layerA = background 로 시작. effect 무시.
    if (isFirst.current) {
      isFirst.current = false;
      lastKeyRef.current = transitionKey;
      return;
    }
    if (lastKeyRef.current === transitionKey) {
      // background prop 만 갱신 — 현재 보이는 레이어에 새 색 세팅 (애니 없이)
      if (crossfade.value < 0.5) {
        setLayerA(background);
      } else {
        setLayerB(background);
      }
      return;
    }
    lastKeyRef.current = transitionKey;

    if (!ENABLE_SLIDE_TRANSITION || !morphEnabled) {
      // 재방문 등 morph 비활성 시: 즉시 색 적용 (보이지 않는 레이어에 세팅 후 즉시 swap).
      if (crossfade.value < 0.5) {
        setLayerB(background);
        crossfade.value = 1;
      } else {
        setLayerA(background);
        crossfade.value = 0;
      }
      return;
    }

    // 보이지 않는 레이어에 새 색 세팅 → 그쪽으로 보간
    if (crossfade.value < 0.5) {
      // A 가 보이는 중. B 에 새 색 → 0→1
      setLayerB(background);
      crossfade.value = withTiming(1, { duration: DURATION_SLIDE_MORPH, easing: EASE_OUT_IOS });
    } else {
      // B 가 보이는 중. A 에 새 색 → 1→0
      setLayerA(background);
      crossfade.value = withTiming(0, { duration: DURATION_SLIDE_MORPH, easing: EASE_OUT_IOS });
    }
  }, [transitionKey, background, crossfade, morphEnabled]);

  const styleA = useAnimatedStyle(() => ({
    opacity: 1 - crossfade.value,
  }));
  const styleB = useAnimatedStyle(() => ({
    opacity: crossfade.value,
  }));

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFillObject, styleA]}>
        <GradientLayer background={layerA} gradientId="slideGradientA" />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFillObject, styleB]}>
        <GradientLayer background={layerB} gradientId="slideGradientB" />
      </Animated.View>
    </View>
  );
};
