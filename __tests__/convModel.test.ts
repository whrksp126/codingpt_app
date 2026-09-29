/**
 * 채팅 v2 순수 모델 — 계약(chat-v2-design.md §2·§3·§10)을 고정한다.
 *
 * 여기서 틀리면 화면에는 오류가 안 뜨고 **내용이 조용히 어긋난다**:
 *  · 틈을 건너뛰고 적용 → 그 사이의 승인 요청·메시지가 영영 안 보인다(다음 프레임은 다시 이어져 보인다).
 *  · 어긋난 델타를 이어 붙임 → 글자가 빠지거나 겹친 문장을 사용자가 읽는다.
 *  · 낙관 버블을 잘못 걷음 → 보낸 말이 사라지거나 두 번 보인다 / 재시도가 중복 전송이 된다.
 */
import {
  addOutgoing, applyBefore, applyDelta, applyOpen, applyPush, applySince, buildItems, closeReqLocal, dropOutgoing,
  emptyState, exportEvents, fmtDuration, hasOlder, importSnapshot, ingestEvents, isWorking, liveBlocks, newItemCache,
  pendingReqs, pollDue, retryOutgoing, sendAccepted, sendFailed, sendRejected, reviveFailed, hideKey, isRetryable, visibleOutbox, workingLabel,
  answersForWire, reqToApproval, convModeLabel, convModeChoices, errorText, noticeText, isWaiting,
  type ConvEvent, type ConvMsg, type ConvReq, type ConvState,
} from '../src/workspace/conv/convModel';

const T0 = 1790000000000;
const msg = (seq: number, key: string, p: Partial<ConvMsg> = {}): ConvEvent => ({
  seq, ts: T0 + seq, op: 'msg',
  msg: { key, seq, ts: T0 + seq, role: 'assistant', kind: 'text', text: `m${seq}`, ...p } as ConvMsg,
});
const user = (seq: number, clientId: string, status: 'queued' | 'sent' | 'failed', text = 'hi'): ConvEvent =>
  msg(seq, 'u:' + clientId, { role: 'user', kind: 'text', text, clientId, status });
const req = (seq: number, id: string, status: ConvReq['status'], p: Partial<ConvReq> = {}): ConvEvent => ({
  seq, ts: T0 + seq, op: 'req', req: { id, kind: 'permission', tool: 'Bash', summary: 'ls', status, requestedAt: T0 + seq, turn: 1, ...p },
});
const opened = (events: ConvEvent[], head?: number): ConvState =>
  applyOpen(emptyState('t1'), { thread: { id: 't1', state: 'idle' }, events, headSeq: head ?? (events.length ? events[events.length - 1].seq : 0), floorSeq: events.length ? events[0].seq : 0, live: [] }, 't1');
const keysOf = (s: ConvState) => s.order.map((k) => `${k}@${s.msgs[k].seq}`);

describe('push 이벤트 — seq 연속성(§3)', () => {
  test('이어지는 프레임은 적용하고 head 가 전진한다', () => {
    const s0 = opened([msg(1, 'a'), msg(2, 'b')]);
    const r = applyPush(s0, { threadId: 't1', headSeq: 4, events: [msg(3, 'c'), msg(4, 'd')] });
    expect(r.need).toBe('none');
    expect(r.state.headSeq).toBe(4);
    expect(r.state.order).toEqual(['a', 'b', 'c', 'd']);
  });

  test('★ 틈이 있으면 **아무것도 적용하지 않고** since 를 요구한다', () => {
    const s0 = opened([msg(1, 'a'), msg(2, 'b')]);
    const r = applyPush(s0, { threadId: 't1', headSeq: 5, events: [msg(5, 'e')] });
    expect(r.need).toBe('since');
    expect(r.state.headSeq).toBe(2);
    expect(r.state.order).toEqual(['a', 'b']);
  });

  test('중복 프레임(이미 받은 구간)은 버린다 — since 를 부르지 않는다', () => {
    const s0 = opened([msg(1, 'a'), msg(2, 'b'), msg(3, 'c')]);
    const r = applyPush(s0, { threadId: 't1', headSeq: 3, events: [msg(2, 'b'), msg(3, 'c')] });
    expect(r.need).toBe('none');
    expect(r.state).toBe(s0);
  });

  test('역순으로 온 프레임 — 늦게 온 앞 프레임은 중복이고, 먼저 온 뒤 프레임은 틈이다', () => {
    const s0 = opened([msg(1, 'a')]);
    const late = applyPush(s0, { threadId: 't1', events: [msg(3, 'c')] });       // 2 를 건너뜀
    expect(late.need).toBe('since');
    const first = applyPush(late.state, { threadId: 't1', events: [msg(2, 'b')] });
    expect(first.need).toBe('none');
    expect(first.state.headSeq).toBe(2);
    // 3 은 버려졌으므로 아직 없다 — since 가 메운다(적용했다면 2 가 빠진 채 굳었을 것이다).
    expect(first.state.order).toEqual(['a', 'b']);
  });

  test('앞부분이 겹치는 프레임은 이어지는 뒷부분만 적용한다', () => {
    const s0 = opened([msg(1, 'a'), msg(2, 'b')]);
    const r = applyPush(s0, { threadId: 't1', events: [msg(2, 'b'), msg(3, 'c')] });
    expect(r.need).toBe('none');
    expect(r.state.headSeq).toBe(3);
    expect(r.state.order).toEqual(['a', 'b', 'c']);
  });

  test('프레임 안에서 seq 가 끊겨 있으면 통째로 버린다', () => {
    const s0 = opened([msg(1, 'a')]);
    const r = applyPush(s0, { threadId: 't1', events: [msg(2, 'b'), msg(4, 'd')] });
    expect(r.need).toBe('since');
    expect(r.state.headSeq).toBe(1);
  });

  test('다른 대화·다른 PC 의 프레임은 무시한다', () => {
    const s0 = opened([msg(1, 'a')]);
    expect(applyPush(s0, { threadId: 'other', events: [msg(2, 'b')] }).state).toBe(s0);
    expect(applyPush(s0, { threadId: 't1', hostDeviceId: 9, events: [msg(2, 'b')] }, 7).state).toBe(s0);
    // hostDeviceId 가 없는 프레임(구 back)은 받는다.
    expect(applyPush(s0, { threadId: 't1', events: [msg(2, 'b')] }, 7).state.headSeq).toBe(2);
    expect(applyPush(s0, { threadId: 't1', hostDeviceId: 7, events: [msg(2, 'b')] }, 7).state.headSeq).toBe(2);
  });

  test('control deleted/gone', () => {
    const s0 = opened([msg(1, 'a')]);
    expect(applyPush(s0, { control: { kind: 'deleted', threadId: 't1' } }).state.gone).toBe('deleted');
    expect(applyPush(s0, { control: { kind: 'gone', threadId: 'zz' } }).state.gone).toBeNull();
    expect(isWorking({ ...s0, gone: 'deleted', thread: { id: 't1', state: 'working' } })).toBe(false);
  });

  test('thread 힌트는 제목·상태를 갱신한다', () => {
    const s0 = opened([msg(1, 'a')]);
    const r = applyPush(s0, { threadId: 't1', thread: { id: 't1', title: '새 제목', state: 'working' } });
    expect(r.state.thread).toMatchObject({ title: '새 제목', state: 'working' });
    expect(r.need).toBe('none');
  });

  test('★ thread 힌트의 headSeq 가 내 것보다 크면 당겨 온다(가져온 과거는 push 되지 않는다)', () => {
    const s0 = opened([msg(1, 'a'), msg(2, 'b')]);
    expect(applyPush(s0, { threadId: 't1', thread: { id: 't1', headSeq: 40 } }).need).toBe('since');
    expect(applyPush(s0, { threadId: 't1', thread: { id: 't1', headSeq: 2 } }).need).toBe('none');
    // 같은 프레임에 이벤트가 실려 있으면 그쪽이 판정한다(이어지면 적용, 끝).
    const r = applyPush(s0, { threadId: 't1', thread: { id: 't1', headSeq: 3 }, events: [msg(3, 'c')] });
    expect(r.need).toBe('none');
    expect(r.state.headSeq).toBe(3);
  });
});

