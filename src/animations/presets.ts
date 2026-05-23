import {
  FadeIn,
  FadeOut,
  FadeInDown,
  ZoomIn,
  SlideInDown,
  SlideOutDown,
  Easing,
} from 'react-native-reanimated';

export const SPRING_SOFT = { damping: 15, stiffness: 150, mass: 1 } as const;
export const SPRING_BOUNCY = { damping: 8, stiffness: 200, mass: 0.8 } as const;
export const SPRING_TIGHT = { damping: 20, stiffness: 220, mass: 0.9 } as const;
export const SPRING_FLUID = { damping: 22, stiffness: 180, mass: 1 } as const;
export const SPRING_GENTLE_POP = { damping: 13, stiffness: 160, mass: 0.9 } as const;
export const SPRING_END_DOT_BOUNCE = { damping: 9, stiffness: 220, mass: 0.8 } as const;

export const TIMING_FAST = { duration: 150 } as const;
export const TIMING_NORMAL = { duration: 300 } as const;
export const TIMING_SLOW = { duration: 500 } as const;

export const EASE_OUT_CUBIC = Easing.out(Easing.cubic);
export const EASE_IN_OUT_SIN = Easing.inOut(Easing.sin);
export const EASE_OUT_QUART = Easing.bezier(0.165, 0.84, 0.44, 1);
export const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_OUT_IOS = Easing.bezier(0.32, 0.72, 0, 1);

export const SPRING_SWIPE_RETURN = { damping: 26, stiffness: 240, mass: 0.85 } as const;

export const DURATION_SLIDE_MORPH = 180;
export const DURATION_MODULE_ENTER = 160;
export const DURATION_SLIDE_OUT = 180;
export const DURATION_SLIDE_IN = 180;
export const STAGGER_CHILD_MS = 10;

// 갤러리/캐러셀 톤 — outgoing/incoming 모두 화면 폭만큼 동일 속도로 이동.
// parallax(시차) 없음. opacity는 건드리지 않음 (즉각적인 슬라이드 인상).
export const PARALLAX_OUT_RATIO = 1.0;
export const PARALLAX_IN_RATIO = 1.0;

export const MODAL_ENTER = FadeIn.duration(220);
export const MODAL_EXIT = FadeOut.duration(180);
export const MODAL_CONTENT_ENTER = ZoomIn.springify().damping(14).mass(0.9);
export const MODAL_CONTENT_EXIT = FadeOut.duration(160);

export const SHEET_ENTER = SlideInDown.springify().damping(18).mass(0.9);
export const SHEET_EXIT = SlideOutDown.duration(220);

export const CARD_POP_IN = FadeInDown.springify().damping(14);

export const MOTI_PRESS = { scale: 0.94 } as const;
export const MOTI_PRESS_REST = { scale: 1 } as const;
export const MOTI_PRESS_TRANSITION = {
  type: 'spring' as const,
  damping: 15,
  stiffness: 220,
  mass: 0.9,
};
