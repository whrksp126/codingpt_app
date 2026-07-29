import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { View, Text, ActivityIndicator, Modal, Pressable, type TextInput } from 'react-native';
import { ArrowUp, Stop, Plus, Paperclip, FolderOpen, Camera, Images, Microphone, X } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import KeyTextInput from '../../components/keyboard/KeyTextInput';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../animations/haptics';
import { pickAndUploadAttachments, subscribeAttachBusy, getAttachBusy } from '../../services/attachFlow';
import ProjectFileSheet from './ProjectFileSheet';
import { composerHasText, spliceSpeech, composerCells, arrowSeq, inputDelta, COMPOSER_KEYS, type ComposerCell } from './composer';
import { getCurrentSttProvider, CODING_TERMS } from '../../services/stt';
import { isNativeSpeechLinked } from '../../services/stt/nativeSpeech';

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
const SEND = 34;

export default function ChatComposer({
  draft, onDraftChange, onDraftAppend, onSend, onStop, busy, running, cwd, host, disabled, disabledHint,
  agentName, placeholderOverride, mirror, onMirrorKey, onMirrorPaste,
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
  /** 컴포저 라이브 미러(정본=TUI) — 있으면 입력칸이 TUI 컴포저 렌더+키 포워딩으로 바뀐다. */
  mirror?: { text: string; nums: number[]; multiRow: boolean; caret: number | null; popup: string[] } | null;
  onMirrorKey?: (seq: string) => void;
  onMirrorPaste?: (t: string) => void;
}) {
  const C = v2.colors;
  const [focused, setFocused] = useState(false);
  const [menu, setMenu] = useState(false);
  const [fileSheet, setFileSheet] = useState(false);
  const sendingRef = useRef(false);
  const uploading = useSyncExternalStore(subscribeAttachBusy, getAttachBusy);
  // ── 음성 입력 ────────────────────────────────────────────────────────────
  // ★ 보조키 패널의 STT 와 **완전히 같은 엔진**을 쓴다(`services/stt` = 자체 네이티브 모듈 CptSpeech:
  //  iOS SFSpeechRecognizer / Android SpeechRecognizer + 코딩 용어 바이어스). 처음엔 서드파티
  //  `@react-native-voice/voice` 로 따로 붙였는데, 사용자가 "패널 STT 는 빠르고 정확한데 채팅은
  //  제대로 안 된다"고 지적했다 — 당연하다, 엔진이 달랐다. 그 의존성은 제거했다.
  //  · provider 는 사용자가 패널에서 고른 것(getCurrentSttProvider)을 그대로 따른다.
  //  · 연속 인식(세그먼트 자동 재시작)은 네이티브가 처리하므로 여기서 재시작 로직을 갖지 않는다.
  const micOk = useRef(isNativeSpeechLinked()).current;
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
  useEffect(() => () => { void getCurrentSttProvider().stop().catch(() => {}); }, []);

  // 부분 결과는 **같은 자리를 덮어쓰고**, 최종 결과가 오면 그 지점을 새 앵커로 **커밋**한다.
  //  ★ 커밋이 없으면 연속 발화에서 두 번째 문장이 첫 문장을 덮어써 **앞서 말한 내용이 사라진다**
  //   (사용자 실측 신고 2026-07-27). Android 는 문장마다 final 을 주고 세션을 다시 시작하므로
  //   "부분 = 덮어쓰기 / 최종 = 커밋" 두 규칙이 함께 있어야 이어 말하기가 성립한다.
  const applySpeech = useCallback((text: string, final: boolean) => {
    if (mirror && onMirrorPaste) { if (final && text.trim()) onMirrorPaste(text.trim() + ' '); return; }
    const { value, cursor } = spliceSpeech(baseRef.current, anchorRef.current, text, DRAFT_MAX);
    onDraftChange(value);
    selRef.current = cursor;
    if (final) { baseRef.current = value; anchorRef.current = cursor; }
  }, [onDraftChange, mirror, onMirrorPaste]);

  const toggleMic = useCallback(async () => {
    haptic.keyPress();
    setMicErr('');
    const P = getCurrentSttProvider();
    if (listening) { setListening(false); await P.stop().catch(() => {}); return; }
    if (!(await P.requestPermission().catch(() => false))) { setMicErr('마이크 권한이 필요합니다.'); return; }
    // 시작 시점의 초안/커서를 앵커로 굳힌다(부분 결과가 매번 같은 자리를 덮어쓴다).
    baseRef.current = draftRef.current;
    anchorRef.current = selRef.current;
    setListening(true);
    try {
      await P.start({
        locale: 'ko-KR',
        // 패널과 같은 코딩 용어 바이어스 — 이게 없으면 기술 용어 인식률이 눈에 띄게 떨어진다.
        contextualStrings: CODING_TERMS,
        onPartial: (t) => applySpeech(t, false),
        onFinal: (t) => applySpeech(t, true),
        // ⚠ 회복 가능한 종료(무음·타임아웃)는 네이티브가 알아서 재시작한다 → 여기서 문구를 띄우면
        //  `7/no match` 같은 원문이 화면에 남는다(실측 신고). 우리 문구만, 그리고 세션을 끊을 때만.
        onError: () => { setMicErr('음성 인식이 중단됐어요. 다시 시도해 주세요.'); setListening(false); },
      });
    } catch (_e) {
      setListening(false);
      setMicErr('음성 인식을 시작할 수 없습니다.');
    }
  }, [listening, applySpeech]);

  const send = useCallback(async () => {
    if (mirror) {
      if (sendingRef.current || disabled) return;
      sendingRef.current = true;
      haptic.keyPress();
      try { await onSend(''); } finally { sendingRef.current = false; }
      return;
    }
    const t = draft.trim();
    if (!t || sendingRef.current || disabled) return;
    sendingRef.current = true;
    haptic.keyPress();
    try {
      // 초안은 낙관적으로 즉시 비운다(전송 실패 시 실패 버블에서 다시 확인 가능).
      onDraftChange('');
      await onSend(t);
    } finally { sendingRef.current = false; }
  }, [draft, disabled, onDraftChange, onSend, mirror]);

  // `+` 삽입 — 커서 위치를 추적하지 않고 **초안 끝에 덧붙인다**(경로는 문장 어디에 와도 에이전트가 읽는다).
  //  KeyTextInput.insertText(커서 삽입)는 KeyAssist 타깃 경로 전용이라 여기서 쓰면 포커스 상태에 의존한다.
  const appendText = useCallback((t: string) => {
    // 미러 모드: 정본은 TUI 컴포저 — 경로를 bracketed paste 로 커서 위치에 싣는다(렌더는 파스가 따라온다).
    if (mirror && onMirrorPaste) { onMirrorPaste(t.endsWith(' ') ? t : t + ' '); return; }
    const cur = draft;
    const sep = !cur || /\s$/.test(cur) ? '' : ' ';
    const next = `${cur}${sep}${t}`;
    const clamped = next.length > DRAFT_MAX ? next.slice(0, DRAFT_MAX) : next;
    // 즉시 영속 경로가 있으면 그것을 쓴다 — 업로드가 끝나기 전에 컴포저가 언마운트되면 디바운스
    //  영속만으로는 방금 고른 경로가 유실된다(ChatBody.onDraftAppend 주석 참조).
    (onDraftAppend || onDraftChange)(clamped);
  }, [draft, onDraftChange, onDraftAppend, mirror, onMirrorPaste]);
  // 최신 초안을 보는 삽입 — 업로드는 수 초 걸리므로 콜백이 캡처한 옛 초안에 덧붙이면 그 사이 타이핑이 날아간다.
  const appendRef = useRef(appendText); appendRef.current = appendText;

  // 첨부 3갈래 — 전부 같은 업로드 플로우(attachFlow) 한 벌을 쓴다. `source` 만 다르다:
  //  'files'  = 기기의 네이티브 파일 탐색기(사용자 요구: "네이티브 파일 탐색기를 열게 해서 직접 찾아서")
  //  'camera' = 촬영 / 'gallery' = 갤러리
  const onAttach = useCallback((source: 'files' | 'camera' | 'gallery') => {
    setMenu(false);
    void pickAndUploadAttachments({ host, insert: (t) => appendRef.current(t), source });
  }, [host]);

  const canSend = mirror
    ? ((composerHasText(mirror.text) || mirror.nums.length > 0 || mirror.popup.length > 0) && !disabled)
    : (composerHasText(draft) && !busy && !disabled);

  return (
    // 배경을 **대화 본문과 같은 색**으로 둔다(사용자 확정 2026-07-27): 별색 띠는 "영역이 나뉜 것"으로
    //  읽혀 터미널/대화와 컴포저가 다른 화면처럼 보였다. 입력 상자만 살짝 떠 있으면 충분하다.
    <View style={{
      flexShrink: 0, backgroundColor: 'transparent',
      paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10,
    }}>
      {disabled && disabledHint ? (
        <Text style={{ color: C.textDim, fontSize: 11.5, marginBottom: 6 }}>{disabledHint}</Text>
      ) : null}
      {micErr ? (
        <Text style={{ color: C.textDim, fontSize: 11.5, marginBottom: 6 }}>{micErr}</Text>
      ) : null}
      {/* TUI 자동완성 팝업 패스스루('/'·'@') — Enter 가 '전송'이 아니라 '선택'인 상태를 보여준다 */}
      {mirror && mirror.popup.length ? (
        <View style={{
          borderWidth: 1, borderColor: C.borderControl, borderRadius: 12, backgroundColor: C.elevated,
          paddingHorizontal: 10, paddingVertical: 7, marginBottom: 6, maxHeight: 150, overflow: 'hidden',
        }}>
          {mirror.popup.map((l, i) => (
            <Text key={i} numberOfLines={1} style={{ fontFamily: v2.font.mono as string, fontSize: 11, lineHeight: 17, color: C.text2 }}>{l}</Text>
          ))}
        </View>
      ) : null}
      {/* ── 한 덩어리 둥근 상자: 입력(위) + 컨트롤 행(아래) ── */}
      <View style={{
        borderWidth: 1, borderRadius: 20, backgroundColor: C.elevated2,
        // 포커스는 상자 테두리로만 표현한다(입력에 별도 테두리 금지 = "최초 모습" 지적의 원인).
        borderColor: focused ? C.border : C.borderControl,
        paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8, gap: 6,
      }}>
        {mirror && onMirrorKey ? (
          <MirrorInput
            mirror={mirror}
            onKey={onMirrorKey}
            inputRef={inputRef}
            placeholder={disabled ? '' : (placeholderOverride || (agentName ? `${agentName}에게 요청` : '메시지 보내기'))}
            onFocusChange={setFocused}
            editable={!disabled}
          />
        ) : (
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
          placeholder={disabled ? '' : (placeholderOverride || (agentName ? `${agentName}에게 요청` : '메시지 보내기'))}
          placeholderTextColor={C.textDim}
          // 멀티라인 유지 — Enter 는 개행이고 전송은 버튼이다(폰에서 Enter=전송은 오폭이 잦다).
          style={{
            color: C.text, fontSize: 15, lineHeight: 21, padding: 0,
            maxHeight: 148, minHeight: 24, textAlignVertical: 'top',
          }}
        />
        )}
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
              <Microphone size={19} color={listening ? C.text : C.text2} weight={listening ? 'fill' : 'regular'} />
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
              backgroundColor: C.text,
            }}
          >
            {busy ? <ActivityIndicator size="small" color={C.base} /> : <ArrowUp size={18} color={C.base} weight="bold" />}
          </PressableScale>
        </View>
      </View>

      {/* `+` 메뉴 — 4갈래(사용자 확정 2026-07-27 3차). "바로 파일 탐색기" 로 갔다가 되돌아온 이유:
          출처가 실제로 넷이라 한 화면으로 합칠 수 없다(프로젝트 파일은 **원격 PC**에, 나머지는 이 폰에).
          · 프로젝트에서 선택 = 워크스페이스 컬럼뷰(원격 PC 파일 — 경로가 그대로 에이전트에게 간다)
          · 기기에서 선택 = 이 폰의 네이티브 파일 탐색기 → 업로드 후 경로 삽입
          · 촬영 / 갤러리 = 카메라·사진 */}
      <Modal visible={menu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.5)' }} onPress={() => setMenu(false)} />
        <View style={{
          position: 'absolute', left: 10, right: 10, bottom: 10, backgroundColor: C.surface,
          borderRadius: v2.radius.md, borderWidth: 1, borderColor: C.borderControl, overflow: 'hidden',
        }}>
          <MenuRow icon={<FolderOpen size={17} color={C.text2} />} label="프로젝트에서 선택" onPress={() => { setMenu(false); setFileSheet(true); }} />
          <View style={{ height: 1, backgroundColor: C.border }} />
          <MenuRow icon={<Paperclip size={17} color={C.text2} />} label="기기에서 선택" onPress={() => onAttach('files')} />
          <View style={{ height: 1, backgroundColor: C.border }} />
          <MenuRow icon={<Camera size={17} color={C.text2} />} label="촬영" onPress={() => onAttach('camera')} />
          <View style={{ height: 1, backgroundColor: C.border }} />
          <MenuRow icon={<Images size={17} color={C.text2} />} label="갤러리" onPress={() => onAttach('gallery')} />
        </View>
      </Modal>

      {/* 워크스페이스 파일 → 상대경로를 초안에 삽입(에이전트가 그 경로를 읽는다). */}
      <ProjectFileSheet
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

