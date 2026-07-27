import React, { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, ActivityIndicator, Modal, Pressable } from 'react-native';
import { ArrowUp, Stop, Plus, Paperclip, FileCode } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import KeyTextInput from '../../components/keyboard/KeyTextInput';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../animations/haptics';
import { pickAndUploadAttachments, subscribeAttachBusy, getAttachBusy } from '../../services/attachFlow';
import WorkspaceFileSheet from './WorkspaceFileSheet';

// 채팅 컴포저 — [+] · 멀티라인 입력 · 전송(chat.input) · 중단(Ctrl-C). 일반 에이전트 앱 배치.
//
// 함정(둘 다 과거 실사고):
//  · **이중 인셋 금지**: 셸(IndexScreen)이 이미 useKeyAssistInset() 만큼 위로 밀려 있으므로 여기서
//    KeyboardAvoidingView/insets.bottom 을 또 쓰면 빈 띠가 생긴다 → 고정 padding 만.
//  · **터미널 크기 주장 금지**: 키보드가 뜨며 pane 높이가 바뀌어도 fit()/claim 을 호출하지 않는다
//    (PaneView 가 chat 모드에서 onBodyLayout 을 조기 return 한다 — 리사이즈 폭발 방어).
//
// KeyAssist 연동(2026-07-27 변경): 이 인풋은 `noBar` 타깃이다 — 포커스 중 보조키 바/특수키 패널을
//  띄우지 않는다(사용자 확정: 채팅은 일반 채팅앱처럼, 터미널에서는 그대로 나온다).
//  ★ 타깃 등록 자체는 유지된다(KeyTextInput 이 등록). 등록을 빼면 iOS 에서 인셋이 0 이 되어 키보드가
//   컴포저를 덮는다 — `components/keyboard/keyAssistInset.ts` 상단 주석이 그 함정의 정본이다.
//  ★ 보조바가 사라지면서 없어진 **파일 첨부 버튼은 좌측 `+` 로 이관**했다(같은 attachFlow 한 벌).

const DRAFT_MAX = 4096;
const BTN = 36; // 좌측 + / 우측 전송·중단 버튼 규격(동일)

