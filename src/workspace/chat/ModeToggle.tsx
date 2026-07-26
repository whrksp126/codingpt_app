import React from 'react';
import { View } from 'react-native';
import { ChatCircleDots, TerminalWindow } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../animations/haptics';

// 터미널 pane 본문 **우측 상단 고정 토글** — TUI ↔ Chat 전환(사용자 확정 요구 1·2).
//
// ★ 3플랫폼 동일 디자인. PC(`codingpt_pc/src/styles.css .pane-mode-toggle`)와 다음 값이 일치해야 한다:
//    코너 오프셋 top 6 / right 12(모바일은 스크롤바가 없어 right 8 로 조금 안쪽 — 아래 주석 참조),
//    라운드 r-sm(6), 배경 --elevated2, 테두리 --border-ctrl, 평상시 색 --text3, chat 활성 시 --accent,
//    글리프: chat 모드면 "터미널"(돌아가기), tui 모드면 "채팅"(들어가기).
//    크기만 차등 — 마우스 26px / 터치 30px + hitSlop 10(실효 50x46px, Apple HIG). §6-6 (b) 권장안.
//    ★ hitSlop 이 실제로 먹으려면 래퍼 패딩이 필요하다 — MODE_TOGGLE_HALO 주석 참조.
//
// 배치 규율: xterm/웹뷰 **내부 DOM 이 아니라 상위 RN 레이어**에 절대배치한다. HTML 문자열을 바꾸면
//  WebView 가 재마운트되어 터미널 스트림이 끊긴다(과거 실사고). 알림 오버레이(zIndex 50)보다 아래.
export const MODE_TOGGLE_SIZE = 30;
export const MODE_TOGGLE_TOP = 6;
// PC `.pane-mode-toggle { right: 12px }` 와 동일 오프셋(사용자 확정: 3플랫폼 동일 디자인).
//  버튼 크기만 터치 타깃 때문에 26 → 30 으로 다르다(문서화된 의도적 차등).
export const MODE_TOGGLE_RIGHT = 12;
// 평상시 투명도 — PC `.pane-mode-toggle { opacity: 0.9 }` 와 같은 값(chat 활성 시 1 = PC `.active`).
//  ★ 이 값은 **PressableScale 의 baseOpacity 로 넘겨야** 한다. style 에 opacity 를 쓰면 PressableScale 이
//   style 배열 뒤에 붙이는 애니메이션 스타일(opacity 를 항상 포함)에 덮여 평상시에도 1 로 그려졌다
//   (2026-07-25 교차검증에서 적출 — 디자인 토큰 테스트는 이름만 봐서 초록이었다).
export const MODE_TOGGLE_IDLE_OPACITY = 0.9;
// 터치 여유(hitSlop) — ★ 값만 주면 iOS 에서 안 먹는다. RN 은 부모 뷰의 bounds 밖 좌표에서 hitTest 를
//  끝내므로(iOS `RCTView.hitTest` 는 subview 를 순회하기 전에 자기 pointInside 를 통과해야 한다;
//  Android TouchTargetHelper 도 자식 hitSlop 을 부모 bounds 안에서만 본다) **절대배치 래퍼가 버튼에
//  꼭 맞으면 hitSlop 이 그대로 잘려 실효 타깃이 30px 로 남는다**(주석엔 50px 이라 적혀 있었지만 실제로는
//  아니었다). 그래서 래퍼에 같은 크기의 패딩(=halo)을 줘서 여유 영역을 래퍼 bounds **안**으로 들여놓고,
//  래퍼는 box-none 이라 halo 영역의 터치는 버튼(hitSlop)만 잡고 그 밖은 터미널로 그대로 통과한다.
//  버튼의 시각적 위치는 top 6 / right 12 그대로 유지된다(패딩만큼 래퍼를 밖으로 밀어 상쇄).
const MODE_TOGGLE_HALO = 10;

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
        //  chat 활성 시 1 + accent 글리프는 PC `.pane-mode-toggle.active` 규칙과 동일.
        baseOpacity={chat ? 1 : MODE_TOGGLE_IDLE_OPACITY}
        accessibilityRole="button"
        accessibilityLabel={chat ? '터미널 화면으로' : '채팅 화면으로'}
        style={{
          width: MODE_TOGGLE_SIZE, height: MODE_TOGGLE_SIZE, borderRadius: v2.radius.sm,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2,
          // ⚠ opacity 를 여기 두면 안 된다 — 위 baseOpacity 로 넘긴다(animStyle 이 덮는다).
        }}
      >
        {chat
          ? <TerminalWindow size={16} color={C.accent} />
          // 유휴 글리프 색은 PC `.pane-mode-toggle { color: var(--text2) }` 와 **같은 토큰**이어야 한다
          //  (사용자 확정: 3플랫폼 동일 디자인). text3 로 두면 폰에서 눈에 띄게 흐리다.
          : <ChatCircleDots size={16} color={C.text2} />}
      </PressableScale>
    </View>
  );
}
