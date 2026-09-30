import React from 'react';
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import { X } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { haptic } from '../../animations/haptics';
import PressableRow from '../../components/ui/PressableRow';
import IconButton from '../../components/ui/IconButton';
import type { TuiDialog } from '../chatModel';
import * as i18n from '../../i18n/index.ts';

// TUI 선택 화면 미러 카드 — `/model`·`/permissions` 처럼 번호 선택 화면을 여는 명령을 채팅에서 보내면
//  TUI 에는 화면이 뜨는데 채팅은 아무 반응이 없어 "먹통"으로 읽힌다(사용자 확정 2026-08-02:
//  그 화면을 카드로 미러하고 채팅에서 고른다).
//
// 규율:
//  · 내용은 **화면 원문 그대로**(제목·설명·선택지·푸터 힌트) — 우리가 재작성하지 않는다(채팅=TUI 미러).
//  · 버튼 = 그 번호 키. 데몬이 **제목을 대조한 뒤에만** 키를 친다(그 사이 화면이 바뀌었으면 거절).
//  · 색은 무채색(accent 는 상태 신호 전용 — 2026-07-28 색 규율).
// PC 미러: `codingpt_pc/src/js/chat-view.js` 의 `.chat-tuidlg` + styles.css 같은 절.
export default function TuiDialogCard({ dialog, busy, onPick, onCancel }: {
  dialog: TuiDialog;
  busy?: boolean;
  onPick: (n: number) => void;
  onCancel: () => void;
}) {
  const C = v2.colors;
  // 규격(§0.8): 카드 elevated · 반경 lg · 헤어라인. 선택지 = 번호 세로 행(승인 카드와 같은 문법) h44.
  return (
    <View style={{
      marginHorizontal: 10, marginBottom: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, borderRadius: v2.radius.lg,
      borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated, opacity: busy ? 0.55 : 1,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, minWidth: 0, color: C.text, fontSize: v2.font.size.body, fontWeight: '600' }}>{dialog.title}</Text>
        {busy ? <ActivityIndicator size="small" color={C.text3} /> : null}
        <IconButton icon={X} iconSize={16} size={28} color={C.text3} onPress={() => { haptic.keyPress(); onCancel(); }} accessibilityLabel={i18n.t('닫기')} disabled={busy} />
      </View>
      {dialog.desc ? (
        <Text style={{ color: C.text2, fontSize: v2.font.size.small, marginTop: 2, lineHeight: 18 }}>{dialog.desc}</Text>
      ) : null}
      <ScrollView style={{ maxHeight: 264, marginTop: 6 }} keyboardShouldPersistTaps="always">
        {(dialog.options || []).map((o) => (
          <PressableRow
            key={o.n}
            disabled={busy}
            onPress={() => { haptic.keyPress(); onPick(o.n); }}
            accessibilityLabel={o.label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 6 }}
          >
            <Text style={{ color: C.text3, fontSize: v2.font.size.caption, fontFamily: v2.font.mono as string, width: 16, textAlign: 'right' }}>{o.n}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: C.text, fontSize: v2.font.size.body }}>{o.label}</Text>
              {o.desc ? (
                <Text numberOfLines={2} style={{ color: C.textDim, fontSize: v2.font.size.small }}>{o.desc}</Text>
              ) : null}
            </View>
          </PressableRow>
        ))}
      </ScrollView>
      {dialog.footer ? (
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginTop: 6 }}>{dialog.footer}</Text>
      ) : null}
    </View>
  );
}