describe('upsert — key 로 접는다(§2.2)', () => {
  test('★ 같은 key 의 뒤 이벤트가 내용을 대체하되 **자리는 처음 나타난 곳**', () => {
    let s = opened([user(1, 'c1', 'queued'), msg(2, 'a')]);
    s = applyPush(s, { threadId: 't1', events: [user(3, 'c1', 'sent')] }).state;
    expect(s.order).toEqual(['u:c1', 'a']);
    expect(s.msgs['u:c1'].status).toBe('sent');
    expect(s.msgs['u:c1'].seq).toBe(3);
    expect(s.first['u:c1']).toBe(1);
  });

  test('옛 이벤트가 뒤늦게 와도 새 내용을 덮지 않는다(멱등·순서 무관)', () => {
    const a = ingestEvents(emptyState('t1'), [user(1, 'c1', 'queued'), user(3, 'c1', 'sent')]);
    const b = ingestEvents(emptyState('t1'), [user(3, 'c1', 'sent'), user(1, 'c1', 'queued')]);
    expect(a.msgs['u:c1'].status).toBe('sent');
    expect(b.msgs['u:c1'].status).toBe('sent');
    expect(b.first['u:c1']).toBe(1);
    // 같은 묶음을 두 번 넣어도 같은 상태(참조까지 같다 = 리렌더 0).
    expect(ingestEvents(a, [user(1, 'c1', 'queued'), user(3, 'c1', 'sent')])).toBe(a);
  });

  test('★ 접은 스냅샷 — 옛 줄이 빠져 있어도 `first` 가 자리를 알려 준다', () => {
    // 데몬의 open 응답: 'queued'(seq 1) 줄은 접혀 빠지고 'sent'(seq 3, first 1) 만 온다. seq 는 띄엄띄엄하다.
    const sent = { ...user(3, 'c1', 'sent'), first: 1 } as ConvEvent;
    const s = opened([msg(2, 'a'), sent], 3);
    expect(s.order).toEqual(['u:c1', 'a']);
    expect(s.first['u:c1']).toBe(1);
    expect(s.headSeq).toBe(3);
    // first 가 없으면(옛 데몬) 받은 seq 자리에 선다.
    expect(opened([msg(2, 'a'), user(3, 'c1', 'sent')], 3).order).toEqual(['a', 'u:c1']);
  });

  test('행 key 는 ConvMsg.key — upsert 로 seq 가 바뀌어도 같은 행이다(리마운트 없음)', () => {
    let s = opened([user(1, 'c1', 'queued'), msg(2, 'a')]);
    const k1 = buildItems(s).map((i) => i.key);
    s = applyPush(s, { threadId: 't1', events: [user(3, 'c1', 'sent')] }).state;
    expect(buildItems(s).map((i) => i.key)).toEqual(k1);
    expect(k1).toEqual(['m:u:c1', 'm:a']);
  });

  test('도구 호출과 결과는 한 행으로 접힌다(v1 규칙 재사용) + 결과가 붙으면 그 행만 새 객체', () => {
    const tool = msg(2, 'tu_1', { kind: 'tool_use', text: '', tool: { name: 'Read', title: '읽기 a.ts', id: 'tu_1' } });
    const res = msg(3, 'r:tu_1', { role: 'user', kind: 'tool_result', text: 'ok', result: { toolUseId: 'tu_1', ok: true, preview: 'ok', bytes: 2, lines: 1, truncated: false, images: 0 } });
    const cache = newItemCache();
    let s = opened([msg(1, 'a'), tool]);
    const before = buildItems(s, cache);
    expect(before.map((i) => i.key)).toEqual(['m:a', 'm:tu_1']);
    s = applyPush(s, { threadId: 't1', events: [res] }).state;
    const after = buildItems(s, cache);
    expect(after.map((i) => i.key)).toEqual(['m:a', 'm:tu_1']);
    expect(after[0]).toBe(before[0]);        // 안 바뀐 행은 같은 객체(memo 가 먹는다)
    expect(after[1]).not.toBe(before[1]);
    expect(after[1].t === 'msg' && after[1].row.result?.ok).toBe(true);
  });

  test('행 캐시 — 아무것도 안 바뀌면 전 행이 같은 객체다', () => {
    const cache = newItemCache();
    const s = opened([msg(1, 'a'), msg(2, 'b')]);
    const a = buildItems(s, cache);
    const b = buildItems({ ...s, live: { x: { key: 'x', kind: 'text', text: 'abc' } } }, cache);
    expect(b.length).toBe(2);
    b.forEach((it, i) => expect(it).toBe(a[i]));
  });
});

