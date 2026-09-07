// 업데이트 안내 — "터미널이 거절당하기 전에" 알려주는 계약.
//
// 왜 이 파일이 있나(2026-09-07 사용자 보고):
//   구버전 앱으로 접속했는데 아무 안내가 없다가, 터미널을 여는 순간 데몬이 빨간 글씨로
//   "[앱/PC 버전이 오래됐습니다]" 를 뱉는 게 **첫 안내**였다. 그때는 이미 기능이 막힌 뒤다.
//   원인: 업데이트 확인이 설정 모달 안에만 있어 그 화면을 열어야만 돌았다.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../src');

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  // utils/service 가 부팅 시 isEmulatorSync 를 부른다(BACK_URL 결정) — 같이 채워 준다.
  default: { getVersion: () => '0.4.0', isEmulatorSync: () => false },
}));

const load = (body: unknown, status = 200) => {
  jest.resetModules();
  const calls: string[] = [];
  (global as any).fetch = jest.fn(async (url: string) => {
    calls.push(url);
    return { ok: status < 300, status, json: async () => body };
  });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../src/services/appUpdate');
  return { mod, calls };
};

describe('앱 업데이트 감지', () => {
  test('스토어가 더 높으면 업데이트 있음으로 잡는다', async () => {
    const { mod } = load({ version: '0.4.1', url: 'https://play.google.com/x' });
    const u = await mod.check(true);
    expect(u.available).toBe(true);
    expect(u.latest).toBe('0.4.1');
    expect(mod.shouldPrompt()).toBe(true);
  });

  test('같거나 낮으면 안내하지 않는다', async () => {
    const { mod } = load({ version: '0.4.0', url: '' });
    await mod.check(true);
    expect(mod.shouldPrompt()).toBe(false);
  });

  test('minVersion 미달이면 필수 — "나중에" 로 접을 수 없다', async () => {
    const { mod } = load({ version: '0.5.0', minVersion: '0.4.1', url: '' });
    await mod.check(true);
    expect(mod.getSnapshot().required).toBe(true);
    mod.dismiss();
    expect(mod.shouldPrompt()).toBe(true); // 필수는 접히지 않는다
  });

  test('"나중에" 는 그 버전에만 적용된다 — 다음 릴리스엔 다시 뜬다', async () => {
    const { mod } = load({ version: '0.4.1', url: '' });
    await mod.check(true);
    mod.dismiss();
    expect(mod.shouldPrompt()).toBe(false);

    (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ version: '0.4.2', url: '' }) }));
    await mod.check(true);
    expect(mod.shouldPrompt()).toBe(true);
  });

  test('조회 실패는 "최신"이 아니라 "모름" — 있던 안내를 지우지 않는다', async () => {
    const { mod } = load({ version: '0.4.1', url: '' });
    await mod.check(true);
    expect(mod.shouldPrompt()).toBe(true);

    (global as any).fetch = jest.fn(async () => { throw new Error('offline'); });
    await mod.check(true);
    expect(mod.shouldPrompt()).toBe(true); // 네트워크 한 번 끊겼다고 배너가 깜빡이며 사라지면 안 된다
  });

  test('스로틀 — 짧은 간격의 재확인은 네트워크를 다시 쓰지 않는다', async () => {
    const { mod, calls } = load({ version: '0.4.1', url: '' });
    await mod.check(true);
    await mod.check(false);
    await mod.check(false);
    expect(calls.length).toBe(1);
  });

  test('URL 이 없으면 플랫폼 기본 스토어로 보낸다', async () => {
    const { mod } = load({ version: '0.4.1', url: '' });
    await mod.check(true);
    expect(mod.storeUrl()).toMatch(/play\.google\.com|apps\.apple\.com/);
  });
});

describe('업데이트 안내가 화면에 실제로 배선돼 있다', () => {
  test('앱 시작 시 자동 확인이 걸려 있다 (설정 화면을 열어야만 알던 문제의 근본 수정)', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
    expect(app).toContain('appUpdate.startAutoCheck()');
  });

  test('워크스페이스에 안내 스트립이 붙어 있다', () => {
    const view = fs.readFileSync(path.join(SRC, 'workspace/WorkspaceView.tsx'), 'utf8');
    expect(view).toContain('<AppUpdateStrip />');
    expect(view).toContain('function AppUpdateStrip()');
  });

  test('업데이트 판정은 한 벌이다 — 설정 화면이 자기 구현을 다시 갖지 않는다', () => {
    const settings = fs.readFileSync(path.join(SRC, 'components/SettingsModal.tsx'), 'utf8');
    expect(settings).toContain('appUpdate.check(true)');
    expect(settings).not.toContain('function isNewerVersion');
  });
});

describe('터미널 실패 화면', () => {
  const pane = () => fs.readFileSync(path.join(SRC, 'workspace/PaneView.tsx'), 'utf8');

  test('버전 불일치는 전원 문제가 아니라 버전 문제로 안내한다', () => {
    const s = pane();
    expect(s).toContain('onIncompatible');
    expect(s).toContain('앱과 PC 버전이 맞지 않아 터미널을 열 수 없어요.');
    // 원문(상대가 보낸 안내)을 함께 보여줘야 어느 쪽이 낮은지 알 수 있다.
    expect(s).toContain('{incompatNotice}');
  });

  test('채움 버튼 글자색은 배경 토큰의 짝이다 — 다크에서 안 보이던 버그', () => {
    const s = pane();
    // backgroundColor: C.text 인 버튼 뒤 4줄 안에 '#fff' 가 있으면 다크에서 글자가 사라진다.
    const lines = s.split('\n');
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      if (!/backgroundColor: C\.text[,}\s]/.test(line)) return;
      const near = lines.slice(i, i + 5).join(' ');
      if (/color: ['"]#fff/i.test(near)) offenders.push(`L${i + 1}`);
    });
    expect(offenders).toEqual([]);
  });
});
