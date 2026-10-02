import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Desktop, Clock, WarningCircle } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import Button from '../ui/Button';
import { BlockingBar, FreeInput, OptionRow, RowComment, ToolChip, type OptionTone } from './approvalRows';
import { approvalKind, type ApprovalRow } from '../../services/approvalService';
import * as i18n from '../../i18n/index.ts';

// 원격 승인 카드(기능1) — 폰에서 claude 의 권한 요청/선택 질문에 답한다.
//
// 두 종류(정본 = prompt.kind. 서버 화이트리스트가 최상위 kind 를 통과시키지 않는다):
//  · permission — Bash/Write/Edit… → TUI 순서의 번호 선택지: 1 허용 / 2 허용하고 다음부터 묻지 않기
//    (claude 가 규칙을 제안한 요청에만 — alwaysLabel 존재. 2026-07-29 실측으로 "훅에 그 개념이
//    없다"던 옛 주석은 오판으로 판명, updatedPermissions 로 규칙이 실제 기록된다. codex 는 이
//    개념이 없어 항상 2줄) / 3 거절
//  · choice — AskUserQuestion/ExitPlanMode → 선택지 버튼(라벨 + 설명, multiSelect 지원) + 자유 입력
//
// deadlineAt 은 "마감시간"이 아니다 — 원격 승인에 마감은 없다(2026-07-28 폐지, TUI 처럼 무기한 대기).
//  이 값은 데몬의 좀비 청소 안전장치(24h)가 발동하는 시각일 뿐이고, 그 극단 상황에서만 버튼을 닫고
//  "PC 터미널에서 답해주세요"로 바꾼다(그 후 응답은 서버가 410 으로 막는다). 정상 경로에선 카드가
//  시간 때문에 사라지는 일이 없다 — 사라지는 이유는 항상 "터미널 쪽에서 먼저 해소됨" 동기화다.

const monoFamily = () => v2.font.mono as string;

function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? i18n.t('{m}분 {s}초', { m, s: String(s % 60).padStart(2, '0') }) : i18n.t('{s}초', { s });
}

/** 남은 시간(1초 갱신). 만료되면 expired=true. */
function useCountdown(deadlineAt: number): { left: number; expired: boolean } {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const left = deadlineAt - now;
  return { left, expired: left <= 0 };
}

function Row({ label, value }: { label: string; value: string }) {
  const C = v2.colors;
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
      <Text style={{ color: C.textDim, fontSize: v2.font.size.small, width: 52 }}>{label}</Text>
      <Text style={{ color: C.text2, fontSize: v2.font.size.caption, flex: 1, fontFamily: monoFamily() }} numberOfLines={3}>{value}</Text>
    </View>
  );
}

