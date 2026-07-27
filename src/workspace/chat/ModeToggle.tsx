import React from 'react';
import { View } from 'react-native';
import { ChatCircleDots, TerminalWindow } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../animations/haptics';

// 터미널 pane **본문 우측 상단**의 TUI ↔ Chat 전환 토글 — 절대배치 오버레이.
//
// ★ 위치 계약(사용자 확정 2026-07-27, 두 번째 정정 = 지금의 정본):
//   "우측 상단"은 **터미널 pane 본문 안**(탭바 아래, 터미널 내용 위에 떠 있는 오버레이)이다.
//   같은 날 오전에 이걸 "앱 헤더(main-top) 맨 우측"으로 잘못 읽어 옮겼다가 되돌렸다 —
//   헤더로 올리면 pane 이 둘 이상일 때 "어느 터미널의 모드인가"가 화면에서 사라지고, 전역 1개라서
//   대상 폴백/포커스 이동 같은 보정 규칙을 계속 덧붙여야 했다(그 자체가 오독의 증거였다).
//   → pane 마다 자기 토글을 그린다(대상 = 그 pane 의 활성 터미널 탭. 폴백 규칙 불필요).
//
// ★ 3플랫폼 동일 디자인 — PC 도 같은 라운드에 pane 내부로 되돌렸다:
//    · PC 배치 정본 = `codingpt_pc/src/js/pane.js` 의 `_syncModeToggle()` + `styles.css`
//      `.pane-mode-toggle`. **`.pane-body { position: relative }` 가 그 절대배치의 전제**다
//      (오프셋 부모가 `.pane` 이 되면 top:6 이 30px 탭바 안으로 들어가 버린다 — 2026-07-27 실측 사고).
//    · 같은 값: 코너 오프셋 top 6 / right 12, 유휴 투명도 0.9, 글리프 = text2,
//      **유휴에도 테두리+배경이 있는 컨트롤 형태**(아래 ★ 항).
//    · ★ 채팅 모드를 **색으로 표시하지 않는다**(사용자 확정 2026-07-27 2차): 액센트 테두리/글리프는
//      "선택된 필터"처럼 읽혀 상태(모드)와 행동(전환)이 헷갈렸다 → 표현은 **글리프 교체 하나뿐**이다.
//      PC 도 같은 라운드에 `.pane-mode-toggle.active` 규칙을 삭제했다(test/agent-toggle.mjs 가 양쪽을 고정).
//    · 다른 값(의도): 버튼 26px(마우스) ↔ 30px(터치) — Apple HIG 최소 타깃. 글리프는 헤더 버튼과
//      맞출 필요가 없다(헤더가 아니다) → 30px 박스 + 1px 테두리에 좌우 6px 여백이 남는 17.
//
// 배치 규율: xterm/웹뷰 **내부 DOM 이 아니라 상위 RN 레이어**에 절대배치한다. HTML 문자열을 바꾸면
//  WebView 가 재마운트되어 터미널 스트림이 끊긴다(과거 실사고). 알림 오버레이(zIndex 50)보다 아래,
//  터미널/채팅 콘텐츠(zIndex 0~1)보다 위 = 30.
export const MODE_TOGGLE_SIZE = 30;
export const MODE_TOGGLE_TOP = 6;
/** PC `.pane-mode-toggle { right: 12px }` 와 같은 오프셋(3플랫폼 동일 디자인). */
export const MODE_TOGGLE_RIGHT = 12;
/** 글리프 크기 — 30px 컨트롤 안에서 좌우 여백 6px(헤더 버튼과 맞추지 않는다: 여긴 헤더가 아니다). */
export const MODE_TOGGLE_GLYPH = 17;
// 평상시 투명도 — PC `.pane-mode-toggle { opacity: .9 }` 와 같은 값(chat 활성 시 1 = PC `.active`).
//  ★ 이 값은 **PressableScale 의 baseOpacity 로 넘겨야** 한다. style 에 opacity 를 쓰면 PressableScale 이
//   style 배열 뒤에 붙이는 애니메이션 스타일(opacity 를 항상 포함)에 덮여 평상시에도 1 로 그려졌다
//   (2026-07-25 교차검증에서 적출 — 디자인 토큰 테스트는 이름만 봐서 초록이었다).
export const MODE_TOGGLE_IDLE_OPACITY = 0.9;
// 터치 여유(hitSlop) — ★ 값만 주면 안 먹는다. RN 은 **부모 뷰의 bounds 밖 좌표에서 hitTest 를 끝낸다**
//  (iOS `RCTView.hitTest` 는 subview 순회 전에 자기 pointInside 를 통과해야 하고, Android
//  TouchTargetHelper 도 자식 hitSlop 을 부모 bounds 안에서만 본다). 그래서 절대배치 래퍼가 버튼에 꼭
//  맞으면 hitSlop 이 잘려 **실효 타깃이 30px 로 남는다**(과거 주석엔 50px 이라 적혀 있었지만 실측은
//  아니었다). 래퍼에 같은 크기의 패딩(=halo)을 줘서 여유를 래퍼 bounds **안**으로 들여놓고, 래퍼는
//  box-none 이라 halo 밖 터치는 터미널로 그대로 통과한다. 버튼의 시각적 위치는 top 6 / right 12 유지
//  (패딩만큼 래퍼를 밖으로 밀어 상쇄). 승인 배너가 이 halo 를 덮지 않도록 PaneView 가 우측 여백을 둔다.
export const MODE_TOGGLE_HALO = 10;

