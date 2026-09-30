import React, { useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { v2 } from '../../theme/v2Tokens';
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
import * as i18n from '../../i18n/index.ts';

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
  /** 'sheet'(기본) = 아래에서 올라오는 시트 · 'dialog' = 가운데 카드(150ms 페이드+살짝 확대). */
  presentation?: 'sheet' | 'dialog';
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
  presentation = 'sheet',
}) => {
  useTheme(); // 테마 전환 시 리렌더 — 색은 아래에서 렌더 시점 v2.colors 로 읽는다
  const isDialog = presentation === 'dialog';
  const C = v2.colors;
  const sheetBg = C.elevated;
  const handleBg = C.borderControl;

  const translateY = useSharedValue(SHEET_HIDDEN_OFFSET);
  const overlayOpacity = useSharedValue(0);
  // 다이얼로그 등장: opacity 0→1 + scale .98→1 (150ms ease-enter). 시트는 스프링 슬라이드.
  const dialogIn = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      overlayOpacity.value = 0;
      overlayOpacity.value = withTiming(1, { duration: 150 });
      if (isDialog) {
        dialogIn.value = 0;
        dialogIn.value = withTiming(1, { duration: 150, easing: Easing.bezier(0.19, 1, 0.22, 1) });
      } else {
        translateY.value = SHEET_HIDDEN_OFFSET;
        translateY.value = withSpring(0, SPRING_SOFT);
      }
    }
  }, [visible, translateY, overlayOpacity, dialogIn, isDialog]);

  const close = (result?: any) => {
    if (onResult) onResult(result);
    overlayOpacity.value = withTiming(0, { duration: 120 });
    if (isDialog) {
      dialogIn.value = withTiming(0, { duration: 100, easing: Easing.bezier(0.8, 0, 0.4, 1) }, (finished) => {
        if (finished) runOnJS(onClose)(result);
      });
      return;
    }
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
      message: i18n.t('배경을 클릭하여 모달이 닫혔습니다.'),
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

  const dialogStyle = useAnimatedStyle(() => ({
    opacity: dialogIn.value,
    transform: [{ scale: 0.98 + 0.02 * dialogIn.value }],
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
          style={[styles.wrapper, isDialog && styles.wrapperCenter]}
        >
          <Animated.View style={[styles.overlay, { backgroundColor: v2.colors.scrim }, overlayStyle]}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={handleBackdropPress}
            />
          </Animated.View>

          {isDialog ? (
            <Animated.View
              style={[styles.dialog, {
                backgroundColor: C.elevated, borderColor: C.borderControl,
                shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 48, shadowOffset: { width: 0, height: 16 }, elevation: 12,
              }, dialogStyle]}
            >
              {React.isValidElement(children)
                ? React.cloneElement(children, { onClose: close, modalId } as any)
                : children}
            </Animated.View>
          ) : (
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
          )}
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
    ...StyleSheet.absoluteFillObject, // 색은 렌더 시점 v2.colors.scrim(테마 전환)
  },
  wrapperCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 20,
    paddingBottom: 16,
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
    width: 36,
    height: 4,
    borderRadius: 2,
  },
});

export default BaseModal;
