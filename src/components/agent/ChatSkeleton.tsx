import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

// 세션 대화 로드 중 표시하는 플레이스홀더(스켈레톤).
// 화면 전환은 즉시 일어나고, 본문은 네트워크 로드 동안 이 스켈레톤이 채운다 → 체감 속도 향상.
const Bubble = ({ w, align, pulse }: { w: number; align: 'left' | 'right'; pulse: Animated.Value }) => (
  <Animated.View
    style={{
      alignSelf: align === 'right' ? 'flex-end' : 'flex-start',
      width: `${w}%`,
      height: 38,
      borderRadius: 14,
      backgroundColor: align === 'right' ? '#1D2740' : '#11151F',
      borderWidth: align === 'right' ? 0 : 1,
      borderColor: '#1C2230',
      opacity: pulse,
    }}
  />
);

const ChatSkeleton: React.FC<{ contentPadding?: number }> = ({ contentPadding = 16 }) => {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ flex: 1, paddingHorizontal: contentPadding, paddingTop: contentPadding, gap: 12 }} pointerEvents="none">
      <Bubble w={58} align="right" pulse={pulse} />
      <Bubble w={82} align="left" pulse={pulse} />
      <Bubble w={64} align="left" pulse={pulse} />
      <Bubble w={44} align="right" pulse={pulse} />
      <Bubble w={76} align="left" pulse={pulse} />
    </View>
  );
};

export default ChatSkeleton;
