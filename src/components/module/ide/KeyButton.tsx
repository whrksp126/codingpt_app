import React, { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS } from 'react-native-reanimated';
import { haptic } from '../../../animations/haptics';
import type { KeyDef } from './keyContexts';

// 롱프레스 대체키 팝업의 한 칸 너비 — KeyButton(인덱스 계산)과 부모 오버레이(셀 렌더)가 공유.
export const POPUP_CELL = 46;

export interface PopupInfo {
  /** 눌린 키의 화면 절대 x */
  x: number;
  /** 눌린 키 너비 */
  width: number;
  /** [primary, ...alternates] — 0번이 기본키 */
  items: KeyDef[];
  activeIndex: number;
}

interface KeyButtonProps {
  def: KeyDef;
  onCommit: (text: string, caret: number | undefined, def: KeyDef) => void;
  /** 스티키 모디파이어(터미널 Ctrl) 활성 비주얼 */
  active?: boolean;
  fontSize?: number;
  /** 키 크기/테마(전역 액세서리 설정) — 미지정 시 기존 기본값 */
  height?: number;
  minWidth?: number;
  colors?: { key: string; keyDown: string; keyText: string };
  /** 롱프레스 팝업 열림 — 부모가 오버레이를 그린다(ScrollView 클리핑 회피). */
  onPopupOpen?: (info: PopupInfo) => void;
  onPopupMove?: (index: number) => void;
  onPopupClose?: () => void;
}

const KeyButton: React.FC<KeyButtonProps> = ({ def, onCommit, active, fontSize = 17, height = 37, minWidth = 33, colors, onPopupOpen, onPopupMove, onPopupClose }) => {
  const [down, setDown] = useState(false);
  const viewRef = useRef<View>(null);
  // 콜백/상태를 ref 로 고정해 제스처 재생성 없이 최신값 참조.
  const cb = useRef({ def, onCommit, onPopupOpen, onPopupMove, onPopupClose });
  cb.current = { def, onCommit, onPopupOpen, onPopupMove, onPopupClose };
  const holdRef = useRef(false);
  const idxRef = useRef(0);
  const items = useMemo<KeyDef[]>(() => (def.alternates && def.alternates.length ? [def, ...def.alternates] : []), [def]);

  const gesture = useMemo(() => {
    // 핸들러는 ref(cb/holdRef/idxRef/viewRef)와 items/def 만 참조 → memo 안에 인라인(안정).
    const pressDown = () => { setDown(true); haptic.keyPress(); };   // 누르는 순간 햅틱(화살표 키와 동일감)
    const commitPrimary = () => { cb.current.onCommit(def.text, def.caret, def); };
    const openPopup = () => {
      if (!items.length) return;
      holdRef.current = true; idxRef.current = 0;
      haptic.holdOpen();
      const node = viewRef.current as any;
      if (node && node.measureInWindow) node.measureInWindow((x: number, _y: number, w: number) => { cb.current.onPopupOpen?.({ x, width: w, items, activeIndex: 0 }); });
      else cb.current.onPopupOpen?.({ x: 0, width: 36, items, activeIndex: 0 });
    };
    const movePopup = (tx: number) => {
      if (!holdRef.current || !items.length) return;
      let idx = Math.round(tx / POPUP_CELL);
      if (idx < 0) idx = 0; if (idx > items.length - 1) idx = items.length - 1;
      if (idx !== idxRef.current) { idxRef.current = idx; cb.current.onPopupMove?.(idx); }
    };
    const endPopup = () => {
      if (!holdRef.current) return;
      holdRef.current = false;
      const pick = items[idxRef.current] || def;
      cb.current.onPopupClose?.();
      haptic.commit();
      cb.current.onCommit(pick.text, pick.caret, pick);
    };
    const cancelPopup = () => { if (holdRef.current) { holdRef.current = false; cb.current.onPopupClose?.(); } };

    const tap = Gesture.Tap()
      .maxDuration(220)
      .onBegin(() => { runOnJS(pressDown)(); })
      .onEnd(() => { runOnJS(commitPrimary)(); })
      .onFinalize(() => { runOnJS(setDown)(false); });
    if (!items.length) return tap;
    const pan = Gesture.Pan()
      .activateAfterLongPress(180)   // 180ms 홀드 후에야 활성 → 그 전 가로 스와이프는 바 스크롤로 흘려보냄
      .onBegin(() => { runOnJS(pressDown)(); })
      .onStart(() => { runOnJS(openPopup)(); })
      .onUpdate((e) => { runOnJS(movePopup)(e.translationX); })
      .onEnd(() => { runOnJS(endPopup)(); })
      .onFinalize(() => { runOnJS(setDown)(false); runOnJS(cancelPopup)(); });
    return Gesture.Race(pan, tap);
  }, [items, def]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        ref={viewRef}
        style={{
          minWidth, height, alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 7, borderRadius: 6,
          backgroundColor: active ? '#F0B4B1' : (down ? (colors?.keyDown ?? '#AAB2C2') : (colors?.key ?? '#FFFFFF')),
          elevation: 1,
        }}
      >
        <Text style={{ color: active ? '#7F1D1D' : (colors?.keyText ?? '#2B2D31'), fontSize, fontWeight: '600' }} numberOfLines={1}>{def.label}</Text>
        {/* iPadOS 처럼 첫 대체키를 우측 상단에 작게 표시(꾹→드래그로 선택 가능 힌트) */}
        {items.length > 1 && (
          <Text style={{ position: 'absolute', top: 1, right: 3, fontSize: 9, fontWeight: '700', color: '#8A93A6' }} numberOfLines={1}>{items[1].label}</Text>
        )}
      </Animated.View>
    </GestureDetector>
  );
};

export default KeyButton;