describe('델타 — off 검사(§2.5)', () => {
  const base = () => opened([msg(1, 'a')]);

  test('off 가 누적 길이와 같으면 이어 붙인다', () => {
    let s = applyDelta(base(), { key: 'm:0', kind: 'text', off: 0, text: '안녕' }).state;
    s = applyDelta(s, { key: 'm:0', kind: 'text', off: 2, text: '하세요' }).state;
    expect(s.live['m:0'].text).toBe('안녕하세요');
    expect(liveBlocks(s).map((l) => l.key)).toEqual(['m:0']);
  });

  test('★ off 가 어긋나면 **붙이지 않고** since 를 요구한다', () => {
    const s = applyDelta(base(), { key: 'm:0', kind: 'text', off: 0, text: 'abc' }).state;
    const r = applyDelta(s, { key: 'm:0', kind: 'text', off: 5, text: 'xyz' });
    expect(r.need).toBe('since');
    expect(r.state.live['m:0'].text).toBe('abc');
    // 앞 조각을 못 받고 시작한 경우도 같다.
    expect(applyDelta(base(), { key: 'm:1', kind: 'text', off: 10, text: 'x' }).need).toBe('since');
  });

  test('이미 받은 구간의 재배달은 조용히 버린다', () => {
    const s = applyDelta(base(), { key: 'm:0', kind: 'text', off: 0, text: 'abcdef' }).state;
    const r = applyDelta(s, { key: 'm:0', kind: 'text', off: 2, text: 'cd' });
    expect(r.need).toBe('none');
    expect(r.state).toBe(s);
    // 같은 자리인데 글자가 다르면 틈이다.
    expect(applyDelta(s, { key: 'm:0', kind: 'text', off: 2, text: 'ZZ' }).need).toBe('since');
  });

  test('완성 msg 가 오면 초안은 사라진다 + 늦게 온 조각은 버린다', () => {
    let s = applyDelta(base(), { key: 'blk', kind: 'text', off: 0, text: '초안' }).state;
    s = applyPush(s, { threadId: 't1', events: [msg(2, 'blk', { text: '완성본' })] }).state;
    expect(s.live.blk).toBeUndefined();
    expect(s.msgs.blk.text).toBe('완성본');
    const late = applyDelta(s, { key: 'blk', kind: 'text', off: 2, text: '뒤늦은' });
    expect(late.need).toBe('none');
    expect(late.state).toBe(s);
  });

  test('틈이 난 프레임에 실린 델타는 적용하지 않는다', () => {
    const r = applyPush(base(), { threadId: 't1', events: [msg(9, 'z')], delta: { key: 'k', kind: 'text', off: 0, text: 'x' } });
    expect(r.need).toBe('since');
    expect(r.state.live.k).toBeUndefined();
  });

  test('thinking 은 본문이 비어 올 수 있다', () => {
    const s = applyDelta(base(), { key: 'th', kind: 'thinking', off: 0, text: '' }).state;
    expect(s.live.th).toEqual({ key: 'th', kind: 'thinking', text: '' });
    expect(workingLabel(s)).toEqual({ kind: 'thinking', text: '' });
  });
});

