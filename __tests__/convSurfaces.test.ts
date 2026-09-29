/**
 * 채팅 탭의 공유 표면 규칙(chat-v2-design.md §10.7).
 *
 * 고정하는 것:
 *  · 아직 대화가 없는 새 채팅 탭은 표면이 **아니다**(등록도, 다른 기기에 나타나지도 않는다).
 *  · 대화가 생기면 표면 id 는 대화마다 하나(`c-<threadId>`).
 *  · 다른 기기가 연 채팅은 탭으로 들어오고, 다른 기기가 닫으면 2틱 뒤 닫힌다.
 *  · 같은 대화가 다른 id 로 등록돼 있어도(다른 구현) 탭은 하나만 둔다.
 *  · 기존 종류(프리뷰·IDE·모바일 화면)의 표면 키는 한 글자도 바뀌지 않는다.
 */
import { _surfaceInternals as S } from '../src/contexts/WorkspaceShellContext';
import * as T from '../src/workspace/tiling';
import { newChatTab } from '../src/workspace/conv/convTabs';

const term = (id: string, tabs: T.TerminalTab[], active = 0): T.Leaf => ({ id, kind: 'terminal', tabs, active });
const rtOf = (layout: T.TilingNode) => ({ layout, focusId: T.firstLeafId(layout), ports: [] as number[] });
const tabsOf = (n: T.TilingNode, id = 'p1') => (T.findLeaf(n, id) as T.TerminalLeaf).tabs;
let ws = 0;
const freshWs = () => 'ws-' + (++ws);

test('★ 새 채팅 탭(threadId 없음)은 표면이 아니다', () => {
  const layout = term('p1', [{ win: 1, title: 'a' }, newChatTab()]);
  expect(S.surfacesOf(layout)).toEqual([]);
  expect(S.withSurfaceIds(layout)).toBe(layout);          // sid 를 붙이지 않는다
  const leaf: T.Leaf = { id: 'c1', kind: 'chat', threadId: null, title: '' };
  expect(S.surfacesOf(leaf)).toEqual([]);
  expect(S.withSurfaceIds(leaf)).toBe(leaf);
});

test('대화가 생기면 표면이 된다 — id 는 대화마다 하나', () => {
  const layout = term('p1', [{ kind: 'chat', threadId: 'th-1', title: '제목', tid: 'c1' }]);
  const withIds = S.withSurfaceIds(layout);
  expect(tabsOf(withIds)[0].sid).toBe('c-th-1');
  expect(S.surfacesOf(withIds)).toEqual([{ sid: 'c-th-1', kind: 'chat', threadId: 'th-1', title: '제목' }]);
  expect(S.withSurfaceIds(withIds)).toBe(withIds);        // 멱등
  const leaf = S.withSurfaceIds({ id: 'c9', kind: 'chat', threadId: 'th-2', title: '' } as T.Leaf) as T.ChatLeaf;
  expect(leaf.sid).toBe('c-th-2');
});

test('탭이 다른 대화로 바뀌면 표면 id 도 바뀐다(옛 표면은 동기화가 걷는다)', () => {
  const layout = term('p1', [{ kind: 'chat', threadId: 'th-2', title: '', tid: 'c1', sid: 'c-th-1' }]);
  expect(tabsOf(S.withSurfaceIds(layout))[0].sid).toBe('c-th-2');
  // 다른 구현이 만든 id 를 물려받은 탭은 그대로 둔다.
  const adopted = term('p1', [{ kind: 'chat', threadId: 'th-2', title: '', tid: 'c1', sid: 'pc-abc' }]);
  expect(S.withSurfaceIds(adopted)).toBe(adopted);
});

test('표면 키 — 채팅은 threadId·제목, 기존 종류는 예전 그대로', () => {
  expect(S.surfaceKey({ url: 'http://x', title: '' })).toBe(JSON.stringify({ url: 'http://x', openPath: null, deviceId: null }));
  expect(S.surfaceKey({ deviceId: 'android:X', title: 'Pixel' })).toBe(JSON.stringify({ openPath: null, deviceId: 'android:X', title: 'Pixel' }));
  const a = S.surfaceKey({ threadId: 'th-1', title: 'A' });
  expect(a).not.toBe(S.surfaceKey({ threadId: 'th-1', title: 'B' }));   // 제목이 바뀌면 update
  expect(a).not.toBe(S.surfaceKey({ threadId: 'th-2', title: 'A' }));
});

