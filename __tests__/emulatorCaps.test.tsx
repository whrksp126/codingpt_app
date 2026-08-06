/**
 * 기기의 **조작 능력이 낡는 것**을 화면이 스스로 고치는가.
 *
 * 2026-08-06 실사고(유선 폰 → iOS 시뮬레이터): 조작 버튼이 하나도 안 뜨고 터치·스크롤도 안 먹었다.
 *  데몬은 `caps.input`·`caps.keys` 를 **목록을 읽는 그 순간의 상태**로 계산한다(시뮬레이터가 안 떠
 *  있으면 input:false, keys:[]). 그런데 화면은 그 목록을 **탭을 처음 열 때 딱 한 번**만 읽었다.
 *  그래서 시뮬레이터가 다 뜬 뒤에도 화면은 "조작 불가" 를 영영 들고 있었다 — 오류도, 이유도 없이
 *  그냥 아무 일도 일어나지 않는다. 안드로이드는 대개 이미 떠 있어 안 걸렸고 iOS 만 걸렸다.
 *
 * 여기서 고정하는 것 두 가지:
 *  ① 탭으로 **돌아오면** 다시 읽는다(사용자가 시뮬레이터를 켜고 돌아오는 실제 동선)
 *  ② 조작 불가인 채로 보고 있으면 잠깐씩 다시 묻되 **상한이 있다**(무한 폴링 금지 —
 *     정말 조작을 지원하지 않는 기기도 있고, 그때 계속 두드리는 건 그냥 낭비다)
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('../src/animations/haptics', () => ({ haptic: { keyPress: () => {} } }));

const mockList = jest.fn();
jest.mock('../src/services/daemonService', () => ({
  __esModule: true,
  default: {
    emulatorList: (...a: any[]) => mockList(...a),
    emulatorPower: jest.fn(),
    emulatorFrame: jest.fn(() => new Promise(() => { /* 프레임은 안 온다 — 목록만 본다 */ })),
    emulatorInput: jest.fn(),
    emulatorStreamStart: jest.fn(() => new Promise(() => { /* 영상도 안 붙인다 */ })),
  },
}));

import EmulatorBody from '../src/workspace/EmulatorBody';

const ID = 'ios:1A2B';
/** 아직 안 뜬 시뮬레이터 — 데몬이 정직하게 "조작 불가" 로 알려 준다(그 순간의 사실이다). */
const COLD = { id: ID, kind: 'ios', name: 'iPhone 16 · iOS 18.5', state: 'shutdown', physical: false, caps: { frame: false, input: false, keys: [] } };
/** 다 뜬 뒤 — 같은 기기인데 능력이 달라진다. 화면이 이걸 다시 읽어야 버튼이 나온다. */
const WARM = { ...COLD, state: 'booted', caps: { frame: true, input: true, keys: ['home', 'rotate', 'lock'] } };

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

describe('조작 능력은 다시 읽는다', () => {
  beforeEach(() => { mockList.mockReset(); mockList.mockResolvedValue({ devices: [COLD], tools: { simctl: true } }); });

  it('★ 탭으로 돌아오면 기기 목록을 다시 읽는다', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <EmulatorBody host={7} deviceId={ID} active={false} onDeviceChange={() => {}} />,
      );
    });
    await flush();
    const whileHidden = mockList.mock.calls.length;

    //  사용자가 그 사이 시뮬레이터를 켜고 돌아온다.
    mockList.mockResolvedValue({ devices: [WARM], tools: { simctl: true } });
    await act(async () => {
      tree.update(<EmulatorBody host={7} deviceId={ID} active onDeviceChange={() => {}} />);
    });
    await flush();
    expect(mockList.mock.calls.length).toBeGreaterThan(whileHidden);
    await act(async () => { tree.unmount(); });
  });

  it('★ 조작 불가인 채로 있으면 다시 묻되, 무한히 두드리지 않는다', async () => {
    jest.useFakeTimers();
    try {
      let tree!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(
          <EmulatorBody host={7} deviceId={ID} active onDeviceChange={() => {}} />,
        );
      });
      await act(async () => { await Promise.resolve(); });

      //  4초 간격 재시도 — 20번을 굴려도 상한(15) 을 넘지 않는다.
      for (let i = 0; i < 20; i++) {
        await act(async () => { jest.advanceTimersByTime(4000); await Promise.resolve(); await Promise.resolve(); });
      }
      const calls = mockList.mock.calls.length;
      expect(calls).toBeGreaterThan(2);    // 재시도가 실제로 돈다(안 돌면 옛 버그 그대로)
      expect(calls).toBeLessThanOrEqual(20); // 상한이 있다(없으면 20번 다 돈다 + 계속 늘어난다)
      await act(async () => { tree.unmount(); });
    } finally { jest.useRealTimers(); }
  });

  it('조작이 되는 기기면 다시 묻지 않는다(멀쩡한 기기를 두드리지 않는다)', async () => {
    mockList.mockResolvedValue({ devices: [WARM], tools: { simctl: true } });
    jest.useFakeTimers();
    try {
      let tree!: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = ReactTestRenderer.create(
          <EmulatorBody host={7} deviceId={ID} active onDeviceChange={() => {}} />,
        );
      });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      const settled = mockList.mock.calls.length;
      for (let i = 0; i < 5; i++) {
        await act(async () => { jest.advanceTimersByTime(4000); await Promise.resolve(); });
      }
      expect(mockList.mock.calls.length).toBe(settled);
      await act(async () => { tree.unmount(); });
    } finally { jest.useRealTimers(); }
  });
});