describe('낙관 버블 상태 기계(§10.2)', () => {
  const start = () => addOutgoing(opened([msg(1, 'a')]), { clientId: 'c1', text: '해줘', at: T0 });

  test('sending → 접수(sent/queued) → 서버 msg 가 버블을 대체', () => {
    let s = start();
    expect(s.outbox[0]).toMatchObject({ status: 'sending', tries: 1, text: '해줘' });
    s = sendAccepted(s, 'c1', 'queued');
    expect(s.outbox[0].status).toBe('queued');
    s = applyPush(s, { threadId: 't1', events: [user(2, 'c1', 'queued', '해줘')] }).state;
    expect(s.outbox).toEqual([]);
    expect(buildItems(s).map((i) => `${i.t}:${i.key}`)).toEqual(['msg:m:a', 'msg:m:u:c1']);
  });

  test('낙관 버블과 서버 행의 목록 key 가 같다(칸이 그대로 남는다)', () => {
    const s = start();
    expect(buildItems(s).map((i) => `${i.t}:${i.key}`)).toEqual(['msg:m:a', 'out:m:u:c1']);
  });

  test('서버 msg 가 접수 응답보다 먼저 와도 버블이 되살아나지 않는다', () => {
    let s = start();
    s = applyPush(s, { threadId: 't1', events: [user(2, 'c1', 'sent', '해줘')] }).state;
    s = sendAccepted(s, 'c1', 'sent');
    expect(s.outbox).toEqual([]);
  });

  test('실패 → failed(원문 보관) → 다시 시도는 **같은 clientId**', () => {
    let s = sendFailed(start(), 'c1', 'TIMEOUT');
    expect(s.outbox[0]).toMatchObject({ status: 'failed', code: 'TIMEOUT', text: '해줘' });
    const r = retryOutgoing(s, 'c1');
    expect(r.send).toMatchObject({ clientId: 'c1', status: 'sending', tries: 2 });
    expect(r.state.outbox[0].code).toBeUndefined();
    s = r.state;
    // ★ 연타 — 이미 보내는 중이면 다시 보내지 않는다(재시도가 중복 전송이 되지 않는다).
    const again = retryOutgoing(s, 'c1');
    expect(again.send).toBeNull();
    expect(again.state).toBe(s);
  });

  test('★ 타임아웃 뒤에 서버가 이미 받았음이 확인되면 실패가 아니다', () => {
    let s = start();
    s = applyPush(s, { threadId: 't1', events: [user(2, 'c1', 'sent', '해줘')] }).state;
    s = sendFailed(s, 'c1', 'TIMEOUT');
    expect(visibleOutbox(s)).toEqual([]);
    expect(s.msgs['u:c1'].status).toBe('sent');
  });

  test("서버가 'failed' 로 적은 메시지는 버블이 대신 그린다(다시 시도·삭제가 버블에 있다)", () => {
    let s = start();
    s = applyPush(s, { threadId: 't1', events: [user(2, 'c1', 'failed', '해줘')] }).state;
    s = sendFailed(s, 'c1', 'START_FAILED');
    expect(s.outbox[0].status).toBe('failed');
    expect(buildItems(s).map((i) => `${i.t}:${i.key}`)).toEqual(['msg:m:a', 'out:m:u:c1']);
    expect(buildItems(dropOutgoing(s, 'c1')).map((i) => i.t)).toEqual(['msg', 'msg']);
  });

  test("★ 'queued' 회신은 실패가 아니다 — 확인은 push 로 뒤따른다", () => {
    let s = sendAccepted(start(), 'c1', 'queued');
    expect(s.outbox[0]).toMatchObject({ status: 'queued' });
    expect(s.outbox[0].code).toBeUndefined();
    s = applyPush(s, { threadId: 't1', events: [user(2, 'c1', 'queued', '해줘')] }).state;
    s = applyPush(s, { threadId: 't1', events: [{ ...user(3, 'c1', 'sent', '해줘'), first: 2 } as ConvEvent] }).state;
    expect(s.msgs['u:c1'].status).toBe('sent');
    expect(s.outbox).toEqual([]);
  });

  test('★ 전달 없이 거절된 전송(터미널 전용 명령) — 실패 버블이 아니라 안내', () => {
    let s = addOutgoing(opened([msg(1, 'a')]), { clientId: 'c7', text: '/vim', at: T0 });
    s = sendRejected(s, 'c7', 'TERMINAL_ONLY_COMMAND');
    expect(s.outbox).toEqual([]);                           // 버블을 걷는다(다시 보내도 같은 결과다)
    s = applyPush(s, { threadId: 't1', events: [user(2, 'c7', 'failed', '/vim'), { seq: 3, ts: T0, op: 'notice', level: 'info', code: 'TERMINAL_ONLY_COMMAND', text: '이 명령은 터미널에서만 쓸 수 있습니다' }] }).state;
    const items = buildItems(s);
    const row = items.find((i) => i.key === 'm:u:c7')!;
    expect(row.t === 'msg' && row.failed).toBe('TERMINAL_ONLY_COMMAND');
    expect(isRetryable('TERMINAL_ONLY_COMMAND')).toBe(false);
    expect(errorText('TERMINAL_ONLY_COMMAND')).toBe('이 명령은 터미널에서만 쓸 수 있어요.');
    expect(items.some((i) => i.t === 'notice')).toBe(true);
  });

  test('★ 프로세스가 죽어 서버가 failed 로 바꾼 메시지 — 같은 clientId 로 다시 보낸다', () => {
    let s = opened([msg(1, 'a'), user(2, 'c1', 'queued', '해줘')]);
    s = applyPush(s, { threadId: 't1', events: [{ ...user(3, 'c1', 'failed', '해줘'), first: 2 } as ConvEvent] }).state;
    const row = buildItems(s).find((i) => i.key === 'm:u:c1')!;
    expect(row.t === 'msg' && row.failed).toBe('UNKNOWN');
    expect(row.t === 'msg' && row.msgKey).toBe('u:c1');
    expect(isRetryable('UNKNOWN')).toBe(true);
    const r = reviveFailed(s, 'u:c1', T0 + 9);
    expect(r.clientId).toBe('c1');
    expect(r.state.outbox[0]).toMatchObject({ clientId: 'c1', text: '해줘', sendText: '해줘', status: 'sending' });
    // 버블이 그 행을 대신 그린다(둘 다 보이지 않는다).
    expect(buildItems(r.state).map((i) => `${i.t}:${i.key}`)).toEqual(['msg:m:a', 'out:m:u:c1']);
    // 연타해도 버블은 하나.
    expect(reviveFailed(r.state, 'u:c1', T0 + 10).clientId).toBeNull();
    // 서버가 다시 받아들이면 버블이 걷히고 행이 정상으로 돌아온다.
    const ok = applyPush(r.state, { threadId: 't1', events: [{ ...user(4, 'c1', 'sent', '해줘'), first: 2 } as ConvEvent] }).state;
    expect(ok.outbox).toEqual([]);
    const back = buildItems(ok).find((i) => i.key === 'm:u:c1')!;
    expect(back.t === 'msg' && back.failed).toBeUndefined();
  });

  test('실패한 서버 행의 [삭제] 는 이 기기에서만 감춘다', () => {
    const s = opened([msg(1, 'a'), user(2, 'c1', 'failed', '해줘')]);
    const h = hideKey(s, 'u:c1');
    expect(buildItems(h).map((i) => i.key)).toEqual(['m:a']);
    expect(h.msgs['u:c1']).toBeTruthy();
    expect(hideKey(h, 'u:c1')).toBe(h);
    // 실패가 아닌 메시지는 되살리지 않는다.
    expect(reviveFailed(opened([user(1, 'c2', 'sent')]), 'u:c2', T0).clientId).toBeNull();
  });

  test('오프라인이면 보내지 않고 처음부터 failed', () => {
    const s = addOutgoing(opened([]), { clientId: 'c9', text: 'x', at: T0, offline: true });
    expect(s.outbox[0]).toMatchObject({ status: 'failed', code: 'DAEMON_OFFLINE', tries: 0 });
  });

  test('같은 clientId 를 두 번 넣어도 버블은 하나', () => {
    const s = start();
    expect(addOutgoing(s, { clientId: 'c1', text: '해줘', at: T0 })).toBe(s);
  });

  test('다른 기기가 보낸 메시지(내 버블 없음)는 그냥 행으로 뜬다', () => {
    const s = applyPush(start(), { threadId: 't1', events: [user(2, 'other', 'sent', '남의 말')] }).state;
    expect(s.outbox.length).toBe(1);
    expect(buildItems(s).map((i) => i.key)).toEqual(['m:a', 'm:u:other', 'm:u:c1']);
  });

  test('대기열 메시지는 queued 표식을 단다', () => {
    const s = opened([user(1, 'c1', 'queued')]);
    const it = buildItems(s)[0];
    expect(it.t === 'msg' && it.queued).toBe(true);
  });
});

