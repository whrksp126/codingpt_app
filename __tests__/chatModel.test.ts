/**
 * chatModel 순수 로직 회귀 — 실기기 검증 없이도 깨지면 즉시 잡히는 부분만 다룬다.
 *  · 병합/중복(push ↔ pull 이중 배달)
 *  · 워터마크(headSeq vs 메시지 최대 seq)
 *  · tool_use ↔ tool_result 접기(중복 표시 금지)
 *  · 낙관적 user 버블 회수(같은 말풍선 2개 금지)
 *  · 작업 중 추정(중단 버튼 노출)
 * 픽스처는 데몬 transcript.js 가 실제로 내는 모양(role/kind/tool/result)을 따른다.
 */
import {
  buildRows, isDisplayed, lastSeqOf, looksBusy, mergeMessages,
  hiddenByQuestionCard, optimisticKey, pendingTuiQuestion, pruneOptimistic, statusMark, toolLabel, clampLines,
  type ChatMsg, type PendingUser,
} from '../src/workspace/chatModel';

const SCALE = 1000;
const seqOf = (off: number, b: number) => off * SCALE + b + 1;

const userMsg = (off: number, text: string, ts?: string): ChatMsg =>
  ({ seq: seqOf(off, 0), role: 'user', kind: 'text', text, ts: ts ?? null });
const asstMsg = (off: number, text: string): ChatMsg =>
  ({ seq: seqOf(off, 0), role: 'assistant', kind: 'text', text });
const toolUse = (off: number, id: string, title: string, path?: string): ChatMsg =>
  ({ seq: seqOf(off, 0), role: 'assistant', kind: 'tool_use', text: title, tool: { name: 'Bash', title, id, ...(path ? { path } : {}) } });
const toolResult = (off: number, id: string, preview: string, ok = true): ChatMsg => ({
  seq: seqOf(off, 0), role: 'user', kind: 'tool_result', text: preview,
  result: { toolUseId: id, ok, preview, bytes: preview.length, lines: preview.split('\n').length, truncated: false, images: 0 },
});

describe('mergeMessages', () => {
  it('seq 오름차순으로 병합하고 같은 seq 는 나중 값으로 덮는다', () => {
    const prev = [userMsg(0, 'a'), asstMsg(100, 'b')];
    const next = mergeMessages(prev, [asstMsg(50, 'mid')]);
    expect(next.map((m) => m.seq)).toEqual([seqOf(0, 0), seqOf(50, 0), seqOf(100, 0)]);
  });

  it('push 와 pull 이 같은 구간을 배달해도 중복 행이 생기지 않는다', () => {
    const a = userMsg(10, 'hello');
    const merged = mergeMessages(mergeMessages([], [a]), [a, asstMsg(20, 'hi')]);
    expect(merged).toHaveLength(2);
    expect(merged.filter((m) => m.seq === a.seq)).toHaveLength(1);
  });

  it('빈 델타는 기존 배열 참조를 그대로 돌려준다(불필요한 리렌더 방지)', () => {
    const prev = [userMsg(0, 'a')];
    expect(mergeMessages(prev, [])).toBe(prev);
  });
});

describe('lastSeqOf', () => {
  it('headSeq(오프셋 워터마크)와 메시지 최대 seq 중 큰 값을 쓴다', () => {
    const msgs = [userMsg(0, 'a')];
    expect(lastSeqOf(msgs, 0)).toBe(seqOf(0, 0));
    // 새 메시지 없이 오프셋만 전진한 경우(headSeq 가 더 큼)도 잃지 않는다.
    expect(lastSeqOf(msgs, 999999)).toBe(999999);
  });
});

