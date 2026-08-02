import React from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { X } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import { haptic } from '../../animations/haptics';
import type { TuiDialog } from '../chatModel';

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
  return (
    <View style={{
      marginHorizontal: 10, marginBottom: 6, padding: 12, borderRadius: v2.radius.md,
      borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated, opacity: busy ? 0.55 : 1,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 14, fontWeight: '700' }}>{dialog.title}</Text>
        {busy ? <ActivityIndicator size="small" color={C.text3} /> : null}
        <Pressable onPress={() => { haptic.keyPress(); onCancel(); }} hitSlop={10} accessibilityLabel="닫기" disabled={busy}>
          <X size={15} color={C.text3} />
        </Pressable>
      </View>
      {dialog.desc ? (
        <Text style={{ color: C.textDim, fontSize: 11.5, marginTop: 3, lineHeight: 16 }}>{dialog.desc}</Text>
      ) : null}
      <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="always">
        {(dialog.options || []).map((o) => (
          <Pressable
            key={o.n}
            disabled={busy}
            onPress={() => { haptic.keyPress(); onPick(o.n); }}
            android_ripple={{ color: C.elevated2 }}
            style={{
              flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6,
              paddingHorizontal: 10, paddingVertical: 9, borderRadius: v2.radius.sm,
              borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.base,
            }}
          >
            <Text style={{ color: C.text3, fontSize: 11, fontFamily: v2.font.mono as string }}>{o.n}</Text>
            <Text style={{ color: C.text, fontSize: 13 }}>{o.label}</Text>
            {o.desc ? (
              <Text numberOfLines={2} style={{ color: C.textDim, fontSize: 11, flex: 1, minWidth: 0 }}>{o.desc}</Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
      {dialog.footer ? (
        <Text style={{ color: C.textDim, fontSize: 10.5, marginTop: 6 }}>{dialog.footer}</Text>
      ) : null}
    </View>
  );
}