describe('요청(§2.4·§10.8)', () => {
  test('가장 오래된 것부터 + 닫힌 것은 빠진다', () => {
    let s = opened([req(1, 'r1', 'pending'), req(2, 'r2', 'pending')]);
    expect(pendingReqs(s).map((r) => r.id)).toEqual(['r1', 'r2']);
    // 다른 기기가 먼저 답했다 → req upsert 로 카드가 닫힌다.
    s = applyPush(s, { threadId: 't1', events: [req(3, 'r1', 'allowed', { by: 'MacBook' })] }).state;
    expect(pendingReqs(s).map((r) => r.id)).toEqual(['r2']);
    expect(s.reqs.r1.by).toBe('MacBook');
  });

  test('취소(중단·프로세스 종료)도 닫힘이다', () => {
    const s = opened([req(1, 'r1', 'pending'), req(2, 'r1', 'canceled', { reason: 'interrupted' })]);
    expect(pendingReqs(s)).toEqual([]);
  });

  test('옛 pending 이 뒤늦게 와도 닫힌 요청을 되살리지 않는다', () => {
    const s = ingestEvents(opened([req(5, 'r1', 'answered')]), [req(2, 'r1', 'pending')]);
    expect(pendingReqs(s)).toEqual([]);
  });

  test('내가 답한 요청은 즉시 닫는다(낙관) — 이미 닫힌 것은 건드리지 않는다', () => {
    const s = opened([req(1, 'r1', 'pending')]);
    const c = closeReqLocal(s, 'r1', 'allowed');
    expect(pendingReqs(c)).toEqual([]);
    expect(closeReqLocal(c, 'r1', 'denied')).toBe(c);
  });

  test('conv.open 의 pending — 이벤트 창 밖의 오래된 요청도 도크에 뜬다', () => {
    const s = applyOpen(emptyState('t1'), {
      thread: { id: 't1', state: 'waiting' }, events: [msg(40, 'a')], headSeq: 40, floorSeq: 40,
      pending: [{ id: 'old', kind: 'question', status: 'pending', requestedAt: T0, questions: [{ header: 'h', question: '어느 쪽?', options: [{ label: 'A' }], multiSelect: false }] }],
    }, 't1');
    expect(pendingReqs(s).map((r) => r.id)).toEqual(['old']);
    // 뒤에 오는 req 이벤트가 그것을 닫을 수 있어야 한다.
    expect(pendingReqs(applyPush(s, { threadId: 't1', events: [req(41, 'old', 'answered')] }).state)).toEqual([]);
  });

  test('답을 기다리는 질문은 목록에서 빠진다(도크가 그린다)', () => {
    const q = msg(2, 'tu_q', { kind: 'question', text: '', tool: { name: 'AskUserQuestion', title: '질문', id: 'tu_q' }, question: { header: 'h', question: '어느 쪽?', options: [{ label: 'A' }], multiSelect: false } });
    const s = opened([msg(1, 'a'), q, req(3, 'r1', 'pending', { kind: 'question', toolUseId: 'tu_q' })]);
    expect(buildItems(s).map((i) => i.key)).toEqual(['m:a']);
    const done = applyPush(s, { threadId: 't1', events: [req(4, 'r1', 'answered', { kind: 'question', toolUseId: 'tu_q' })] }).state;
    expect(buildItems(done).map((i) => i.key)).toEqual(['m:a', 'm:tu_q']);
  });

  test('answers 와이어 모양 = {"질문 문구": "라벨" | ["라벨",…] | "자유 텍스트"}(§4.4)', () => {
    const r: ConvReq = { id: 'r', kind: 'question', status: 'pending', questions: [
      { header: 'h1', question: '색?', options: [{ label: '빨강' }, { label: '파랑' }], multiSelect: true },
      { header: 'h2', question: '크기?', options: [{ label: '큼' }], multiSelect: false },
      { header: 'h3', question: '모양?', options: [{ label: '원' }], multiSelect: false },
    ] };
    expect(answersForWire(r, [
      { questionIndex: 0, labels: ['빨강', '파랑'] },
      { questionIndex: 1, labels: [], text: ' 중간 ' },
      { questionIndex: 2, labels: ['원'] },
    ])).toEqual({ '색?': ['빨강', '파랑'], '크기?': '중간', '모양?': '원' });
    // 답이 빈 질문은 싣지 않는다.
    expect(answersForWire(r, [{ questionIndex: 0, labels: [] }])).toEqual({});
  });

  test('★ 응답의 pending 목록과 맞춘다 — 닫는 이벤트를 놓쳤어도 답할 수 없는 카드가 남지 않는다', () => {
    const s0 = opened([req(1, 'r1', 'pending'), req(2, 'r2', 'pending')]);
    const r = applySince(s0, { thread: { id: 't1', state: 'working' }, events: [], headSeq: 2, live: [], pending: [{ id: 'r2', kind: 'permission', status: 'pending', requestedAt: T0 }] });
    expect(pendingReqs(r.state).map((x) => x.id)).toEqual(['r2']);
    expect(r.state.reqs.r1.status).toBe('canceled');
    // ★ 응답보다 **뒤에** push 로 온 요청은 건드리지 않는다(응답이 만들어질 때는 없던 요청이다).
    let s1 = opened([req(1, 'r1', 'pending')]);
    s1 = applyPush(s1, { threadId: 't1', events: [msg(2, 'x'), req(3, 'r9', 'pending')] }).state;
    const late = applySince({ ...s1, headSeq: 2 }, { thread: { id: 't1' }, events: [], headSeq: 2, live: [], pending: [] });
    expect(late.state.reqs.r1.status).toBe('canceled');
    expect(late.state.reqs.r9.status).toBe('pending');
    // 이어 받는 중(more)에는 닫지 않는다 — 아직 다 받지 못한 목록이다.
    const m = applySince(s0, { events: [msg(3, 'x')], headSeq: 9, more: true, pending: [] });
    expect(pendingReqs(m.state).map((x) => x.id)).toEqual(['r1', 'r2']);
  });

  test('승인 카드 모양으로 바꾼다 — 마감 없음', () => {
    const a = reqToApproval({ id: 'r', kind: 'plan', status: 'pending', plan: '1. 한다' }, { id: 't1', agent: 'claude' }, 'work/app');
    expect(a).toMatchObject({ id: 'r', deadlineAt: 0, cwd: 'work/app', prompt: { kind: 'choice', plan: '1. 한다' } });
    expect(a.prompt.questions).toBeUndefined();
    const p = reqToApproval({ id: 'p', kind: 'permission', status: 'pending', tool: 'Bash', summary: 'rm', alwaysLabel: 'Bash(rm:*)' }, null, '');
    expect(p).toMatchObject({ tool: 'Bash', alwaysLabel: 'Bash(rm:*)', prompt: { kind: 'permission' } });
  });
});

