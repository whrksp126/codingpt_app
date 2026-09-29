/**
 * 채팅 탭 — 종류 확장이 **빠짐없이** 됐는가.
 *
 * 고정하는 것(사전 조사에서 확인된 결함):
 *  · migrateTree 가 독립 pane 종류를 손으로 나열하고 있어서, 나열에 없던 `emulator` 독립 pane 은
 *    앱을 다시 켜면 **터미널로 바뀌었다**. `chat` 도 같은 길을 밟을 뻔했다.
 *  · 채팅 탭은 pane ↔ 탭을 왕복해도 대화(threadId)·제목·초안을 잃지 않는다.
 *  · 같은 대화를 두 번 열지 않는다(알림·목록·리컨실러가 같은 판정을 쓴다).
 */
import * as T from '../src/workspace/tiling';
import { chatSid, findChat, newChatTab, openChat } from '../src/workspace/conv/convTabs';

describe('migrateTree — 독립 pane 을 보존한다', () => {
  test.each(T.TAB_KINDS)('★ %s 독립 pane 은 터미널로 바뀌지 않는다', (kind) => {
    const node = JSON.parse(JSON.stringify(T.leaf(kind, {})));
    const out = T.migrateTree(node) as T.Leaf;
    expect(out.kind).toBe(kind);
    expect((out as any).tabs).toBeUndefined();
  });

  test('★ 채팅·모바일 화면 pane 의 값이 그대로 남는다', () => {
    const tree = {
      dir: 'h', ratio: 0.5,
      first: { id: 'p1', kind: 'chat', threadId: 'th-1', title: '리팩터링', chatDraft: '쓰던 글', tid: 'p1', sid: 'c-th-1' },
      second: { dir: 'v', ratio: 0.5, first: { id: 'p2', kind: 'emulator', deviceId: 'android:X', metaName: 'Pixel' }, second: { id: 'p3', win: 4 } },
    };
    const out = T.migrateTree(JSON.parse(JSON.stringify(tree))) as T.Branch;
    expect(out.first).toEqual(tree.first);
    expect((out.second as T.Branch).first).toEqual({ id: 'p2', kind: 'emulator', deviceId: 'android:X', metaName: 'Pixel' });
    // 구버전 leaf(win 단일)는 여전히 탭 배열로 바뀐다.
    expect((out.second as T.Branch).second).toEqual({ id: 'p3', kind: 'terminal', tabs: [{ win: 4, title: '' }], active: 0 });
  });

  test('탭 배열을 가진 터미널 pane 은 건드리지 않는다(채팅 탭 포함)', () => {
    const node = { id: 'p1', kind: 'terminal', active: 1, tabs: [{ win: 3, title: '터미널 1' }, { kind: 'chat', threadId: 'th-1', title: 'x', tid: 'c1' }] };
    expect(T.migrateTree(JSON.parse(JSON.stringify(node)))).toEqual(node);
  });
});

