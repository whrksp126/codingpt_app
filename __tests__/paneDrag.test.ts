/**
 * pane ↔ 탭 변환 — **잡아서 다른 pane 안으로 넣을 수 있는가**.
 *
 * 이 파일이 고정하는 것(2026-08-05 실사고): 사용자 원문 —
 *  "터미널은 잡고 다른 pane 안으로 들어가는데 에뮬레이터는 왜 pane 으로 이동이 안될까?"
 *
 * 원인은 기능이 없어서가 아니라, 종류별 분기가 **네 곳에 흩어져** 있었고 새로 들어온 `emulator` 가
 * 그 전부에서 빠져 있었기 때문이다(드롭 판정·탭 편입·탭→pane 승격·헤더 라벨). 잡히기는 하니
 * 사용자에겐 "되다 만 것"으로 보였다.
 *
 * 그래서 개별 종류를 세지 않고 **불변식**을 건다: 혼합 탭이 될 수 있다고 선언한 종류는 전부
 * pane↔탭을 왕복할 수 있어야 하고, 왕복해도 정체성(기기 선택·표면 ID)을 잃지 않아야 한다.
 */
import * as T from '../src/workspace/tiling';

describe('혼합 탭이 될 수 있는 종류는 전부 왕복한다', () => {
  test('★ 목록에 모바일 화면이 있다', () => {
    expect(T.TAB_KINDS).toContain('emulator');
    expect(T.TAB_KINDS).toContain('ide');
    expect(T.TAB_KINDS).toContain('preview');
  });

  test.each(T.TAB_KINDS)('★ %s — pane → 탭 → pane 왕복', (kind) => {
    const leaf = T.leaf(kind, {});
    const tab = T.leafToTab(leaf);
    expect(tab).toBeTruthy();
    expect(tab!.kind).toBe(kind);
    const back = T.tabToLeaf(tab!, 'p-back');
    expect(back).toBeTruthy();
    expect(back!.kind).toBe(kind);
    expect(back!.id).toBe('p-back');
  });

  test('터미널은 이 경로로 오지 않는다(탭 배열을 이미 갖는다)', () => {
    expect(T.leafToTab(T.leaf('terminal', {}))).toBeNull();
    expect(T.canBeTab('terminal')).toBe(false);
  });

  test('★ 왕복해도 기기 선택을 잃지 않는다(다시 고르게 만들면 이동이 아니라 초기화다)', () => {
    const leaf = { id: 'p1', kind: 'emulator', deviceId: 'android:XYZ' } as T.Leaf;
    const tab = T.leafToTab(leaf)!;
    expect(tab.deviceId).toBe('android:XYZ');
    expect(T.tabToLeaf(tab, 'p2')).toMatchObject({ kind: 'emulator', deviceId: 'android:XYZ' });
  });

  test('프리뷰는 표면 ID(tid)를 승계한다 — 안 그러면 이동할 때마다 WebView 가 새로 뜬다', () => {
    const tab = T.leafToTab({ id: 'p1', kind: 'preview', url: 'http://x', tid: 'surface-9' } as T.Leaf)!;
    expect(tab.tid).toBe('surface-9');
    expect(T.tabToLeaf(tab, 'p2')).toMatchObject({ tid: 'surface-9', url: 'http://x' });
    //  tid 가 없던 옛 pane 은 pane id 를 표면 ID 로 삼는다(기존 WebView 를 그대로 쓴다).
    const legacy = T.leafToTab({ id: 'p7', kind: 'preview', url: null } as T.Leaf)!;
    expect(legacy.tid).toBe('p7');
  });

  test('IDE 는 에디터 그룹 레이아웃을 잃지 않는다', () => {
    const layout = { groups: [{ files: ['a.ts'] }] };
    const tab = T.leafToTab({ id: 'p1', kind: 'ide', openPath: 'a.ts', ideLayout: layout } as T.Leaf)!;
    expect(T.tabToLeaf(tab, 'p2')).toMatchObject({ openPath: 'a.ts', ideLayout: layout });
  });

  test('모르는 종류에 그럴듯한 기본값을 주지 않는다(조용히 프리뷰가 되면 안 된다)', () => {
    expect(T.leafToTab({ id: 'p1', kind: 'nope' } as unknown as T.Leaf)).toBeNull();
    expect(T.tabToLeaf({ kind: 'nope' } as unknown as T.TerminalTab)).toBeNull();
  });
});
