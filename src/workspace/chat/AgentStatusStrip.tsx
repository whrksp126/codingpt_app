import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';
import { statusChips, statusDetail, statusLine, type AgentStatus } from '../chatModel';
import { parseAnsiLine } from './ansi';
import { termPalette } from '../../theme/terminalSchemes';
import { useTermScheme } from '../../utils/termSchemeSetting';
import { useTheme } from '../../contexts/ThemeContext';
import { Platform } from 'react-native';

// 에이전트 상태 스트립 — 컴포저 바로 위 한 줄. 탭하면 상세가 펼쳐진다.
//
// ★ 2026-08-03 재설계(사용자 확정: "채팅 UI답게 새로 그리기").
//  종전엔 터미널 화면을 3초마다 캡처해 그 **글자를 그대로 흉내**냈다(StatusLineStrip). 그 방식은
//  ① 3초 늦고 ② 화면 배치가 바뀌면 못 읽고 ③ 유휴 터미널은 push 가 0건이라(실측 60초 0건)
//  한 번 놓치면 영영 빈칸이었다 — claude 가 아예 안 보이던 진범.
//  지금은 데몬이 **공식 채널**에서 구조화 값을 받는다(claude statusLine 훅 / codex rollout) →
//  우리는 폰 화면에 맞는 표시를 직접 만든다. 터미널에 없는 것(7일 한도·리셋 시각·비용)도 보여준다.
//
// 규율:
//  · 문구·순서·포맷은 `chatModel.ts` statusChips/statusDetail 이 정본이고 **PC 와 공유**한다.
//  · 리셋까지 남은 시간은 **그리는 시점**에 계산한다(데몬이 문자열을 만들면 화면에 굳는다).
//  · 색은 무채색 — accent 는 상태 신호 전용(2026-07-28 색 규율).
//  · 좁은 폭에서는 가로 스크롤로 흘린다(줄바꿈하면 컴포저를 밀어낸다).
export default function AgentStatusStrip({ status }: { status: AgentStatus }) {
  const C = v2.colors;
  const [open, setOpen] = useState(false);
  const { resolvedScheme } = useTheme();
  const scheme = useTermScheme();
  const pal = termPalette(scheme, resolvedScheme !== 'light');
  // ★ 한 줄 요약 = **사용자가 설정한 그 줄**(2026-08-04 사용자 지적: 우리가 항목을 고르고 있었다).
  //  claude 는 사용자 스크립트 출력이 ANSI 째로 오므로 터미널 팔레트·모노로 그린다(게이지 정렬).
  //  codex 는 `[tui] status_line` 항목대로 데몬이 조립해 준다. 없을 때만 우리 칩으로 폴백.
  const line = statusLine(status);
  const chips = statusChips(status);
  if (!line && !chips.length) return null;
  const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
  // 펼칠 때마다 지금 시각으로 다시 계산한다(리셋 남은 시간).
  const rows = open ? statusDetail(status, Date.now()) : [];
  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 3, paddingBottom: 1 }}>
      <PressableScale onPress={() => setOpen((v) => !v)} hitSlop={6}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 14, alignItems: 'center' }}>
          {line ? (
            <Text numberOfLines={1} style={{ fontFamily: mono, fontSize: 10.5, lineHeight: 16, color: C.text3 }}>
              {parseAnsiLine(line, pal).map((s, j) => (
                <Text
                  key={j}
                  style={{
                    ...(s.color ? { color: s.color } : {}),
                    ...(s.backgroundColor ? { backgroundColor: s.backgroundColor } : {}),
                    ...(s.bold ? { fontWeight: '700' as const } : {}),
                    ...(s.dim ? { opacity: 0.6 } : {}),
                  }}
                >
                  {s.text}
                </Text>
              ))}
            </Text>
          ) : chips.map((c, i) => (
            <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
              {i ? <View style={{ width: 1, height: 9, backgroundColor: C.border, marginHorizontal: 8 }} /> : null}
              <Text numberOfLines={1} style={{ color: C.text3, fontSize: 11, lineHeight: 16 }}>{c.text}</Text>
            </View>
          ))}
        </ScrollView>
      </PressableScale>
      {open && rows.length ? (
        <View style={{ paddingTop: 5, paddingBottom: 2, gap: 2 }}>
          {rows.map((r) => (
            <View key={r.key} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={{ color: C.textDim, fontSize: 11, lineHeight: 16, minWidth: 68 }}>{r.label}</Text>
              <Text style={{ color: C.text2, fontSize: 11, lineHeight: 16 }}>{r.value}</Text>
              {r.sub ? <Text style={{ color: C.textDim, fontSize: 11, lineHeight: 16 }}>{r.sub}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
