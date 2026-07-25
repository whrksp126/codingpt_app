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
//    크기만 차등 — 마우스 26px / 터치 30px + hitSlop 10(실효 50px, Apple HIG). §6-6 (b) 권장안.
//
// 배치 규율: xterm/웹뷰 **내부 DOM 이 아니라 상위 RN 레이어**에 절대배치한다. HTML 문자열을 바꾸면
//  WebView 가 재마운트되어 터미널 스트림이 끊긴다(과거 실사고). 알림 오버레이(zIndex 50)보다 아래.
export const MODE_TOGGLE_SIZE = 30;
export const MODE_TOGGLE_TOP = 6;
// PC `.pane-mode-toggle { right: 12px }` 와 동일 오프셋(사용자 확정: 3플랫폼 동일 디자인).
//  버튼 크기만 터치 타깃 때문에 26 → 30 으로 다르다(문서화된 의도적 차등).
export const MODE_TOGGLE_RIGHT = 12;

export default function ModeToggle({ mode, onToggle }: { mode: 'tui' | 'chat'; onToggle: () => void }) {
  const C = v2.colors;
  const chat = mode === 'chat';
  return (
    // box-none — 버튼 밖 영역의 터치는 그대로 아래(터미널/채팅)로 통과해야 한다.
    <View pointerEvents="box-none" style={{ position: 'absolute', top: MODE_TOGGLE_TOP, right: MODE_TOGGLE_RIGHT, zIndex: 30, elevation: 30 }}>
      <PressableScale
        onPress={() => { haptic.keyPress(); onToggle(); }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={chat ? '터미널 화면으로' : '채팅 화면으로'}
        style={{
          width: MODE_TOGGLE_SIZE, height: MODE_TOGGLE_SIZE, borderRadius: v2.radius.sm,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2,
          // PC 는 hover 로 .55→1 이 되지만 터치엔 hover 가 없다 → 평상시 0.9 로 고정(가독성).
          //  chat 활성 시 opacity 1 + accent 글리프는 PC `.active` 규칙과 동일.
          opacity: chat ? 1 : 0.9,
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
