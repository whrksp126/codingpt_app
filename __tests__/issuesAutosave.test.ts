// 이슈 자동 저장(issuesAutosave.ts) — 앱 쪽 연기 검증. 전체 규칙 검증은 PC 와 같은 묶음으로 돈다
//  (codingpt_pc/test/issues-autosave.test.mjs 가 이 파일의 대상도 함께 돌린다).
import { createAutosaver, displayTitle, workspaceOptions, SAVE_DELAY_MS } from '../src/workspace/issues/issuesAutosave';

function rig(id: string | null = null) {
  const calls: any[] = []; const timers: { fn: () => void; ms: number; on: boolean }[] = [];
  let failNext = 0; let rev = 10;
  const call = async (...a: any[]) => { calls.push(a); if (failNext > 0) { failNext -= 1; throw new Error('x'); } return { id: 'iss_1', rev: ++rev }; };
  const s = createAutosaver({ id, fields: id ? { title: 'T', body: 'B' } : {}, create: (f) => call('create', f), update: (i, p) => call('update', i, p),
    setTimer: (fn, ms) => { const h = { fn, ms, on: true }; timers.push(h); return h; }, clearTimer: (h: any) => { h.on = false; } });
  return { s, calls, armed: () => timers.filter((x) => x.on), fail: (n: number) => { failNext = n; } };
}

test('빈 초안은 만들지 않고, 첫 뜻 있는 입력에서 한 번만 만든다', async () => {
  const r = rig();
  r.s.set({ status: 'done', title: '  ' });
  expect((await r.s.flush()).id).toBeNull();
  expect(r.calls.length).toBe(0);
  r.s.set({ body: '본' }); r.s.set({ body: '본문' });
  expect(r.armed().map((x) => x.ms)).toEqual([SAVE_DELAY_MS]);
  const [a, b] = await Promise.all([r.s.flush(), r.s.flush()]);
  expect(a.id).toBe('iss_1'); expect(b.ok).toBe(true);
  expect(r.calls.filter((c) => c[0] === 'create').length).toBe(1);
  r.s.set({ title: '제목' });
  await r.s.flush();
  expect(r.calls[1]).toEqual(['update', 'iss_1', { title: '제목' }]);
});

test('실패하면 입력을 쥐고 다시 보내고, 늦게 온 옛 사본은 방금 쓴 글을 되감지 않는다', async () => {
  const r = rig('x');
  r.fail(1);
  r.s.set({ title: 'T1' });
  expect((await r.s.flush()).ok).toBe(false);
  expect(r.s.status()).toBe('error'); expect(r.s.fields().title).toBe('T1'); expect(r.armed().length).toBe(1);
  expect((await r.s.flush()).ok).toBe(true);
  expect(r.s.mergeRemote({ title: 'T', body: 'B', updatedAt: 5 })).toEqual([]);
  expect(r.s.fields().title).toBe('T1');
  expect(r.s.mergeRemote({ title: 'T1', body: 'B2', updatedAt: 99 }, ['body'])).toEqual([]);
  expect(r.s.mergeRemote(null, [])).toEqual(['body']);
});

test('제목 없는 초안의 표시 · 워크스페이스 선택지(같은 프로젝트는 한 번)', () => {
  expect(displayTitle({ title: '', body: '# 첫 줄\n둘째' }, '제목 없음')).toBe('첫 줄');
  expect(displayTitle({}, '제목 없음')).toBe('제목 없음');
  const W = [{ cwd: 'other/project/codingpt', name: 'codingpt' }, { cwd: '.codingpt/vm/linux/ws/codingpt', name: 'codingpt' }, { cwd: '.codingpt/vm/macos/ws/codingpt', name: 'codingpt' }, { cwd: 'other/project/hub', name: 'hub' }];
  expect(workspaceOptions(W).map((x) => x.label)).toEqual(['codingpt', 'hub']);
});
