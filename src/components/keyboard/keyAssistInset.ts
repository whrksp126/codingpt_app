// keyAssistInset.ts — KeyAssist 오버레이(보조바 + 특수키/STT 패널)의 **레이아웃 산수 순수 코어**.
//
// 왜 별 파일인가: 이 계산이 틀리면 증상이 "조용히" 나온다 — 인셋이 과하면 빈 띠, 부족하면 **키보드가
//  입력을 덮어 사용자가 자기가 뭘 쓰는지 못 본다**. 두 실패 모두 에러·로그 0건이라 실기기에서 눈으로
//  보기 전엔 모른다. 그래서 훅(RN 의존)에서 산수만 떼어 조합표로 고정한다(__tests__/keyAssistInset.test.ts).
//
// ★ 2026-07-27 요구(채팅 인풋 포커스 중 보조바 숨김)의 함정이 여기 박혀 있다:
//   "바를 안 그린다" 를 **타깃을 등록하지 않는 것**으로 구현하면 iOS 가 깨진다. iOS 는 창이 키보드에
//   리사이즈되지 않으므로(`windowResizes=false`) 인셋에 `kbOverlap = keyboardHeight` 를 포함시켜야
//   컴포저가 키보드 위로 올라오는데, 타깃이 없으면 `showing=false` → 인셋 0 → **키보드가 컴포저를 덮는다**.
//   그래서 타깃 등록은 유지하고 `noBar` 플래그로 **바 높이 기여만 0** 으로 만든다(kbOverlap 은 그대로).
//   패널(특수키/STT)은 바 없이는 열 수 없지만, 방어적으로 noBar 면 패널 기여도 0 으로 접는다.

export type KbMode = 'os' | 'panel' | 'stt';

/** OS 키보드가 내려가고 패널(특수키/STT)이 자리를 차지하는 모드인가 — 레이아웃/리셋 공용 판정. */
export const isPanelMode = (m: KbMode): boolean => m === 'panel' || m === 'stt';

export interface KaLayoutInput {
  /** 설정(보조키 바 사용) 켜짐 */
  enabled: boolean;
  /** 옛 MobileIDEScreen 이 자체 바를 그리는 동안 전역 액세서리 비활성 */
  suppressed: boolean;
  /** 포커스된 KeyTarget 이 등록돼 있는가 */
  hasTarget: boolean;
  /** 그 타깃이 "바를 그리지 않는" 타깃인가(채팅 컴포저) */
  noBar: boolean;
  focused: boolean;
  kbMode: KbMode;
  kbSwitching: boolean;
  keyboardVisible: boolean;
  keyboardHeight: number;
  barH: number;
  /** Android adjustNothing 세션(창이 키보드에 안 줄어드는 상태) */
  imeOverlay: boolean;
  /** 이 콘텐츠의 윈도가 키보드에 맞춰 리사이즈되는가(Android 루트=true, iOS·Modal=false) */
  windowResizes: boolean;
  /** 플랫폼이 iOS 인가 — 전환 갭(kbSwitching)에 패널 필러를 유지하는 것은 iOS 전용 */
  ios: boolean;
}

export interface KaLayout {
  /** 오버레이(바/패널)를 렌더하는가 */
  showing: boolean;
  /** 패널이 펼쳐진(또는 iOS 전환 갭) 상태인가 */
  panelMode: boolean;
  /** 오버레이 자체 높이(바 + 펼친 패널) — KAV 로 이미 키보드 회피가 되는 콘텐츠용 */
  overlayH: number;
  /** 콘텐츠가 비켜설 총 높이(오버레이 + 겹치는 키보드) */
  inset: number;
}

export function keyAssistLayout(i: KaLayoutInput): KaLayout {
  const showing = i.enabled && !i.suppressed && i.hasTarget
    && (i.focused || isPanelMode(i.kbMode) || i.kbSwitching);
  const panelMode = !i.noBar && (isPanelMode(i.kbMode) || (i.ios && i.kbSwitching));
  if (!showing) return { showing: false, panelMode, overlayH: 0, inset: 0 };
  // noBar = 바도 패널도 그리지 않는다 → 오버레이 높이 0. **kbOverlap 은 아래에서 그대로 살린다.**
  const overlayH = i.noBar ? 0 : i.barH + (panelMode ? i.keyboardHeight : 0);
  // imeOverlay(Android adjustNothing 세션): 창이 안 줄어든 상태로 키보드가 덮으므로 겹침 보정 필요.
  const noResize = !i.windowResizes || i.imeOverlay;
  const kbOverlap = !panelMode && noResize && i.keyboardVisible ? i.keyboardHeight : 0;
  return { showing: true, panelMode, overlayH, inset: overlayH + kbOverlap };
}

export default { isPanelMode, keyAssistLayout };