// ── 컴포저 라이브 미러 입력(정본=TUI · 2026-07-30) ─────────────────────────────
//  · 표시: 파스된 TUI 컴포저 텍스트 + [Image #N] 원자 칩(✕=TUI 원자 삭제 구동) + 캐럿.
//    flexWrap 행에 공백 경계 단위 Text 조각 — 칩과 글자가 한 흐름으로 줄바꿈된다.
//  · 입력: 1×1 숨은 KeyTextInput(uncontrolled + ZWSP 센티널)의 onChangeText 델타를 PTY 로 포워딩
//    (PC pane.js input-델타 방식의 RN 판). 한글 IME 조합을 깨지 않기 위해 타이핑 중 리셋 금지 —
//    제출로 TUI 컴포저가 비는 순간(조합 없음 보장)에만 리셋한다.
const SENT = '\u200B'; // zero-width space — 빈 캡처칸에서도 백스페이스가 onChangeText 로 잡히게 하는 센티널

function Caret({ C }: { C: any }) {
  return <View style={{ width: 1.5, height: 18, backgroundColor: C.accent || C.text, marginHorizontal: 0.5 }} />;
}

function renderMirrorCells(
  cells: ComposerCell[], caret: number | null, C: any, onChipX: (tok: string) => void, multiRow: boolean,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let pos = 0; let k = 0; let buf = '';
  const txt = { color: C.text, fontSize: 15, lineHeight: 21 } as const;
  const flush = () => { if (buf) { out.push(<Text key={'t' + k++} style={txt}>{buf}</Text>); buf = ''; } };
  const pushCaret = () => { flush(); out.push(<Caret key={'c' + k++} C={C} />); };
  for (const c of cells) {
    if (caret === pos) pushCaret();
    if ('str' in c) {
      flush();
      out.push(
        <View
          key={'i' + k++}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.borderControl,
            borderRadius: 7, backgroundColor: C.elevated, paddingHorizontal: 6, paddingVertical: 2, marginHorizontal: 2,
          }}
        >
          <Text style={{ color: C.text2, fontSize: 11.5 }}>Image #{c.img}</Text>
          {!multiRow ? (
            <Pressable onPress={() => onChipX(c.str)} hitSlop={8} accessibilityLabel="첨부 빼기">
              <X size={10} color={C.text3} />
            </Pressable>
          ) : null}
        </View>,
      );
      pos += c.str.length;
    } else if (c.ch === '\n') {
      flush();
      out.push(<View key={'n' + k++} style={{ width: '100%', height: 0 }} />);
      pos += 1;
    } else {
      buf += c.ch;
      if (c.ch === ' ') flush(); // 공백 경계 = 자연 줄바꿈 지점
      pos += 1;
    }
  }
  if (caret != null && caret >= pos) pushCaret(); else flush();
  flush();
  return out;
}