describe('턴 상태', () => {
  const turn = (seq: number, phase: 'start' | 'end', p: Record<string, unknown> = {}): ConvEvent => ({ seq, ts: T0 + seq * 1000, op: 'turn', phase, turn: 1, ...p } as ConvEvent);

  test('turn start → 작업 중, turn end → 끝 + 요약 행', () => {
    let s = opened([msg(1, 'a')]);
    s = applyPush(s, { threadId: 't1', events: [turn(2, 'start')] }).state;
    expect(isWorking(s)).toBe(true);
    expect(s.turn).toMatchObject({ n: 1, startedAt: T0 + 2000 });
    s = applyPush(s, { threadId: 't1', events: [msg(3, 'b'), turn(4, 'end', { ok: true, durationMs: 12000 })] }).state;
    expect(isWorking(s)).toBe(false);
    expect(buildItems(s).map((i) => `${i.t}:${i.key}`)).toEqual(['msg:m:a', 'msg:m:b', 'turn:t:4']);
  });

  test('★ working/waiting 은 state 이벤트로 오지 않는다 — turn·req 이벤트에서 따라간다', () => {
    let s = opened([msg(1, 'a')]);
    expect(s.thread?.state).toBe('idle');
    s = applyPush(s, { threadId: 't1', events: [turn(2, 'start')] }).state;
    expect(s.thread?.state).toBe('working');
    s = applyPush(s, { threadId: 't1', events: [req(3, 'r1', 'pending')] }).state;
    expect(s.thread?.state).toBe('waiting');
    expect(isWaiting(s)).toBe(true);
    s = applyPush(s, { threadId: 't1', events: [req(4, 'r1', 'allowed')] }).state;
    expect(s.thread?.state).toBe('working');
    s = applyPush(s, { threadId: 't1', events: [turn(5, 'end', { ok: true })] }).state;
    expect(s.thread?.state).toBe('idle');
    expect(isWorking(s)).toBe(false);
  });

  test('턴 끝 뒤에 state 이벤트가 error 를 말하면 그쪽이 맞다', () => {
    let s = applyPush(opened([msg(1, 'a')]), { threadId: 't1', events: [turn(2, 'start')] }).state;
    s = applyPush(s, { threadId: 't1', events: [turn(3, 'end', { ok: false }), { seq: 4, ts: T0, op: 'state', state: 'error' }] }).state;
    expect(s.thread?.state).toBe('error');
    expect(isWorking(s)).toBe(false);
  });

  test('진행 중에 들어왔다(턴 시작을 못 봤다) — 응답의 state 를 믿고, 요청이 열리고 닫히는 것을 따라간다', () => {
    let s = applyOpen(emptyState('t1'), { thread: { id: 't1', state: 'working' }, events: [msg(9, 'x')], headSeq: 9, floorSeq: 5, live: [] }, 't1');
    expect(isWorking(s)).toBe(true);
    s = applyPush(s, { threadId: 't1', events: [req(10, 'r1', 'pending')] }).state;
    expect(s.thread?.state).toBe('waiting');
    s = applyPush(s, { threadId: 't1', events: [req(11, 'r1', 'denied')] }).state;
    expect(s.thread?.state).toBe('working');
    // 이전 내역(옛 이벤트)을 받아도 지금 상태는 바뀌지 않는다.
    const older = applyBefore(s, { events: [turn(2, 'start'), req(3, 'old', 'pending'), req(4, 'old', 'allowed'), turn(5, 'end', { ok: true })], floorSeq: 1 });
    expect(older.thread?.state).toBe('working');
    expect(isWorking(older)).toBe(true);
  });

  test('턴 끝을 못 받았어도 state 가 idle/error 면 작업 중에 굳지 않는다', () => {
    let s = applyPush(opened([msg(1, 'a')]), { threadId: 't1', events: [turn(2, 'start')] }).state;
    s = applyPush(s, { threadId: 't1', events: [{ seq: 3, ts: T0, op: 'state', state: 'error' }] }).state;
    expect(isWorking(s)).toBe(false);
    expect(s.thread?.state).toBe('error');
  });

  test('이미 끝난 턴의 start 가 뒤늦게 와도 되살아나지 않는다', () => {
    const s = ingestEvents(opened([turn(2, 'start'), turn(5, 'end', { ok: true })]), [turn(2, 'start')]);
    expect(isWorking(s)).toBe(false);
  });

  test('턴이 끝나면 남은 초안은 버린다', () => {
    let s = applyDelta(opened([msg(1, 'a')]), { key: 'x', kind: 'text', off: 0, text: '쓰다 만' }).state;
    s = applyPush(s, { threadId: 't1', events: [turn(2, 'end', { interrupted: true })] }).state;
    expect(liveBlocks(s)).toEqual([]);
  });

  test('state 이벤트 — 옛 이벤트가 새 모드를 덮지 않는다', () => {
    let s = opened([{ seq: 5, ts: T0, op: 'state', mode: 'plan' }]);
    s = ingestEvents(s, [{ seq: 2, ts: T0, op: 'state', mode: 'default' }]);
    expect(s.thread?.mode).toBe('plan');
  });

  test('진행 중 도구의 제목이 작업 중 표시가 된다 — 결과가 붙으면 사라진다', () => {
    const tool = msg(2, 'tu_1', { kind: 'tool_use', text: '', tool: { name: 'Bash', title: '$ npm test', id: 'tu_1' } });
    let s = opened([msg(1, 'a'), tool]);
    expect(workingLabel(s)).toEqual({ kind: 'tool', text: '$ npm test' });
    s = applyPush(s, { threadId: 't1', events: [msg(3, 'r:tu_1', { role: 'user', kind: 'tool_result', text: '', result: { toolUseId: 'tu_1', ok: true, preview: '', bytes: 0, lines: 0, truncated: false, images: 0 } })] }).state;
    expect(workingLabel(s)).toBeNull();
    // 글이 나오고 있으면 도구 제목을 남기지 않는다.
    const typing = applyDelta(opened([msg(1, 'a'), tool]), { key: 'k', kind: 'text', off: 0, text: '답' }).state;
    expect(workingLabel(typing)).toBeNull();
  });
});

