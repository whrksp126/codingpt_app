import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, ActivityIndicator, Pressable, Image } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { ArrowUp, Stop, Plus, Paperclip, FolderOpen, Camera, Images, Microphone, X, CaretDown, File as FileIcon } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import KeyTextInput from '../../components/keyboard/KeyTextInput';
import PressableScale from '../../components/ui/PressableScale';
import PressableRow from '../../components/ui/PressableRow';
import Sheet from '../../components/ui/Sheet';
import { haptic } from '../../animations/haptics';
import { pickAndUploadAttachments, subscribeAttachBusy, getAttachBusy } from '../../services/attachFlow';
import ProjectFileSheet from './ProjectFileSheet';
import AgentModeSheet from './AgentModeSheet';
import { agentModeView, slashQuery, type AgentMode, type AgentModeItem, type SlashCommand } from '../chatModel';
import { composerHasText, snapAttachTokens, snapCaretOutOfToken, spliceSpeech, type AttachEntry } from './composer';
import { getCurrentSttProvider, CODING_TERMS } from '../../services/stt';
import { isNativeSpeechLinked } from '../../services/stt/nativeSpeech';
import MicSpectrum from './MicSpectrum';
import SlashPalette from './SlashPalette';
import * as i18n from '../../i18n/index.ts';

// 채팅 컴포저 — 주류 AI 앱(Claude/ChatGPT/Gemini)과 같은 **한 덩어리 둥근 상자**(사용자 확정 2026-07-27,
//  참고 스크린샷 9장). 구조: 위=입력(위로 자란다) / 아래=컨트롤 행 [+] ···· [중단] [마이크] [전송].
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
const SEND = 30;