export default function ModeToggle({ mode, onToggle }: { mode: 'tui' | 'chat'; onToggle: () => void }) {
  const C = v2.colors;
  const chat = mode === 'chat';
  return (
    // box-none — 버튼(+halo) 밖 영역의 터치는 그대로 아래(터미널/채팅)로 통과해야 한다.
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        // 위쪽 halo 는 pane 바깥(탭바)으로 나가면 클리핑되므로 top 0 에서 패딩으로만 확보한다.
        top: 0,
        right: MODE_TOGGLE_RIGHT - MODE_TOGGLE_HALO,
        paddingTop: MODE_TOGGLE_TOP,
        paddingLeft: MODE_TOGGLE_HALO,
        paddingRight: MODE_TOGGLE_HALO,
        paddingBottom: MODE_TOGGLE_HALO,
        zIndex: 30,
        elevation: 30,
      }}
    >
      <PressableScale
        onPress={() => { haptic.keyPress(); onToggle(); }}
        hitSlop={MODE_TOGGLE_HALO}
        // PC 는 hover 로 .9→1 이 되지만 터치엔 hover 가 없다 → 평상시 0.9 고정(가독성).
        //  모드에 따라 바꾸지 않는다 — 투명도도 '색'과 같은 상태 신호라 글리프 교체만 남기는 규칙에 어긋난다.
        baseOpacity={MODE_TOGGLE_IDLE_OPACITY}
        accessibilityRole="button"
        accessibilityLabel={chat ? '터미널 화면으로' : '채팅 화면으로'}
        style={{
          width: MODE_TOGGLE_SIZE, height: MODE_TOGGLE_SIZE, borderRadius: v2.radius.sm,
          alignItems: 'center', justifyContent: 'center',
          // ★ 항상 테두리+배경이 있는 **컨트롤 형태**(PC `.pane-mode-toggle` 과 같은 규칙).
          //  납작한 아이콘으로 두면 사용자가 "토글이 없다"고 읽는다(2026-07-27 실신고). 게다가 여기는
          //  터미널 글자 위에 떠 있으므로 배경은 **불투명**이어야 겹쳐도 글리프가 읽힌다.
          borderWidth: 1, borderColor: C.borderControl,
          backgroundColor: C.elevated2,
          // ⚠ opacity 를 여기 두면 안 된다 — 위 baseOpacity 로 넘긴다(animStyle 이 덮는다).
        }}
      >
        {/* 글리프 색은 두 모드 **동일**(PC `.pane-mode-toggle { color: var(--text2) }` 와 같은 토큰).
            바뀌는 것은 모양뿐: chat 이면 "터미널로 갈 수 있다", tui 면 "채팅으로 갈 수 있다". */}
        {chat
          ? <TerminalWindow size={MODE_TOGGLE_GLYPH} color={C.text2} />
          : <ChatCircleDots size={MODE_TOGGLE_GLYPH} color={C.text2} />}
      </PressableScale>
    </View>
  );
}
