import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { ArrowUp, Stop } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import KeyTextInput from '../../components/keyboard/KeyTextInput';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../animations/haptics';

// 채팅 컴포저 — 멀티라인 입력 + 전송(chat.input) + 중단(Ctrl-C).
//
// 함정(둘 다 과거 실사고):
//  · **이중 인셋 금지**: 셸(IndexScreen)이 이미 useKeyAssistInset() 만큼 위로 밀려 있으므로 여기서
//    KeyboardAvoidingView/insets.bottom 을 또 쓰면 빈 띠가 생긴다 → 고정 padding 만.
//  · **터미널 크기 주장 금지**: 키보드가 뜨며 pane 높이가 바뀌어도 fit()/claim 을 호출하지 않는다
//    (PaneView 가 chat 모드에서 onBodyLayout 을 조기 return 한다 — 리사이즈 폭발 방어).
//
// KeyAssist 연동: KeyTextInput 이 포커스 시 자기 타깃을 등록하므로 보조바/특수키 패널이 자동으로 붙는다.
//  attachCtx 를 넘기면 보조바에 파일 첨부 버튼이 나오고, 업로드된 절대경로가 컴포저 텍스트에 삽입된다
//  (터미널 첨부 플로우 재사용 — claude 가 그 경로를 읽는다).

const DRAFT_MAX = 4096;

export default function ChatComposer({
  draft, onDraftChange, onSend, onStop, busy, running, attachCtx, disabled, disabledHint,
}: {
  draft: string;
  onDraftChange: (t: string) => void;
  onSend: (text: string) => Promise<void> | void;
  onStop?: () => void;
  /** 전송 RPC 진행 중 */
  busy?: boolean;
  /** 에이전트가 지금 작업 중(추정) — 중단 버튼을 함께 노출. 전송은 계속 가능(TUI 처럼 큐잉된다). */
  running?: boolean;
  attachCtx?: () => { cwd: string; host: number | null };
  disabled?: boolean;
  disabledHint?: string;
}) {
  const C = v2.colors;
  const [focused, setFocused] = useState(false);
  const sendingRef = useRef(false);

  const send = useCallback(async () => {
    const t = draft.trim();
    if (!t || sendingRef.current || disabled) return;
    sendingRef.current = true;
    haptic.keyPress();
    try {
      // 초안은 낙관적으로 즉시 비운다(전송 실패 시 실패 버블에서 다시 확인 가능).
      onDraftChange('');
      await onSend(t);
    } finally { sendingRef.current = false; }
  }, [draft, disabled, onDraftChange, onSend]);

  const canSend = !!draft.trim() && !busy && !disabled;

  return (
    <View style={{
      flexShrink: 0, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface,
      paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8,
    }}>
      {disabled && disabledHint ? (
        <Text style={{ color: C.textDim, fontSize: 11.5, marginBottom: 6 }}>{disabledHint}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{
          flex: 1, borderWidth: 1, borderRadius: v2.radius.sm, backgroundColor: C.elevated2,
          borderColor: focused ? C.borderFocus : C.borderControl, paddingHorizontal: 10, paddingVertical: 6,
        }}>
          <KeyTextInput
            value={draft}
            onChangeText={(t) => onDraftChange(t.length > DRAFT_MAX ? t.slice(0, DRAFT_MAX) : t)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            multiline
            editable={!disabled}
            attachCtx={attachCtx}
            placeholder={disabled ? '' : 'Claude 에게 보낼 메시지'}
            placeholderTextColor={C.textDim}
            // 멀티라인 유지 — Enter 는 개행이고 전송은 버튼이다(폰에서 Enter=전송은 오폭이 잦다).
            style={{
              color: C.text, fontSize: 14, lineHeight: 20, padding: 0,
              maxHeight: 132, minHeight: 22, textAlignVertical: 'top',
            }}
          />
        </View>
        {/* 중단(Ctrl-C) — 전송 버튼을 대체하지 않는다: 작업 중에도 입력을 이어 보낼 수 있어야 한다
            (TUI 에서 타이핑이 큐에 쌓이는 것과 동일). 작업 중 추정일 때만 노출. */}
        {running && onStop ? (
          <PressableScale
            onPress={() => { haptic.keyPress(); onStop(); }}
            hitSlop={8}
            style={{ width: 36, height: 36, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.borderControl }}
          >
            <Stop size={16} color={C.text2} weight="fill" />
          </PressableScale>
        ) : null}
        <PressableScale
          onPress={() => { void send(); }}
          disabled={!canSend}
          hitSlop={8}
          style={{
            width: 36, height: 36, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center',
            backgroundColor: canSend ? C.accent : C.elevated2,
            borderWidth: canSend ? 0 : 1, borderColor: C.borderControl,
            opacity: canSend ? 1 : 0.6,
          }}
        >
          {busy ? <ActivityIndicator size="small" color={C.text2} /> : <ArrowUp size={17} color={canSend ? C.onAccent : C.textDim} weight="bold" />}
        </PressableScale>
      </View>
    </View>
  );
}