export default function ChatComposer({
  draft, onDraftChange, onDraftAppend, onSend, onStop, busy, running, cwd, host, disabled, disabledHint,
  agentName, placeholderOverride, attachReg, onAttachAdd, onAttachRemove, onPreviewLocal,
  mode, modeBusy, onPickMode, commands, commandsLoading, onNeedCommands, stopReplacesSend, modeChoices,
  ctlLeft, ctlRight,
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
  /** 에이전트 표시 이름(플레이스홀더 "Claude에게 요청"). 모르면 기본 문구. */
  agentName?: string;
  /** 질문이 떠 있을 때 등, 입력의 의미가 바뀌는 경우의 안내 문구. */
  placeholderOverride?: string;
  /** 첨부 칩 레지스트리(ChatBody 소유) — 입력칸 토큰([사진 N])과 짝, 스트립 썸네일의 근거. */
  attachReg?: AttachEntry[];
  /** 업로드 완료 항목 등록 → 토큰이 채워진 엔트리 배열 반환(입력칸 삽입은 여기 컴포저가 한다). */
  onAttachAdd?: (items: { path: string; name: string; image: boolean; base64?: string }[]) => AttachEntry[];
  onAttachRemove?: (token: string) => void;
  /** 스트립 칩 탭 미리보기(로컬 base64) — ChatBody 의 모달을 연다. */
  onPreviewLocal?: (a: AttachEntry) => void;
  /** 에이전트 권한 모드(TUI shift+tab) — 없으면 알약을 그리지 않는다(codex 등 미지원/판정 불가). */
  mode?: AgentMode | null;
  /** 전환 요청 진행 중 */
  modeBusy?: boolean;
  /** 모드 선택 — ChatBody 가 chat.mode RPC 를 부른다(성공/실패 표시도 그쪽). */
  onPickMode?: (id: string) => void;
  /** 슬래시 명령 목록(없으면 아직 안 불러온 것) — ChatBody 가 chat.commands 로 받는다. */
  commands?: SlashCommand[] | null;
  commandsLoading?: boolean;
  /** `/` 를 처음 칠 때 목록을 요청한다(열기 전엔 부르지 않는다 — 쓸데없는 왕복 금지). */
  onNeedCommands?: () => void;
  /**
   * 채팅 v2(구조화 대화) — 작업 중이고 입력칸이 비어 있으면 **전송 버튼 자리가 중단 버튼**이 된다
   *  (chat-v2-design.md §10.3). 글자가 있으면 다시 전송 버튼이다(보내면 대기열에 들어간다).
   *  미지정(v1 터미널 채팅)은 예전 그대로 — 중단 버튼이 전송 버튼 옆에 따로 선다.
   */
  stopReplacesSend?: boolean;
  /** 모드 시트의 선택지(채팅 v2 — 사람이 읽는 이름). 미지정이면 v1 카탈로그(TUI 원문 라벨). */
  modeChoices?: AgentModeItem[];
  /** 컨트롤 행 확장 슬롯 — 채팅 v2 가 [더 보기] 와 [모델·컨텍스트] 를 여기에 건다(PC 도구줄과 같은 배치). */
  ctlLeft?: React.ReactNode;
  ctlRight?: React.ReactNode;
}) {
  const C = v2.colors;
  const [focused, setFocused] = useState(false);
  const [menu, setMenu] = useState(false);
  const [fileSheet, setFileSheet] = useState(false);
  const [modeSheet, setModeSheet] = useState(false);
  const sendingRef = useRef(false);
  const uploading = useSyncExternalStore(subscribeAttachBusy, getAttachBusy);
  // 알약 표시값 — 데몬이 준 label/symbol 우선, 없으면 카탈로그로 메운다(모르는 모드면 null = 숨김).
  const modeView = agentModeView(mode || null);
  // ── 음성 입력 ────────────────────────────────────────────────────────────
  // ★ 보조키 패널의 STT 와 **완전히 같은 엔진**을 쓴다(`services/stt` = 자체 네이티브 모듈 CptSpeech:
  //  iOS SFSpeechRecognizer / Android SpeechRecognizer + 코딩 용어 바이어스). 처음엔 서드파티
  //  `@react-native-voice/voice` 로 따로 붙였는데, 사용자가 "패널 STT 는 빠르고 정확한데 채팅은
  //  제대로 안 된다"고 지적했다 — 당연하다, 엔진이 달랐다. 그 의존성은 제거했다.
  //  · provider 는 사용자가 패널에서 고른 것(getCurrentSttProvider)을 그대로 따른다.
  //  · 연속 인식(세그먼트 자동 재시작)은 네이티브가 처리하므로 여기서 재시작 로직을 갖지 않는다.
  // 받아쓰기 규칙(앵커·부분 덮어쓰기·최종 커밋·언마운트 시 정지·레벨 ref)은 훅 한 벌에 있다 —
  //  새 작업 시트(NewTaskSheet)도 같은 훅을 쓴다(두 벌이면 한쪽만 고쳐진다).
  const { micOk, listening, micErr, micLevelRef, selRef, toggleMic } = useMicDictation(draft, onDraftChange, DRAFT_MAX);
  const draftRef = useRef(draft); draftRef.current = draft;
  const inputRef = useRef<any>(null);

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

  // 첨부 3갈래 — 전부 같은 업로드 플로우(attachFlow) 한 벌을 쓴다. `source` 만 다르다:
  //  'files'  = 기기의 네이티브 파일 탐색기(사용자 요구: "네이티브 파일 탐색기를 열게 해서 직접 찾아서")
  //  'camera' = 촬영 / 'gallery' = 갤러리
  const regRef = useRef(attachReg); regRef.current = attachReg;
  const onAttach = useCallback((source: 'files' | 'camera' | 'gallery') => {
    setMenu(false);
    void pickAndUploadAttachments({
      host,
      insert: (t) => appendRef.current(t), // insertRich 미지원 폴백(경로 텍스트)
      insertRich: onAttachAdd ? (items) => {
        const added = onAttachAdd(items);
        appendRef.current(added.map((a) => a.token).join(' ') + ' ');
      } : undefined,
      source,
    });
  }, [host, onAttachAdd]);

  // 토큰 원자성(스냅): 편집으로 토큰이 조금이라도 깨지면 잔해째 걷고 레지스트리에서도 지운다.
  const changeText = useCallback((t: string) => {
    const next = t.length > DRAFT_MAX ? t.slice(0, DRAFT_MAX) : t;
    const tokens = (regRef.current || []).map((a) => a.token);
    if (tokens.length) {
      const snapped = snapAttachTokens(next, tokens);
      if (snapped.removed.length) {
        for (const tok of snapped.removed) onAttachRemove?.(tok);
        onDraftChange(snapped.text);
        return;
      }
    }
    onDraftChange(next);
  }, [onDraftChange, onAttachRemove]);
  // 커서가 토큰 내부로 들어가면 끝으로 스냅 — 토큰 안 타이핑(파괴)을 예방한다.
  const onSel = useCallback((e: any) => {
    const start = e?.nativeEvent?.selection?.start ?? 0;
    const end = e?.nativeEvent?.selection?.end ?? start;
    selRef.current = start;
    if (start !== end) return; // 범위 선택은 존중(삭제 시 스냅이 잔해를 걷는다)
    const tokens = (regRef.current || []).map((a) => a.token);
    if (!tokens.length) return;
    const snapped = snapCaretOutOfToken(draftRef.current, start, tokens);
    if (snapped !== start) {
      try { inputRef.current?.setNativeProps({ selection: { start: snapped, end: snapped } }); } catch (_) { /* noop */ }
      selRef.current = snapped;
    }
  }, [selRef]); // selRef = 훅이 준 안정 ref(값이 바뀌지 않는다)

  // ── 슬래시 명령 팔레트 ────────────────────────────────────────────────────
  // 초안 전체가 `/토큰` 한 개일 때만 뜬다(공백을 치면 인자 모드 → 닫힌다). 판정은 chatModel 이 정본.
  const slashQ = disabled ? null : slashQuery(draft);
  const needRef = useRef(false);
  useEffect(() => {
    // 목록은 `/` 를 실제로 칠 때 한 번만 요청한다(채팅을 열 때마다 미리 받지 않는다).
    if (slashQ != null && !needRef.current) { needRef.current = true; onNeedCommands?.(); }
  }, [slashQ, onNeedCommands]);

  const pickCommand = useCallback((name: string) => {
    // 채워넣기 = 이름 + 공백 한 칸. 인자를 이어 치거나 그대로 전송한다(실행은 사용자가 한 번 더).
    onDraftChange(`${name} `);
    setTimeout(() => { try { inputRef.current?.focus?.(); } catch (_) { /* noop */ } }, 0);
  }, [onDraftChange]);

  const canSend = composerHasText(draft) && !busy && !disabled;
  // v2: 전송 버튼 자리를 중단이 차지하는가 — 작업 중 + 보낼 글 없음.
  const stopInSlot = !!stopReplacesSend && !!running && !!onStop && !composerHasText(draft);

  return (
    // 배경을 **대화 본문과 같은 색**으로 둔다(사용자 확정 2026-07-27): 별색 띠는 "영역이 나뉜 것"으로
    //  읽혀 터미널/대화와 컴포저가 다른 화면처럼 보였다. 입력 상자만 살짝 떠 있으면 충분하다.
    <View style={{
      flexShrink: 0, backgroundColor: 'transparent',
      paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10,
    }}>
      {disabled && disabledHint ? (
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginBottom: 6 }}>{disabledHint}</Text>
      ) : null}
      {micErr ? (
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginBottom: 6 }}>{micErr}</Text>
      ) : null}
      {/* 슬래시 팔레트 — 컴포저 바로 위(키보드가 올라온 상태에서 손가락과 가장 가깝다). */}
      {slashQ != null ? (
        <SlashPalette query={slashQ} items={commands ?? null} loading={commandsLoading} onPick={pickCommand} />
      ) : null}
      {/* ── 한 덩어리 둥근 상자: 입력(위) + 컨트롤 행(아래) ── */}
      <View style={{
        borderWidth: 1, borderRadius: v2.radius.composer, backgroundColor: C.elevated,
        // 포커스는 상자 테두리로만 표현한다(입력에 별도 테두리 금지 = "최초 모습" 지적의 원인).
        //  포커스 = 한 단 **진하게**(borderStrong). 예전엔 포커스 때 오히려 흐려지는 반전 버그였다(설계 §0.7).
        borderColor: focused ? C.borderStrong : C.borderControl,
        paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8, gap: 6,
      }}>
        <KeyTextInput
          ref={inputRef}
          value={draft}
          onChangeText={changeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // 커서 추적(음성 입력 앵커) + 토큰 내부 진입 스냅(첨부 토큰 원자성).
          onSelectionChange={onSel}
          multiline
          editable={!disabled}
          // 채팅 인풋 포커스 중엔 보조키 바를 띄우지 않는다(터미널/IDE/일반 인풋은 그대로).
          noBar
          placeholder={disabled ? '' : (placeholderOverride || (agentName ? i18n.t('{name}에게 요청', { name: agentName }) : i18n.t('메시지 보내기')))}
          placeholderTextColor={C.textDim}
          // 멀티라인 유지 — Enter 는 개행이고 전송은 버튼이다(폰에서 Enter=전송은 오폭이 잦다).
          style={{
            color: C.text, fontSize: v2.font.size.body, lineHeight: 21, padding: 0, fontFamily: v2.font.sans,
            maxHeight: 148, minHeight: 24, textAlignVertical: 'top',
          }}
        />
        {/* 첨부 칩 스트립 — 입력칸 토큰([사진 N])과 짝. 탭=미리보기, ✕=토큰+레지스트리 제거 */}
        {attachReg && attachReg.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {attachReg.filter((a) => draft.includes(a.token)).map((a) => (
              <Pressable
                key={a.token}
                onPress={() => { if (a.image && a.base64) onPreviewLocal?.(a); }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  borderRadius: v2.radius.sm, backgroundColor: C.elevated2, paddingHorizontal: 6, paddingVertical: 3,
                }}
              >
                {a.image && a.base64 ? (
                  <Image source={{ uri: `data:image/*;base64,${a.base64}` }} style={{ width: 24, height: 24, borderRadius: v2.radius.xs }} />
                ) : (
                  <FileIcon size={14} color={C.text3} />
                )}
                <Text numberOfLines={1} style={{ color: C.text2, fontSize: v2.font.size.caption, fontWeight: '500', maxWidth: 90 }}>{a.token}</Text>
                <Pressable
                  onPress={() => {
                    onAttachRemove?.(a.token);
                    onDraftChange(draftRef.current.split(a.token + ' ').join('').split(a.token).join(''));
                  }}
                  hitSlop={8}
                  accessibilityLabel={i18n.t('첨부 빼기')}
                >
                  <X size={12} color={C.text3} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* [+] — 첨부/워크스페이스 파일. 업로드 중엔 스피너(같은 버튼 자리 유지). */}
          <PressableScale
            onPress={() => { haptic.keyPress(); setMenu(true); }}
            disabled={!!disabled || uploading}
            hitSlop={10}
            baseOpacity={disabled ? 0.5 : 1}
            accessibilityRole="button"
            accessibilityLabel={i18n.t('파일 넣기')}
            style={{ width: BTN, height: BTN, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}
          >
            {uploading ? <ActivityIndicator size="small" color={C.text2} /> : <Plus size={19} color={C.text2} weight="bold" />}
          </PressableScale>
          {ctlLeft}
          {/* 에이전트 모드 알약 — 지금 모드(TUI 원문 라벨)를 보여주고 탭하면 바텀시트로 바꾼다.
              PC 미러: `.chat-mode`(컴포저 컨트롤 행, `+` 오른쪽). 모르면(=null) 아예 그리지 않는다. */}
          {modeView ? (
            <PressableScale
              onPress={() => { haptic.keyPress(); setModeSheet(true); }}
              disabled={!!disabled || !!modeBusy}
              hitSlop={8}
              baseOpacity={modeBusy ? 0.55 : 1}
              accessibilityRole="button"
              accessibilityLabel={i18n.t('에이전트 모드: {mode}', { mode: modeView.label })}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 190,
                // 듣는 중엔 스펙트럼에 자리를 내준다(알약이 먼저 줄어든다 — 파형이 뭉개지면 의미가 없다).
                flexShrink: 1, minWidth: 0,
                height: 28, paddingHorizontal: 9, borderRadius: 999,
                borderWidth: 1, borderColor: C.borderControl,
              }}
            >
              <Text numberOfLines={1} style={{ color: C.text2, fontSize: v2.font.size.caption, fontWeight: '500' }}>{modeView.label}</Text>
              {modeBusy
                ? <ActivityIndicator size="small" color={C.text3} />
                : <CaretDown size={10} color={C.textDim} weight="bold" />}
            </PressableScale>
          ) : null}
          {/* 듣는 중이면 이 자리(모드 알약 ↔ 마이크 사이)가 수음 스펙트럼이 된다
              = [+][mode][파형][마이크][보내기]. 평소엔 그냥 빈 공간(스페이서). */}
          {listening ? <MicSpectrum active levelRef={micLevelRef} /> : <View style={{ flex: 1 }} />}
          {ctlRight}
          {/* 중단(Ctrl-C) — 전송 버튼을 대체하지 않는다: 작업 중에도 입력을 이어 보낼 수 있어야 한다
              (TUI 에서 타이핑이 큐에 쌓이는 것과 동일). 작업 중 추정일 때만 노출. */}
          {running && onStop && !stopReplacesSend ? (
            <PressableScale
              onPress={() => { haptic.keyPress(); onStop(); }}
              hitSlop={10}
              accessibilityLabel={i18n.t('중단')}
              style={{ width: BTN, height: BTN, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated2 }}
            >
              <Stop size={15} color={C.text2} weight="fill" />
            </PressableScale>
          ) : null}
          {/* 마이크 — 눌러서 음성 입력 시작, 한 번 더 눌러 **종료**(사용자 확정 2026-08-02).
              듣는 중엔 액센트 알약(채워진 글리프) — "지금 켜져 있고, 누르면 꺼진다"가 한눈에 보여야 한다.
              ★ 네이티브 모듈이 안 붙은 빌드에서는 렌더하지 않는다(죽은 버튼 금지). */}
          {micOk ? (
            <PressableScale
              onPress={() => { void toggleMic(); }}
              disabled={!!disabled}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={listening ? i18n.t('음성 입력 종료') : i18n.t('음성으로 입력')}
              style={{
                width: BTN, height: BTN, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                // 켜짐은 **명암**으로만 말한다(색 규율 2026-07-28) — 배경 한 단 밝게 + 채운 글리프.
                backgroundColor: listening ? C.elevated2 : 'transparent',
              }}
            >
              <Microphone size={19} color={listening ? C.text : C.text2} weight={listening ? 'fill' : 'regular'} />
            </PressableScale>
          ) : null}
          <PressableScale
            onPress={() => { if (stopInSlot) { haptic.keyPress(); onStop?.(); } else void send(); }}
            disabled={stopInSlot ? false : !canSend}
            hitSlop={10}
            // 비활성은 흐림 대신 **한 단 가라앉은 면**(elevated2 + textDim 글리프 — 설계 §0.7).
            //  style.opacity 는 PressableScale 의 animStyle 에 덮이므로 투명도는 baseOpacity 로만 준다(과거 실사고).
            //  숨기지 않는 이유: 버튼 위치 학습을 깨지 않는다(PC 와 같은 규칙).
            baseOpacity={1}
            accessibilityRole="button"
            accessibilityLabel={stopInSlot ? i18n.t('중단') : i18n.t('보내기')}
            style={{
              width: SEND, height: SEND, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
              // 전송 = text 채움/base 화살표 · 중단 = text2 채움 · 비활성 = elevated2 + textDim
              backgroundColor: stopInSlot ? C.text2 : canSend || busy ? C.text : C.elevated2,
            }}
          >
            {/* 전송 ↔ 중단 전환 — 같은 자리의 글리프만 바뀐다. key 로 갈아 끼워 짧게 튀어나오게 한다
                (버튼이 통째로 사라졌다 나타나면 손가락 아래에서 자리가 흔들린다). */}
            {busy ? <ActivityIndicator size="small" color={C.base} /> : stopInSlot ? (
              <Animated.View key="stop" entering={ZoomIn.duration(140)}><Stop size={14} color={C.base} weight="fill" /></Animated.View>
            ) : stopReplacesSend ? (
              <Animated.View key="send" entering={ZoomIn.duration(140)}><ArrowUp size={16} color={canSend ? C.base : C.textDim} weight="bold" /></Animated.View>
            ) : <ArrowUp size={16} color={canSend ? C.base : C.textDim} weight="bold" />}
          </PressableScale>
        </View>
      </View>

      {/* `+` 메뉴 — 4갈래(사용자 확정 2026-07-27 3차). "바로 파일 탐색기" 로 갔다가 되돌아온 이유:
          출처가 실제로 넷이라 한 화면으로 합칠 수 없다(프로젝트 파일은 **원격 PC**에, 나머지는 이 폰에).
          · 프로젝트에서 선택 = 워크스페이스 컬럼뷰(원격 PC 파일 — 경로가 그대로 에이전트에게 간다)
          · 기기에서 선택 = 이 폰의 네이티브 파일 탐색기 → 업로드 후 경로 삽입
          · 촬영 / 갤러리 = 카메라·사진 */}
      <Sheet visible={menu} onClose={() => setMenu(false)} paddingHorizontal={8}>
        <View>
          {/* 라벨은 **한국어 원문**을 넘긴다 — 번역은 MenuRow 가 한다(원문이 곧 사전의 키다).
              PC 대조 테스트(codingpt_pc/test/chat-composer.mjs)가 이 네 줄의 원문과 순서를 읽는다. */}
          <MenuRow icon={<FolderOpen size={20} color={C.text2} />} label="프로젝트에서 선택" onPress={() => { setMenu(false); setFileSheet(true); }} />
          <MenuRow icon={<Paperclip size={20} color={C.text2} />} label="기기에서 선택" onPress={() => onAttach('files')} />
          <MenuRow icon={<Camera size={20} color={C.text2} />} label="촬영" onPress={() => onAttach('camera')} />
          <MenuRow icon={<Images size={20} color={C.text2} />} label="갤러리" onPress={() => onAttach('gallery')} />
        </View>
      </Sheet>

      {/* 워크스페이스 파일 → 상대경로를 초안에 삽입(에이전트가 그 경로를 읽는다). */}
      <ProjectFileSheet
        visible={fileSheet}
        onClose={() => setFileSheet(false)}
        root={cwd}
        host={host}
        onPick={(rels) => appendRef.current(rels.map((r) => `'${r}'`).join(' ') + ' ')}
      />
      <AgentModeSheet
        visible={modeSheet}
        onClose={() => setModeSheet(false)}
        current={mode || null}
        choices={modeChoices}
        busy={!!modeBusy}
        onPick={(id) => { setModeSheet(false); onPickMode?.(id); }}
      />
    </View>
  );
}

