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

export const TIMING_FAST = { duration: 150 } as const;
export const TIMING_NORMAL = { duration: 300 } as const;
export const TIMING_SLOW = { duration: 500 } as const;

export const EASE_OUT_CUBIC = Easing.out(Easing.cubic);
export const EASE_IN_OUT_SIN = Easing.inOut(Easing.sin);

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
