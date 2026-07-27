import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, ActivityIndicator, Modal, Pressable } from 'react-native';
import { ArrowUp, Stop, Plus, Paperclip, FileCode, Microphone } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import KeyTextInput from '../../components/keyboard/KeyTextInput';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../animations/haptics';
import { pickAndUploadAttachments, subscribeAttachBusy, getAttachBusy } from '../../services/attachFlow';
import WorkspaceFileSheet from './WorkspaceFileSheet';
import { composerHasText, prettyModel, spliceSpeech } from './composer';
import { isSpeechAvailable, startSpeech, stopSpeech } from '../../services/speechInput';

// 채팅 컴포저 — 주류 AI 앱(Claude/ChatGPT/Gemini)과 같은 **한 덩어리 둥근 상자**(사용자 확정 2026-07-27,
//  참고 스크린샷 9장). 구조: 위=입력(위로 자란다) / 아래=컨트롤 행 [+] [모델칩] ···· [중단] [마이크] [전송].
//   · 입력과 버튼을 나란히 놓던 구 배치는 참고 앱 어디에도 없고, 포커스 테두리가 통짜 바처럼 보였다.
//   · 전송은 **원형 액센트(↑)** — 참고 앱 3종 전부 이 모양. 빈 입력에선 흐리게(누를 수 없음).
//   · 마이크는 모바일만(PC 웹뷰엔 음성 인식 API 가 없어 PC 는 버튼 자체를 두지 않는다 — 사용자 확정).
//     네이티브 모듈이 안 붙은 빌드에서는 **버튼을 숨긴다**(죽은 버튼 금지 — speechInput 상단 주석).
//   · PC 미러: `codingpt_pc/src/js/chat-view.js` 의 `.chat-box`/`.chat-ctl` + styles.css 같은 절.
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
/** 컨트롤 행 버튼 규격 — 터치 타깃은 hitSlop 으로 확보한다(상자 안이라 시각 크기는 작게). */
const BTN = 32;
/** 전송 버튼 — 원형. PC `.chat-send { width: 30px; border-radius: 999px }` 와 같은 형태. */
const SEND = 34;

