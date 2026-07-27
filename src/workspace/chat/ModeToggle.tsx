import React from 'react';
import { ChatCircleDots, TerminalWindow } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../animations/haptics';

// TUI ↔ Chat 전환 토글 — **메인 영역 헤더(main-top) 맨 우측**의 인라인 버튼.
//
// ★ 2026-07-27 사용자 확정으로 위치가 바뀌었다: 예전엔 터미널 pane 본문 위에 절대배치(top 6/right 12)
//   된 오버레이였다 → "pane 위로 올라가는 게 아니라 **메인 영역 기준** 우측 상단"이어야 한다.
//   그래서 이 컴포넌트는 이제 절대배치·halo 패딩·zIndex 를 **갖지 않는다**(레이아웃 흐름 안의 버튼).
//   렌더 위치 = `WorkspaceView` main-top 의 통합 추가 버튼(MtBtn ×3) 오른쪽 + 얇은 구분선.
//
// ★ 3플랫폼 동일 디자인(계약 갱신 2026-07-27):
//    · PC 도 같은 라운드에 main-top 으로 옮겼다 — `codingpt_pc/src/js/workspace-view.js` 의
//      `buildModeToggle()`/`syncModeToggle()` + `styles.css .mt-mode`(구 `.pane-mode-toggle` 셀렉터는
//      없어졌다). 양쪽 다 절대배치가 아니므로 코너 오프셋(MODE_TOGGLE_TOP/RIGHT)은 폐기했다.
//    · 유지되는 대조 값: 글리프 규칙(chat 모드면 "터미널"=돌아가기 / tui 모드면 "채팅"=들어가기)과
//      색 토큰 — 유휴 = --text2(PC `.pane-ctrl { color: var(--dim) }` 계열의 흐린 아이콘),
//      chat 활성 = --accent 글리프 + --elevated2 배경(PC `.pane-ctrl.active` 규칙과 같은 두 토큰).
//      테두리 없음도 PC `.pane-ctrl`(border:none, 투명 배경)과 같다 = 같은 헤더 버튼 idiom.
//    · **글리프 픽셀은 플랫폼별로 다르다(의도)**: "그 플랫폼 헤더의 추가 버튼과 같은 크기" 가 계약이다
//      (PC 16 / 앱 19 = WorkspaceView MtBtn 의 아이콘 크기). 숫자를 억지로 통일하면 각자 헤더 줄에서
//      어긋난다 — 앱 MtBtn 아이콘 크기를 바꾸면 아래 GLYPH 도 같이 바꿀 것.
//    · 버튼 박스는 같은 헤더의 다른 버튼(MtBtn 36×36)과 동일 — 터치 타깃을 헤더 줄이 이미 확보한다.
//
// 노출 판정·모드 전환의 정본은 여전히 `agentPresence.ts`(resolveToggleVisible/resolveAgentPresence)와
// PaneView 의 setTabMode(uiControls 모드 채널 경유)다 — 이 파일은 **모양만** 담당한다.

/** 헤더 버튼 규격 — WorkspaceView 의 MtBtn 과 같은 값(정렬이 어긋나면 헤더 줄이 들쭉날쭉해진다). */
export const MODE_TOGGLE_SIZE = 36;
/** 글리프 크기 — 같은 헤더 추가 버튼(MtBtn 의 TerminalWindow/Code/Globe)과 **같은 19**. */
export const MODE_TOGGLE_GLYPH = 19;
// 평상시 투명도(유휴 아이콘을 살짝 죽인다 — chat 활성 시 1).
//  ★ 이 값은 **PressableScale 의 baseOpacity 로 넘겨야** 한다. style 에 opacity 를 쓰면 PressableScale 이
//   style 배열 뒤에 붙이는 애니메이션 스타일(opacity 를 항상 포함)에 덮여 평상시에도 1 로 그려졌다
//   (2026-07-25 교차검증에서 적출 — 디자인 토큰 테스트는 이름만 봐서 초록이었다).
export const MODE_TOGGLE_IDLE_OPACITY = 0.9;

export default function ModeToggle({ mode, onToggle }: { mode: 'tui' | 'chat'; onToggle: () => void }) {
  const C = v2.colors;
  const chat = mode === 'chat';
  return (
    <PressableScale
      onPress={() => { haptic.keyPress(); onToggle(); }}
      hitSlop={6}
      // PC 는 hover 로 .9→1 이 되지만 터치엔 hover 가 없다 → 평상시 0.9 고정(가독성).
      //  chat 활성 시 1 + accent 글리프는 PC `.active` 규칙과 동일.
      baseOpacity={chat ? 1 : MODE_TOGGLE_IDLE_OPACITY}
      accessibilityRole="button"
      accessibilityLabel={chat ? '터미널 화면으로' : '채팅 화면으로'}
      style={{
        width: MODE_TOGGLE_SIZE, height: MODE_TOGGLE_SIZE, borderRadius: v2.radius.md,
        alignItems: 'center', justifyContent: 'center',
        // ★ 항상 테두리+배경이 있는 **컨트롤 형태**로 그린다(PC `.mt-mode` 와 같은 규칙).
        //  유휴에 테두리 없이 납작하게 두면 옆의 추가 버튼 3개와 구별되지 않아 "토글이 없다"고
        //  읽힌다 — 사용자가 PC 에서 실제로 그렇게 신고했다(추가=행동 / 토글=상태, 의미가 다르다).
        borderWidth: 1, borderColor: chat ? C.accent : C.borderControl,
        backgroundColor: C.elevated2,
        // ⚠ opacity 를 여기 두면 안 된다 — 위 baseOpacity 로 넘긴다(animStyle 이 덮는다).
      }}
    >
      {chat
        ? <TerminalWindow size={MODE_TOGGLE_GLYPH} color={C.accent} />
        // 유휴 글리프 색은 PC `.mt-mode { color: var(--text2) }` 와 **같은 토큰**이어야 한다
        //  (사용자 확정: 3플랫폼 동일 디자인). text3 로 두면 폰에서 눈에 띄게 흐리다.
        : <ChatCircleDots size={MODE_TOGGLE_GLYPH} color={C.text2} />}
    </PressableScale>
  );
}
