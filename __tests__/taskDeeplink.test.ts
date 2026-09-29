// 작업 딥링크(설계 §3.4/§6.9) — `codingpt://task/<taskId>?host=<n>&run=<r>`.
//  푸시 탭과 OS Linking 이 같은 파서를 탄다. 한쪽 경로만 되는 갈래를 막기 위해 파서·라우팅을 여기서 고정한다.
jest.mock('../src/workspace/tasks/tasksUi', () => ({ openTasksDashboard: jest.fn() }));

import { parseTaskDeeplink, takePendingPushDeeplink } from '../src/services/pushService';
import { handleTaskLink } from '../src/hooks/useTaskDeepLink';
import { openTasksDashboard } from '../src/workspace/tasks/tasksUi';

describe('parseTaskDeeplink', () => {
  test('데몬이 싣는 모양 그대로', () => {
    expect(parseTaskDeeplink('codingpt://task/t_k3j9x2m1qa?host=12&run=r_8fk2ma1q'))
      .toEqual({ taskId: 't_k3j9x2m1qa', host: 12, runId: 'r_8fk2ma1q' });
  });
  test('쿼리 없음 / 순서 바뀜 / 인코딩', () => {
    expect(parseTaskDeeplink('codingpt://task/t_abc')).toEqual({ taskId: 't_abc', host: null, runId: null });
    expect(parseTaskDeeplink('codingpt://task/t_abc?run=r_1&host=3')).toEqual({ taskId: 't_abc', host: 3, runId: 'r_1' });
    expect(parseTaskDeeplink('codingpt://task/t%5Fabc/?host=3')).toEqual({ taskId: 't_abc', host: 3, runId: null });
  });
  test('host 는 정수만 — 아니면 null(모든 PC 에서 찾는다)', () => {
    expect(parseTaskDeeplink('codingpt://task/t_a?host=abc')?.host).toBeNull();
    expect(parseTaskDeeplink('codingpt://task/t_a?host=1.5')?.host).toBeNull();
    expect(parseTaskDeeplink('codingpt://task/t_a?host=')?.host).toBeNull();
  });
  test('다른 스킴·종류·빈 id 는 null', () => {
    expect(parseTaskDeeplink('codingpt://notif/12?ws=a')).toBeNull();
    expect(parseTaskDeeplink('codingpt://task/')).toBeNull();
    expect(parseTaskDeeplink('https://task/t_a')).toBeNull();
    expect(parseTaskDeeplink(null)).toBeNull();
  });
});

describe('handleTaskLink — 파싱되면 현황판을 그 작업으로 연다', () => {
  beforeEach(() => (openTasksDashboard as jest.Mock).mockClear());
  test('task 링크', () => {
    expect(handleTaskLink('codingpt://task/t_1?host=2&run=r_9')).toBe(true);
    expect(openTasksDashboard).toHaveBeenCalledWith({ taskId: 't_1', runId: 'r_9', host: 2 });
  });
  test('다른 링크는 건드리지 않는다(알림·승인 소비자 몫)', () => {
    expect(handleTaskLink('codingpt://approval/abc')).toBe(false);
    expect(handleTaskLink('codingpt://notif/1')).toBe(false);
    expect(openTasksDashboard).not.toHaveBeenCalled();
  });
});

test("takePendingPushDeeplink('task') 는 task 링크가 아니면 소비하지 않는다", () => {
  // 보관분이 없으면 null — kind 필터가 다른 종류를 빼앗지 않는다는 계약의 최소 확인.
  expect(takePendingPushDeeplink('task')).toBeNull();
});