describe('캐치업 — since/before/폴링(§10.1)', () => {
  test('since — 이어지는 이벤트를 붙이고 live 를 통째로 바꾼다', () => {
    const s0 = applyDelta(opened([msg(1, 'a')]), { key: 'old', kind: 'text', off: 0, text: '옛 초안' }).state;
    const r = applySince(s0, { thread: { id: 't1', state: 'working' }, events: [msg(2, 'b')], headSeq: 2, live: [{ key: 'blk', kind: 'text', text: '지금 쓰는 중' }] });
    expect(r.reset).toBe(false);
    expect(r.state.headSeq).toBe(2);
    expect(Object.keys(r.state.live)).toEqual(['blk']);
    expect(isWorking(r.state)).toBe(true);
  });

  test('★ reset:true — 로컬 상태를 버리고 응답으로 통째 교체한다', () => {
    let s0 = opened([msg(1, 'old1'), msg(2, 'old2'), msg(3, 'old3')]);
    s0 = addOutgoing(s0, { clientId: 'c1', text: '아직 보내는 중', at: T0 });
    const r = applySince(s0, { reset: true, thread: { id: 't1', state: 'idle', title: '다시 만든 대화' }, events: [msg(1, 'n1'), msg(2, 'n2')], headSeq: 2, floorSeq: 1, live: [], pending: [], more: false });
    expect(r.reset).toBe(true);
    expect(r.state.order).toEqual(['n1', 'n2']);
    expect(r.state.headSeq).toBe(2);
    expect(r.state.floorSeq).toBe(1);
    expect(r.state.msgs.old1).toBeUndefined();
    expect(r.state.outbox.length).toBe(1);                 // 낙관 버블은 남는다(아직 서버에 없을 수 있다)
  });

  test('★ 늦게 도착한 응답(서버 head < 내 head) — head·상태·자라던 글을 되돌리지 않는다', () => {
    // 요청을 보낸 뒤 push 가 먼저 와서 내 head 는 3, 자라는 글도 있다. 그 뒤에 head 1 짜리 응답이 도착했다.
    let s0 = opened([msg(1, 'a'), msg(2, 'b'), msg(3, 'c')]);
    s0 = applyPush(s0, { threadId: 't1', events: [{ seq: 4, ts: T0, op: 'turn', phase: 'start', turn: 2 }] }).state;
    s0 = applyDelta(s0, { key: 'blk', kind: 'text', off: 0, text: '쓰는 중' }).state;
    const r = applySince(s0, { thread: { id: 't1', state: 'idle', title: '옛 제목' }, events: [], headSeq: 1, live: [], pending: [] });
    expect(r.reset).toBe(false);
    expect(r.more).toBe(false);
    expect(r.state.headSeq).toBe(4);
    expect(r.state.live.blk.text).toBe('쓰는 중');
    expect(isWorking(r.state)).toBe(true);
    expect(r.state.thread?.title).toBeUndefined();
    expect(r.state).toBe(s0);                       // 아무것도 바뀌지 않았다
  });

  test('늦게 도착한 open 응답도 상태를 갈아엎지 않는다 — 모르던 옛 이벤트만 채운다', () => {
    let s0 = opened([msg(5, 'e'), msg(6, 'f')], 6);
    s0 = applyPush(s0, { threadId: 't1', events: [msg(7, 'g')] }).state;
    const late = applyOpen(s0, { thread: { id: 't1', state: 'idle' }, events: [msg(4, 'd'), msg(5, 'e'), msg(6, 'f')], headSeq: 6, floorSeq: 4, live: [] }, 't1');
    expect(late.headSeq).toBe(7);
    expect(late.order).toEqual(['d', 'e', 'f', 'g']);
    // 무조건 교체(reset)는 예외다.
    expect(applyOpen(s0, { thread: { id: 't1' }, events: [msg(1, 'n')], headSeq: 1, floorSeq: 1 }, 't1', { force: true }).order).toEqual(['n']);
  });

  test('★ since 응답은 접은 구간이다 — seq 가 띄엄띄엄해도 틈이 아니다', () => {
    // 내 head=1. 서버 로그 2(queued)·3·4(sent, 2를 대체)·5 중 접혀서 3·4·5 만 온다.
    const r = applySince(opened([msg(1, 'a')]), { thread: { id: 't1' }, events: [msg(3, 'b'), { ...user(4, 'c1', 'sent'), first: 2 } as ConvEvent, msg(5, 'c')], headSeq: 5, live: [] });
    expect(r.reset).toBe(false);
    expect(r.state.headSeq).toBe(5);
    expect(r.state.order).toEqual(['a', 'u:c1', 'b', 'c']);
    // upsert 가 있는 대화에서 since 를 되풀이해도 같은 결과다(다시 열기가 반복되지 않는다).
    const again = applySince(r.state, { thread: { id: 't1' }, events: [], headSeq: 5, live: [] });
    expect(again.state.order).toEqual(['a', 'u:c1', 'b', 'c']);
    expect(again.reset).toBe(false);
  });

  test('more 인데 받은 게 없으면 멈춘다(같은 요청을 끝없이 되풀이하지 않는다)', () => {
    const r = applySince(opened([msg(1, 'a')]), { events: [], headSeq: 9, more: true });
    expect(r.more).toBe(false);
  });

  test('more:true(512KB 예산) — **마지막 이벤트의 seq** 까지가 head, 이어 받는다', () => {
    const r = applySince(opened([msg(1, 'a')]), { events: [msg(2, 'b'), msg(3, 'c')], headSeq: 9, more: true, live: [{ key: 'z', kind: 'text', text: 'x' }] });
    expect(r.more).toBe(true);
    expect(r.state.headSeq).toBe(3);
    expect(r.state.live.z).toBeUndefined();      // 아직 중간이라 live 를 믿지 않는다
    const r2 = applySince(r.state, { events: [msg(4, 'd')], headSeq: 4, live: {} });
    expect(r2.more).toBe(false);
    expect(r2.state.order).toEqual(['a', 'b', 'c', 'd']);
  });

  test('open 도 more 면 받은 데까지만 head', () => {
    const s = applyOpen(emptyState('t1'), { thread: { id: 't1' }, events: [msg(5, 'e'), msg(6, 'f')], headSeq: 20, floorSeq: 5, more: true }, 't1');
    expect(s.headSeq).toBe(6);
  });

  test('새 이벤트 없는 전진(head 만 이동)도 받는다', () => {
    expect(applySince(opened([msg(1, 'a')]), { events: [], headSeq: 3 }).state.headSeq).toBe(3);
  });

  test('★ floorSeq 는 데몬이 준 값이다 — 받은 첫 seq 로 추측하지 않는다', () => {
    // 접은 스냅샷: 첫 줄이 seq 5 여도 그 앞이 없을 수 있다(앞 줄이 전부 접혀 빠졌다) → 데몬이 1 을 준다.
    const s = applyOpen(emptyState('t1'), { thread: { id: 't1' }, events: [msg(5, 'e'), msg(6, 'f')], headSeq: 6, floorSeq: 1, live: [] }, 't1');
    expect(hasOlder(s)).toBe(false);
    // 값이 없으면 더 앞이 없는 것으로 친다.
    expect(hasOlder(applyOpen(emptyState('t1'), { thread: { id: 't1' }, events: [msg(5, 'e')], headSeq: 5 }, 't1'))).toBe(false);
    expect(hasOlder(applyOpen(emptyState('t1'), { thread: { id: 't1' }, events: [msg(5, 'e')], headSeq: 5, floorSeq: 5 }, 't1'))).toBe(true);
  });

  test('before — 앞에 붙이고 head 는 그대로. 더 없으면 floor 가 1 로 굳는다', () => {
    const s0 = opened([msg(10, 'j'), msg(11, 'k')]);
    expect(hasOlder(s0)).toBe(true);
    const s1 = applyBefore(s0, { events: [msg(8, 'h'), msg(9, 'i')], floorSeq: 8 });
    expect(s1.order).toEqual(['h', 'i', 'j', 'k']);
    expect(s1.headSeq).toBe(11);
    expect(s1.floorSeq).toBe(8);
    const s2 = applyBefore(s1, { events: [], floorSeq: 8 });
    expect(hasOlder(s2)).toBe(false);
  });

  test('before 로 받은 옛 upsert 는 자리만 당기고 내용은 새것을 남긴다', () => {
    const s0 = opened([msg(9, 'x'), user(10, 'c1', 'sent', '말')]);
    const s1 = applyBefore(s0, { events: [user(7, 'c1', 'queued', '말')], floorSeq: 7 });
    expect(keysOf(s1)).toEqual(['u:c1@10', 'x@9']);
    expect(s1.msgs['u:c1'].status).toBe('sent');
  });

  // [push 가 온 지, 마지막으로 받아 온 지, 작업 중, 기대]
  test.each([
    [1000, 4000, false, false],     // push 가 1초 전에 왔다 → 건너뜀
    [4000, 4000, false, false],     // 유휴 15초 주기 — 아직
    [4000, 4000, true, false],      // 작업 중 5초 주기 — 아직
    [4000, 6000, true, true],       // 작업 중, 6초 지남
    [4000, 16000, false, true],     // 유휴, 16초 지남
    [null, 24000, false, true],     // push 를 한 번도 못 받음
    // ★ 보고 있다는 신호(§4.4) — push 가 방금 왔어도 20초마다 한 번은 부른다.
    [500, 19000, true, false],
    [500, 20000, true, true],
    [500, 20000, false, true],
    [100, 60000, true, true],
  ])('pollDue(push %s ms 전, pull %i ms 전, working=%s) → %s', (pushAgo, pullAgo, working, want) => {
    const now = 1000000;
    expect(pollDue(now, pushAgo == null ? 0 : now - (pushAgo as number), now - (pullAgo as number), working as boolean)).toBe(want);
  });
});

