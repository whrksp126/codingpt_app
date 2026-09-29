// modalLayer.ts — 셸 공용 오버레이(알럿·승인 카드·새 작업 시트)를 **어느 네이티브 모달 층에** 띄울지 + iOS 모달 전환 순서.
//
// 왜 필요한가(iOS new arch): RCTModalHostView 는 `[self reactViewController]`(= 루트 VC)에서 present 한다.
//  루트 VC 가 이미 전체화면 모달(작업 현황판)을 띄우고 있으면 UIKit 이 두 번째 present 를 **거부**하고,
//  RN 은 _isPresented 를 먼저 세워 두므로 다시 시도하지도 않는다 → 알럿·승인 카드·새 작업 시트가 영영 안 뜬다
//  (SettingsModal 로그아웃 확인창이 뒤에 깔리던 것과 같은 계열). 그래서:
//   ① 층(layer) — 현황판이 열려 있는 동안 공용 호스트들은 **현황판 Modal 의 자식으로** 그린다(중첩 present = 그 VC 에서).
//      셸 레벨 인스턴스는 그동안 아무것도 그리지 않는다(한 번에 한 곳만).
//   ② 전환 — 한 모달을 닫고 **같은 틱에** 다른 형제 모달을 열면, 닫히는 중인 VC 때문에 present 가 실패한다.
//      닫는 쪽이 noteModalClosing() 을 부르고, 여는 쪽은 afterModalTransition() 으로 dismiss 애니메이션 뒤에 연다.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type OverlayLayer = 'root' | 'tasks';

let layer: OverlayLayer = 'root';
const listeners = new Set<() => void>();

export function getOverlayLayer(): OverlayLayer { return layer; }
export function setOverlayLayer(next: OverlayLayer): void {
  if (layer === next) return;
  layer = next;
  listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });
}
export function subscribeOverlayLayer(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
/** 지금 공용 오버레이를 그릴 층. 호스트는 자기 층일 때만 그린다. */
export function useOverlayLayer(): OverlayLayer {
  return useSyncExternalStore(subscribeOverlayLayer, getOverlayLayer);
}

// iOS 모달 dismiss 애니메이션(fade/slide ≈ 300ms) + 여유. Android 는 창(Dialog) 단위라 즉시 열어도 된다.
export const IOS_DISMISS_MS = 420;
let lastClosingAt = 0;

/** 모달을 닫기 시작했다(닫는 쪽이 부른다). */
export function noteModalClosing(): void { lastClosingAt = Date.now(); }

/** 방금 닫힌 모달이 완전히 내려간 뒤 fn(iOS). 닫힌 지 충분히 지났거나 Android 면 즉시. */
export function afterModalTransition(fn: () => void, now: number = Date.now()): void {
  if (Platform.OS !== 'ios') { fn(); return; }
  const wait = lastClosingAt + IOS_DISMISS_MS - now;
  if (wait > 0) setTimeout(fn, wait);
  else fn();
}

/** 테스트 전용. */
export function _resetModalLayerForTest(): void { layer = 'root'; lastClosingAt = 0; listeners.clear(); }