export default function ApprovalCard({
  approval, onRespond, onDismiss, busy, compact,
}: {
  approval: ApprovalRow;
  /** 실제 전송은 상위(컨텍스트)가 한다 — 409/410 처리와 카드 회수가 한 곳에 모여야 한다. */
  onRespond: (decision: 'allow' | 'deny' | 'answer', opts?: { message?: string; always?: boolean; answer?: { questionIndex: number; labels: string[]; text?: string | null } }) => void;
  onDismiss?: () => void;
  busy?: boolean;
  /** 배너에서 펼친 축약형(패딩·폰트 축소). */
  compact?: boolean;
}) {
  const C = v2.colors;
  const kind = approvalKind(approval);
  const { left, expired } = useCountdown(approval.deadlineAt);
  const questions = approval.prompt && Array.isArray(approval.prompt.questions) ? approval.prompt.questions : [];
  const q = questions[0];
  const plan = approval.prompt?.plan || '';
  // ★ 선택형인데 질문 목록이 없는 경우 = ExitPlanMode(계획 승인). 데몬이 kind:'choice' + questions:null +
  //  prompt.plan 으로 보낸다. 이 케이스를 선택지 UI 로 다루면 고를 항목이 없어 "보내기"가 영구 비활성이
  //  되고 거절만 가능해진다(= 계획 승인이 폰에서 불가능). 그래서 [거절]/[승인] 2버튼으로 따로 그린다.
  //  데몬은 choice + allow 를 "계획을 승인했습니다. 계획대로 진행하세요." 로 번역하므로 allow 가 정답이다.
  const planApproval = kind === 'choice' && !q;
  // TUI 미러(prompt.mirror) — 화면에서 읽어온 권한 다이얼로그. 선택지 문구 그대로 + 누르면 즉시 전송
  //  (TUI 숫자키 한 번과 동일). 코멘트는 각 행 안에 바로(TUI 인라인 입력과 동일).
  const mirror = !!(approval.prompt && (approval.prompt as { mirror?: boolean }).mirror) && !!q;
  // 화면 보강(prompt.screen) — 훅 대기 중 데몬이 TUI 다이얼로그를 파싱해 실은 **TUI 원문**
  //  (제목/본문/질문 줄/선택지 문구 그대로 — "TUI 에 나오는 건 다 채팅에도"). 있으면 이게 정본.
  const screenRaw = approval.prompt && (approval.prompt as { screen?: unknown }).screen
    ? (approval.prompt as { screen: { title: string; body: string; options: Array<{ label: string; act: 'allow' | 'always' | 'deny'; input?: boolean }> } }).screen
    : null;
  const scr = screenRaw && Array.isArray(screenRaw.options) && screenRaw.options.length >= 2 ? screenRaw : null;
  const [picked, setPicked] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  // 행내 코멘트 — TUI 인라인 입력의 동치(각 옵션에 **바로** 쓴다. 2026-07-29 사용자 확정). 행 index 별.
  const [rowText, setRowText] = useState<Record<number, string>>({});
  const [cmdOpen, setCmdOpen] = useState(false);   // 명령 행 펼침(200자 클립 초과분 열람)
  const [diffOpen, setDiffOpen] = useState(false); // 변경 내용 펼침
  const disabled = !!busy || expired || !!approval.claimed;

  const cmd = useMemo(() => {
    const p = approval.inputPreview as Record<string, unknown> | null;
    if (p && typeof p === 'object' && typeof (p as { command?: string }).command === 'string') return (p as { command: string }).command;
    return '';
  }, [approval.inputPreview]);

  // 번호 선택지 행 — 도크(QuestionDock)·PC(.apc-qopt)와 같은 시각 언어(approvalRows.OptionRow 한 벌).
  const optRow = (label: string, desc: string | undefined, num: number, onPress: () => void, tone: OptionTone = 'plain') => (
    <OptionRow key={`${num}-${label}`} num={num} label={label} desc={desc} tone={tone} disabled={disabled} onPress={onPress} />
  );

  // 행내 코멘트가 달린 선택지 행 — TUI 와 같은 배치: **`N` 이 앞에**, 라벨, 그 옆에 코멘트
  //  (입력 가능한 옵션만 — 다이얼로그마다 실측 판별된 input 표식. 도크와 동일 규칙).
  //  행 탭 = 그 행의 코멘트(있으면)와 함께 즉시 전송, 입력칸의 [보내기] 키 동일.
  const rowLine = (idx: number, label: string, desc: string | undefined, num: number, canInput: boolean, onSend: (text: string | null) => void, tone: OptionTone = 'plain') => {
    const send = () => onSend((rowText[idx] || '').trim() || null);
    return (
      <OptionRow
        key={`${num}-${label}`}
        num={num}
        label={label}
        desc={desc}
        tone={tone}
        disabled={disabled}
        onPress={send}
        labelLines={3}
        right={canInput ? (
          <RowComment
            value={rowText[idx] || ''}
            onChange={(t) => setRowText((c) => ({ ...c, [idx]: t }))}
            onSubmit={send}
            editable={!disabled}
            placeholder={i18n.t('코멘트 입력…')}
            tone={tone}
          />
        ) : <View style={{ flex: 1 }} />}
      />
    );
  };

  // 미러/보강 카드 본문 — TUI 위계: 본문(모노·차분) ↔ 질문 줄(굵게·간격), 화면 배치 순서대로.
  const screenBody = (bodyText: string | undefined, ask: string | undefined, askFirst: boolean) => {
    const b = bodyText && bodyText !== ask ? (
      <Text key="b" style={{ color: C.text2, fontSize: v2.font.size.small, lineHeight: 19, fontFamily: monoFamily() }}>{bodyText}</Text>
    ) : null;
    const a = ask ? (
      <Text key="a" style={{ color: C.text, fontSize: v2.font.size.body, fontWeight: '600', marginTop: b && !askFirst ? 6 : 0, marginBottom: b && askFirst ? 6 : 0 }}>{ask}</Text>
    ) : null;
    return <View>{askFirst ? [a, b] : [b, a]}</View>;
  };

  const toggle = (label: string) => {
    if (!q) return;
    setPicked((cur) => {
      if (q.multiSelect) return cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
      return [label];
    });
  };

  const submitAnswer = () => {
    const labels = picked.slice();
    const text = freeText.trim();
    if (!labels.length && !text) return;
    onRespond('answer', { answer: { questionIndex: 0, labels, text: text || null } });
  };

  const pad = compact ? 10 : 14;
  // 선택지 톤 — 1번(주 선택) = primary, 거절 = danger(설계 §0.7 승인 카드).
  const toneOf = (i: number, act?: 'allow' | 'always' | 'deny'): OptionTone => (act === 'deny' ? 'danger' : i === 0 ? 'primary' : 'plain');

  return (
    // 카드: elevated · 반경 lg · 헤어라인. 막는 중(만료 전)이면 왼쪽 2px warn 막대 — 테두리 전체를 칠하지 않는다.
    <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.lg, padding: pad, overflow: 'hidden' }}>
      {expired ? null : <BlockingBar />}
      {/* 헤더 — 무엇을 요청했는지(제목 15/600 text) + 도구 칩 + 남은 시간 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flexShrink: 1, color: C.text, fontSize: v2.font.size.body, fontWeight: '600' }}>{scr ? scr.title : i18n.t('승인 필요')}</Text>
        {approval.tool ? <ToolChip name={approval.tool} /> : null}
        <View style={{ flex: 1 }} />
        {/* ★ 남은 시간은 **곧 마감될 때만** 보여준다. 원격 응답에는 마감이 없어서(24h) 평소엔
            '1440분' 같은 무의미한 숫자가 되고, 카운트다운 자체가 '곧 사라지겠구나' 로 읽힌다. */}
        {expired ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <WarningCircle size={12} color={C.textDim} />
            <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{i18n.t('종료됨')}</Text>
          </View>
        ) : left < 60000 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Clock size={12} color={left < 30000 ? C.error : C.textDim} />
            <Text style={{ color: left < 30000 ? C.error : C.textDim, fontSize: v2.font.size.caption }}>{fmtLeft(left)}</Text>
          </View>
        ) : null}
      </View>

      {/* 본문 */}
      {kind === 'choice' && q ? (
        <View style={{ marginTop: 8 }}>
          {q.header ? (
            <Text style={{ color: mirror ? C.text : C.text2, fontSize: mirror ? v2.font.size.body : v2.font.size.small, fontWeight: mirror ? '600' : '500', marginBottom: 3 }}>{q.header}</Text>
          ) : null}
          {mirror
            ? screenBody(q.question, q.ask, !!q.askFirst)
            : <Text style={{ color: C.text, fontSize: v2.font.size.body, lineHeight: 22 }}>{q.question || approval.summary}</Text>}
          {q.multiSelect ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginTop: 3 }}>{i18n.t('여러 개 고를 수 있어요')}</Text> : null}
          <View style={{ marginTop: 9, gap: 6 }}>
            {/* 미러: 행 탭 = 즉시 전송(TUI 숫자키), 코멘트는 각 행 안에 바로(TUI 인라인 입력 동치).
                일반 질문: 행 탭 = 고르기(전송은 [보내기]). */}
            {mirror
              ? q.options.map((o, i) => rowLine(i, o.label, o.description, i + 1, !!o.input, (text) =>
                onRespond('answer', { answer: { questionIndex: 0, labels: [o.label], text: text || null } }), toneOf(i)))
              : q.options.map((o, i) => (
                <OptionRow
                  key={`${i}-${o.label}`}
                  num={i + 1}
                  label={o.label}
                  desc={o.description}
                  selected={picked.includes(o.label)}
                  disabled={disabled}
                  onPress={() => toggle(o.label)}
                />
              ))}
          </View>
          {/* 자유 입력 — 선택지에 없는 답을 그대로 claude 에 전달(answer.text). TUI 미러엔 없다
              (코멘트가 행 안에 있다). */}
          {mirror ? null : (
          <FreeInput style={{ marginTop: 8 }} value={freeText} onChangeText={setFreeText} editable={!disabled} multiline placeholder={i18n.t('직접 답하기(선택)')} />
          )}
        </View>
      ) : (
        <View style={{ marginTop: 8 }}>
          {/* 화면 보강이 있으면 TUI 원문(본문 모노 ↔ 질문 줄 굵게, 화면 순서대로), 없으면 summary/detail. */}
          {scr ? (
            screenBody(scr.body, (scr as { ask?: string }).ask, !!(scr as { askFirst?: boolean }).askFirst)
          ) : (
            <Text style={{ color: C.text, fontSize: v2.font.size.body, lineHeight: 22 }} numberOfLines={compact ? 3 : 6}>
              {approval.summary || approval.tool}
            </Text>
          )}
          {/* 설명 — TUI 가 명령 아래 회색으로 붙이는 한 줄. 접지 않는다(펼쳐야 보이던 게 문제였다). */}
          {!scr && approval.detail ? (
            <Text style={{ color: C.text2, fontSize: v2.font.size.small, lineHeight: 18, marginTop: 4 }} numberOfLines={3}>
              {approval.detail}
            </Text>
          ) : null}
          {plan ? (
            <ScrollView style={{ maxHeight: compact ? 120 : 220, marginTop: 8, backgroundColor: C.base, borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.md }} contentContainerStyle={{ padding: 10 }}>
              <Text style={{ color: C.text2, fontSize: v2.font.size.small, lineHeight: 19 }}>{plan}</Text>
            </ScrollView>
          ) : null}
          {!compact ? (
            <View style={{ marginTop: 7 }}>
              {approval.relPath ? <Row label={i18n.t('파일')} value={approval.relPath} /> : null}
              {cmd && cmd !== approval.summary ? (
                // 명령 전문 — 3줄 클립을 탭으로 펼친다(200자 클립 초과분을 볼 유일한 모달 경로).
                <PressableScale onPress={() => setCmdOpen((v) => !v)}>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 3 }}>
                    <Text style={{ color: C.textDim, fontSize: v2.font.size.small, width: 52 }}>{i18n.t('명령')}</Text>
                    <Text style={{ color: C.text2, fontSize: v2.font.size.caption, flex: 1, fontFamily: monoFamily() }} numberOfLines={cmdOpen ? undefined : 3}>{cmd}</Text>
                  </View>
                </PressableScale>
              ) : null}
              {approval.wsName ? <Row label={i18n.t('폴더')} value={approval.wsName} /> : null}
              {approval.diff && (approval.diff.newContent || approval.diff.oldContent) ? (
                // 변경 내용 — 이전(빨간 표시) → 새(초록 표시). 도크·PC 카드와 같은 형태.
                <View style={{ marginTop: 5 }}>
                  <PressableScale onPress={() => setDiffOpen((v) => !v)} hitSlop={6}>
                    <Text style={{ color: C.text2, fontSize: v2.font.size.small }}>
                      {(approval.diff.kind === 'write' ? i18n.t('파일 내용') : i18n.t('변경 내용')) + (diffOpen ? i18n.t(' 접기') : i18n.t(' 보기'))}
                    </Text>
                  </PressableScale>
                  {diffOpen ? (
                    <ScrollView style={{ maxHeight: 200, marginTop: 4 }} contentContainerStyle={{ gap: 4 }}>
                      {approval.diff.oldContent ? (
                        <View style={{ backgroundColor: C.base, borderWidth: 1, borderColor: C.border, borderLeftWidth: 2, borderLeftColor: C.error, borderRadius: v2.radius.md, padding: 8 }}>
                          <Text style={{ color: C.text3, fontSize: v2.font.size.caption, lineHeight: 17, fontFamily: monoFamily() }}>{approval.diff.oldContent}</Text>
                        </View>
                      ) : null}
                      {approval.diff.newContent ? (
                        <View style={{ backgroundColor: C.base, borderWidth: 1, borderColor: C.border, borderLeftWidth: 2, borderLeftColor: C.success, borderRadius: v2.radius.md, padding: 8 }}>
                          <Text style={{ color: C.text2, fontSize: v2.font.size.caption, lineHeight: 17, fontFamily: monoFamily() }}>{approval.diff.newContent}</Text>
                        </View>
                      ) : null}
                      {approval.diff.truncated ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption }}>{i18n.t('내용이 길어 일부만 표시됩니다')}</Text> : null}
                    </ScrollView>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          {/* 계획 승인은 의견을 함께 보낼 수 있다(선택) — 거절 시 이유, 승인 시 단서를 claude 에 전달한다. */}
          {planApproval && !compact ? (
            <FreeInput style={{ marginTop: 8 }} value={freeText} onChangeText={setFreeText} editable={!disabled} multiline placeholder={i18n.t('의견 남기기(선택)')} />
          ) : null}
        </View>
      )}

      {/* 요청 기기 */}
      {approval.hostName ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
          <Desktop size={13} color={C.textDim} />
          <Text style={{ color: C.text2, fontSize: v2.font.size.small }}>{approval.hostName}</Text>
        </View>
      ) : null}

      {/* 액션 */}
      {expired ? (
        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, color: C.text2, fontSize: v2.font.size.small }}>{i18n.t('이 요청은 종료됐어요 — PC 터미널에서 답해주세요.')}</Text>
          {onDismiss ? <Button label={i18n.t('닫기')} size="sm" onPress={onDismiss} /> : null}
        </View>
      ) : planApproval ? (
        // 계획 승인 — TUI 순서의 번호 선택지: 1 계획대로 진행 / 2 거절. 의견(freeText)은 고른 행에
        //  실려 간다(진행이면 answer.text, 거절이면 사유 — 데몬이 각각 "계획 승인/거절"로 번역).
        <View style={{ marginTop: 10, gap: 6 }}>
          {optRow(i18n.t('계획대로 진행'), undefined, 1, () => {
            const text = freeText.trim();
            if (text) onRespond('answer', { answer: { questionIndex: 0, labels: [], text } });
            else onRespond('allow');
          }, 'primary')}
          {optRow(i18n.t('거절'), undefined, 2, () => onRespond('deny', { message: freeText.trim() || i18n.t('원격 기기에서 계획을 거절했습니다') }), 'danger')}
          {busy ? <ActivityIndicator size="small" color={C.text2} /> : null}
        </View>
      ) : mirror ? (
        // TUI 미러 — 입력이 비어 있으면 선택지 자체가 즉시 전송이라 푸터가 없다(TUI 와 동일).
        //  추가 지시를 치면 [보내기]가 나타난다(TUI 의 커서 이동→타이핑→Enter 동치).
        freeText.trim() ? (
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }} />
            {busy ? <ActivityIndicator size="small" color={C.text2} /> : (
              <Button
                label={i18n.t('보내기')}
                variant="primary"
                size="sm"
                onPress={() => {
                  if (!picked.length) return;
                  onRespond('answer', { answer: { questionIndex: 0, labels: picked.slice(0, 1), text: freeText.trim() } });
                }}
                disabled={disabled || !picked.length}
              />
            )}
          </View>
        ) : busy ? <View style={{ marginTop: 10 }}><ActivityIndicator size="small" color={C.text2} /></View> : null
      ) : kind === 'choice' ? (
        <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
          <Button label={i18n.t('취소')} variant="danger" onPress={() => onRespond('deny', { message: i18n.t('폰에서 거절') })} disabled={disabled} />
          <Button
            label={i18n.t('보내기')}
            variant="primary"
            stretch
            busy={busy}
            onPress={submitAnswer}
            disabled={disabled || (!picked.length && !freeText.trim())}
          />
        </View>
      ) : (
        // 권한형 — 코멘트는 TUI 처럼 **각 옵션 행 안에 바로** 쓴다(도크·PC 카드와 완전 동일).
        //  화면 보강(scr)이 있으면 선택지 문구도 TUI 원문 그대로 + 옵션별 입력 가능 표식(실측:
        //  claude Yes/No 만, codex 는 No 만). 없으면 한글 행 폴백 — 입력 가능 규칙 동일.
        <View style={{ marginTop: 10, gap: 6 }}>
          {(scr
            ? scr.options.map((o) => ({ label: o.label, desc: undefined as string | undefined, input: !!o.input, act: o.act }))
            : [
              // 폴백(보강 전) — 코멘트 입력칸 없음: 화면(보강 input 표식)이 증명할 때만 그린다.
              { label: i18n.t('허용'), desc: undefined as string | undefined, input: false, act: 'allow' as const },
              ...(approval.alwaysLabel ? [{ label: i18n.t('허용하고 다음부터 묻지 않기'), desc: approval.alwaysLabel as string | undefined, input: false, act: 'always' as const }] : []),
              { label: i18n.t('거절'), desc: undefined as string | undefined, input: false, act: 'deny' as const },
            ]
          ).map((r, i) => rowLine(i, r.label, r.desc, i + 1, r.input, (text) => {
            if (r.act === 'always') { onRespond('allow', { always: true }); return; }
            if (r.act === 'allow') onRespond('allow', text ? { message: text } : undefined);
            else onRespond('deny', { message: text || i18n.t('폰에서 거절') });
          }, toneOf(i, r.act)))}
          {busy ? <ActivityIndicator size="small" color={C.text2} /> : null}
        </View>
      )}
      {approval.claimed && !expired ? (
        <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, marginTop: 6 }}>{i18n.t('다른 기기가 응답을 처리하고 있어요…')}</Text>
      ) : null}
    </View>
  );
}