describe('채팅 탭 왕복', () => {
  test('목록에 채팅이 있다', () => {
    expect(T.TAB_KINDS).toContain('chat');
    expect(T.canBeTab('chat')).toBe(true);
  });

  test('★ pane → 탭 → pane — 대화·제목·초안·표면 id·본문 키를 잃지 않는다', () => {
    const leaf: T.Leaf = { id: 'p1', kind: 'chat', threadId: 'th-1', title: '리팩터링', chatDraft: '쓰던 글', tid: 'body-1', sid: 'c-th-1' };
    const tab = T.leafToTab(leaf)!;
    expect(tab).toMatchObject({ kind: 'chat', threadId: 'th-1', title: '리팩터링', chatDraft: '쓰던 글', tid: 'body-1', sid: 'c-th-1' });
    expect(T.isTermTab(tab)).toBe(false);
    expect(T.tabToLeaf(tab, 'p9')).toEqual({ id: 'p9', kind: 'chat', threadId: 'th-1', title: '리팩터링', chatDraft: '쓰던 글', tid: 'body-1', sid: 'c-th-1' });
  });

  test('새 대화(threadId 없음)는 표면 id 가 없다 — 공유 표면에 등록되지 않는다', () => {
    const tab = newChatTab();
    expect(tab.kind).toBe('chat');
    expect(tab.threadId).toBeNull();
    expect(tab.sid).toBeUndefined();
    expect(tab.tid).toBeTruthy();
    expect(newChatTab('th-2', '제목')).toMatchObject({ threadId: 'th-2', title: '제목', sid: chatSid('th-2') });
    const leaf = T.leaf('chat', {});
    expect(leaf).toMatchObject({ kind: 'chat', threadId: null });
    expect((leaf as T.ChatLeaf).sid).toBeUndefined();
  });

  test('표면 id 는 데몬 규칙(`^[A-Za-z0-9_-]{1,64}$`)을 지킨다 — 콜론이 들면 등록이 거절된다', () => {
    const id = chatSid('0d1c2b3a-1111-2222-3333-444455556666');
    expect(id).toBe('c-0d1c2b3a-1111-2222-3333-444455556666');
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  test('저장 직전 정리 — 채팅 탭의 값은 남는다(휘발 신호가 아니다)', () => {
    const node: T.Leaf = { id: 'p1', kind: 'terminal', active: 0, tabs: [{ win: 3, title: 't', agent: 'claude', miss: 1 }, { kind: 'chat', threadId: 'th', title: 't', chatDraft: 'd', tid: 'c', sid: 'c-th' }] };
    const out = T.stripVolatile(node) as T.TerminalLeaf;
    expect(out.tabs[0]).toEqual({ win: 3, title: 't' });
    expect(out.tabs[1]).toEqual({ kind: 'chat', threadId: 'th', title: 't', chatDraft: 'd', tid: 'c', sid: 'c-th' });
  });
});

describe('openChat — 같은 대화를 두 번 열지 않는다', () => {
  const term = (id: string, tabs: T.TerminalTab[], active = 0): T.Leaf => ({ id, kind: 'terminal', tabs, active });

  test('이미 탭으로 열려 있으면 그 탭을 앞으로 + 포커스', () => {
    const rt = { layout: term('p1', [{ win: 1, title: 'a' }, newChatTab('th-1', '제목')]), focusId: 'p1' as string | null };
    const out = openChat(rt, 'th-1');
    expect((out.layout as T.TerminalLeaf).active).toBe(1);
    expect((out.layout as T.TerminalLeaf).tabs.length).toBe(2);
    // 이미 앞에 있으면 아무것도 바꾸지 않는다(같은 참조 = 리렌더 0).
    expect(openChat(out, 'th-1')).toBe(out);
  });

  test('독립 pane 으로 열려 있으면 그 pane 을 포커스', () => {
    const layout: T.TilingNode = { dir: 'h', ratio: 0.5, first: term('p1', [{ win: 1, title: 'a' }]), second: { id: 'p2', kind: 'chat', threadId: 'th-1', title: 't' } };
    const out = openChat({ layout, focusId: 'p1' }, 'th-1');
    expect(out.focusId).toBe('p2');
    expect(out.layout).toBe(layout);
    expect(findChat(layout, 'th-1')).toEqual({ leafId: 'p2', index: -1 });
  });

  test('없으면 포커스된 터미널 pane 의 탭으로 들이고 그 탭을 연다', () => {
    const layout: T.TilingNode = { dir: 'h', ratio: 0.5, first: term('p1', [{ win: 1, title: 'a' }]), second: term('p2', [{ win: 2, title: 'b' }]) };
    const out = openChat({ layout, focusId: 'p2' }, 'th-9', '새 제목');
    const p2 = T.findLeaf(out.layout, 'p2') as T.TerminalLeaf;
    expect(p2.tabs.length).toBe(2);
    expect(p2.active).toBe(1);
    expect(p2.tabs[1]).toMatchObject({ kind: 'chat', threadId: 'th-9', title: '새 제목', sid: 'c-th-9' });
    expect((T.findLeaf(out.layout, 'p1') as T.TerminalLeaf).tabs.length).toBe(1);
    expect(out.focusId).toBe('p2');
  });

  test('포커스가 터미널 pane 이 아니면 첫 터미널 pane 으로', () => {
    const layout: T.TilingNode = { dir: 'h', ratio: 0.5, first: { id: 'i1', kind: 'ide', openPath: null }, second: term('p2', []) };
    const out = openChat({ layout, focusId: 'i1' }, 'th-9');
    expect((T.findLeaf(out.layout, 'p2') as T.TerminalLeaf).tabs[0]).toMatchObject({ kind: 'chat', threadId: 'th-9' });
    expect(out.focusId).toBe('p2');
  });

  test('터미널 pane 이 하나도 없으면 옆을 갈라 독립 pane 으로', () => {
    const layout: T.TilingNode = { id: 'i1', kind: 'ide', openPath: null };
    const out = openChat({ layout, focusId: 'i1' }, 'th-9', 't');
    expect(T.isBranch(out.layout)).toBe(true);
    const hit = findChat(out.layout, 'th-9')!;
    expect(hit.index).toBe(-1);
    expect(out.focusId).toBe(hit.leafId);
  });

  test('새 대화 탭(threadId 없음)은 어떤 대화의 탭도 아니다', () => {
    const layout = term('p1', [newChatTab()]);
    expect(findChat(layout, '')).toBeNull();
    expect(findChat(layout, 'th-1')).toBeNull();
  });
});
