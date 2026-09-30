import React from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';

import { v2 } from '../../theme/v2Tokens';
import { haptic } from '../../animations/haptics';
import PressableRow from '../../components/ui/PressableRow';
import { commandBadges, filterCommands, type SlashCommand } from '../chatModel';
import * as i18n from '../../i18n/index.ts';

// 슬래시 명령 팔레트 — TUI 에서 `/` 를 치면 뜨는 그 목록을 채팅에서도 낸다(사용자 요청 2026-08-02).
//
// PC 미러: `codingpt_pc/src/js/chat-view.js` 의 `.chat-cmds` 팝오버 + styles.css 같은 절.
//  · 여는 조건·정렬·배지는 `chatModel.ts`(slashQuery/filterCommands/commandBadges)가 정본이고
//    PC 와 **같은 함수 규칙**이다 — 한쪽만 고치면 폰과 PC 가 다른 목록을 보인다.
//  · 고르면 **컴포저에 채워 넣는다**(사용자 확정): 인자 있는 명령을 위해서, 그리고 실수로 실행되지
//    않게 하려고. 실행은 언제나 사용자가 전송을 한 번 더 눌러야 일어난다.
//  · 'tui' 분류(편집기 열림·세션 종료 등)는 **고를 수 없다**. 배지가 이유를 말한다. 직접 타이핑하면
//    그대로 나가므로 막는 게 아니라 권하지 않는 것이다.
//
// 배치: 컴포저 **바로 위**(키보드가 올라온 상태에서 손가락과 가장 가깝다). 목록이 길면 스크롤.
const MAX_H = 260;

export default function SlashPalette({ query, items, loading, onPick }: {
  /** `/` 뒤에 친 글자(빈 문자열이면 전체 목록). null 이면 이 컴포넌트를 그리지 않는다(호출측 판정). */
  query: string;
  items: SlashCommand[] | null;
  loading?: boolean;
  onPick: (name: string) => void;
}) {
  const C = v2.colors;
  const rows = filterCommands(items, query);

  return (
    <View style={{
      marginBottom: 6, borderRadius: v2.radius.lg,   // 좌우 여백은 컴포저 컨테이너가 이미 준다
      borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, overflow: 'hidden', paddingVertical: 4,
    }}>
      {!items && loading ? (
        <View style={{ padding: 14, alignItems: 'center' }}><ActivityIndicator size="small" color={C.text3} /></View>
      ) : !rows.length ? (
        <Text style={{ color: C.textDim, fontSize: v2.font.size.small, padding: 12, textAlign: 'center' }}>{i18n.t('맞는 명령이 없습니다')}</Text>
      ) : (
        <ScrollView style={{ maxHeight: MAX_H }} keyboardShouldPersistTaps="always">
          {rows.map((c) => {
            const off = c.chat === 'tui';
            return (
              <PressableRow
                key={c.name}
                disabled={off}
                onPress={() => { haptic.keyPress(); onPick(c.name); }}
                accessibilityLabel={c.name}
                radius={0}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ color: C.text, fontSize: v2.font.size.small, fontFamily: v2.font.mono as string }}>{c.name}</Text>
                <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.small, flex: 1, minWidth: 0 }}>{c.desc}</Text>
                {/* 분류 배지는 알약 대신 보조 텍스트(§0.6 — 알약은 세그먼트·컴포저·모드에만) */}
                {commandBadges(c).map((b) => (
                  <Text key={b} style={{ color: C.text3, fontSize: v2.font.size.caption }}>{b}</Text>
                ))}
              </PressableRow>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
