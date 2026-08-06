/**
 * 모바일 화면이 **자기 자신을 다시 부르지 않는가**(목록 요청 폭주 금지).
 *
 * 2026-08-06 실사고: 탭 제목을 기기명으로 올리면서 `loadDevices` 안에서 매번
 *  `onDeviceChange(id, name)` 를 부르고, 그 콜백을 useCallback 의존성에도 넣었다. 부모(PaneView)는
 *  인라인 화살표를 내려 주므로 고리가 닫혔다:
 *    목록 요청 → 부모 상태 쓰기 → 부모 렌더 → **새 콜백** → loadDevices 새로 만들어짐 →
 *    useEffect 다시 → 목록 요청 …
 *  실측: 폰이 **초당 5회** 프로덕션 서버에 목록을 요청했다(왕복 260~490ms). 오류는 한 줄도 없고,
 *  증상은 "앱이 전체적으로 굼뜨다" + 영상 스트림이 시작조차 못 하는 것뿐이라 원인을 짐작할 수 없다.
 *
 * 그래서 여기서 고정하는 것은 **불변식**이다: 부모가 매 렌더 새 콜백을 줘도 목록 요청은 유한하다.
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
  },
}));

import EmulatorBody from '../src/workspace/EmulatorBody';

const ON = {
  id: 'android:emulator-5554', kind: 'android', name: 'Pixel 6', avdName: 'Pixel_6',
  state: 'booted', physical: false, caps: { frame: true, input: true, keys: ['home'] },
};

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

/**
 * 부모(PaneView)를 그대로 흉내 낸다. 두 가지가 **둘 다** 있어야 실제와 같다:
 *  ① onDeviceChange 가 인라인 화살표라 매 렌더 새 함수다
 *  ② 그 콜백이 상태를 쓸 때 **새 객체**를 만든다(patchTabByKey 는 `n.tabs.map(... {...t, ...patch})`
 *     라 값이 같아도 항상 새 배열/새 객체다) → 같은 이름을 다시 올려도 React 가 렌더를 건너뛰지 않는다.
 *  ②를 빼먹으면(문자열 상태로 흉내 내면) 같은 값 쓰기에서 React 가 바일아웃해 고리가 저절로 멈춘다 —
 *  그러면 이 테스트는 **버그가 있어도 초록**이다(실제로 처음에 그렇게 썼다가 통과했다).
 */
function ParentNoRemount() {
  const [, setTab] = React.useState<{ metaName: string }>({ metaName: '' });
  return (
    <EmulatorBody
      host={7}
      deviceId={ON.id}
      active
      onDeviceChange={(_id, name) => setTab({ metaName: name || '' })}
    />
  );
}

describe('목록 요청이 스스로를 다시 부르지 않는다', () => {
  beforeEach(() => { mockList.mockReset(); mockList.mockResolvedValue({ devices: [ON], tools: { adb: true } }); });

  it('★ 부모가 매 렌더 새 콜백을 줘도 목록 요청은 유한하다', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { tree = ReactTestRenderer.create(<ParentNoRemount />); });
    for (let i = 0; i < 8; i++) await flush();
    //  고리가 살아 있으면 왕복마다 한 번씩 늘어 수십 번이 된다. 정상이면 처음 한두 번뿐이다.
    expect(mockList.mock.calls.length).toBeLessThanOrEqual(3);
    await act(async () => { tree.unmount(); });
  });

  it('이름을 이미 올렸으면 같은 이름을 다시 올리지 않는다', async () => {
    const onDeviceChange = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <EmulatorBody host={7} deviceId={ON.id} active onDeviceChange={onDeviceChange} />,
      );
    });
    for (let i = 0; i < 6; i++) await flush();
    expect(onDeviceChange).toHaveBeenCalledTimes(1);
    expect(onDeviceChange).toHaveBeenCalledWith(ON.id, 'Pixel 6');
    await act(async () => { tree.unmount(); });
  });
});