describe('buildRows', () => {
  it('tool_use 와 그 tool_result 를 한 행으로 접는다', () => {
    const msgs = [toolUse(0, 'toolu_1', '$ ls'), toolResult(100, 'toolu_1', 'a\nb')];
    const rows = buildRows(msgs);
    expect(rows).toHaveLength(1);
    expect(rows[0].msg.kind).toBe('tool_use');
    expect(rows[0].result?.preview).toBe('a\nb');
    expect(rows[0].resultSeq).toBe(seqOf(100, 0));
  });

  it('짝 없는 tool_result 는 독립 행으로 남긴다(스냅샷 앞부분 절단 대비)', () => {
    const rows = buildRows([toolResult(100, 'toolu_ghost', 'orphan')]);
    expect(rows).toHaveLength(1);
    expect(rows[0].msg.kind).toBe('tool_result');
  });

  it('결과가 아직 없는 tool_use 는 진행 중(result undefined)', () => {
    const rows = buildRows([toolUse(0, 'toolu_1', '$ sleep 5')]);
    expect(rows[0].result).toBeUndefined();
    expect(statusMark(rows[0].result?.ok)).toBe('…');
  });

  it('hidden 메타/시스템 라인은 걸러내고 thinking 은 남긴다', () => {
    const hidden: ChatMsg = { seq: seqOf(10, 0), role: 'system', kind: 'system', text: 'turn_duration', hidden: true };
    const thinking: ChatMsg = { seq: seqOf(20, 0), role: 'assistant', kind: 'thinking', text: '', hidden: true };
    expect(isDisplayed(hidden)).toBe(false);
    expect(isDisplayed(thinking)).toBe(true);
    const rows = buildRows([hidden, thinking, asstMsg(30, 'done')]);
    expect(rows.map((r) => r.msg.kind)).toEqual(['thinking', 'text']);
  });
});

describe('pruneOptimistic', () => {
  const mkPending = (text: string): PendingUser => ({ id: 'p1', text, at: Date.now(), state: 'sending' });

  it('같은 텍스트의 user 메시지가 도착하면 낙관적 버블을 걷는다', () => {
    const now = Date.now();
    const pending = [mkPending('빌드 돌려줘')];
    const arrived = [userMsg(0, '빌드 돌려줘', new Date(now).toISOString())];
    expect(pruneOptimistic(pending, arrived, now)).toHaveLength(0);
  });

  it('60s 창 밖의 옛 메시지와는 매칭하지 않는다(같은 프롬프트 재전송 보호)', () => {
    const now = Date.now();
    const pending = [mkPending('다시')];
    const old = [userMsg(0, '다시', new Date(now - 5 * 60 * 1000).toISOString())];
    expect(pruneOptimistic(pending, old, now)).toHaveLength(1);
  });

  it('전송 실패 버블은 남긴다(사용자에게 알려야 한다)', () => {
    const now = Date.now();
    const failed: PendingUser = { id: 'p2', text: 'x', at: now, state: 'failed' };
    expect(pruneOptimistic([failed], [userMsg(0, 'x', new Date(now).toISOString())], now)).toHaveLength(1);
  });

  it('중복 키는 trim 후 앞 200자', () => {
    expect(optimisticKey('  hello  ')).toBe('hello');
    expect(optimisticKey('a'.repeat(300))).toHaveLength(200);
  });
});

describe('looksBusy', () => {
  it('사람 말이 마지막이면 응답 대기 = 작업 중', () => {
    expect(looksBusy(buildRows([asstMsg(0, 'ok'), userMsg(100, '다음')]))).toBe(true);
  });
  it('결과 없는 tool_use 가 마지막이면 작업 중', () => {
    expect(looksBusy(buildRows([toolUse(0, 't1', '$ npm test')]))).toBe(true);
  });
  it('어시스턴트 텍스트로 끝나면 유휴', () => {
    expect(looksBusy(buildRows([userMsg(0, 'q'), asstMsg(100, '답변')]))).toBe(false);
  });
});

describe('표시 규칙', () => {
  it('toolLabel 은 데몬이 만든 title 을 신뢰한다', () => {
    expect(toolLabel(toolUse(0, 't', '$ npm run dev'))).toBe('$ npm run dev');
  });
  it('clampLines 는 6줄까지만 남기고 잘림을 알린다', () => {
    const r = clampLines('1\n2\n3\n4\n5\n6\n7', 6);
    expect(r.clamped).toBe(true);
    expect(r.text.split('\n')).toHaveLength(6);
  });
  it('statusMark 는 성공/실패/진행중을 구분한다', () => {
    expect(statusMark(true)).toBe('✓');
    expect(statusMark(false)).toBe('✕');
    expect(statusMark(undefined)).toBe('…');
  });
});