function MirrorInput({ mirror, onKey, inputRef, placeholder, onFocusChange, editable }: {
  mirror: { text: string; nums: number[]; multiRow: boolean; caret: number | null; popup: string[] };
  onKey: (seq: string) => void;
  inputRef: React.MutableRefObject<any>;
  placeholder: string;
  onFocusChange: (f: boolean) => void;
  editable: boolean;
}) {
  const C = v2.colors;
  const capRef = useRef(SENT);
  const reset = useCallback(() => {
    capRef.current = SENT;
    try { (inputRef.current as TextInput | null)?.setNativeProps({ text: SENT }); } catch (_) { /* noop */ }
  }, [inputRef]);
  const onCap = useCallback((t: string) => {
    const prev = capRef.current;
    let next = t;
    if (!next.startsWith(SENT)) {
      // 센티널까지 지워짐 = 캡처칸 맨 앞에서의 백스페이스 → TUI 백스페이스로 변환 후 센티널 복구.
      onKey(COMPOSER_KEYS.backspace);
      next = SENT + next;
      try { (inputRef.current as TextInput | null)?.setNativeProps({ text: next }); } catch (_) { /* noop */ }
    }
    const d = inputDelta(prev, next);
    if (d.bs) onKey(COMPOSER_KEYS.backspace.repeat(d.bs));
    if (d.add) onKey(d.add.replace(/\n/g, COMPOSER_KEYS.newline));
    capRef.current = next;
  }, [onKey, inputRef]);
  // 제출로 TUI 컴포저가 비는 순간 캡처칸 리셋 — 이 시점엔 IME 조합이 없다(Enter 로 확정됨).
  const prevText = useRef(mirror.text);
  useEffect(() => {
    if (prevText.current && !mirror.text) reset();
    prevText.current = mirror.text;
  }, [mirror.text, reset]);

  const cells = composerCells(mirror.text);
  const chipX = useCallback((tok: string) => {
    if (mirror.multiRow) return;
    const idx = cells.findIndex((c) => 'str' in c && c.str === tok);
    if (idx < 0) return;
    // 셀 모델: End → 토큰 뒤까지 ←(토큰=1스텝) → 백스페이스 1회(원자 삭제 — cptest 실측).
    onKey(COMPOSER_KEYS.end + arrowSeq(-(cells.length - idx - 1)) + COMPOSER_KEYS.backspace);
  }, [cells, mirror.multiRow, onKey]);

  return (
    <Pressable onPress={() => { try { inputRef.current?.focus(); } catch (_) { /* noop */ } }} style={{ minHeight: 24, maxHeight: 148 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        {cells.length === 0 ? (
          <>
            <Caret C={C} />
            <Text style={{ color: C.textDim, fontSize: 15, lineHeight: 21 }}>{placeholder}</Text>
          </>
        ) : renderMirrorCells(cells, mirror.caret, C, chipX, mirror.multiRow)}
      </View>
      {/* 1×1 숨은 캡처칸 — KeyTextInput 인 이유: KeyAssist 인셋 등록(빼면 iOS 인셋 0 함정, 파일 상단 주석) */}
      <KeyTextInput
        ref={inputRef}
        defaultValue={SENT}
        onChangeText={onCap}
        onFocus={() => onFocusChange(true)}
        onBlur={() => { onFocusChange(false); reset(); }}
        multiline
        editable={editable}
        noBar
        autoCorrect={false}
        autoCapitalize="none"
        style={{ position: 'absolute', left: 0, bottom: 0, width: 1, height: 1, opacity: 0.02, color: 'transparent', padding: 0 }}
      />
    </Pressable>
  );
}
