import React, { forwardRef, useImperativeHandle, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { ENABLE_CONFETTI } from '../../utils/featureFlags';

export interface ConfettiBurstHandle {
  burst: (origin?: { x: number; y: number }) => void;
}

interface Props {
  particleCount?: number;
  colors?: string[];
}

const DEFAULT_COLORS = [
  '#FFD700', // gold
  '#FF6B6B', // coral
  '#4ECDC4', // teal
  '#95E1D3', // mint
  '#F38181', // pink
  '#AA96DA', // lavender
  '#FCBAD3', // rose
  '#FFFFD2', // cream
];

interface ParticleConfig {
  color: string;
  size: number;
  startAngle: number; // radians
  speed: number;
  rotationSpeed: number;
  shape: 'rect' | 'circle';
}

const Particle: React.FC<{
  config: ParticleConfig;
  trigger: number; // shared value 로 늘려가며 burst 트리거
  originX: number;
  originY: number;
}> = ({ config, trigger, originX, originY }) => {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rot = useSharedValue(0);
  const opacity = useSharedValue(0);

  // trigger 변경 시점에 burst — 부모가 ref 로 호출
  React.useEffect(() => {
    if (trigger === 0) return;
    // 초기화
    tx.value = 0;
    ty.value = 0;
    rot.value = 0;
    opacity.value = 1;

    const vx = Math.cos(config.startAngle) * config.speed;
    const vy = Math.sin(config.startAngle) * config.speed - 200; // 위쪽으로 살짝 발사
    const duration = 1500 + Math.random() * 500;

    // 수평 — 등속
    tx.value = withTiming(vx * (duration / 1000), {
      duration,
      easing: Easing.linear,
    });
    // 수직 — 처음 위로 갔다가 중력 받아 떨어짐 (포물선 비슷)
    ty.value = withSequence(
      withTiming(vy * 0.4, { duration: duration * 0.3, easing: Easing.out(Easing.quad) }),
      withTiming(vy * 0.4 + 600, { duration: duration * 0.7, easing: Easing.in(Easing.quad) }),
    );
    // 회전
    rot.value = withTiming(config.rotationSpeed * (duration / 1000), {
      duration,
      easing: Easing.linear,
    });
    // 끝에서 fade out
    opacity.value = withSequence(
      withTiming(1, { duration: duration * 0.75 }),
      withTiming(0, { duration: duration * 0.25, easing: Easing.out(Easing.quad) }),
    );
  }, [trigger, config, tx, ty, rot, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${rot.value}deg` },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: originX - config.size / 2,
          top: originY - config.size / 2,
          width: config.size,
          height: config.size * (config.shape === 'circle' ? 1 : 0.5),
          backgroundColor: config.color,
          borderRadius: config.shape === 'circle' ? config.size / 2 : 1,
        },
        style,
      ]}
    />
  );
};

/**
 * 정답/완료 시 종이꽃 폭발.
 * ref.burst({x, y}) 로 호출. 외부 의존성 없이 Reanimated + View 로 자체 구현.
 */
export const ConfettiBurst = forwardRef<ConfettiBurstHandle, Props>(
  ({ particleCount = 28, colors = DEFAULT_COLORS }, ref) => {
    const [trigger, setTrigger] = React.useState(0);
    const [origin, setOrigin] = React.useState<{ x: number; y: number }>(() => {
      const { width, height } = Dimensions.get('window');
      return { x: width / 2, y: height / 2 };
    });

    useImperativeHandle(ref, () => ({
      burst: (o?: { x: number; y: number }) => {
        if (!ENABLE_CONFETTI) return;
        const { width, height } = Dimensions.get('window');
        setOrigin(o ?? { x: width / 2, y: height / 2 });
        setTrigger((t) => t + 1);
      },
    }));

    const particles = useMemo<ParticleConfig[]>(() => {
      return Array.from({ length: particleCount }).map(() => ({
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 8,
        startAngle: Math.random() * Math.PI * 2,
        speed: 220 + Math.random() * 220,
        rotationSpeed: (Math.random() < 0.5 ? 1 : -1) * (360 + Math.random() * 720),
        shape: Math.random() < 0.5 ? 'rect' : 'circle',
      }));
    }, [particleCount, colors]);

    if (!ENABLE_CONFETTI) return null;

    return (
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {particles.map((p, i) => (
          <Particle key={`p-${i}-${trigger}`} config={p} trigger={trigger} originX={origin.x} originY={origin.y} />
        ))}
      </View>
    );
  },
);
ConfettiBurst.displayName = 'ConfettiBurst';
