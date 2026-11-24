/**
 * 모바일 화면 — **목록에서 기기를 고르는 순간 앱이 죽지 않는다**(2026-11-24 사용자 영상).
 *
 *  EmulatorBody 는 기기를 안 골랐을 때 목록을 그리고 일찍 return 한다. 그 return **뒤에** 훅 7개가
 *  있었다(9/21~22 알림 종 라운드). 같은 컴포넌트가 deviceId=null → 'android:…' 로 다시 그려지면
 *  훅 개수가 달라져 React 가 "Rendered more hooks than during the previous render" 를 던지고,
 *  릴리스 앱은 그 자리에서 종료된다. 여기서는 그 전환을 **같은 인스턴스로** 재현한다.
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
    emulatorFrame: jest.fn(() => new Promise(() => {})),
    emulatorInput: jest.fn(),
    emulatorStreamToken: jest.fn(() => new Promise(() => {})),
    buildEmulatorStreamWsUrl: jest.fn(() => 'wss://x'),
    emulatorWebrtcOffer: jest.fn(() => Promise.reject(new Error('no'))),
    emulatorWebrtcClose: jest.fn(),
    turnCredentials: jest.fn(),
    desktopRpc: jest.fn(() => new Promise(() => {})),
  },
}));

import EmulatorBody from '../src/workspace/EmulatorBody';

const ON = {
  id: 'android:emulator-5554', kind: 'android', name: 'sdk gphone64 arm64',
  state: 'booted', physical: false, caps: { frame: true, input: true },
};

test('★ 목록(deviceId 없음) → 기기 선택으로 다시 그려도 throw 하지 않는다', async () => {
  mockList.mockResolvedValue({ devices: [ON], tools: { adb: true } });
  const errors: unknown[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a[0]); });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<EmulatorBody host={null} deviceId={null} onDeviceChange={() => {}} active />);
  });
  await act(async () => {
    tree.update(<EmulatorBody host={null} deviceId={ON.id} onDeviceChange={() => {}} active />);
  });
  //  다시 목록으로 돌아가도(훅 수가 줄어드는 방향) 마찬가지
  await act(async () => {
    tree.update(<EmulatorBody host={null} deviceId={null} onDeviceChange={() => {}} active />);
  });
  spy.mockRestore();
  expect(errors.map(String).filter((e) => /hooks/i.test(e))).toEqual([]);
  tree.unmount();
});
