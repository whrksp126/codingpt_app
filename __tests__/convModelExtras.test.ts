/**
 * 채팅 v2 — 첨부 줄·검색·caps 선택지·사용량 줄의 순수 규칙(chat-v2-design.md §4.4·§4.5·§10).
 *
 * 고정하는 것:
 *  · 첨부 칩은 본문 **끝**의 `[첨부] <경로>` 블록만 뗀다(사용자가 본문 중간에 같은 모양을 쓰면 그건 글이다).
 *  · 검색은 불러온 행 안에서, 대소문자 무시, 첨부 경로는 찾지 않는다.
 *  · 모드 목록 = 데몬이 받는 모드 ∩ 카탈로그. 위험 모드는 지금 그 모드일 때만.
 *  · 에이전트 선택은 쓸 수 있는 것이 2개 이상일 때만. 모델 목록은 데몬이 줄 때만.
 *  · 사용량 줄은 null 필드를 견딘다.
 */
import {
  addOutgoing, applyDetail, applyOpen, attachmentsForWire, buildItems, convModeChoices, countMatches, emptyState, findMatches,
  highlightSegments, modelChoices, modelShort, msgAttachments, pickableAgents, reviveFailed, searchTextOf, showAgentPicker,
  splitAttachLines, stepMatch, usageLine, type ConvEvent, type ConvMsg,
} from '../src/workspace/conv/convModel';

const msg = (seq: number, key: string, p: Partial<ConvMsg> = {}): ConvEvent => ({
  seq, ts: 1000 + seq, op: 'msg', msg: { key, seq, ts: 1000 + seq, role: 'assistant', kind: 'text', text: `답 ${seq}`, ...p } as ConvMsg,
});

describe('첨부 줄 파싱(§4.5)', () => {
  test('데몬 모양 — 본문 + 빈 줄 + [첨부] 줄들', () => {
    const r = splitAttachLines('이 화면 고쳐줘\n\n[첨부] /Users/me/a.png\n[첨부] /Users/me/log.txt');
    expect(r).toEqual({ body: '이 화면 고쳐줘', paths: ['/Users/me/a.png', '/Users/me/log.txt'] });
  });
  test('첨부만 보낸 메시지 — 본문이 빈다', () => {
    expect(splitAttachLines('[첨부] /Users/me/a.png')).toEqual({ body: '', paths: ['/Users/me/a.png'] });
  });
  test('경로에 공백이 있어도 한 줄 전체가 경로다', () => {
    expect(splitAttachLines('보기\n\n[첨부] /Users/me/My Shots/화면 1.png').paths).toEqual(['/Users/me/My Shots/화면 1.png']);
  });
  test('★ 본문 중간의 같은 모양은 떼지 않는다(끝 블록만)', () => {
    const t = '[첨부] /a.png 라고 쓰면 첨부가 되나요?\n그냥 궁금해서';
    expect(splitAttachLines(t)).toEqual({ body: t, paths: [] });
  });
  test('첨부 줄이 없으면 원문 그대로(끝 공백도 건드리지 않는다)', () => {
    expect(splitAttachLines('그냥 글\n')).toEqual({ body: '그냥 글\n', paths: [] });
    expect(splitAttachLines(null)).toEqual({ body: '', paths: [] });
  });
  test('msg.attachments 메타와 본문 줄을 합친다 — 경로로 중복 제거, 이미지 판정은 mediaType 우선', () => {
    const r = msgAttachments({
      text: '봐줘\n\n[첨부] /h/a.png\n[첨부] /h/b.txt',
      attachments: [{ idx: 0, path: '/h/a.png', name: '스크린샷.png', mediaType: 'image/png' }],
    });
    expect(r.body).toBe('봐줘');
    expect(r.files).toEqual([
      { path: '/h/a.png', name: '스크린샷.png', image: true, mediaType: 'image/png' },
      { path: '/h/b.txt', name: 'b.txt', image: false },
    ]);
    // 확장자로도 이미지를 안다.
    expect(msgAttachments({ text: '[첨부] /h/c.JPG' }).files[0]).toMatchObject({ image: true, name: 'c.JPG' });
  });
  test('와이어 모양 — path·name·mediaType 만, 최대 12개', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ path: `/h/${i}.png`, name: `${i}.png`, image: true, mediaType: 'image/png' }));
    const w = attachmentsForWire(many);
    expect(w.length).toBe(12);
    expect(w[0]).toEqual({ path: '/h/0.png', name: '0.png', mediaType: 'image/png' });
    expect(attachmentsForWire([{ path: '/h/x.txt', name: 'x.txt', image: false }])).toEqual([{ path: '/h/x.txt', name: 'x.txt' }]);
  });
  test('낙관 버블이 첨부를 들고 있다 · 서버 실패 행을 되살리면 첨부 줄을 떼어 attachments 로 다시 보낸다', () => {
    const files = [{ path: '/h/a.png', name: 'a.png', image: true }];
    const st = addOutgoing(emptyState('t1'), { clientId: 'c1', text: '', at: 1, attachments: files });
    expect(st.outbox[0].attachments).toEqual(files);
    let s2 = applyOpen(emptyState('t1'), {
      thread: { id: 't1' }, headSeq: 1, floorSeq: 1,
      events: [msg(1, 'u:c9', { role: 'user', clientId: 'c9', status: 'failed', text: '다시\n\n[첨부] /h/a.png' })],
    }, 't1');
    const r = reviveFailed(s2, 'u:c9', 5);
    expect(r.clientId).toBe('c9');
    s2 = r.state;
    expect(s2.outbox[0]).toMatchObject({ text: '다시', sendText: '다시', attachments: [{ path: '/h/a.png', image: true }] });
  });
});

