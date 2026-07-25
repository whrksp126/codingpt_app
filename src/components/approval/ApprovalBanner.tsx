import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { CaretDown, CaretUp, ShieldWarning } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import ApprovalCard from './ApprovalCard';

// 승인 배너 — 채팅/터미널 화면 **상단**에 붙는 인라인 카드(요구사항 4).
//  · (cwd, win) 스코프: 이 터미널이 만든 요청만 보여준다(다른 터미널 것은 자기 화면에서).
//  · 접힘 = 한 줄 요약(대화를 가리지 않게), 탭하면 그 자리에서 펼쳐 응답 버튼이 나온다.
//  · 여러 건 대기면 최신 1건 + "n건 더" 표기(폭주 시 화면을 다 먹지 않게).
export default function ApprovalBanner({ cwd, win }: { cwd: string; win: number | null }) {
  const C = v2.colors;
  const S = useWorkspaceShell();
  const [expanded, setExpanded] = useState(true);

  const mine = useMemo(() => {
    if (!cwd) return [];
    return S.approvals
      .filter((a) => (a.cwd || '') === cwd && (win == null || a.win == null || a.win === win))
      .sort((x, y) => y.requestedAt - x.requestedAt);
  }, [S.approvals, cwd, win]);

  const top = mine[0];
  if (!top) return null;

  return (
    <View style={{ paddingHorizontal: 10, paddingTop: 8, backgroundColor: C.base }}>
      {expanded ? (
        <ApprovalCard
          approval={top}
          compact
          busy={!!top.claimed}
          onRespond={(d, o) => { void S.respondApproval(top.id, d, o); }}
          onDismiss={() => S.dismissApproval(top.id)}
        />
      ) : (
        <PressableScale
          onPress={() => setExpanded(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 7,
            backgroundColor: C.elevated, borderWidth: 1, borderColor: C.warn,
            borderRadius: v2.radius.md, paddingHorizontal: 11, paddingVertical: 9,
          }}
        >
          <ShieldWarning size={15} color={C.warn} />
          <Text style={{ flex: 1, color: C.text2, fontSize: 12.5 }} numberOfLines={1}>
            승인 필요 · {top.tool}{top.summary ? ` — ${top.summary}` : ''}
          </Text>
          <CaretDown size={13} color={C.text3} />
        </PressableScale>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 }}>
        {mine.length > 1 ? (
          <Text style={{ color: C.textDim, fontSize: 11 }}>대기 중 {mine.length}건</Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {expanded ? (
          <PressableScale onPress={() => setExpanded(false)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={{ color: C.text3, fontSize: 11 }}>접기</Text>
            <CaretUp size={11} color={C.text3} />
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}
