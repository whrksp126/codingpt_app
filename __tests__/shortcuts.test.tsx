/**
 * 단축키 재바인딩 — 보관 계약과 폰 화면.
 *
 * 이 파일이 고정하는 것:
 *  · 사용자가 **지운** 단축키(null)는 기본값으로 되살아나지 않는다. 되살리면 지운 키가 유령처럼
 *    다시 먹는다.
 *  · 기본값과 같아지면 override 를 지운다(설정에 의미 없는 줄이 쌓이지 않게).
 *  · 값은 **계정 동기화**다 — 로컬 변경은 서버로 밀고, 서버발 적용은 되밀지 않는다(에코 루프 방지).
 *  · 폰은 keydown 을 전역으로 못 받으므로 조합을 **고른다**. 그래도 저장 형식과 판정은 PC 와
 *    같은 파일(palette/commands)이다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text, Pressable } from 'react-native';

import ShortcutSettings from '../src/components/ShortcutSettings';
import * as SC from '../src/palette/shortcuts';
import { defaultBindings, findConflicts, formatCombo } from '../src/palette/commands';
import { tx } from '../src/text';
import { PALETTE_TEXT } from '../src/text/palette';

const TX = tx(PALETTE_TEXT);

const mockPush = jest.fn();
jest.mock('../src/utils/appearanceSync', () => ({ schedulePushAppearance: () => mockPush() }));

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => (k in store ? store[k] : null),
    setItem: async (k: string, v: string) => { store[k] = v; },
    removeItem: async (k: string) => { delete store[k]; },
  },
}));

beforeEach(async () => {
  jest.clearAllMocks();
  // act 로 감싼다 — resetAll 은 구독자(마운트된 화면)에게 상태를 밀어 준다.
  await act(async () => { await SC.resetAll(); });
  mockPush.mockClear();
});

function flatten(c: any): string {
  if (c == null || c === false) return '';
  if (Array.isArray(c)) return c.map(flatten).join('');
  if (typeof c === 'object') return '';
  return String(c);
}

// ── 보관 계약 ────────────────────────────────────────────────────────────────

test('기본값은 명령 표에서 온다(따로 적어 두지 않는다)', () => {
  const b = SC.bindings();
  const d = defaultBindings('app');
  expect(b['ws.addTerminal']).toBe('Mod+T');
  expect(Object.keys(b).sort()).toEqual(Object.keys(d).sort());
});

test('바꾸면 저장되고 서버로도 민다', async () => {
  await SC.setBinding('ws.addTerminal', 'cmd+shift+k');
  expect(SC.bindings()['ws.addTerminal']).toBe('Mod+Shift+K');   // 표기가 달라도 정규화된다
  expect(SC.isDefault('ws.addTerminal')).toBe(false);
  expect(mockPush).toHaveBeenCalled();
  expect(JSON.parse(store['app:shortcuts'])['ws.addTerminal']).toBe('Mod+Shift+K');
});

test('지운 단축키는 기본값으로 되살아나지 않는다', async () => {
  await SC.setBinding('ws.addTerminal', null);
  expect(SC.bindings()['ws.addTerminal']).toBeNull();
  expect(SC.isDefault('ws.addTerminal')).toBe(false);   // "지움"도 사용자의 의사다
});

test('기본값과 같아지면 override 를 지운다(빈 줄이 쌓이지 않게)', async () => {
  await SC.setBinding('ws.addTerminal', 'Mod+Shift+K');
  await SC.setBinding('ws.addTerminal', 'Mod+T');
  expect(SC.isDefault('ws.addTerminal')).toBe(true);
  expect(SC.overridesSnapshot()['ws.addTerminal']).toBeUndefined();
});

test('못 읽는 조합은 아무 일도 하지 않는다(조용히 망가뜨리지 않는다)', async () => {
  await SC.setBinding('ws.addTerminal', 'K');        // 수식어 없는 글자 = 터미널 입력을 먹는다
  expect(SC.bindings()['ws.addTerminal']).toBe('Mod+T');
  await SC.setBinding('ws.addTerminal', '뭐라고?');
  expect(SC.bindings()['ws.addTerminal']).toBe('Mod+T');
});

test('서버발 적용은 되밀지 않는다(에코 루프 방지)', () => {
  SC.applyRemoteShortcuts({ 'ws.addIde': 'Mod+Shift+I' });
  expect(SC.bindings()['ws.addIde']).toBe('Mod+Shift+I');
  expect(mockPush).not.toHaveBeenCalled();
});

test('겹치면 겹쳤다고 말한다(범위로 봐주지 않는다)', async () => {
  await SC.setBinding('ws.addIde', 'Mod+T');
  const c = findConflicts(SC.bindings());
  expect(c['Mod+T']).toEqual(['ws.addIde', 'ws.addTerminal']);
});

// ── 화면 ─────────────────────────────────────────────────────────────────────

async function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<ShortcutSettings />); });
  return tree;
}
function texts(t: ReactTestRenderer.ReactTestRenderer): string[] {
  return t.root.findAllByType(Text).map((n) => flatten(n.props.children)).filter(Boolean);
}
function rowWith(t: ReactTestRenderer.ReactTestRenderer, label: string) {
  const hits = t.root.findAllByType(Pressable).filter((p) => {
    try { return p.findAllByType(Text).some((x) => flatten(x.props.children).includes(label)); }
    catch (_) { return false; }
  });
  return hits[hits.length - 1];
}

test('표를 묶음별로 그리고, 지금 걸린 조합을 보여준다', async () => {
  const tree = await render();
  const t = texts(tree);
  expect(t).toContain(TX.group.add);
  expect(t).toContain(TX.cmd['ws.addTerminal']);
  expect(t).toContain(formatCombo('Mod+T', SC.IS_APPLE));
  // 팔레트 자신도 바꿀 수 있다(사용자 확정: 전부 바꿀 수 있게).
  expect(t).toContain(TX.cmd['palette.open']);
});

test('겹치면 그 행에 표시가 붙는다', async () => {
  await SC.setBinding('ws.addIde', 'Mod+T');
  const tree = await render();
  expect(texts(tree)).toContain(TX.sc.conflict);
  expect(texts(tree).join('\n')).toContain(TX.sc.conflictNote);
});

test('조합 고르기 — 수식어 없는 글자는 적용되지 않는다', async () => {
  const tree = await render();
  // 키 버튼(현재 ⌘T)을 눌러 고르기 열기
  await act(async () => { rowWith(tree, formatCombo('Mod+T', SC.IS_APPLE))?.props.onPress?.(); });
  // 수식어를 전부 끄고(현재 Mod 만 켜져 있다) 'K' 를 고른 뒤 적용 → 무효라 그대로여야 한다
  await act(async () => { rowWith(tree, SC.IS_APPLE ? '⌘' : 'Ctrl')?.props.onPress?.(); });
  await act(async () => { rowWith(tree, 'K')?.props.onPress?.(); });
  await act(async () => { rowWith(tree, '적용')?.props.onPress?.(); });
  expect(SC.bindings()['ws.addTerminal']).toBe('Mod+T');
});
