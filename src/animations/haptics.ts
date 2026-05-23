import ReactNativeHapticFeedback, { HapticFeedbackTypes } from 'react-native-haptic-feedback';
import { ENABLE_HAPTICS } from '../utils/featureFlags';

const noop = () => {};

const options = {
  enableVibrateFallback: false,
  ignoreAndroidSystemSettings: false,
};

const trigger = (type: HapticFeedbackTypes) => {
  if (!ENABLE_HAPTICS) return;
  try {
    ReactNativeHapticFeedback.trigger(type, options);
  } catch {
    // 일부 디바이스/시뮬레이터에서 햅틱 미지원 → 무시
  }
};

/**
 * 의도적으로 정답/오답만 실연결. press / select 등은 noop 유지.
 * (사용자 결정: 중요 순간에만 사용하여 피로감 방지)
 */
export const haptic = {
  light: noop,
  medium: noop,
  heavy: noop,
  success: () => trigger(HapticFeedbackTypes.notificationSuccess),
  warning: noop,
  error: () => trigger(HapticFeedbackTypes.notificationError),
  select: noop,
};
