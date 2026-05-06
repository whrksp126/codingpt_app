import React from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useScaleOnPress } from '../../animations/hooks';
import { haptic } from '../../animations/haptics';

interface DefaultIconBtnProps {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  size?: number;
  enableHapticFeedback?: boolean;
  enableSound?: boolean;
  className?: string;
  iconClassName?: string;
  pressScale?: number;
  // 하위 호환: 새 구현에서는 무시됨.
  pressOpacity?: number;
  bounceScale?: number;
}

const DefaultIconBtn: React.FC<DefaultIconBtnProps> = ({
  onPress,
  children,
  disabled = false,
  size = 35,
  enableHapticFeedback = true,
  className = '',
  iconClassName = '',
  pressScale = 0.9,
}) => {
  const { style: scaleStyle, onPressIn, onPressOut } = useScaleOnPress({
    pressed: pressScale,
  });

  const handlePressIn = () => {
    if (disabled) return;
    onPressIn();
  };

  const handlePressOut = () => {
    if (disabled) return;
    onPressOut();
  };

  const handlePress = () => {
    if (disabled) return;
    if (enableHapticFeedback) haptic.light();
    onPress();
  };

  return (
    <Animated.View style={scaleStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        className={className}
        style={{
          width: size,
          height: size,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View className={iconClassName} style={{ opacity: disabled ? 0.5 : 1 }}>
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
};

export default DefaultIconBtn;