test('다른 기기가 연 채팅은 탭으로 들어온다', () => {
  const id = freshWs();
  const rt = rtOf(term('p1', [{ win: 1, title: 'a' }]));
  const out = S.reconcileSurfaces(id, rt, [{ id: 'c-th-1', kind: 'chat', threadId: 'th-1', title: '리팩터링' }]);
  expect(tabsOf(out.layout)[1]).toMatchObject({ kind: 'chat', threadId: 'th-1', title: '리팩터링', sid: 'c-th-1' });
  // 같은 목록이 다시 와도 탭이 늘지 않는다.
  expect(S.reconcileSurfaces(id, out, [{ id: 'c-th-1', kind: 'chat', threadId: 'th-1', title: '리팩터링' }])).toBe(out);
});

test('대화 없는 채팅 표면(threadId 없음)은 들이지 않는다', () => {
  const rt = rtOf(term('p1', [{ win: 1, title: 'a' }]));
  expect(S.reconcileSurfaces(freshWs(), rt, [{ id: 'x', kind: 'chat', title: '' }])).toBe(rt);
});

test('다른 기기가 닫으면 2틱 뒤 닫힌다 — 등록 전 탭·새 채팅 탭은 건드리지 않는다', () => {
  const id = freshWs();
  const draft = newChatTab();
  let rt = rtOf(term('p1', [{ win: 1, title: 'a' }, draft]));
  rt = S.reconcileSurfaces(id, rt, [{ id: 'c-th-1', kind: 'chat', threadId: 'th-1', title: 't' }]);
  expect(tabsOf(rt.layout).length).toBe(3);
  const t1 = S.reconcileSurfaces(id, rt, []);
  expect(tabsOf(t1.layout).length).toBe(3);                  // 1틱 유예
  expect(tabsOf(t1.layout)[2].miss).toBe(1);
  const t2 = S.reconcileSurfaces(id, t1, []);
  expect(tabsOf(t2.layout).map((t) => t.kind || 'term')).toEqual(['term', 'chat']);
  expect(tabsOf(t2.layout)[1]).toBe(draft);                  // 새 채팅 탭은 그대로
});

test('★ 같은 대화가 다른 id 로 등록돼 있으면 이 기기의 탭이 그 id 를 물려받는다(탭 두 개 금지)', () => {
  const id = freshWs();
  // 이 기기에서 막 만든 대화 — 아직 등록 전.
  const rt = rtOf(term('p1', [{ kind: 'chat', threadId: 'th-1', title: 't', tid: 'c1', sid: 'c-th-1' }]));
  const out = S.reconcileSurfaces(id, rt, [{ id: 'pc-abc', kind: 'chat', threadId: 'th-1', title: 't' }]);
  expect(tabsOf(out.layout).length).toBe(1);
  expect(tabsOf(out.layout)[0]).toMatchObject({ threadId: 'th-1', sid: 'pc-abc', tid: 'c1' });
  expect(S.knownOf(id).has('pc-abc')).toBe(true);
});

test('같은 대화가 표면 두 개로 등록돼 있어도 탭은 하나', () => {
  const id = freshWs();
  const rt = rtOf(term('p1', [{ win: 1, title: 'a' }]));
  const out = S.reconcileSurfaces(id, rt, [
    { id: 'c-th-1', kind: 'chat', threadId: 'th-1', title: 't' },
    { id: 'pc-abc', kind: 'chat', threadId: 'th-1', title: 't' },
  ]);
  expect(tabsOf(out.layout).filter((t) => t.kind === 'chat').length).toBe(1);
  const again = S.reconcileSurfaces(id, out, [
    { id: 'c-th-1', kind: 'chat', threadId: 'th-1', title: 't' },
    { id: 'pc-abc', kind: 'chat', threadId: 'th-1', title: 't' },
  ]);
  expect(tabsOf(again.layout).filter((t) => t.kind === 'chat').length).toBe(1);
});

test('기존 종류의 리컨실은 그대로다(모바일 화면이 탭으로 들어온다)', () => {
  const rt = rtOf(term('p1', [{ win: 1, title: 'a' }]));
  const out = S.reconcileSurfaces(freshWs(), rt, [{ id: 's1', kind: 'emulator', deviceId: 'android:X', title: 'Pixel' }]);
  expect(tabsOf(out.layout)[1]).toMatchObject({ kind: 'emulator', deviceId: 'android:X', metaName: 'Pixel', sid: 's1' });
});
