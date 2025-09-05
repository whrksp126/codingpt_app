import React, { useRef, useEffect } from 'react';
import { Modal, Pressable, View, Animated } from 'react-native';

interface BaseModalProps {
  visible: boolean;
  onClose: (result?: any) => void;
  children: React.ReactNode;
  animationType?: 'fade' | 'slide' | 'none';
  backgroundColor?: string;
  contentClassName?: string;
  enableBackdropClose?: boolean;
  statusBarTranslucent?: boolean;
  onResult?: (result: any) => void;
  modalId?: string;
}

const BaseModal: React.FC<BaseModalProps> = ({
  visible,
  onClose,
  children,
  animationType = 'fade',
  backgroundColor = 'bg-black/40',
  contentClassName = '',
  enableBackdropClose = true,
  statusBarTranslucent = true,
  onResult,
  modalId,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleBackdropPress = () => {
    if (enableBackdropClose) {
      // 배경 클릭 시 취소 결과 반환
      onClose({ 
        success: false, 
        action: 'backdrop_close',
        message: '배경을 클릭하여 모달이 닫혔습니다.'
      });
    }
  };

  const handleContentPress = (e: any) => {
    e.stopPropagation();
  };

  const handleClose = (result?: any) => {
    if (onResult) {
      onResult(result);
    }
    onClose(result);
  };

  return (
    <Modal 
      visible={visible} 
      transparent 
      animationType="none" 
      statusBarTranslucent={statusBarTranslucent}
    >
      <Animated.View 
        className={`flex-1 ${backgroundColor} justify-center items-center`}
        style={{ opacity: fadeAnim }}
      >
        <Pressable 
          className="absolute inset-0"
          onPress={handleBackdropPress}
        />
        <Animated.View
          className={contentClassName}
          style={{ 
            transform: [{ scale: scaleAnim }],
          }}
          onTouchStart={handleContentPress}
        >
          {React.isValidElement(children) 
            ? React.cloneElement(children, {
                onClose: handleClose,
                modalId,
              } as any)
            : children
          }
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

export default BaseModal;
