/**
 * 작업 현황판 — 모달 흐름·라이브 갱신 회귀.
 *
 * 고정하는 것:
 *  · iOS(new arch)는 루트 VC 가 전체화면 모달(현황판)을 띄운 동안 형제 모달 present 를 거부한다 →
 *    현황판이 열려 있으면 공용 오버레이(알럿·승인·새 작업 시트)는 현황판 Modal 안의 'tasks' 층에서만 그린다.
 *  · 한 모달을 닫고 같은 틱에 다른 형제 모달을 열지 않는다(iOS: dismiss 뒤에 연다).
 *  · onShow 가 안 온(= present 실패한) 현황판은 다음 열기 요청에서 다시 마운트해 되살린다.
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

describe('modalLayer — 공용 오버레이는 한 층에서만', () => {
  test('현황판이 열리면 알럿은 tasks 층 인스턴스만 그린다, 닫히면 root', () => {
    expect(Platform.OS).toBe('ios');
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => { r = ReactTestRenderer.create(<><AppAlertHost /><AppAlertHost layer="tasks" /></>); });
    act(() => { showAppAlert({ title: 'x' }); });
    const count = () => r.root.findAll((n) => (n.type as any) === 'Modal' || (n.type as any)?.displayName === 'Modal').length;
    const rootOnly = count();
    expect(rootOnly).toBeGreaterThan(0);
    act(() => { UI.openTasksDashboard(); jest.advanceTimersByTime(1000); });
    expect(ML.getOverlayLayer()).toBe('tasks');
    expect(count()).toBe(rootOnly); // 둘 중 하나만(이번엔 tasks 층)
    act(() => { UI.closeTasksDashboard(); });
    expect(ML.getOverlayLayer()).toBe('root');
    act(() => { hideAppAlert(); r.unmount(); });
  });

  test('닫은 직후 여는 형제 모달은 dismiss 애니메이션 뒤로 미룬다(iOS)', () => {
    UI.openNewTask({ host: 5 });
    jest.advanceTimersByTime(1000);
    expect(UI.getTasksUi().newTask).not.toBeNull();
    UI.closeNewTask();                 // 시트 내려가는 중
    UI.openTasksDashboard({ taskId: 't_1', host: 5 });
    expect(UI.getTasksUi().open).toBe(false);          // 같은 틱에는 열지 않는다
    jest.advanceTimersByTime(ML.IOS_DISMISS_MS + 10);
    expect(UI.getTasksUi().open).toBe(true);
    expect(UI.getTasksUi().focus?.taskId).toBe('t_1');
  });

  test('현황판 안에서 여는 새 작업 시트는 즉시(중첩 present)', () => {
    UI.openTasksDashboard();
    jest.advanceTimersByTime(1000);
    UI.markTasksDashboardShown();
    UI.openNewTask({ host: 5 });
    expect(UI.getTasksUi().newTask).not.toBeNull();
  });

  test('onShow 가 안 온 현황판은 다음 열기 요청에서 다시 마운트(modalGen)', () => {
    UI.openTasksDashboard();
    jest.advanceTimersByTime(1000);
    const g0 = UI.getTasksUi().modalGen;
    jest.advanceTimersByTime(2000);
    UI.openTasksDashboard();                        // 이미 open 인데 shown 아님 = present 실패
    expect(UI.getTasksUi().modalGen).toBe(g0 + 1);
    UI.markTasksDashboardShown();
    jest.advanceTimersByTime(2000);
    UI.openTasksDashboard({ taskId: 't_2' });       // 정상적으로 떠 있으면 초점만 바꾼다
    expect(UI.getTasksUi().modalGen).toBe(g0 + 1);
    expect(UI.getTasksUi().focus?.taskId).toBe('t_2');
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
