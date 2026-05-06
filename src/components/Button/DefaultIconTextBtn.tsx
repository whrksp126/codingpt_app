import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useScaleOnPress } from '../../animations/hooks';
import { haptic } from '../../animations/haptics';

interface DefaultIconTextBtnProps {
  onPress: () => void;
  text: string;
  icon: React.ReactNode;
  disabled?: boolean;
  buttonClassName?: string;
  textClassName?: string;
  iconClassName?: string;
  enableHapticFeedback?: boolean;
  enableSound?: boolean;
  flex?: boolean;
}

const DefaultIconTextBtn: React.FC<DefaultIconTextBtnProps> = ({
  onPress,
  text,
  icon,
  disabled = false,
  buttonClassName = 'bg-[#58CC02] h-[50px] rounded-[25px] px-6 py-3 flex-row items-center justify-center',
  textClassName = 'text-[18px] font-bold text-white',
  iconClassName = 'mr-[10px]',
  enableHapticFeedback = true,
  flex = true,
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
    if (disabled) return textClassName.replace('text-white', 'text-[#999999]');
    return textClassName;
  };

  return (
    <Animated.View className={flex ? 'flex-1' : ''} style={scaleStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className={getButtonClassName()}
        style={{
          shadowColor: isPressed ? '#000' : disabled ? '#CCCCCC' : '#58CC02',
          shadowOffset: { width: 0, height: isPressed ? 2 : 4 },
          shadowOpacity: isPressed ? 0.2 : disabled ? 0.1 : 0.3,
          shadowRadius: isPressed ? 3 : 6,
          elevation: isPressed ? 3 : 6,
        }}
        disabled={disabled}
      >
        <View className={iconClassName}>{icon}</View>
        <Text className={getTextClassName()}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
};

export default DefaultIconTextBtn;
