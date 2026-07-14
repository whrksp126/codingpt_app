import React, { useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { SPRING_SOFT } from '../../animations/presets';
import { useTheme } from '../../contexts/ThemeContext';

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

const SHEET_HIDDEN_OFFSET = 800;

const BaseModal: React.FC<BaseModalProps> = ({
  visible,
  onClose,
  children,
  enableBackdropClose = true,
  statusBarTranslucent = true,
  onResult,
  modalId,
}) => {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const sheetBg = isDark ? '#1B1F27' : '#FFFFFF';
  const handleBg = isDark ? '#3F444D' : '#DDDDDD';

  const translateY = useSharedValue(SHEET_HIDDEN_OFFSET);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = SHEET_HIDDEN_OFFSET;
      overlayOpacity.value = 0;
      translateY.value = withSpring(0, SPRING_SOFT);
      overlayOpacity.value = withTiming(1, { duration: 220 });
    }
  }, [visible, translateY, overlayOpacity]);

  const close = (result?: any) => {
    if (onResult) onResult(result);
    overlayOpacity.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(
      SHEET_HIDDEN_OFFSET,
      { duration: 220, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onClose)(result);
      },
    );
  };

  const handleBackdropPress = () => {
    if (!enableBackdropClose) return;
    close({
      success: false,
      action: 'backdrop_close',
      message: '배경을 클릭하여 모달이 닫혔습니다.',
    });
  };

  const handleRequestClose = () => {
    close();
  };

  const startY = useSharedValue(0);
  const pan = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(0, startY.value + e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 500) {
        runOnJS(close)({
          success: false,
          action: 'drag_close',
        });
      } else {
        translateY.value = withSpring(0, SPRING_SOFT);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent={statusBarTranslucent}
      navigationBarTranslucent
      onRequestClose={handleRequestClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.wrapper}
        >
          <Animated.View style={[styles.overlay, overlayStyle]}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={handleBackdropPress}
            />
          </Animated.View>

          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.sheet, { backgroundColor: sheetBg }, sheetStyle]}>
              {/* 스프링 오버슈트 시 시트가 위로 튕길 때 아래쪽이 투명해 보이지 않도록 시트와 같은 색의 확장 영역 */}
              <View pointerEvents="none" style={[styles.bottomExtension, { backgroundColor: sheetBg }]} />
              <View style={styles.handleArea}>
                <View style={[styles.handle, { backgroundColor: handleBg }]} />
              </View>
              {React.isValidElement(children)
                ? React.cloneElement(children, {
                    onClose: close,
                    modalId,
                  } as any)
                : children}
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  bottomExtension: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    height: 400,
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
});

export default BaseModal;
