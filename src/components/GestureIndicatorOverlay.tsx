import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  useAnimatedReaction,
  runOnJS,
  withSpring, 
  withTiming,
  withSequence,
  withDelay
} from 'react-native-reanimated';
import { ArrowLeft, ArrowRight, Play, Pause } from '../assets/SvgIcon';

interface GestureIndicatorOverlayProps {
  translateX: Animated.SharedValue<number>;
  isPaused: boolean;
  hasActiveTimers: boolean;
  canGoLeft: boolean;
  canGoRight: boolean;
  onTap?: () => void;
  showTapIndicator?: boolean;
}

const GestureIndicatorOverlay: React.FC<GestureIndicatorOverlayProps> = ({
  translateX,
  isPaused,
  hasActiveTimers,
  canGoLeft,
  canGoRight,
  onTap,
  showTapIndicator = false,
}) => {
  // 왼쪽 화살표 표시를 위한 opacity
  const leftArrowOpacity = useSharedValue(0);
  // 오른쪽 화살표 표시를 위한 opacity
  const rightArrowOpacity = useSharedValue(0);
  // 재생/일시정지 아이콘 표시를 위한 opacity
  const playPauseOpacity = useSharedValue(0);
  const playPauseScale = useSharedValue(1);
  const prevTranslateX = useSharedValue(0);
  const isShowingLeftArrow = useSharedValue(false);
  const isShowingRightArrow = useSharedValue(false);

  // Pan 제스처 시작 감지 (translateX가 0에서 변경될 때)
  useAnimatedReaction(
    () => translateX.value,
    (current, previous) => {
      const absCurrent = Math.abs(current);
      const absPrevious = previous !== null ? Math.abs(previous) : 0;
      const isLeftSwipe = current < 0;
      const isRightSwipe = current > 0;
      
      // 왼쪽 스와이프 시작 감지 (0에서 -5 이하로 변경) → 다음 슬라이드로 이동 → 오른쪽 화살표 표시
      if (absPrevious < 5 && absCurrent >= 5 && isLeftSwipe && !isShowingRightArrow.value) {
        isShowingRightArrow.value = true;
        rightArrowOpacity.value = withSequence(
          withTiming(1, { duration: 200 }),
          withDelay(1500, withTiming(0, { duration: 300 }, () => {
            isShowingRightArrow.value = false;
          }))
        );
      }
      
      // 오른쪽 스와이프 시작 감지 (0에서 5 이상으로 변경) → 이전 슬라이드로 이동 → 왼쪽 화살표 표시
      if (absPrevious < 5 && absCurrent >= 5 && isRightSwipe && !isShowingLeftArrow.value) {
        isShowingLeftArrow.value = true;
        leftArrowOpacity.value = withSequence(
          withTiming(1, { duration: 200 }),
          withDelay(1500, withTiming(0, { duration: 300 }, () => {
            isShowingLeftArrow.value = false;
          }))
        );
      }
      
      // translateX가 0으로 리셋되면 화살표도 즉시 숨김
      if (absCurrent < 2) {
        if (isShowingLeftArrow.value) {
          leftArrowOpacity.value = withTiming(0, { duration: 200 }, () => {
            isShowingLeftArrow.value = false;
          });
        }
        if (isShowingRightArrow.value) {
          rightArrowOpacity.value = withTiming(0, { duration: 200 }, () => {
            isShowingRightArrow.value = false;
          });
        }
      }
      
      prevTranslateX.value = current;
    },
    []
  );

  // 탭 감지 시 재생/일시정지 아이콘 표시
  useEffect(() => {
    if (showTapIndicator) {
      playPauseOpacity.value = withSequence(
        withTiming(1, { duration: 200 }),
        withDelay(1500, withTiming(0, { duration: 300 }))
      );
      playPauseScale.value = withSequence(
        withSpring(1.2, { damping: 10, stiffness: 200 }),
        withSpring(1, { damping: 10, stiffness: 200 })
      );
    }
  }, [showTapIndicator]);

  // 왼쪽 화살표 애니메이션 스타일 (이전 슬라이드 방향 - 오른쪽 스와이프 시 표시)
  const leftArrowStyle = useAnimatedStyle(() => {
    const swipeIntensity = translateX.value > 0 
      ? Math.min(1, Math.abs(translateX.value) / 100)
      : 0;
    
    return {
      opacity: canGoLeft ? leftArrowOpacity.value * (0.7 + swipeIntensity * 0.3) : 0,
      transform: [
        { 
          translateX: translateX.value > 0 
            ? Math.min(10, translateX.value / 5) 
            : 0 
        },
        { scale: translateX.value > 0 ? 1.1 : 1 }
      ],
    };
  });

  // 오른쪽 화살표 애니메이션 스타일 (다음 슬라이드 방향 - 왼쪽 스와이프 시 표시)
  const rightArrowStyle = useAnimatedStyle(() => {
    const swipeIntensity = translateX.value < 0 
      ? Math.min(1, Math.abs(translateX.value) / 100)
      : 0;
    
    return {
      opacity: canGoRight ? rightArrowOpacity.value * (0.7 + swipeIntensity * 0.3) : 0,
      transform: [
        { 
          translateX: translateX.value < 0 
            ? Math.max(-10, translateX.value / 5) 
            : 0 
        },
        { scale: translateX.value < 0 ? 1.1 : 1 }
      ],
    };
  });

  // 재생/일시정지 아이콘 애니메이션 스타일
  const playPauseStyle = useAnimatedStyle(() => {
    return {
      opacity: hasActiveTimers ? playPauseOpacity.value : 0,
      transform: [{ scale: playPauseScale.value }],
    };
  });

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {/* 왼쪽 화살표 */}
      {canGoLeft && (
        <Animated.View style={[styles.arrowContainer, styles.leftArrow, leftArrowStyle]}>
          <ArrowLeft width={32} height={32} fill="#08875D" />
        </Animated.View>
      )}

      {/* 오른쪽 화살표 */}
      {canGoRight && (
        <Animated.View style={[styles.arrowContainer, styles.rightArrow, rightArrowStyle]}>
          <ArrowRight width={32} height={32} fill="#08875D" />
        </Animated.View>
      )}

      {/* 재생/일시정지 아이콘 (정가운데) */}
      {hasActiveTimers && (
        <Animated.View 
          style={[styles.playPauseContainer, playPauseStyle]}
          onTouchEnd={onTap}
        >
          <View style={styles.iconBackground}>
            {isPaused ? (
              <Play width={24} height={24} fill="#FFFFFF" />
            ) : (
              <Pause width={24} height={24} fill="#FFFFFF" />
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  arrowContainer: {
    position: 'absolute',
    top: '50%',
    marginTop: -16, // 아이콘 높이의 절반
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  leftArrow: {
    left: 16,
  },
  rightArrow: {
    right: 16,
  },
  playPauseContainer: {
    position: 'absolute',
    top: '50%',
    marginTop: -28, // 아이콘 높이의 절반 (56/2)
    alignSelf: 'center',
  },
  iconBackground: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(8, 135, 93, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

export default GestureIndicatorOverlay;

