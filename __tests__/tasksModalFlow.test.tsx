/**
 * 작업 현황판 — 모달 흐름·라이브 갱신 회귀.
 *
 * 고정하는 것:
 *  · 진행 현황은 모달이 아니라 메인 자리의 장소다 — 공용 오버레이는 root 층 그대로, 열기는 즉시, 다시 열기는 초점만.
 *  · tasks.changed {host:null} 은 유령 호스트 0 을 조회하지 않고 전체 새로고침으로 간다.
 *  · 콜드스타트 URL(getInitialURL)은 프로세스당 한 번만 처리한다(재로그인마다 재생 금지).
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Linking, Platform } from 'react-native';

jest.mock('../src/components/keyboard/KeyAssist', () => ({ KeyAssistOverlay: () => null, collapseKeyAssist: () => {} }));
jest.mock('../src/animations/haptics', () => ({ haptic: { warning: () => {}, keyPress: () => {} } }));

const mockList = jest.fn(async (..._a: any[]) => ({ items: [], caps: { gh: null } }));
jest.mock('../src/services/taskService', () => {
  const actual = jest.requireActual('../src/services/taskService');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      listTasks: (...a: any[]) => mockList(...a),
      connectedHosts: () => [5],
      isHostConnected: (h: number) => h === 5,
      hostSupportsTasks: () => true,
      refreshHostCaps: async () => {},
    },
  };
});

import * as ML from '../src/components/modalLayer';
import * as UI from '../src/workspace/tasks/tasksUi';
import { AppAlertHost, showAppAlert, hideAppAlert } from '../src/components/AppAlert';
import { onTasksChanged, setTaskHostProvider } from '../src/workspace/tasks/useTasks';
import { useTaskDeepLink, _resetTaskDeepLinkForTest } from '../src/hooks/useTaskDeepLink';

beforeEach(() => {
  jest.useFakeTimers();
  ML._resetModalLayerForTest();
  UI.closeTasksDashboard();
  UI.closeNewTask();
  hideAppAlert();
  jest.advanceTimersByTime(1000);
});
afterEach(() => { jest.useRealTimers(); });

describe('진행 현황 = 메인 자리의 장소(모달 아님, 2026-09-29)', () => {
  test('진행 현황에 들어가도 공용 오버레이(알럿)는 root 층 그대로', () => {
    expect(Platform.OS).toBe('ios');
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => { r = ReactTestRenderer.create(<><AppAlertHost /><AppAlertHost layer="tasks" /></>); });
    act(() => { showAppAlert({ title: 'x' }); });
    const count = () => r.root.findAll((n) => (n.type as any) === 'Modal' || (n.type as any)?.displayName === 'Modal').length;
    const rootOnly = count();
    expect(rootOnly).toBeGreaterThan(0);
    act(() => { UI.openTasksDashboard(); });
    expect(ML.getOverlayLayer()).toBe('root');
    expect(count()).toBe(rootOnly);
    act(() => { hideAppAlert(); r.unmount(); });
  });

  test('모달이 아니므로 닫히는 시트 뒤에서도 같은 틱에 들어간다', () => {
    UI.openNewTask({ host: 5 });
    jest.advanceTimersByTime(1000);
    UI.closeNewTask();                 // 시트 내려가는 중
    UI.openTasksDashboard({ taskId: 't_1', host: 5 });
    expect(UI.getTasksUi().open).toBe(true);
    expect(UI.getTasksUi().focus?.taskId).toBe('t_1');
  });

  test('이미 들어와 있으면 다시 열기 = 초점만 바꾼다(토글 아님)', () => {
    UI.openTasksDashboard();
    UI.openTasksDashboard({ taskId: 't_2' });
    expect(UI.getTasksUi().open).toBe(true);
    expect(UI.getTasksUi().focus?.taskId).toBe('t_2');
    UI.closeTasksDashboard();
    expect(UI.getTasksUi().open).toBe(false);
    expect(UI.getTasksUi().focus).toBeNull();
  });

  test('진행 현황에서 여는 새 작업 시트', () => {
    UI.openTasksDashboard();
    UI.openNewTask({ host: 5 });
    jest.advanceTimersByTime(1000);
    expect(UI.getTasksUi().newTask).not.toBeNull();
  });
});

describe('tasks.changed', () => {
  test('host:null 은 유령 호스트 0 을 조회하지 않고 전체 새로고침', async () => {
    setTaskHostProvider(() => [5]);
    mockList.mockClear();
    onTasksChanged({ host: null, taskIds: [], reason: 'run' });
    await act(async () => { jest.advanceTimersByTime(400); for (let i = 0; i < 5; i++) await Promise.resolve(); });
    const hosts = mockList.mock.calls.map((c) => c[0]);
    expect(hosts).not.toContain(0);
    expect(hosts).toContain(5);
  });
});

describe('useTaskDeepLink', () => {
  test('getInitialURL 은 프로세스당 1회 — 로그아웃→로그인에 재생하지 않는다', async () => {
    _resetTaskDeepLinkForTest();
    const spy = jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('codingpt://task/t_9?host=5' as any);
    function Probe({ on }: { on: boolean }) { useTaskDeepLink(on); return null; }
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { r = ReactTestRenderer.create(<Probe on />); });
    await act(async () => { r.update(<Probe on={false} />); });
    await act(async () => { r.update(<Probe on />); });
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => { r.unmount(); });
    spy.mockRestore();
  });
});
