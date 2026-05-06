import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useScaleOnPress } from '../../animations/hooks';
import { haptic } from '../../animations/haptics';

interface CircleBtnProps {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  size?: number;
  backgroundColor?: string;
  disabledBackgroundColor?: string;
  enableHapticFeedback?: boolean;
  enableSound?: boolean;
  className?: string;
}

const CircleBtn: React.FC<CircleBtnProps> = ({
  onPress,
  children,
  disabled = false,
  size = 70,
  backgroundColor = '#58CC02',
  disabledBackgroundColor = '#E5E5E5',
  enableHapticFeedback = true,
  className = '',
}) => {
  const { style: scaleStyle, onPressIn, onPressOut } = useScaleOnPress({
    pressed: 0.9,
  });
  const [isPressed, setIsPressed] = useState(false);

  const handlePressIn = () => {
    if (disabled) return;
    setIsPressed(true);
    onPressIn();
  };

  const handlePressOut = () => {
    if (disabled) return;
    setIsPressed(false);
    onPressOut();
  };

  const handlePress = () => {
    if (disabled) return;
    if (enableHapticFeedback) haptic.light();
    onPress();
  };

  const currentBackgroundColor = disabled ? disabledBackgroundColor : backgroundColor;

  return (
    <Animated.View style={scaleStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        className={`py-[10px] ${className}`}
      >
        <View
          className="flex items-center justify-center"
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: currentBackgroundColor,
            shadowColor: isPressed ? '#000' : currentBackgroundColor,
            shadowOffset: { width: 0, height: isPressed ? 2 : 4 },
            shadowOpacity: isPressed ? 0.2 : disabled ? 0.1 : 0.3,
            shadowRadius: isPressed ? 3 : 6,
            elevation: isPressed ? 3 : 6,
          }}
        >
          {children}
        </View>
      </Pressable>
    </Animated.View>
  );
};

export default CircleBtn;
