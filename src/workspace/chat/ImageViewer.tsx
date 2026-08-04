import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, Image, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { X } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import * as i18n from '../../i18n/index.ts';

// 이미지 전체화면 뷰어 — 카카오톡류의 조작(핀치 확대/축소·드래그 이동·더블탭 확대·아래로 당겨 닫기).
//  사용자 요청 2026-08-02: "클릭해서 확대·축소하고 조작할 수 있게".
//
// 규율:
//  · **원본 비율 유지**(contain) — 채팅 본문의 배치 규칙과 같다.
//  · 확대 범위 1~5배. 축소하면 원위치로 스냅(빈 공간에 이미지가 떠 있는 상태를 남기지 않는다).
//  · 1배에서 아래로 크게 끌면 닫는다(사진 뷰어 관례). 확대 중에는 그 제스처가 '이동'이라 닫지 않는다.
//  · GestureHandlerRootView 로 자체 래핑한다 — Modal 안은 별도 트리라 앱 루트의 래퍼가 닿지 않는다.
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const CLOSE_DY = 120;

export default function ImageViewer({ item, onClose }: {
  item: { uri?: string; base64?: string; mediaType?: string; name: string } | null;
  onClose: () => void;
}) {
  const C = v2.colors;
  const { width: W, height: H } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [aspect, setAspect] = useState<number | null>(null);

  const uri = item?.uri || (item?.base64 ? `data:${item.mediaType || 'image/png'};base64,${item.base64}` : null);

  useEffect(() => {
    // 열 때마다 초기화 — 지난번 확대 상태가 남아 있으면 "이상하게 잘린 사진"으로 보인다.
    scale.value = 1; savedScale.value = 1;
    tx.value = 0; ty.value = 0; savedTx.value = 0; savedTy.value = 0;
    setAspect(null);
    if (uri) Image.getSize(uri, (w, h) => { if (w && h) setAspect(w / h); }, () => { /* 기본 비율 */ });
  }, [uri, scale, savedScale, tx, ty, savedTx, savedTy]);

  const close = useCallback(() => onClose(), [onClose]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE * 0.7), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        scale.value = withTiming(MIN_SCALE);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
      }
      savedScale.value = Math.max(MIN_SCALE, Math.min(scale.value, MAX_SCALE));
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd((e) => {
      // 1배에서 아래로 크게 끌면 닫기(사진 뷰어 관례). 확대 중에는 이동으로만 다룬다.
      if (savedScale.value <= MIN_SCALE + 0.01 && e.translationY > CLOSE_DY) {
        runOnJS(close)();
        return;
      }
      if (savedScale.value <= MIN_SCALE + 0.01) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
        return;
      }
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    // 기본값(탭 간격 500ms·이동 허용 작음)은 손가락이 조금 느리거나 흔들리면 그냥 무시된다
    //  (adb 주입으로 재현: 두 탭 간격이 벌어지면 확대가 안 걸렸다) → 여유를 준다. 단일 탭은 아무 동작도
    //  없으므로 이 관대함에 부작용이 없다.
    .maxDelay(600)
    .maxDistance(40)
    .onEnd(() => {
      const zoomed = savedScale.value > MIN_SCALE + 0.01;
      const next = zoomed ? MIN_SCALE : 2.5;
      scale.value = withTiming(next);
      savedScale.value = next;
      if (!zoomed) return;
      tx.value = withTiming(0); ty.value = withTiming(0); savedTx.value = 0; savedTy.value = 0;
    });

  const composed = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, pan));

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  if (!item || !uri) return null;
  const a = aspect || 3 / 4;
  const boxW = Math.min(W, H * a);
  const boxH = boxW / a;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
          {/* 상단 바 — 파일명 + 닫기(제스처와 겹치지 않게 최상단에 고정) */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 44, paddingBottom: 10 }}>
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: 13, flex: 1 }}>{item.name}</Text>
            <PressableScale onPress={close} hitSlop={12} accessibilityLabel={i18n.t('닫기')}
              style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={15} color="#fff" />
            </PressableScale>
          </View>
          <GestureDetector gesture={composed}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.Image
                source={{ uri }}
                resizeMode="contain"
                style={[{ width: boxW, height: boxH, backgroundColor: C.base }, animStyle]}
              />
            </View>
          </GestureDetector>
          <Text style={{ position: 'absolute', bottom: 26, alignSelf: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
            
            {i18n.t('두 손가락으로 확대 · 두 번 탭 · 아래로 밀어 닫기')}
          </Text>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
