/**
 * 자동화 번들 딥링크 + 장소 전환(automation-design.md §5.8 · §5.9 · §6.5).
 *
 * 고정하는 것:
 *  · `codingpt://auto/<id>?host=` → `자동화` 장소의 그 상세 · id 없으면 목록.
 *  · `codingpt://tasks?host=`     → 그 PC 로 옮긴 뒤 진행 현황(pc_sleeping/pc_disconnected).
 *  · 푸시 pending 의 종류 경계: 'task' 가 'tasks?host=' 를 가로채지 않는다(접두 비교 금지).
 *  · 진행 현황 ↔ 자동화는 배타(한쪽을 열면 다른 쪽이 닫힌다).
 *  · 하드웨어 back 순서: 드로어 → 시트 → 진행 현황 → 자동화 → 앱 기본.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BackHandler, Linking } from 'react-native';

jest.mock('../src/components/keyboard/KeyAssist', () => ({ KeyAssistOverlay: () => null, collapseKeyAssist: () => {} }));
const mockDrawer = { open: false, closeDrawer: jest.fn() };
jest.mock('../src/contexts/DrawerContext', () => ({ useDrawer: () => mockDrawer }));
const mockMyInfo = { open: false };
jest.mock('../src/contexts/MyInfoContext', () => ({ useMyInfo: () => mockMyInfo }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ getState: () => ({ index: 0, routes: [{ name: 'Tabs' }] }) }) }));

import { parseAutoDeeplink, parseTasksDeeplink, deeplinkKindIs } from '../src/services/pushService';
import { handleAutoLink, useAutoDeepLink, _resetAutoDeepLinkForTest } from '../src/hooks/useAutoDeepLink';
import * as AU from '../src/workspace/automations/automationsUi';
import * as TU from '../src/workspace/tasks/tasksUi';
import AppBackHandler from '../src/navigation/AppBackHandler';

beforeEach(() => {
  AU._resetAutomationsUiForTest();
  TU.closeTasksDashboard();
  TU.setTasksBackHandler(null);
  mockDrawer.open = false;
  mockDrawer.closeDrawer.mockClear();
  mockMyInfo.open = false;
});

describe('파서', () => {
  test('auto — 데몬이 싣는 모양 그대로', () => {
    expect(parseAutoDeeplink('codingpt://auto/a_k3j9x2m1qa?host=12')).toEqual({ id: 'a_k3j9x2m1qa', host: 12 });
    expect(parseAutoDeeplink('codingpt://auto/a%5F1/?host=3')).toEqual({ id: 'a_1', host: 3 });
    expect(parseAutoDeeplink('codingpt://auto?host=3')).toEqual({ id: null, host: 3 });
    expect(parseAutoDeeplink('codingpt://auto/a_1?host=x')).toEqual({ id: 'a_1', host: null });
    expect(parseAutoDeeplink('codingpt://autox/a_1')).toBeNull();
    expect(parseAutoDeeplink('codingpt://task/t_1')).toBeNull();
  });
  test('tasks — 경로 없이 쿼리만', () => {
    expect(parseTasksDeeplink('codingpt://tasks?host=12')).toEqual({ host: 12 });
    expect(parseTasksDeeplink('codingpt://tasks')).toEqual({ host: null });
    expect(parseTasksDeeplink('codingpt://task/t_1?host=12')).toBeNull();
  });
  test('종류 경계 — task ≠ tasks', () => {
    expect(deeplinkKindIs('codingpt://tasks?host=1', 'task')).toBe(false);
    expect(deeplinkKindIs('codingpt://tasks?host=1', 'tasks')).toBe(true);
    expect(deeplinkKindIs('codingpt://task/t_1', 'task')).toBe(true);
    expect(deeplinkKindIs('codingpt://auto', 'auto')).toBe(true);
  });
});

describe('handleAutoLink', () => {
  test('auto → 자동화 장소 + 그 상세 focus, 진행 현황은 닫힌다', () => {
    TU.openTasksDashboard();
    expect(handleAutoLink('codingpt://auto/a_1?host=12')).toBe(true);
    expect(AU.getAutomationsUi()).toMatchObject({ open: true, focus: { id: 'a_1', host: 12 } });
    expect(TU.getTasksUi().open).toBe(false);
  });
  test('tasks?host= → 그 PC 로 옮기고 진행 현황, 자동화는 닫힌다', () => {
    AU.openAutomations();
    const go = jest.fn();
    expect(handleAutoLink('codingpt://tasks?host=12', go)).toBe(true);
    expect(go).toHaveBeenCalledWith(12);
    expect(TU.getTasksUi().open).toBe(true);
    expect(AU.getAutomationsUi().open).toBe(false);
  });
  test('다른 링크는 건드리지 않는다', () => {
    expect(handleAutoLink('codingpt://task/t_1?host=1')).toBe(false);
    expect(handleAutoLink('codingpt://notif/1')).toBe(false);
    expect(AU.getAutomationsUi().open).toBe(false);
  });
  test('콜드스타트 URL 은 프로세스당 1회', async () => {
    _resetAutoDeepLinkForTest();
    const spy = jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('codingpt://auto/a_9?host=5' as any);
    function Probe({ on }: { on: boolean }) { useAutoDeepLink(on); return null; }
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { r = ReactTestRenderer.create(<Probe on />); });
    expect(AU.getAutomationsUi().focus).toEqual({ id: 'a_9', host: 5 });
    await act(async () => { r.update(<Probe on={false} />); });
    await act(async () => { r.update(<Probe on />); });
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => { r.unmount(); });
    spy.mockRestore();
  });
});

describe('장소 규칙', () => {
  test('배타 — 자동화 열면 진행 현황 닫힘, 반대도', () => {
    TU.openTasksDashboard();
    AU.openAutomations();
    expect(TU.getTasksUi().open).toBe(false);
    expect(AU.getAutomationsUi().open).toBe(true);
    TU.openTasksDashboard();
    expect(AU.getAutomationsUi().open).toBe(false);
  });
  test('다시 열기 = 초점만(토글 아님)', () => {
    AU.openAutomations();
    AU.openAutomations({ id: 'a_2' });
    expect(AU.getAutomationsUi()).toMatchObject({ open: true, focus: { id: 'a_2' } });
  });
});

describe('AppBackHandler 순서 — 드로어 → 시트 → 진행 현황 → 자동화', () => {
  function mount() {
    const handlers: (() => boolean)[] = [];
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e: any, fn: any) => { handlers.push(fn); return { remove: () => {} } as any; });
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => { r = ReactTestRenderer.create(<AppBackHandler />); });
    spy.mockRestore();
    return { press: () => handlers[handlers.length - 1](), r };
  }
  test('드로어가 열려 있으면 드로어가 먼저', () => {
    mockDrawer.open = true;
    AU.openAutomations();
    const autoBack = jest.fn(() => true);
    AU.setAutomationsBackHandler(autoBack);
    const { press, r } = mount();
    expect(press()).toBe(true);
    expect(mockDrawer.closeDrawer).toHaveBeenCalled();
    expect(autoBack).not.toHaveBeenCalled();
    act(() => r.unmount());
  });
  test('내 정보 시트가 열려 있으면 패스(시트 자체 핸들러)', () => {
    mockMyInfo.open = true;
    AU.openAutomations();
    const autoBack = jest.fn(() => true);
    AU.setAutomationsBackHandler(autoBack);
    const { press, r } = mount();
    expect(press()).toBe(false);
    expect(autoBack).not.toHaveBeenCalled();
    act(() => r.unmount());
  });
  test('진행 현황이 열려 있으면 진행 현황, 자동화면 자동화', () => {
    const tasksBack = jest.fn(() => true);
    const autoBack = jest.fn(() => true);
    TU.setTasksBackHandler(tasksBack);
    AU.setAutomationsBackHandler(autoBack);
    TU.openTasksDashboard();
    const a = mount();
    expect(a.press()).toBe(true);
    expect(tasksBack).toHaveBeenCalledTimes(1);
    expect(autoBack).not.toHaveBeenCalled();
    act(() => a.r.unmount());
    AU.openAutomations(); // 진행 현황을 닫는다
    const b = mount();
    expect(b.press()).toBe(true);
    expect(autoBack).toHaveBeenCalledTimes(1);
    expect(tasksBack).toHaveBeenCalledTimes(1);
    act(() => b.r.unmount());
  });
});