describe('잘린 본문(conv.detail)', () => {
  test('전문으로 바꾸고 truncated 를 내린다 · 없는 key 는 그대로', () => {
    const st = applyOpen(emptyState('t1'), { thread: { id: 't1' }, headSeq: 1, floorSeq: 1, events: [msg(1, 'a1', { text: '앞부분…', truncated: true })] }, 't1');
    const next = applyDetail(st, 'a1', '앞부분 그리고 뒷부분 전부');
    expect(next.msgs.a1).toMatchObject({ text: '앞부분 그리고 뒷부분 전부', truncated: false });
    expect(applyDetail(st, 'zz', 'x')).toBe(st);
  });
});

describe('대화 안 검색(§4.5)', () => {
  const st = applyOpen(emptyState('t1'), {
    thread: { id: 't1' }, headSeq: 4, floorSeq: 1,
    events: [
      msg(1, 'u1', { role: 'user', text: 'Login 폼 고쳐줘\n\n[첨부] /h/login.png' }),
      msg(2, 'a1', { text: 'login 버튼을 고쳤어요. LOGIN 테스트도 통과.' }),
      msg(3, 'a2', { text: '다른 이야기' }),
      msg(4, 'u2', { role: 'user', text: '고마워' }),
    ],
  }, 't1');
  const items = buildItems(st);

  test('대소문자 무시·겹치지 않게 센다', () => {
    expect(countMatches('login LOGIN Login', 'login')).toBe(3);
    expect(countMatches('aaaa', 'aa')).toBe(2);
    expect(countMatches('abc', '  ')).toBe(0);
  });
  test('일치하는 행과 자리(index)·건수 — 목록 순서', () => {
    const hits = findMatches(items, 'login');
    expect(hits.map((h) => h.key)).toEqual(['m:u1', 'm:a1']);
    expect(hits.map((h) => h.count)).toEqual([1, 2]);
    expect(hits[1].index).toBe(items.findIndex((i) => i.key === 'm:a1'));
    expect(findMatches(items, '')).toEqual([]);
  });
  test('★ 첨부 경로로는 찾지 않는다', () => {
    expect(findMatches(items, '/h/login.png')).toEqual([]);
    expect(searchTextOf(items[0])).toBe('Login 폼 고쳐줘');
  });
  test('강조 조각 — 원문 대소문자를 그대로 둔다', () => {
    expect(highlightSegments('Login 폼 login', 'LOGIN')).toEqual([
      { text: 'Login', hit: true }, { text: ' 폼 ', hit: false }, { text: 'login', hit: true },
    ]);
    expect(highlightSegments('abc', '')).toEqual([{ text: 'abc', hit: false }]);
  });
  test('이동은 끝에서 반대 끝으로 돈다', () => {
    expect(stepMatch(3, 2, 1)).toBe(0);
    expect(stepMatch(3, 0, -1)).toBe(2);
    expect(stepMatch(3, -1, -1)).toBe(2);
    expect(stepMatch(3, -1, 1)).toBe(0);
    expect(stepMatch(0, 0, 1)).toBe(-1);
  });
});

