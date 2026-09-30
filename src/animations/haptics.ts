import ReactNativeHapticFeedback, { HapticFeedbackTypes } from 'react-native-haptic-feedback';
import { ENABLE_HAPTICS } from '../utils/featureFlags';

const noop = () => {};

const options = {
  enableVibrateFallback: false,
  ignoreAndroidSystemSettings: false,
};

const trigger = (type: HapticFeedbackTypes, opts = options) => {
  if (!ENABLE_HAPTICS) return;
  try {
    ReactNativeHapticFeedback.trigger(type, opts);
  } catch {
    // 일부 디바이스/시뮬레이터에서 햅틱 미지원 → 무시
  }
};

// 키 입력용 — KEYBOARD_PRESS 미지원 기기(일부 안드로이드)에선 진동 폴백으로라도
//  OS 키보드와 같은 "눌림" 피드백을 보장한다.
const keyOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

/**
 * select(선택 변경)·light(가벼운 확정)·warning(주의) 는 OS 관용대로 실연결(2026-09-30 디자인 리프레시).
 * medium/heavy 는 noop 유지. 단순 화면 이동에는 호출을 추가하지 않는다(피로감 방지).
 */
export const haptic = {
  light: () => trigger(HapticFeedbackTypes.impactLight),
  medium: noop,
  heavy: noop,
  success: () => trigger(HapticFeedbackTypes.notificationSuccess),
  warning: () => trigger(HapticFeedbackTypes.notificationWarning),
  error: () => trigger(HapticFeedbackTypes.notificationError),
  select: () => trigger(HapticFeedbackTypes.selection),
  // 모바일 IDE 특수문자 키 — 가벼운 탭 피드백(설정 토글 등)
  keyTap: () => trigger(HapticFeedbackTypes.impactLight, keyOptions),
  // 모바일 IDE 특수문자 키 입력 — 시스템 키보드와 동일한 느낌(KEYBOARD_PRESS)
  keyPress: () => trigger(HapticFeedbackTypes.keyboardPress, keyOptions),
  // 롱프레스 대체키 팝업 등장 — 살짝 강한 임팩트로 "열렸다" 신호
  holdOpen: () => trigger(HapticFeedbackTypes.impactMedium),
  // 롱프레스 드래그 후 손 떼서 확정 입력
  commit: () => trigger(HapticFeedbackTypes.keyboardPress, keyOptions),
};
