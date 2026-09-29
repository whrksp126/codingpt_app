/**
 * 대화 목록 — 밀어서 삭제(§10.7: 지우는 길은 conv.remove 하나뿐).
 *  · 왼쪽으로 밀면 [삭제] 가 드러나고, 누르면 **행 안 확인**을 거친다(밀어서 바로 지우지 않는다 — 되돌릴 수 없다).
 *  · 길게 누르기도 그대로 같은 확인으로 간다.
 *  · 터미널에서 만든 대화(external)는 우리 목록 것이 아니라 지울 수 없다 — 밀기도 꺼진다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/animations/haptics', () => ({ haptic: { keyPress: () => {}, select: () => {}, holdOpen: () => {}, warning: () => {} } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/services/convCache', () => ({ __esModule: true, default: { removeConv: jest.fn(async () => {}) } }));
const mockRpc = { list: jest.fn(), remove: jest.fn(), adopt: jest.fn() };
jest.mock('../src/services/convService', () => {
  const actual = jest.requireActual('../src/services/convService');
  const wrap = { list: (...a: any[]) => mockRpc.list(...a), remove: (...a: any[]) => mockRpc.remove(...a), adopt: (...a: any[]) => mockRpc.adopt(...a), addConvEventListener: () => () => {} };
  return { __esModule: true, ...actual, ...wrap, default: { ...actual.default, ...wrap } };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  // 제스처는 jest 에서 돌지 않는다 — 오른쪽 동작을 곧바로 그려 "밀면 보이는 것"을 검사한다.
  const R = require('react');
  const { View } = require('react-native');
  const Sw = (p: any) => R.createElement(View, { testID: 'swipeable', enabled: p.enabled },
    p.enabled === false ? null : p.renderRightActions?.({ value: 1 }, { value: -84 }, { close: mockClose }), p.children);
  return { __esModule: true, default: Sw };
});
const mockClose = jest.fn();

import ConversationListSheet from '../src/workspace/conv/ConversationListSheet';
import PressableScale from '../src/components/ui/PressableScale';

const texts = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((t) => (typeof t.props.children === 'string' ? t.props.children : '')).filter(Boolean);
const byLabel = (r: ReactTestRenderer.ReactTestRenderer, l: string) => r.root.findAllByType(PressableScale).filter((n) => n.props.accessibilityLabel === l);

test('★ 밀어서 드러난 [삭제] → 행 안 확인 → conv.remove', async () => {
  mockRpc.list.mockResolvedValue({ threads: [
    { id: 't1', title: '리팩터링', lastAt: 2 },
    { id: 't2', title: '터미널 것', lastAt: 1, external: true },
  ] });
  mockRpc.remove.mockResolvedValue({ ok: true });
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<ConversationListSheet visible onClose={() => {}} host={7} cwd="work/app" account={12} currentId={null} onOpen={() => {}} onNew={() => {}} />);
  });
  await act(async () => { await Promise.resolve(); });
  const rows = r.root.findAll((n) => n.props && n.props.testID === 'swipeable' && (n.type as unknown) === 'View');
  expect(rows.map((n) => n.props.enabled)).toEqual([true, false]);   // external 은 밀기 꺼짐
  const del = byLabel(r, '삭제');
  expect(del.length).toBe(1);                                         // 드러난 동작(확인 전)
  await act(async () => { del[0].props.onPress(); });
  expect(mockClose).toHaveBeenCalled();
  expect(mockRpc.remove).not.toHaveBeenCalled();                      // 바로 지우지 않는다
  expect(texts(r)).toContain('이 대화를 지울까요? 되돌릴 수 없어요.');
  const confirm = byLabel(r, '삭제').filter((n) => n !== del[0]);
  await act(async () => { confirm[confirm.length - 1].props.onPress(); await Promise.resolve(); await Promise.resolve(); });
  expect(mockRpc.remove).toHaveBeenCalledWith(7, 't1');
  expect(texts(r)).not.toContain('리팩터링');
  act(() => { r.unmount(); });
});

test('길게 누르기는 그대로 같은 확인으로 간다', async () => {
  mockRpc.list.mockResolvedValue({ threads: [{ id: 't1', title: '리팩터링', lastAt: 2 }] });
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<ConversationListSheet visible onClose={() => {}} host={7} cwd="work/app" account={12} currentId={null} onOpen={() => {}} onNew={() => {}} />);
  });
  await act(async () => { await Promise.resolve(); });
  const row = r.root.findAll((n) => n.props && typeof n.props.onLongPress === 'function')[0];
  await act(async () => { row.props.onLongPress(); });
  expect(texts(r)).toContain('이 대화를 지울까요? 되돌릴 수 없어요.');
  act(() => { r.unmount(); });
});