describe('캐시 직렬화(§10.9)', () => {
  test('내보냈다 들이면 같은 화면이다 + 자리(first)를 잃지 않는다', () => {
    let s = opened([user(1, 'c1', 'queued'), msg(2, 'a'), req(3, 'r1', 'pending')]);
    s = applyPush(s, { threadId: 't1', events: [user(4, 'c1', 'sent'), { seq: 5, ts: T0, op: 'turn', phase: 'end', turn: 1, ok: true, durationMs: 3000 }] }).state;
    const ex = exportEvents(s);
    const back = importSnapshot('t1', { thread: s.thread, events: JSON.parse(JSON.stringify(ex.events)), headSeq: ex.headSeq, floorSeq: ex.floorSeq });
    expect(back.order).toEqual(['u:c1', 'a']);
    expect(back.headSeq).toBe(5);
    expect(buildItems(back).map((i) => i.key)).toEqual(buildItems(s).map((i) => i.key));
    expect(pendingReqs(back).map((r) => r.id)).toEqual(['r1']);
    expect(back.turn).toBeNull();
    // 데몬의 접은 스냅샷과 같은 모양 — upsert 된 줄에만 first 가 실린다.
    const mine = ex.events.find((e) => e.op === 'msg' && e.msg.key === 'u:c1') as any;
    expect(mine.seq).toBe(4);
    expect(mine.first).toBe(1);
    expect((ex.events.find((e) => e.op === 'msg' && e.msg.key === 'a') as any).first).toBeUndefined();
  });

  test('최근 N 개만 — 잘리면 floor 가 올라간다', () => {
    const evs = Array.from({ length: 10 }, (_, i) => msg(i + 1, 'k' + i));
    const ex = exportEvents(opened(evs), 4);
    expect(ex.events.map((e) => e.seq)).toEqual([7, 8, 9, 10]);
    expect(ex.floorSeq).toBe(7);
    expect(ex.headSeq).toBe(10);
  });
});

describe('권한 모드 — 사람이 읽는 이름', () => {
  test.each([
    ['default', '매번 물어보기'], ['acceptEdits', '파일 수정은 자동 허용'], ['plan', '계획만 세우기'],
    ['auto', '자동'], ['bypassPermissions', '모두 허용'], ['dontAsk', '묻지 않고 거절'],
  ])('%s → %s', (id, label) => { expect(convModeLabel(id)).toBe(label); });

  test('모르는 모드는 id 그대로, 없으면 기본', () => {
    expect(convModeLabel('futureMode')).toBe('futureMode');
    expect(convModeLabel(null)).toBe('매번 물어보기');
  });

  test('위험하거나 드문 모드는 지금 그 모드일 때만 목록에 낀다', () => {
    expect(convModeChoices('default').map((m) => m.id)).toEqual(['default', 'acceptEdits', 'plan', 'auto']);
    expect(convModeChoices('bypassPermissions').map((m) => m.id)).toEqual(['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions']);
    expect(convModeChoices('dontAsk').map((m) => m.id)).toContain('dontAsk');
    // 데몬이 알려 준 모드만 — 지금 모드는 목록에 없어도 남긴다(체크가 사라지면 안 된다).
    expect(convModeChoices('plan', ['default', 'acceptEdits']).map((m) => m.id)).toEqual(['default', 'acceptEdits', 'plan']);
  });
});

test.each(['ADOPT_FAILED', 'CONTROL_TIMEOUT', 'CONTROL_FAILED', 'THREAD_BUSY', 'TERMINAL_ONLY_COMMAND'])('오류 안내 — %s 는 제 문구가 있다', (code) => {
  expect(errorText(code)).not.toBe(errorText('SOMETHING_ELSE'));
});

describe('안내(notice) — 아는 code 는 우리 문구로', () => {
  test.each([
    ['TERMINAL_ONLY_COMMAND', '이 명령은 터미널에서만 쓸 수 있어요.'],
    ['PROCESS_EXIT', '에이전트가 예기치 않게 종료됐어요.'],
    ['START_FAILED', '에이전트를 시작하지 못했어요.'],
    ['TURN_FAILED', '작업을 끝내지 못했어요.'],
    ['AGENT_NOT_LOGGED_IN', 'PC에서 에이전트에 먼저 로그인해 주세요.'],
    ['RATE_LIMITED', '사용 한도에 걸렸어요. 잠시 후 다시 시도해 주세요.'],
    ['IMPORT_TRUNCATED', '대화가 길어 최근 부분만 가져왔어요.'],
    ['MODEL_NEXT_START', '모델 변경은 다음 시작부터 적용돼요.'],
  ])('%s', (code, want) => { expect(noticeText(code, '데몬이 보낸 한국어 글')).toBe(want); });

  test('모르는 code 는 데몬의 글을 그대로', () => {
    expect(noticeText('SOMETHING_NEW', '데몬이 보낸 글')).toBe('데몬이 보낸 글');
    expect(noticeText(undefined, undefined)).toBe('');
  });
});

test('모르는 모드도 지금 값이면 목록에 있다(체크가 사라지지 않게)', () => {
  expect(convModeChoices('futureMode').map((m) => m.id)).toEqual(['default', 'acceptEdits', 'plan', 'auto', 'futureMode']);
  expect(convModeChoices('default', [{ id: 'default' }, { id: 'plan' }]).map((m) => m.id)).toEqual(['default', 'plan']);
});

test('걸린 시간 표기', () => {
  expect(fmtDuration(900)).toBe('1초');
  expect(fmtDuration(59000)).toBe('59초');
  expect(fmtDuration(200000)).toBe('3분 20초');
  expect(fmtDuration(120000)).toBe('2분');
  expect(fmtDuration(3900000)).toBe('1시간 5분');
});