/** `+` 메뉴 한 줄. label = 한국어 원문(사전의 키) — 여기서 지금 언어로 바꿔 그린다. */
function MenuRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const C = v2.colors;
  return (
    <PressableRow
      onPress={() => { haptic.keyPress(); onPress(); }}
      accessibilityLabel={i18n.t(label)}
      minHeight={48}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 }}
    >
      {icon}
      <Text style={{ color: C.text, fontSize: v2.font.size.body, fontWeight: '500', fontFamily: v2.font.sans }}>{i18n.t(label)}</Text>
    </PressableRow>
  );
}

// ── 받아쓰기(STT) 훅 ───────────────────────────────────────────────────────────
// 입력칸 받아쓰기의 **정본이 여기 있다**. 새 작업 시트·한 줄 지시 시트도 같은 훅을 쓴다 —
//  `hooks/useMicDictation.ts` 가 이것을 그대로 다시 내보낸다(구현은 한 벌).
//
// 왜 컴포저 파일에 두는가: PC 대조 테스트(codingpt_pc/test/chat-composer.mjs)가 **이 파일**에서 아래 규칙을
//  읽어 고정한다 — ① 보조키 패널과 같은 엔진(services/stt provider) ② 같은 코딩 용어 바이어스
//  ③ 최종 결과에서 앵커를 커밋한다. 훅을 다른 파일로 빼면 그 대조가 실패한다(한동안 앱 쪽 import 하나 때문에
//  그 절이 통째로 건너뛰어져 아무도 몰랐다).
//
//  1) 엔진 = 보조키 패널 STT 와 같은 services/stt(자체 네이티브 CptSpeech + 코딩 용어 바이어스).
//     provider 는 사용자가 패널에서 고른 것(getCurrentSttProvider)을 그대로 따른다.
//  2) "커서 있는 곳에 채운다" — 시작 시점의 커서를 앵커로 굳힌다. 부분 결과는 같은 자리를 덮어쓰고,
//     최종 결과가 오면 그 지점을 새 앵커로 **커밋**한다. 커밋이 없으면 연속 발화에서 두 번째 문장이 첫 문장을
//     덮어써 앞서 말한 내용이 사라진다(사용자 실측 신고 2026-07-27).
//  3) 화면을 떠날 때 듣기를 반드시 멈춘다 — 안 멈추면 마이크가 백그라운드에서 계속 열린다.
//  4) 회복 가능한 종료(무음·타임아웃)는 네이티브가 재시작한다 → 여기서 원문 오류를 띄우지 않는다.
//  5) 듣는 언어는 **앱 언어**를 따른다(i18n.speechLocale). 한 언어로 굳혀 두면 다른 언어 사용자의 말이
//     그 언어의 음절로 받아써진다.
export interface MicDictation {
  /** 네이티브 모듈이 붙은 빌드인가 — 아니면 버튼을 **숨긴다**(죽은 버튼 금지). */
  micOk: boolean;
  listening: boolean;
  micErr: string;
  setMicErr: (s: string) => void;
  /** 입력 레벨(0~1) — state 가 아니라 ref(초당 10~20회 → 리렌더 폭주 방지). MicSpectrum 이 샘플링한다. */
  micLevelRef: React.MutableRefObject<number>;
  /** 현재 커서 위치 — 입력칸의 onSelectionChange 가 채운다(시작 시 앵커가 된다). */
  selRef: React.MutableRefObject<number>;
  toggleMic: () => Promise<void>;
  stopMic: () => void;
}

