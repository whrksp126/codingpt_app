/**
 * PC 설정 시트 — PC 깨어 있기 카드(automation-design.md §6.6).
 *
 * 고정하는 것:
 *  · caps ∌ power.v1 → "이 PC 앱을 업데이트해야…"(요청 0회) · supported:false(비 macOS) → powerUnsupported.
 *  · 미설정 상태에서 [덮개를 닫아도 계속 작업] 을 켜면 토글이 아니라 **원격 안내**가 먼저(암호 창은 PC 화면에 뜬다).
 *  · 안내에서 [설정하기] 를 눌러야 power.setup 을 보낸다 → "PC 화면의 암호 창을 확인하세요".
 *  · 상태 한 줄(깨어 있음 · 작업 n개 / 잠자기 허용) · 배터리 문구 · 주의 문구.
 *  · power.changed 가 오면 다시 읽는다.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/animations/haptics', () => ({ haptic: { keyPress: () => {}, select: () => {} } }));
jest.mock('../src/components/keyboard/KeyAssist', () => ({ KeyAssistOverlay: () => null, collapseKeyAssist: () => {} }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children }: any) => children }));

const mockCaps = { power: true as boolean | null };
jest.mock('../src/services/automationService', () => {
  const actual = jest.requireActual('../src/services/automationService');
  return { __esModule: true, ...actual, hostSupportsPower: () => mockCaps.power };
});
const mockPower = {
  getPowerStatus: jest.fn(),
  setPower: jest.fn(),
  setupPower: jest.fn(async (..._a: any[]) => ({ accepted: true })),
};
jest.mock('../src/services/powerService', () => {
  const actual = jest.requireActual('../src/services/powerService');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      getPowerStatus: (...a: any[]) => mockPower.getPowerStatus(...a),
      setPower: (...a: any[]) => mockPower.setPower(...a),
      setupPower: (...a: any[]) => mockPower.setupPower(...a),
    },
  };
});

import { PowerCard, powerNowLine } from '../src/components/PcSettingsSheet';
import { onPowerChanged, type PowerStatus } from '../src/services/powerService';
import { tx } from '../src/text';
import { AUTO_TEXT } from '../src/text/automations';
import { TASKS_TEXT } from '../src/text/tasks';
import Toggle from '../src/components/ui/Toggle';

const TA = tx(AUTO_TEXT);
const TT = tx(TASKS_TEXT);

const ST: PowerStatus = {
  supported: true, keepAwake: false, lidClosed: false, setup: 'none', active: false, reasons: [],
  layers: { caffeinate: false, disableSleep: false }, power: 'ac', lidBlocked: null,
};

const texts = (r: ReactTestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map((n) => {
  const c = n.props.children;
  return Array.isArray(c) ? c.join('') : String(c);
});
const pressText = (r: ReactTestRenderer.ReactTestRenderer, label: string) => {
  const t = r.root.findAllByType(Text).find((n) => n.props.children === label);
  if (!t) throw new Error(`no ${label}`);
  let p: any = t.parent;
  while (p && !p.props.onPress) p = p.parent;
  p.props.onPress();
};
async function render(): Promise<ReactTestRenderer.ReactTestRenderer> {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { r = ReactTestRenderer.create(<PowerCard host={12} />); });
  await act(async () => { await Promise.resolve(); });
  return r;
}

beforeEach(() => {
  mockCaps.power = true;
  mockPower.getPowerStatus.mockReset().mockResolvedValue(ST);
  mockPower.setPower.mockReset().mockResolvedValue({ status: ST });
  mockPower.setupPower.mockClear();
});

test('caps 없음 → PC 업데이트 안내, 요청 0회', async () => {
  mockCaps.power = false;
  const r = await render();
  expect(texts(r)).toContain(TT.pcNeedsUpdate);
  expect(mockPower.getPowerStatus).not.toHaveBeenCalled();
  act(() => r.unmount());
});

test('비 macOS → 지원 안 됨', async () => {
  mockPower.getPowerStatus.mockResolvedValue({ ...ST, supported: false });
  const r = await render();
  expect(texts(r)).toContain(TA.powerUnsupported);
  act(() => r.unmount());
});

test('미설정에서 덮개 토글 → 원격 안내 먼저, [설정하기] 를 눌러야 power.setup', async () => {
  const r = await render();
  const t = texts(r);
  expect(t).toContain(TA.keepAwakeWork);
  expect(t).toContain(TA.lidClosedDesc);
  expect(t).toContain(TA.asleepAllowed);
  expect(t).toContain(TA.powerCaveat);
  // 두 번째 토글 = 덮개
  const toggles = r.root.findAllByType(Toggle);
  await act(async () => { toggles[1].props.onValueChange(true); });
  expect(mockPower.setPower).not.toHaveBeenCalled();
  expect(texts(r)).toContain(TA.setupRemoteHint);
  expect(mockPower.setupPower).not.toHaveBeenCalled();
  // 안내 카드 안의 [설정하기](primary) — 아래쪽 것
  const setupBtns = r.root.findAllByType(Text).filter((n) => n.props.children === TA.setUp);
  expect(setupBtns.length).toBe(2);
  let p: any = setupBtns[1].parent; while (p && !p.props.onPress) p = p.parent;
  await act(async () => { p.props.onPress(); await Promise.resolve(); });
  expect(mockPower.setupPower).toHaveBeenCalledWith(12, false);
  expect(texts(r)).toContain(TA.setupPending);
  act(() => r.unmount());
});

test('작업 중 토글 → power.set keepAwake', async () => {
  const r = await render();
  const toggles = r.root.findAllByType(Toggle);
  await act(async () => { toggles[0].props.onValueChange(true); await Promise.resolve(); });
  expect(mockPower.setPower).toHaveBeenCalledWith(12, { keepAwake: true });
  act(() => r.unmount());
});

test('설정됨 → [해제] 는 곧장 remove, 덮개 토글은 power.set', async () => {
  mockPower.getPowerStatus.mockResolvedValue({ ...ST, setup: 'done' });
  const r = await render();
  expect(texts(r)).toContain(TA.setUpDone);
  await act(async () => { pressText(r, TA.removeSetup); await Promise.resolve(); });
  expect(mockPower.setupPower).toHaveBeenCalledWith(12, true);
  const toggles = r.root.findAllByType(Toggle);
  await act(async () => { toggles[1].props.onValueChange(true); await Promise.resolve(); });
  expect(mockPower.setPower).toHaveBeenCalledWith(12, { lidClosed: true });
  act(() => r.unmount());
});

test('상태 한 줄 · 배터리 문구', async () => {
  expect(powerNowLine({ ...ST, active: true, keepAwake: true, reasons: ['task:t_1', 'task:t_2', 'automation:a_1'], layers: { caffeinate: true, disableSleep: false } }))
    .toBe(TA.awakeStatus(2));
  mockPower.getPowerStatus.mockResolvedValue({ ...ST, power: 'battery', lidBlocked: 'battery' });
  const r = await render();
  expect(texts(r)).toContain(TA.onBattery);
  act(() => r.unmount());
});

test('power.changed(같은 PC) → 다시 읽는다', async () => {
  const r = await render();
  const n = mockPower.getPowerStatus.mock.calls.length;
  await act(async () => { onPowerChanged({ host: 12 }); await Promise.resolve(); });
  expect(mockPower.getPowerStatus.mock.calls.length).toBe(n + 1);
  await act(async () => { onPowerChanged({ host: 99 }); await Promise.resolve(); });
  expect(mockPower.getPowerStatus.mock.calls.length).toBe(n + 1);
  act(() => r.unmount());
});
