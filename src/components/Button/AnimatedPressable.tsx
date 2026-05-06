import React from 'react';
import { ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useScaleOnPress } from '../../animations/hooks';
import { haptic } from '../../animations/haptics';

interface AnimatedPressableProps {
  onPress: () => void;
  children: (props: {
    onPress: () => void;
    onPressIn: () => void;
    onPressOut: () => void;
    disabled?: boolean;
  }) => React.ReactNode;
  className?: string;
  style?: ViewStyle;
  disabled?: boolean;
  enableHapticFeedback?: boolean;
  enableSound?: boolean;
  scaleValue?: number;
  // 하위 호환: 기존 호출자에서 사용. 새 구현에서는 무시됨.
  bounceValue?: number;
  tension?: number;
  friction?: number;
}

const AnimatedPressable: React.FC<AnimatedPressableProps> = ({
  onPress,
  children,
  className = '',
  style = {},
  disabled = false,
  enableHapticFeedback = true,
  scaleValue = 0.94,
}) => {
  const { style: scaleStyle, onPressIn, onPressOut } = useScaleOnPress({
    pressed: scaleValue,
  });

  const handlePress = () => {
    if (disabled) return;
    if (enableHapticFeedback) haptic.light();
    onPress();
  };

  const handlePressIn = () => {
    if (disabled) return;
    onPressIn();
  };

  const handlePressOut = () => {
    if (disabled) return;
    onPressOut();
  };

  return (
    <Animated.View style={[scaleStyle, style]} className={className}>
      {children({
        onPress: handlePress,
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
        disabled,
      })}
    </Animated.View>
  );
};

export default AnimatedPressable;
