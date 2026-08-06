/**
 * 모바일 화면 — **켜기를 누른 뒤 그 기기를 따라가는가**.
 *
 * 이 파일이 고정하는 것(2026-08-05 실사고):
 *  꺼진 에뮬레이터는 `avd:Pixel_9a`, 켜지면 `android:emulator-5554` 로 **id 가 통째로 바뀐다.**
 *  그래서 켜기를 누른 화면은 자기가 들고 있던 id 가 목록에서 사라진 채 남았고, 사용자에게는
 *  "PC 에서는 켜졌는데 폰에서는 계속 꺼짐" 으로 보였다. 둘을 잇는 끈은 `avdName` 하나뿐이다.
 *
 *  화면이 그 끈을 실제로 따라가는지 — 즉 `onDeviceChange('android:emulator-5554')` 를 부르는지 —
 *  를 본다. 상태 문구만 고쳐 놓고 따라가지 않으면 화면은 여전히 죽은 id 를 보고 있다.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('../src/animations/haptics', () => ({ haptic: { keyPress: () => {} } }));

const mockList = jest.fn();
const mockPower = jest.fn();
const mockFrame = jest.fn();
jest.mock('../src/services/daemonService', () => ({
  __esModule: true,
  default: {
    emulatorList: (...a: any[]) => mockList(...a),
    emulatorPower: (...a: any[]) => mockPower(...a),
    emulatorFrame: (...a: any[]) => mockFrame(...a),
    emulatorInput: jest.fn(),
  },
}));

import EmulatorBody from '../src/workspace/EmulatorBody';

const OFF = {
  id: 'avd:Pixel_9a', kind: 'android', name: 'Pixel 9a', avdName: 'Pixel_9a',
  state: 'shutdown', physical: false, caps: { frame: false, input: false },
};
const ON = {
  id: 'android:emulator-5554', kind: 'android', name: 'Pixel 9a', avdName: 'Pixel_9a',
  state: 'booted', physical: false, caps: { frame: true, input: true },
};

const flush = async () => { await act(async () => { await Promise.resolve(); }); };

/** 화면에 실제로 보이는 글자 전부 — 상태 문구는 `{조건 ? A : B}{...}` 라 children 이 배열이다. */
const screenText = (tree: ReactTestRenderer.ReactTestRenderer) => {
  const out: string[] = [];
  const walk = (c: unknown) => {
    if (typeof c === 'string') out.push(c);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  tree.root.findAllByType(Text).forEach((n) => walk(n.props.children));
  return out.join('|');
};

/** [켜기] 버튼 — 같은 라벨이 합성/호스트 노드로 여러 번 잡히므로 onPress 를 가진 것 하나만 쓴다. */
const powerButton = (tree: ReactTestRenderer.ReactTestRenderer) => tree.root.findAll(
  (n) => typeof n.props.accessibilityLabel === 'string'
    && /켜기$/.test(n.props.accessibilityLabel)
    && typeof n.props.onPress === 'function',
)[0];

describe('켜기 → 켜진 기기로 따라간다', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFrame.mockResolvedValue({ mime: 'image/jpeg', base64: '', width: 1080, height: 2400 });
    mockPower.mockResolvedValue({ ok: true, booting: true, avdName: 'Pixel_9a' });
  });
  afterEach(() => { jest.useRealTimers(); });

  test('★ 부팅이 끝나면 새 id 로 갈아탄다(예전엔 죽은 avd: id 를 붙들고 영원히 꺼짐이었다)', async () => {
    // 처음엔 꺼져 있고, 두 번째 조회부터 켜진 행으로 바뀐다.
    mockList
      .mockResolvedValueOnce({ devices: [OFF], tools: { adb: true } })   // 최초 로드
      .mockResolvedValueOnce({ devices: [OFF], tools: { adb: true } })   // power 직후
      .mockResolvedValue({ devices: [ON], tools: { adb: true } });       // 부팅 완료
    const onDeviceChange = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <EmulatorBody host={7} deviceId={null} onDeviceChange={onDeviceChange} active />,
      );
    });
    await flush();

    // 목록에서 꺼진 기기의 [켜기] 를 누른다.
    const btn = powerButton(tree);
    expect(btn).toBeTruthy();
    await act(async () => { btn.props.onPress(); });
    await flush();
    expect(mockPower).toHaveBeenCalledWith('avd:Pixel_9a', 'boot', 7);

    // 아직 안 떴다 — 화면을 옮기지 않는다(엉뚱한 기기로 가면 안 된다).
    expect(onDeviceChange).not.toHaveBeenCalled();

    // 부팅 감시 주기가 돌면 새 행을 찾아 따라간다.
    for (let i = 0; i < 3 && !onDeviceChange.mock.calls.length; i++) {
      await act(async () => { jest.advanceTimersByTime(2600); });
      await flush();
    }
    //  ★ 이름까지 같이 올린다 — 탭 제목이 곧 기기명이다(2026-08-06).
    expect(onDeviceChange).toHaveBeenCalledWith('android:emulator-5554', 'Pixel 9a');
  });

  test('켜는 동안에는 “켜는 중…” 이라고 말한다(꺼짐이라고 하면 눌러도 안 됐다고 읽힌다)', async () => {
    mockList.mockResolvedValue({ devices: [OFF], tools: { adb: true } });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <EmulatorBody host={7} deviceId={null} onDeviceChange={jest.fn()} active />,
      );
    });
    await flush();
    expect(screenText(tree)).toContain('꺼짐');
    await act(async () => { powerButton(tree).props.onPress(); });
    await flush();
    expect(screenText(tree)).toContain('켜는 중…');
  });

  test('부팅 응답에 avdName 이 없으면 목록 행의 이름으로 따라간다(구 데몬 호환)', async () => {
    mockPower.mockResolvedValue({ ok: true, booting: true });   // 구 데몬 = avdName 없음
    mockList
      .mockResolvedValueOnce({ devices: [OFF], tools: { adb: true } })
      .mockResolvedValueOnce({ devices: [OFF], tools: { adb: true } })
      .mockResolvedValue({ devices: [ON], tools: { adb: true } });
    const onDeviceChange = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <EmulatorBody host={7} deviceId={null} onDeviceChange={onDeviceChange} active />,
      );
    });
    await flush();
    await act(async () => { powerButton(tree).props.onPress(); });
    await flush();
    for (let i = 0; i < 3 && !onDeviceChange.mock.calls.length; i++) {
      await act(async () => { jest.advanceTimersByTime(2600); });
      await flush();
    }
    //  ★ 이름까지 같이 올린다 — 탭 제목이 곧 기기명이다(2026-08-06).
    expect(onDeviceChange).toHaveBeenCalledWith('android:emulator-5554', 'Pixel 9a');
  });
});