describe('conv.caps 로 정하는 선택지', () => {
  test('★ 모드 = 데몬 목록 ∩ 카탈로그 — 모르는 모드는 안 보이고, 위험 모드는 지금 그 모드일 때만', () => {
    const ids = (cur: string, allowed: string[] | null) => convModeChoices(cur, allowed).map((m) => m.id);
    expect(ids('default', ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'futureMode'])).toEqual(['default', 'acceptEdits', 'plan']);
    // 데몬이 모르는 모드(auto)는 빠진다.
    expect(ids('default', ['default', 'plan'])).not.toContain('auto');
    // 지금 bypass 면 그것만은 남는다(무엇이 켜져 있는지 알아야 한다).
    expect(ids('bypassPermissions', ['default', 'bypassPermissions'])).toEqual(['default', 'bypassPermissions']);
    // 목록을 모르면(구 데몬) 카탈로그 그대로.
    expect(ids('default', null)).toEqual(['default', 'acceptEdits', 'plan', 'auto']);
  });
  test('에이전트 선택 — available 이 2개 이상일 때만', () => {
    const one = { agents: [{ id: 'claude', label: 'Claude', available: true }, { id: 'codex', label: 'Codex', available: false }] };
    expect(pickableAgents(one)).toEqual([{ id: 'claude', label: 'Claude' }]);
    expect(showAgentPicker(one)).toBe(false);
    const two = { agents: [{ id: 'claude', label: 'Claude', available: true }, { id: 'codex', label: '', available: true }] };
    expect(showAgentPicker(two)).toBe(true);
    expect(pickableAgents(two)[1]).toEqual({ id: 'codex', label: 'codex' });
    expect(showAgentPicker(null)).toBe(false);
  });
  test('모델 — 데몬이 준 것만(문자열·객체 둘 다), 없으면 빈 배열', () => {
    expect(modelChoices({ agents: [] })).toEqual([]);
    expect(modelChoices({ models: ['opus', { id: 'sonnet', label: 'Sonnet' }, { label: 'id 없음' } as any, 'opus'] }))
      .toEqual([{ id: 'opus', label: 'opus' }, { id: 'sonnet', label: 'Sonnet' }]);
  });
  test('★ 에이전트별 목록(agents[].models)이 정본 — 그 대화의 에이전트 것, 모르면 쓸 수 있는 첫 에이전트', () => {
    const caps = {
      models: ['legacy'],
      agents: [
        { id: 'claude', label: 'Claude', available: true, models: [{ id: 'opus', label: 'Opus' }, { id: 'sonnet', label: 'Sonnet' }, 'haiku'] },
        { id: 'codex', label: 'Codex', available: true, models: [] },
      ],
    };
    expect(modelChoices(caps, 'claude').map((m) => m.id)).toEqual(['opus', 'sonnet', 'haiku']);
    expect(modelChoices(caps).map((m) => m.label)).toEqual(['Opus', 'Sonnet', 'haiku']);
    // 그 에이전트가 목록을 안 주면 공용 목록(caps.models)으로.
    expect(modelChoices(caps, 'codex')).toEqual([{ id: 'legacy', label: 'legacy' }]);
    expect(modelChoices({ agents: [{ id: 'claude', available: true }] }, 'claude')).toEqual([]);
  });
});

describe('사용량 줄(§4.5)', () => {
  test('usage.contextPct·usage.model 이 정본', () => {
    expect(usageLine({ id: 't', model: 'old', usage: { contextPct: 42, model: 'claude-opus-4-1-20250805', contextTokens: 1, contextMax: 1000 } }))
      .toEqual({ model: 'claude-opus-4-1-20250805', pct: 42 });
  });
  test('contextPct 가 없으면 토큰으로 계산, 모델은 thread.model 로', () => {
    expect(usageLine({ id: 't', model: 'sonnet', usage: { contextTokens: 50000, contextMax: 200000, contextPct: null } })).toEqual({ model: 'sonnet', pct: 25 });
  });
  test('★ 전부 null 이어도 죽지 않는다 — 모르면 줄이 없다', () => {
    expect(usageLine({ id: 't', usage: { contextTokens: null, contextMax: null, contextPct: null, costUsd: null, model: null } })).toBeNull();
    expect(usageLine({ id: 't', usage: null })).toBeNull();
    expect(usageLine(null)).toBeNull();
    expect(usageLine({ id: 't', usage: { contextPct: 130 } })).toEqual({ model: null, pct: 100 });
  });
  test('모델 이름은 날짜 꼬리를 뗀다', () => {
    expect(modelShort('claude-opus-4-1-20250805')).toBe('claude-opus-4-1');
    expect(modelShort('opus')).toBe('opus');
    expect(modelShort(null)).toBe('');
  });
});
