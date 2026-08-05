// apiBody — 서버로 나가는 **요청 본문의 모양**을 고정한다.
//
// 왜 이 파일이 있나(2026-08-05 실사고): 폰의 "모바일 화면" 탭이 항상
//   `Unexpected token " in JSON at position 0`
// 으로 죽었다. 지난 라운드에 이걸 "PC 데몬이 구버전이라 그렇다"고 오진했는데, 데몬을 올려도
// 그대로였다. 진짜 원인은 클라이언트였다:
//
//   apiRequest 는 `config.body = JSON.stringify(options.body)` 를 **자기가** 한다.
//   그런데 emulator/review 계열만 `body: JSON.stringify({...})` 로 이미 문자열을 넘겼다.
//   → 본문이 `"{\"id\":…}"` (최상위가 JSON **문자열**)
//   → express.json() 은 기본이 strict:true 라 최상위 문자열을 **거부**한다(400)
//   → 그 400 의 본문에 담긴 파서 오류 메시지가 화면에 그대로 떴다.
//
// 이 오류는 "서버가 뭔가 잘못됐다"처럼 보여서 며칠을 엉뚱한 곳에서 찾게 만든다. 그래서
// **나가는 본문을 실제로 가로채** 최상위가 객체인지 확인한다(문자열이면 실패).
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../src');

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => 'tok'), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}));

describe('요청 본문은 최상위가 객체여야 한다', () => {
  const sent: { url: string; body: string | undefined }[] = [];

  beforeEach(() => {
    sent.length = 0;
    (global as any).fetch = jest.fn(async (url: string, cfg: any) => {
      sent.push({ url, body: cfg?.body });
      return {
        status: 200,
        ok: true,
        json: async () => ({ success: true, data: { devices: [], tools: {} } }),
      };
    });
  });

  // 데몬 릴레이 계열을 골고루 — 한 곳만 고쳐지는 것을 막는다.
  const CASES: [string, (d: any) => Promise<unknown>][] = [
    ['emulatorList', (d) => d.emulatorList(7)],
    ['emulatorFrame', (d) => d.emulatorFrame('emulator-5554', { maxWidth: 480 }, 7)],
    ['emulatorInput', (d) => d.emulatorInput({ id: 'x', type: 'tap', x: 0.5, y: 0.5 }, 7)],
    ['emulatorPower', (d) => d.emulatorPower('x', 'boot', 7)],
    ['reviewSubmit', (d) => d.reviewSubmit('r1', [], 'note', 7)],
    ['reviewCancel', (d) => d.reviewCancel('r1', 'why', 7)],
    // 원래 멀쩡했던 것 — 검사 자체가 살아 있다는 대조군.
    ['wireAgent', (d) => d.wireAgent('claude', true, 7)],
  ];

  test.each(CASES)('%s — 본문이 JSON 객체다(문자열 이중 인코딩 금지)', async (_name, call) => {
    const daemonService = require('../src/services/daemonService');
    await call(daemonService).catch(() => { /* 응답 모양은 이 테스트의 관심사가 아니다 */ });
    expect(sent.length).toBeGreaterThan(0);
    const raw = sent[sent.length - 1].body;
    expect(typeof raw).toBe('string');
    const parsed = JSON.parse(raw as string);
    //  ★ 여기가 핵심: 이중 stringify 면 parsed 가 **문자열**이 되고 서버가 400 을 던진다.
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
  });

  // 위 목록에 없는 호출이 같은 실수를 하는 것도 막는다(소스 스캔).
  //  ⚠ `body: JSON.stringify(` 자체는 죄가 없다 — approvalService·e2ee 는 **자기 fetch 래퍼**라
  //   거기서 직렬화하는 게 맞다. 문제는 이미 직렬화하는 `apiRequest` 에 또 넘기는 경우뿐이므로,
  //   그 호출 안에 있는 것만 잡는다(안 그러면 정상 코드를 잡는 시끄러운 검사가 되어 곧 꺼진다).
  test('apiRequest 호출에 이미 문자열이 된 body 를 넘기지 않는다', () => {
    const offenders: string[] = [];
    for (const f of fs.readdirSync(path.join(SRC, 'services'))) {
      if (!f.endsWith('.ts')) continue;
      const src = fs.readFileSync(path.join(SRC, 'services', f), 'utf8');
      // apiRequest( ... ) 한 호출을 통째로 떠서 그 안만 본다.
      for (const m of src.matchAll(/apiRequest[\s\S]{0,60}?\(/g)) {
        let i = m.index! + m[0].length - 1, depth = 0, end = i;
        for (; i < src.length && i < m.index! + 4000; i++) {
          if (src[i] === '(') depth++;
          else if (src[i] === ')') { depth--; if (!depth) { end = i; break; } }
        }
        const call = src.slice(m.index!, end);
        if (/body:\s*JSON\.stringify\(/.test(call)) {
          offenders.push(`${f}:${src.slice(0, m.index!).split('\n').length}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