export default function ChatComposer({
  draft, onDraftChange, onDraftAppend, onSend, onStop, busy, running, cwd, host, disabled, disabledHint,
  model, agentName,
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
  /** 이 대화의 모델(트랜스크립트 관측값) — 표시 전용 칩. 모르면 칩을 그리지 않는다. */
  model?: string | null;
  /** 에이전트 표시 이름(플레이스홀더 "Claude에게 요청"). 모르면 기본 문구. */
  agentName?: string;
}) {
  const C = v2.colors;
  const [focused, setFocused] = useState(false);
  const [menu, setMenu] = useState(false);
  const [fileSheet, setFileSheet] = useState(false);
  const sendingRef = useRef(false);
  const uploading = useSyncExternalStore(subscribeAttachBusy, getAttachBusy);
  // ── 음성 입력 ────────────────────────────────────────────────────────────
  // 네이티브 모듈 유무는 **마운트 때 한 번** 본다(런타임에 붙거나 사라지지 않는다).
  const micOk = useRef(isSpeechAvailable()).current;
  const [listening, setListening] = useState(false);
  const [micErr, setMicErr] = useState('');
  // 커서 위치 — STT 는 "커서 있는 곳에 채워" 준다(사용자 요구). 선택 변화를 추적해 두고 시작 시점의
  //  위치를 앵커로 고정한다(말하는 동안 사용자가 커서를 안 움직인다는 가정 없이 안전).
  const selRef = useRef(0);
  const anchorRef = useRef(0);
  const baseRef = useRef('');
  const draftRef = useRef(draft); draftRef.current = draft;
  const inputRef = useRef<any>(null);
  // 화면을 떠날 때 듣기를 반드시 멈춘다 — 안 멈추면 마이크가 백그라운드에서 계속 열린다.
  useEffect(() => () => { void stopSpeech(); }, []);

  const applySpeech = useCallback((text: string) => {
    const { value, cursor } = spliceSpeech(baseRef.current, anchorRef.current, text, DRAFT_MAX);
    onDraftChange(value);
    selRef.current = cursor;
  }, [onDraftChange]);

  const toggleMic = useCallback(async () => {
    haptic.keyPress();
    setMicErr('');
    if (listening) { await stopSpeech(); setListening(false); return; }
    // 시작 시점의 초안/커서를 앵커로 굳힌다(부분 결과가 매번 같은 자리를 덮어쓴다).
    baseRef.current = draftRef.current;
    anchorRef.current = selRef.current;
    setListening(true);
    const ok = await startSpeech({
      onText: (t) => applySpeech(t),
      onError: (m) => { setMicErr(m); setListening(false); },
      onDone: () => setListening(false),
    });
    if (!ok) setListening(false);
  }, [listening, applySpeech]);

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

  const canSend = composerHasText(draft) && !busy && !disabled;
  const modelLabel = prettyModel(model);

  return (
    <View style={{
      flexShrink: 0, backgroundColor: C.surface,
      paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10,
    }}>
      {disabled && disabledHint ? (
        <Text style={{ color: C.textDim, fontSize: 11.5, marginBottom: 6 }}>{disabledHint}</Text>
      ) : null}
      {micErr ? (
        <Text style={{ color: C.textDim, fontSize: 11.5, marginBottom: 6 }}>{micErr}</Text>
      ) : null}
      {/* ── 한 덩어리 둥근 상자: 입력(위) + 컨트롤 행(아래) ── */}
      <View style={{
        borderWidth: 1, borderRadius: 20, backgroundColor: C.elevated2,
        // 포커스는 상자 테두리로만 표현한다(입력에 별도 테두리 금지 = "최초 모습" 지적의 원인).
        borderColor: focused ? C.border : C.borderControl,
        paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8, gap: 6,
      }}>
        <KeyTextInput
          ref={inputRef}
          value={draft}
          onChangeText={(t) => onDraftChange(t.length > DRAFT_MAX ? t.slice(0, DRAFT_MAX) : t)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // 커서 위치 추적 — 음성 입력이 "커서 있는 곳"에 채우기 위한 유일한 재료.
          onSelectionChange={(e: any) => { selRef.current = e?.nativeEvent?.selection?.start ?? draftRef.current.length; }}
          multiline
          editable={!disabled}
          // 채팅 인풋 포커스 중엔 보조키 바를 띄우지 않는다(터미널/IDE/일반 인풋은 그대로).
          noBar
          placeholder={disabled ? '' : (agentName ? `${agentName}에게 요청` : '메시지 보내기')}
          placeholderTextColor={C.textDim}
          // 멀티라인 유지 — Enter 는 개행이고 전송은 버튼이다(폰에서 Enter=전송은 오폭이 잦다).
          style={{
            color: C.text, fontSize: 15, lineHeight: 21, padding: 0,
            maxHeight: 148, minHeight: 24, textAlignVertical: 'top',
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* [+] — 첨부/워크스페이스 파일. 업로드 중엔 스피너(같은 버튼 자리 유지). */}
          <PressableScale
            onPress={() => { haptic.keyPress(); setMenu(true); }}
            disabled={!!disabled || uploading}
            hitSlop={10}
            baseOpacity={disabled ? 0.5 : 1}
            accessibilityRole="button"
            accessibilityLabel="파일 넣기"
            style={{ width: BTN, height: BTN, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
          >
            {uploading ? <ActivityIndicator size="small" color={C.text2} /> : <Plus size={19} color={C.text2} weight="bold" />}
          </PressableScale>
          {/* 모델 칩 — **표시 전용**(우리가 모델을 정하지 않는다. 관측값이고, 모르면 없다). */}
          {modelLabel ? (
            <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: C.elevated }}>
              <Text numberOfLines={1} style={{ color: C.text3, fontSize: 11.5 }}>{modelLabel}</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {/* 중단(Ctrl-C) — 전송 버튼을 대체하지 않는다: 작업 중에도 입력을 이어 보낼 수 있어야 한다
              (TUI 에서 타이핑이 큐에 쌓이는 것과 동일). 작업 중 추정일 때만 노출. */}
          {running && onStop ? (
            <PressableScale
              onPress={() => { haptic.keyPress(); onStop(); }}
              hitSlop={10}
              accessibilityLabel="중단"
              style={{ width: BTN, height: BTN, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated }}
            >
              <Stop size={15} color={C.text2} weight="fill" />
            </PressableScale>
          ) : null}
          {/* 마이크 — 눌러서 음성 입력 시작, 한 번 더 눌러 종료(사용자 확정). 듣는 중엔 채워진 글리프.
              ★ 네이티브 모듈이 안 붙은 빌드에서는 렌더하지 않는다(죽은 버튼 금지). */}
          {micOk ? (
            <PressableScale
              onPress={() => { void toggleMic(); }}
              disabled={!!disabled}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={listening ? '음성 입력 종료' : '음성으로 입력'}
              style={{
                width: BTN, height: BTN, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                backgroundColor: listening ? C.elevated : 'transparent',
              }}
            >
              <Microphone size={19} color={listening ? C.accent : C.text2} weight={listening ? 'fill' : 'regular'} />
            </PressableScale>
          ) : null}
          <PressableScale
            onPress={() => { void send(); }}
            disabled={!canSend}
            hitSlop={10}
            // 흐림은 baseOpacity 로 — style.opacity 는 PressableScale 의 animStyle 에 덮인다(과거 실사고).
            //  숨기지 않고 흐리게 두는 이유: 버튼 위치 학습을 깨지 않는다(PC 와 같은 규칙).
            baseOpacity={canSend ? 1 : 0.38}
            accessibilityRole="button"
            accessibilityLabel="보내기"
            style={{
              width: SEND, height: SEND, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
              backgroundColor: C.accent,
            }}
          >
            {busy ? <ActivityIndicator size="small" color={C.onAccent} /> : <ArrowUp size={18} color={C.onAccent} weight="bold" />}
          </PressableScale>
        </View>
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
