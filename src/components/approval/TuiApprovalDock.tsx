import React, { useState } from 'react';
import { View } from 'react-native';

import QuestionDock from './QuestionDock';
import { usePaneApprovals } from './paneApproval';

// TUI(터미널) 모드의 질문 도크 — 채팅의 컴포저 위 도크와 **같은 카드**를 화면 아래에 붙인다.
//  두 모드에서 답하는 자리가 달라지면 사용자가 매번 찾아야 한다(같은 자리 = 같은 동작).
//
// ★ 반드시 절대배치 오버레이여야 한다. 일반 흐름에 넣으면 터미널 레이어 높이가 바뀌고
//  fit() → tmux resize-window 가 나간다(리사이즈 폭발 = 과거 최대 사고). 오버레이는 레이아웃을
//  건드리지 않는다. box-none 이라 카드 밖 터치는 터미널로 그대로 통과한다.
export default function TuiApprovalDock({ cwd, win }: { cwd: string; win: number | null }) {
  const pending = usePaneApprovals(cwd, win);
  const [closed, setClosed] = useState<string | null>(null);
  const ask = pending[0];
  if (!ask || closed === ask.id) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40, elevation: 40, paddingBottom: 10 }}
    >
      <QuestionDock approval={ask} onDismiss={() => setClosed(ask.id)} />
    </View>
  );
}
