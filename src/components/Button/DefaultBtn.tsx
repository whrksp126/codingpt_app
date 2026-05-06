import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { useScaleOnPress } from '../../animations/hooks';
import { haptic } from '../../animations/haptics';

interface DefaultBtnProps {
  onPress: () => void;
  text: string;
  disabled?: boolean;
  buttonClassName?: string;
  textClassName?: string;
  enableHapticFeedback?: boolean;
  enableSound?: boolean;
  flex?: boolean;
  shadowColor?: string;
}

const DefaultBtn: React.FC<DefaultBtnProps> = ({
  onPress,
  text,
  disabled = false,
  buttonClassName = 'flex items-center justify-center h-[50px] rounded-[10px] bg-[#58CC02]',
  textClassName = 'text-[18px] font-[700] text-center text-[#fff]',
  enableHapticFeedback = true,
  flex = true,
  shadowColor,
}) => {
  const { style: scaleStyle, onPressIn, onPressOut } = useScaleOnPress({
    pressed: 0.95,
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

  const getButtonClassName = () => {
    if (disabled) return buttonClassName.replace('bg-[#58CC02]', 'bg-[#CCCCCC]');
    return buttonClassName;
  };

  const getTextClassName = () => {
    if (disabled) return textClassName.replace('text-[#fff]', 'text-[#999999]');
    return textClassName;
  };

  const getShadowColor = () => {
    if (shadowColor) return isPressed ? '#000' : shadowColor;
    if (disabled) return '#CCCCCC';
    if (buttonClassName.includes('bg-[#58CC02]')) return '#58CC02';
    if (buttonClassName.includes('bg-[#93D333]')) return '#93D333';
    if (buttonClassName.includes('bg-[#FE4C4A]')) return '#FE4C4A';
    if (buttonClassName.includes('bg-white')) return '#FE4C4A';
    return '#58CC02';
  };

  return (
    <Animated.View className={flex ? 'flex-1' : ''} style={scaleStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className={getButtonClassName()}
        style={{
          shadowColor: getShadowColor(),
          shadowOffset: { width: 0, height: isPressed ? 2 : 4 },
          shadowOpacity: isPressed ? 0.2 : disabled ? 0.1 : 0.3,
          shadowRadius: isPressed ? 3 : 6,
          elevation: isPressed ? 3 : 6,
        }}
        disabled={disabled}
      >
        <Text className={getTextClassName()}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
};

export default DefaultBtn;