export function useMicDictation(draft: string, onChange: (value: string) => void, max: number): MicDictation {
  const micOk = useRef(isNativeSpeechLinked()).current;
  const [listening, setListening] = useState(false);
  const [micErr, setMicErr] = useState('');
  const micLevelRef = useRef(0);
  const selRef = useRef(0);
  const anchorRef = useRef(0);
  const baseRef = useRef('');
  const draftRef = useRef(draft); draftRef.current = draft;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;

  useEffect(() => () => { void getCurrentSttProvider().stop().catch(() => {}); }, []);

  const applySpeech = useCallback((text: string, final: boolean) => {
    const { value, cursor } = spliceSpeech(baseRef.current, anchorRef.current, text, max);
    onChangeRef.current(value);
    selRef.current = cursor;
    if (final) { baseRef.current = value; anchorRef.current = cursor; }
  }, [max]);

  const stopMic = useCallback(() => {
    setListening(false);
    micLevelRef.current = 0;
    void getCurrentSttProvider().stop().catch(() => {});
  }, []);

  const toggleMic = useCallback(async () => {
    haptic.keyPress();
    setMicErr('');
    const P = getCurrentSttProvider();
    // 듣는 중에 누르면 **종료**(사용자 확정) — 같은 버튼이 시작/종료를 겸한다.
    if (listening) { setListening(false); micLevelRef.current = 0; await P.stop().catch(() => {}); return; }
    if (!(await P.requestPermission().catch(() => false))) { setMicErr(i18n.t('마이크 권한이 필요합니다.')); return; }
    baseRef.current = draftRef.current;
    anchorRef.current = selRef.current;
    setListening(true);
    try {
      await P.start({
        // 앱 언어를 따른다 — 'ko-KR' 로 굳혀 두면 영어·일본어 사용자의 말이 한국어 음절로 받아써진다.
        locale: i18n.speechLocale(),
        contextualStrings: CODING_TERMS,
        onPartial: (t) => applySpeech(t, false),
        onFinal: (t) => applySpeech(t, true),
        onError: () => { setMicErr(i18n.t('음성 인식이 중단됐어요. 다시 시도해 주세요.')); setListening(false); micLevelRef.current = 0; },
        // 피크 홀드(어택 즉시·릴리즈는 스펙트럼의 감쇠) — 말의 끝에서 막대가 뚝 끊기지 않게.
        onVolume: (l) => {
          const v = l > 1 ? 1 : l < 0 ? 0 : l;
          micLevelRef.current = Math.max(v, micLevelRef.current * 0.6);
        },
      });
    } catch (_e) {
      setListening(false);
      micLevelRef.current = 0;
      setMicErr(i18n.t('음성 인식을 시작할 수 없습니다.'));
    }
  }, [listening, applySpeech]);

  return { micOk, listening, micErr, setMicErr, micLevelRef, selRef, toggleMic, stopMic };
}