describe('미응답 질문 감추기(도크와 대화의 중복 방지)', () => {
  // 데몬 transcript.js 가 AskUserQuestion 에 대해 내는 모양.
  const question = (off: number, id: string): ChatMsg => ({
    seq: seqOf(off, 0), role: 'assistant', kind: 'question', text: '질문 2개',
    tool: { name: 'AskUserQuestion', title: '질문 2개', id },
    question: { header: '집중 시간', question: '하루 중 언제 가장 집중이 잘 되세요?', options: [{ label: '이른 아침' }] },
  } as ChatMsg);

  it('카드가 떠 있으면 미응답 질문은 대화 내역에서 빠진다', () => {
    const rows = buildRows([question(0, 'q1')]);
    expect(rows.filter((r) => !hiddenByQuestionCard(r, true))).toHaveLength(0);
  });

  it('카드가 없으면 감추지 않는다 — TUI 엔 있는데 채팅엔 없는 상태를 만들지 않는다', () => {
    const rows = buildRows([question(0, 'q1')]);
    expect(rows.filter((r) => !hiddenByQuestionCard(r, false))).toHaveLength(1);
  });

  it('답한 질문(짝 tool_result 있음)은 카드가 떠 있어도 대화에 남는다', () => {
    const rows = buildRows([question(0, 'q1'), toolResult(1, 'q1', '이른 아침')]);
    expect(rows.filter((r) => !hiddenByQuestionCard(r, true))).toHaveLength(1);
  });

  it('tool_use_id 가 없는 승인 요청에도 규칙이 성립한다(옛 toolUseId 대조 회귀)', () => {
    // 진범: claude PermissionRequest 페이로드에 tool_use_id 가 없으면 옛 규칙은 아무것도 못 감췄다.
    //  새 규칙은 승인 요청의 id 를 아예 보지 않는다 → 이 케이스에서도 감춘다.
    const rows = buildRows([question(0, 'whatever-id')]);
    expect(rows.every((r) => hiddenByQuestionCard(r, true))).toBe(true);
  });
});

describe('pendingTuiQuestion (TUI 폴백 질문 카드 재건)', () => {
  const tuiQuestion = (off: number, id: string): ChatMsg => ({
    seq: seqOf(off, 0), role: 'assistant', kind: 'question', text: '질문',
    tool: { name: 'AskUserQuestion', title: '질문 1개', id },
    question: { header: 'h', question: '계절?', options: [{ label: '봄' }], multiSelect: false },
    questions: [{ header: 'h', question: '계절?', options: [{ label: '봄' }], multiSelect: false }],
  } as ChatMsg);

  it('마지막 표시 행이 결과 없는 질문(questions 있음)일 때만 잡는다', () => {
    expect(pendingTuiQuestion(buildRows([userMsg(0, 'q'), tuiQuestion(1, 't1')]))).toBeTruthy();
  });
  it('답이 붙었으면 null', () => {
    expect(pendingTuiQuestion(buildRows([tuiQuestion(0, 't1'), toolResult(1, 't1', '봄')]))).toBeNull();
  });
  it('질문 뒤에 대화가 이어졌으면 null(다이얼로그는 이미 지나갔다)', () => {
    expect(pendingTuiQuestion(buildRows([tuiQuestion(0, 't1'), asstMsg(1, '넘어갑니다')]))).toBeNull();
  });
  it('questions 배열이 없으면(구 데몬) null — 조작 계획을 세울 수 없다', () => {
    const old = { ...tuiQuestion(0, 't1') } as ChatMsg;
    delete (old as any).questions;
    expect(pendingTuiQuestion(buildRows([old]))).toBeNull();
  });
});