export default function ChatComposer({
  draft, onDraftChange, onDraftAppend, onSend, onStop, busy, running, cwd, host, disabled, disabledHint,
}: {
  draft: string;
  onDraftChange: (t: string) => void;
  /** `+` 로 넣은 경로 — 즉시 영속(언마운트 레이스로 유실되면 안 된다). 없으면 onDraftChange 로 폴백. */
  onDraftAppend?: (t: string) => void;
  onSend: (text: string) => Promise<void> | void;
  onStop?: () => void;
  /** 전송 RPC 진행 중 */
  busy?: boolean;
  /** 에이전트가 지금 작업 중(추정) — 중단 버튼을 함께 노출. 전송은 계속 가능(TUI 처럼 큐잉된다). */
  running?: boolean;
  /** 워크스페이스 루트(홈-기준 상대) — `+` 의 워크스페이스 파일 목록 루트 */
  cwd: string;
  /** 이 워크스페이스의 호스트 PC(hostDeviceId) — 첨부 업로드/파일 목록 대상 */
  host: number | null;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const C = v2.colors;
  const [focused, setFocused] = useState(false);
  const [menu, setMenu] = useState(false);
  const [fileSheet, setFileSheet] = useState(false);
  const sendingRef = useRef(false);
  const uploading = useSyncExternalStore(subscribeAttachBusy, getAttachBusy);

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

  // `+` 삽입 — 커서 위치를 추적하지 않고 **초안 끝에 덧붙인다**(경로는 문장 어디에 와도 에이전트가 읽는다).
  //  KeyTextInput.insertText(커서 삽입)는 KeyAssist 타깃 경로 전용이라 여기서 쓰면 포커스 상태에 의존한다.
  const appendText = useCallback((t: string) => {
    const cur = draft;
    const sep = !cur || /\s$/.test(cur) ? '' : ' ';
    const next = `${cur}${sep}${t}`;
    const clamped = next.length > DRAFT_MAX ? next.slice(0, DRAFT_MAX) : next;
    // 즉시 영속 경로가 있으면 그것을 쓴다 — 업로드가 끝나기 전에 컴포저가 언마운트되면 디바운스
    //  영속만으로는 방금 고른 경로가 유실된다(ChatBody.onDraftAppend 주석 참조).
    (onDraftAppend || onDraftChange)(clamped);
  }, [draft, onDraftChange, onDraftAppend]);
  // 최신 초안을 보는 삽입 — 업로드는 수 초 걸리므로 콜백이 캡처한 옛 초안에 덧붙이면 그 사이 타이핑이 날아간다.
  const appendRef = useRef(appendText); appendRef.current = appendText;

  const onAttach = useCallback(() => {
    setMenu(false);
    void pickAndUploadAttachments({ host, insert: (t) => appendRef.current(t) });
  }, [host]);

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
        {/* [+] — 첨부/워크스페이스 파일. 업로드 중엔 스피너(같은 버튼 자리 유지). */}
        <PressableScale
          onPress={() => { haptic.keyPress(); setMenu(true); }}
          disabled={!!disabled || uploading}
          hitSlop={8}
          baseOpacity={disabled ? 0.5 : 1}
          accessibilityRole="button"
          accessibilityLabel="파일 넣기"
          style={{
            width: BTN, height: BTN, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center',
            backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.borderControl,
          }}
        >
          {uploading ? <ActivityIndicator size="small" color={C.text2} /> : <Plus size={18} color={C.text2} weight="bold" />}
        </PressableScale>
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
            // 채팅 인풋 포커스 중엔 보조키 바를 띄우지 않는다(터미널/IDE/일반 인풋은 그대로).
            noBar
            placeholder={disabled ? '' : '메시지'}
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
            style={{ width: BTN, height: BTN, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.borderControl }}
          >
            <Stop size={16} color={C.text2} weight="fill" />
          </PressableScale>
        ) : null}
        <PressableScale
          onPress={() => { void send(); }}
          disabled={!canSend}
          hitSlop={8}
          // 흐림은 baseOpacity 로 — style.opacity 는 PressableScale 의 animStyle 에 덮인다(과거 실사고).
          baseOpacity={canSend ? 1 : 0.6}
          style={{
            width: BTN, height: BTN, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center',
            backgroundColor: canSend ? C.accent : C.elevated2,
            borderWidth: canSend ? 0 : 1, borderColor: C.borderControl,
          }}
        >
          {busy ? <ActivityIndicator size="small" color={C.text2} /> : <ArrowUp size={17} color={canSend ? C.onAccent : C.textDim} weight="bold" />}
        </PressableScale>
      </View>

      {/* `+` 메뉴 — 항목 2개(설명 문구 없음). 배경 터치로 닫힘. */}
      <Modal visible={menu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.5)' }} onPress={() => setMenu(false)} />
        <View style={{
          position: 'absolute', left: 10, right: 10, bottom: 10, backgroundColor: C.surface,
          borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, overflow: 'hidden',
        }}>
          <MenuRow icon={<Paperclip size={17} color={C.text2} />} label="사진·파일 첨부" onPress={onAttach} />
          <View style={{ height: 1, backgroundColor: C.border }} />
          <MenuRow icon={<FileCode size={17} color={C.text2} />} label="워크스페이스 파일" onPress={() => { setMenu(false); setFileSheet(true); }} />
        </View>
      </Modal>

      {/* 워크스페이스 파일 → 상대경로를 초안에 삽입(에이전트가 그 경로를 읽는다). */}
      <WorkspaceFileSheet
        visible={fileSheet}
        onClose={() => setFileSheet(false)}
        root={cwd}
        host={host}
        onPick={(rels) => appendRef.current(rels.map((r) => `'${r}'`).join(' ') + ' ')}
      />
    </View>
  );
}

function MenuRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const C = v2.colors;
  return (
    <Pressable
      onPress={() => { haptic.keyPress(); onPress(); }}
      android_ripple={{ color: C.elevated2 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52 }}
    >
      {icon}
      <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
