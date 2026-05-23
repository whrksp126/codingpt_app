import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { DURATION_SLIDE_IN, EASE_OUT_IOS } from '../../animations/presets';
import { ENABLE_SLIDE_TRANSITION } from '../../utils/featureFlags';

interface Props {
  children: React.ReactNode;
  transitionKey: number | string;
  /**
   * 슬라이드 진행 방향. forward = 다음 슬라이드(→), backward = 이전 슬라이드(←).
   * SlidePageContainer 의 translateX 와 같은 방향으로 타이틀도 함께 이동시킨다.
   */
  direction?: 'forward' | 'backward';
}

// 슬라이드 폭 전체로 이동하면 타이틀이 화면 밖으로 너무 멀리 나가서 부자연스러움.
// 슬라이드(SlidePageContainer)는 SCREEN_WIDTH 만큼 이동하지만 타이틀은 더 작은 거리로 동기.
const TRAVEL_RATIO = 0.35;

/**
 * 슬라이드 제목 cross-fade — 이전 타이틀과 새 타이틀이 동시에 좌우로 이동하며 교체.
 * SlidePageContainer 와 동일한 DURATION_SLIDE_IN(180ms) + EASE_OUT_IOS 사용해 한 흐름으로 동기화.
 */
export const AnimatedSlideTitle: React.FC<Props> = ({ children, transitionKey, direction = 'forward' }) => {
  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  const travel = SCREEN_WIDTH * TRAVEL_RATIO;

  const [currentNode, setCurrentNode] = useState<React.ReactNode>(children);
  const [prevNode, setPrevNode] = useState<React.ReactNode>(null);

  const currOpacity = useSharedValue(1);
  const currTx = useSharedValue(0);
  const prevOpacity = useSharedValue(0);
  const prevTx = useSharedValue(0);

  const isFirst = useRef(true);
  const prevKey = useRef(transitionKey);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      setCurrentNode(children);
      prevKey.current = transitionKey;
      return;
    }

    if (transitionKey === prevKey.current) {
      // children 만 바뀐 경우(같은 슬라이드 내용 갱신) — 그대로 표시.
      setCurrentNode(children);
      return;
    }
    prevKey.current = transitionKey;

    if (!ENABLE_SLIDE_TRANSITION) {
      setCurrentNode(children);
      return;
    }

    // forward: 다음 슬라이드 → 새 타이틀은 우측에서 들어오고 이전은 좌측으로 나감.
    // backward: 이전 슬라이드 → 새 타이틀은 좌측에서 들어오고 이전은 우측으로 나감.
    const sign = direction === 'forward' ? 1 : -1;

    // 직전 타이틀을 prev 슬롯에 보존, 새 children 을 current 슬롯에 설정.
    setPrevNode(currentNode);
    setCurrentNode(children);

    // prev 는 화면 안에서 → 반대 방향으로 빠져나가며 사라짐.
    prevOpacity.value = 1;
    prevTx.value = 0;
    prevOpacity.value = withTiming(0, { duration: DURATION_SLIDE_IN, easing: EASE_OUT_IOS });
    prevTx.value = withTiming(-sign * travel, { duration: DURATION_SLIDE_IN, easing: EASE_OUT_IOS });

    // current 는 방향 쪽에서 들어옴.
    currOpacity.value = 0;
    currTx.value = sign * travel;
    currOpacity.value = withTiming(1, { duration: DURATION_SLIDE_IN, easing: EASE_OUT_IOS });
    currTx.value = withTiming(0, { duration: DURATION_SLIDE_IN, easing: EASE_OUT_IOS });

    // 애니메이션 끝나면 prev 정리 (메모리/레이어 누수 방지).
    const t = setTimeout(() => setPrevNode(null), DURATION_SLIDE_IN + 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionKey, direction]);

  const currStyle = useAnimatedStyle(() => ({
    opacity: currOpacity.value,
    transform: [{ translateX: currTx.value }],
  }));
  const prevStyle = useAnimatedStyle(() => ({
    opacity: prevOpacity.value,
    transform: [{ translateX: prevTx.value }],
  }));

  return (
    <View style={styles.wrapper}>
      {prevNode != null && (
        <Animated.View style={[styles.layer, prevStyle]} pointerEvents="none">
          {prevNode}
        </Animated.View>
      )}
      <Animated.View style={currStyle}>{currentNode}</Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  layer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});
