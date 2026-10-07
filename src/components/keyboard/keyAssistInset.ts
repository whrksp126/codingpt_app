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

// ── 바 노출 판정(단일 지점) — "지금 입력 대상이 보조 키가 의미 있는 곳인가" ──
// 2026-10-08(이슈 #10): 보조 키 패널이 Tasks 검색창 등 아무 입력에서나 뜨던 것을 막는다. 원인은 둘이었다.
//  (1) 일반 텍스트 입력(KeyTextInput, kind 'text')도 바를 그렸다 — 전역화할 때 "어떤 입력이든" 으로 넓힌 것.
//  (2) **터미널 타깃이 등록된 채 남아 있으면**, 타깃과 무관한 RN TextInput(Tasks 검색 등)이 키보드를 올려도
//      keyboardDidShow 가 `focused=true` 로 되살려 터미널용 바(첨부·줄바꿈 키 포함)가 그 위에 떴다.
//      그 상태로 누른 키는 가려진 터미널의 pty 로 나간다.
// 둘 다 여기 두 함수로만 판정한다. 결과는 기존 `noBar` 경로(등록·인셋은 유지, 바/패널만 0)에 태운다 —
//  타깃을 지우거나 focused 를 내리면 iOS 에서 키보드 겹침 여백이 사라져 입력이 가려진다(위 ★ 함정).
export type KaTargetKind = 'terminal' | 'editor' | 'text';

/** 바/특수키 패널을 그리는 타깃 종류. 터미널(TUI 포함)과 코드 편집기(문맥 키셋 — 코디네이터 확정 2026-10-08:
 *  편집기는 유지). 일반 텍스트 입력은 그리지 않는다. 편집기도 끄려면 여기서 'editor' 만 빼면 된다. */
export const BAR_KINDS: readonly KaTargetKind[] = ['terminal', 'editor'];

export interface KaForeignKbInput {
  /** 등록된 타깃 종류(없으면 null) */
  kind: KaTargetKind | null;
  /** 지금 RN TextInput 이 네이티브 포커스를 쥐고 있는가(웹뷰 입력은 여기 안 잡힌다) */
  rnInputFocused: boolean;
  /** 그 RN 입력이 "타깃이 포커스될 때 이미 잡혀 있던 것"인가 — 웹뷰로 포커스가 넘어갔는데 RN blur 가
   *  아직 처리되지 않은 잔상. 이걸 남의 키보드로 치면 터미널에서 바가 안 뜬다. */
  rnInputIsLeftover: boolean;
}

/** 떠 있는 키보드가 **타깃이 아닌 다른 입력의 것**인가. 웹뷰 타깃(터미널/편집기)인데 RN TextInput 이
 *  포커스를 쥐고 있으면 그 키보드는 그 TextInput 의 것이다. 'text' 타깃은 자기 자신이 RN TextInput 이라
 *  구분할 수 없고, 어차피 바를 안 그리므로 false. */
export function isForeignKeyboard(i: KaForeignKbInput): boolean {
  if (!i.kind || i.kind === 'text') return false;
  return i.rnInputFocused && !i.rnInputIsLeftover;
}

export interface KaBarGateInput {
  kind: KaTargetKind | null;
  /** 타깃이 스스로 바를 사양했는가(채팅 컴포저) */
  noBar: boolean;
  /** isForeignKeyboard 의 결과 */
  foreignKeyboard: boolean;
}

/** 이 타깃에 바/패널을 그려도 되는가 — 렌더·인셋·패널 열기가 전부 이 하나를 본다. */
export function keyAssistBarAllowed(i: KaBarGateInput): boolean {
  if (!i.kind || i.noBar || i.foreignKeyboard) return false;
  return BAR_KINDS.includes(i.kind);
}

export interface KaLayoutInput {
  /** 설정(보조키 바 사용) 켜짐 */
  enabled: boolean;
  /** 옛 MobileIDEScreen 이 자체 바를 그리는 동안 전역 액세서리 비활성 */
  suppressed: boolean;
  /** 포커스된 KeyTarget 이 등록돼 있는가 */
  hasTarget: boolean;
  /** 그 타깃에 바를 그리지 않는가 — `!keyAssistBarAllowed(...)` (채팅 컴포저·일반 텍스트 입력·남의 키보드) */
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
  /** 물리(외장) 키보드가 붙어 있는가 — OS 에 직접 물어본 값(추측 아님) */
  hardwareKeyboard: boolean;
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
  // 물리 키보드가 붙어 있으면 보조바·특수키 패널·키보드 여백을 통째로 접는다(사용자 확정 2026-09-06).
  //  특수키는 실물 키로 치면 되고 조작은 단축키로 하므로 바는 화면만 잡아먹는다. 소프트 키보드가
  //  안 뜨는 상태에서 keyboardHeight 만큼 비워 두면 화면 아래가 통째로 검은 띠가 된다(iPad 실기).
  //  ★ 여기서 끊어야 하는 이유: showing 만 false 로 만들면 inset(kbOverlap)이 남아 빈 띠가 그대로다.
  //  ★ 단, 소프트 키보드가 **실제로 떠 있으면**(높이가 잡혔으면) 물리 키보드 판정보다 화면이 정본이다 — 시뮬레이터·
  //   블루투스 키보드 연결 상태에서도 소프트 키보드가 뜨는 경우가 있고, 그때 0 을 주면 키보드가 입력을 덮는다.
  const softKb = i.keyboardVisible && i.keyboardHeight > 80;
  if (i.hardwareKeyboard && !softKb) return { showing: false, panelMode: false, overlayH: 0, inset: 0 };
  const noResize0 = !i.windowResizes || i.imeOverlay;
  // 바를 안 그리는 경우(설정 OFF·물리 키보드)에도 **키보드 겹침만큼은 비켜선다**. 설정은 "보조 바"를 끄는 것이지
  //  "키보드가 입력을 덮어도 된다"가 아니다(2026-09-30 iOS 실기: 바 설정 OFF → 채팅·터미널 입력이 키보드 밑).
  const lift = !i.suppressed && i.hasTarget && i.focused && noResize0 && softKb ? i.keyboardHeight : 0;
  if (i.hardwareKeyboard) return { showing: false, panelMode: false, overlayH: 0, inset: lift };
  const showing = i.enabled && !i.suppressed && i.hasTarget
    && (i.focused || isPanelMode(i.kbMode) || i.kbSwitching);
  const panelMode = !i.noBar && (isPanelMode(i.kbMode) || (i.ios && i.kbSwitching));
  if (!showing) return { showing: false, panelMode, overlayH: 0, inset: i.enabled ? 0 : lift };
  // noBar = 바도 패널도 그리지 않는다 → 오버레이 높이 0. **kbOverlap 은 아래에서 그대로 살린다.**
  const overlayH = i.noBar ? 0 : i.barH + (panelMode ? i.keyboardHeight : 0);
  // imeOverlay(Android adjustNothing 세션): 창이 안 줄어든 상태로 키보드가 덮으므로 겹침 보정 필요.
  const noResize = !i.windowResizes || i.imeOverlay;
  const kbOverlap = !panelMode && noResize && i.keyboardVisible ? i.keyboardHeight : 0;
  return { showing: true, panelMode, overlayH, inset: overlayH + kbOverlap };
}

export default { isPanelMode, keyAssistLayout, keyAssistBarAllowed, isForeignKeyboard };
