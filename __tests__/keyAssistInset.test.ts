// keyAssistInset.test.ts — 보조바/패널 인셋 산수의 조합표(플랫폼 × noBar × 패널모드 × 키보드).
//
// 왜 이 테스트가 필요한가: 이 계산의 두 실패는 **둘 다 조용하다**(에러·로그 0건).
//  (a) 인셋이 과하면 입력 아래에 빈 띠가 남는다(보기 나쁘지만 치명은 아님).
//  (b) 인셋이 부족하면 **키보드가 입력을 덮어 사용자가 자기가 쓴 글을 못 본다** — 2026-07-27 "채팅에서
//      보조바 숨김" 요구를 "타깃을 등록하지 않는다" 로 구현했다면 iOS 에서 정확히 이게 났다
//      (타깃 없음 → showing=false → 인셋 0 → 키보드가 컴포저 위에 겹침).
// 그래서 noBar 는 "등록은 유지 + 바 기여만 0" 이어야 하고, 그 불변식을 여기서 못 박는다.
import { keyAssistLayout, isPanelMode, keyAssistBarAllowed, isForeignKeyboard, BAR_KINDS, type KaLayoutInput } from '../src/components/keyboard/keyAssistInset';

const BAR = 47;
const KB = 300;

/** 기본 = 보조바 사용 + 타깃 포커스 + OS 키보드 떠 있음. 각 케이스는 필요한 필드만 덮어쓴다. */
const base = (over: Partial<KaLayoutInput> = {}): KaLayoutInput => ({
  enabled: true,
  suppressed: false,
  hasTarget: true,
  noBar: false,
  focused: true,
  kbMode: 'os',
  kbSwitching: false,
  keyboardVisible: true,
  keyboardHeight: KB,
  barH: BAR,
  imeOverlay: false,
  windowResizes: true,   // Android 루트(adjustResize)
  ios: false,
  hardwareKeyboard: false,
  ...over,
});

const android = (over: Partial<KaLayoutInput> = {}) => base({ windowResizes: true, ios: false, ...over });
// iOS(루트든 Modal 든) = 창이 키보드에 리사이즈되지 않는다.
const ios = (over: Partial<KaLayoutInput> = {}) => base({ windowResizes: false, ios: true, ...over });

describe('isPanelMode', () => {
  it("'panel'·'stt' 만 패널 모드(os 는 아니다)", () => {
    expect(isPanelMode('panel')).toBe(true);
    expect(isPanelMode('stt')).toBe(true);
    expect(isPanelMode('os')).toBe(false);
  });
});

describe('바를 그리는 평범한 타깃(터미널/IDE/일반 인풋) — 기존 동작 불변', () => {
  it('Android + OS 키보드: 창이 줄어드니 바 높이만', () => {
    expect(keyAssistLayout(android()).inset).toBe(BAR);
  });

  it('iOS + OS 키보드: 창이 안 줄어드니 바 + 키보드', () => {
    expect(keyAssistLayout(ios()).inset).toBe(BAR + KB);
  });

  it('특수키/STT 패널: 양 플랫폼 모두 바 + 패널(=키보드 높이), 겹침 보정 없음', () => {
    for (const kbMode of ['panel', 'stt'] as const) {
      expect(keyAssistLayout(android({ kbMode, keyboardVisible: false })).inset).toBe(BAR + KB);
      expect(keyAssistLayout(ios({ kbMode, keyboardVisible: false })).inset).toBe(BAR + KB);
    }
  });

  it('iOS 전환 갭(kbSwitching)은 패널 필러를 유지한다(검정 번쩍임 방지)', () => {
    expect(keyAssistLayout(ios({ kbMode: 'os', kbSwitching: true, keyboardVisible: false })).inset)
      .toBe(BAR + KB);
    // Android 는 창 자체가 리사이즈되므로 필러를 그리지 않는다(역방향 깜빡임).
    expect(keyAssistLayout(android({ kbMode: 'os', kbSwitching: true, keyboardVisible: false })).inset).toBe(BAR);
  });

  it('Android adjustNothing 세션(imeOverlay)에서는 겹침을 보정한다', () => {
    expect(keyAssistLayout(android({ imeOverlay: true })).inset).toBe(BAR + KB);
  });

  it('오버레이가 안 보이는 조건들은 전부 0(설정 OFF·suppress·타깃 없음·비포커스)', () => {
    // 설정 OFF 는 바만 끈다 — iOS 키보드 겹침은 여전히 비켜선다(아래 별도 케이스).
    expect(keyAssistLayout(ios({ enabled: false })).showing).toBe(false);
    expect(keyAssistLayout(ios({ suppressed: true })).inset).toBe(0);
    expect(keyAssistLayout(ios({ hasTarget: false })).inset).toBe(0);
    expect(keyAssistLayout(ios({ focused: false })).inset).toBe(0);
  });
});

describe('noBar 타깃(채팅 컴포저) — 바 기여 0, iOS 키보드 겹침은 유지', () => {
  it('Android: 창이 줄어드니 인셋 0(바가 없다)', () => {
    const r = keyAssistLayout(android({ noBar: true }));
    expect(r.showing).toBe(true);          // 타깃 등록은 살아 있다
    expect(r.overlayH).toBe(0);
    expect(r.inset).toBe(0);
  });

  it('★ iOS: 인셋 = 키보드 높이(바 없음). 여기서 0 이 나오면 키보드가 컴포저를 덮는다', () => {
    const r = keyAssistLayout(ios({ noBar: true }));
    expect(r.overlayH).toBe(0);
    expect(r.inset).toBe(KB);
  });

  it('iOS + 키보드 내려감: 0(겹칠 것이 없다)', () => {
    expect(keyAssistLayout(ios({ noBar: true, keyboardVisible: false })).inset).toBe(0);
  });

  it('방어: 패널 모드 값이 남아 있어도 noBar 면 패널 높이를 세지 않는다', () => {
    for (const kbMode of ['panel', 'stt'] as const) {
      expect(keyAssistLayout(android({ noBar: true, kbMode, keyboardVisible: false })).overlayH).toBe(0);
      expect(keyAssistLayout(android({ noBar: true, kbMode, keyboardVisible: false })).inset).toBe(0);
      // iOS 는 키보드가 떠 있으면 그 겹침만 남는다.
      expect(keyAssistLayout(ios({ noBar: true, kbMode })).inset).toBe(KB);
    }
    expect(keyAssistLayout(ios({ noBar: true, kbSwitching: true })).inset).toBe(KB);
  });

  it('전 조합 대조 — noBar 는 "평범한 타깃의 인셋에서 바/패널 기여만 뺀 값"이다', () => {
    let checked = 0;
    for (const ios2 of [false, true]) {
      for (const kbMode of ['os', 'panel', 'stt'] as const) {
        for (const kbSwitching of [false, true]) {
          for (const keyboardVisible of [false, true]) {
            for (const imeOverlay of [false, true]) {
              const common = { kbMode, kbSwitching, keyboardVisible, imeOverlay, ios: ios2, windowResizes: !ios2 };
              const withBar = keyAssistLayout(base({ ...common, noBar: false }));
              const noBar = keyAssistLayout(base({ ...common, noBar: true }));
              expect(noBar.showing).toBe(withBar.showing);   // 등록 상태는 같다(핵심 불변식)
              expect(noBar.overlayH).toBe(0);
              // 바가 없으면 패널도 없다 → 겹침(kbOverlap)만 남는다.
              const overlap = keyboardVisible && (ios2 || imeOverlay) ? KB : 0;
              expect(noBar.inset).toBe(overlap);
              expect(noBar.inset).toBeLessThanOrEqual(withBar.inset === 0 ? Infinity : Math.max(withBar.inset, overlap));
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBe(2 * 3 * 2 * 2 * 2);
  });
});

describe('물리(외장) 키보드', () => {
  // 2026-09-06 사용자 확정: 실물 키보드로 치는 동안 보조바·특수키 패널은 화면만 잡아먹고,
  //  소프트 키보드가 없는데 keyboardHeight 만큼 비워 두면 화면 아래가 검은 띠가 된다(iPad 실기).
  it('보조바도 키보드 여백도 남기지 않는다 — inset 0', () => {
    const r = keyAssistLayout(base({ hardwareKeyboard: true }));
    expect(r).toEqual({ showing: false, panelMode: false, overlayH: 0, inset: 0 });
  });

  it('★ iOS(창 미리사이즈)에서도 0 — showing 만 끄면 kbOverlap 이 남아 빈 띠가 그대로다', () => {
    // 물리 키보드가 붙은 iPad 는 소프트 키보드 대신 짧은 단축키 띠(≈55~70pt)만 올린다 — 그 높이만큼 비우면 빈 띠다.
    const r = keyAssistLayout(base({ hardwareKeyboard: true, ios: true, windowResizes: false, keyboardHeight: 60 }));
    expect(r.inset).toBe(0);
    expect(r.showing).toBe(false);
  });

  it('패널이 펼쳐져 있던 중에 연결돼도 접는다', () => {
    const r = keyAssistLayout(base({ hardwareKeyboard: true, kbMode: 'panel', keyboardVisible: false }));
    expect(r).toEqual({ showing: false, panelMode: false, overlayH: 0, inset: 0 });
  });

  it('연결이 아니면 종전 동작 그대로 — 회귀 금지', () => {
    const off = keyAssistLayout(base({ ios: true, windowResizes: false }));
    expect(off.showing).toBe(true);
    expect(off.inset).toBe(BAR + KB);
  });
});

describe('바를 끈 상태에서도 키보드가 입력을 덮지 않는다(2026-09-30 iOS 실기)', () => {
  it('설정 OFF + iOS + 소프트 키보드 = 키보드 높이만큼 비켜선다', () => {
    expect(keyAssistLayout(ios({ enabled: false })).inset).toBe(KB);
    expect(keyAssistLayout(ios({ enabled: false, noBar: true })).inset).toBe(KB);
  });
  it('설정 OFF + Android(창이 줄어든다) = 0', () => {
    expect(keyAssistLayout(android({ enabled: false })).inset).toBe(0);
  });
  it('설정 OFF 여도 포커스·타깃이 없으면 0, suppress 면 0', () => {
    expect(keyAssistLayout(ios({ enabled: false, focused: false })).inset).toBe(0);
    expect(keyAssistLayout(ios({ enabled: false, hasTarget: false })).inset).toBe(0);
    expect(keyAssistLayout(ios({ enabled: false, suppressed: true })).inset).toBe(0);
  });
  it('물리 키보드로 판정돼도 소프트 키보드가 실제로 떠 있으면 겹침만 비켜선다(바는 안 그림)', () => {
    const r = keyAssistLayout(ios({ hardwareKeyboard: true }));
    expect(r.showing).toBe(false); expect(r.inset).toBe(KB);
    expect(keyAssistLayout(ios({ hardwareKeyboard: true, keyboardVisible: false })).inset).toBe(0);
  });
});

// ── 바 노출 판정(이슈 #10: 보조 키 패널이 Tasks 검색창 등 아무 입력에서나 뜨던 문제) ──
describe('보조 키 패널은 터미널(TUI)·코드 편집기에서만 뜬다', () => {
  const gate = (over: Partial<Parameters<typeof keyAssistBarAllowed>[0]> = {}) =>
    keyAssistBarAllowed({ kind: 'terminal', noBar: false, foreignKeyboard: false, ...over });

  it('터미널·편집기는 그리고, 일반 텍스트 입력은 안 그린다', () => {
    expect(gate({ kind: 'terminal' })).toBe(true);
    expect(gate({ kind: 'editor' })).toBe(true);
    expect(gate({ kind: 'text' })).toBe(false);
    expect([...BAR_KINDS].sort()).toEqual(['editor', 'terminal']);
  });

  it('타깃이 없거나 타깃이 바를 사양(채팅 컴포저)하면 안 그린다', () => {
    expect(gate({ kind: null })).toBe(false);
    expect(gate({ noBar: true })).toBe(false);
    expect(gate({ kind: 'editor', noBar: true })).toBe(false);
  });

  it('터미널 타깃이 남아 있어도 키보드가 남의 입력 것이면 안 그린다(Tasks 검색창 재현)', () => {
    // 터미널을 쓰다 Tasks 로 넘어가 검색창(평범한 RN TextInput)을 눌렀다 — 타깃은 여전히 터미널이다.
    const foreignKeyboard = isForeignKeyboard({ kind: 'terminal', rnInputFocused: true, rnInputIsLeftover: false });
    expect(foreignKeyboard).toBe(true);
    expect(gate({ kind: 'terminal', foreignKeyboard })).toBe(false);
    expect(gate({ kind: 'editor', foreignKeyboard: true })).toBe(false);
  });
});

describe('isForeignKeyboard — 떠 있는 키보드의 주인이 타깃인가', () => {
  it('웹뷰 타깃(터미널/편집기)이 포커스를 쥐고 있으면(RN 입력 없음) 타깃의 키보드다', () => {
    expect(isForeignKeyboard({ kind: 'terminal', rnInputFocused: false, rnInputIsLeftover: false })).toBe(false);
    expect(isForeignKeyboard({ kind: 'editor', rnInputFocused: false, rnInputIsLeftover: false })).toBe(false);
  });
  it('RN TextInput 이 포커스를 쥐고 있으면 남의 키보드다', () => {
    expect(isForeignKeyboard({ kind: 'terminal', rnInputFocused: true, rnInputIsLeftover: false })).toBe(true);
    expect(isForeignKeyboard({ kind: 'editor', rnInputFocused: true, rnInputIsLeftover: false })).toBe(true);
  });
  it('타깃이 포커스될 때 이미 잡혀 있던 RN 입력(blur 지연 잔상)은 남의 것으로 치지 않는다 — 터미널에서 바가 사라지면 안 된다', () => {
    expect(isForeignKeyboard({ kind: 'terminal', rnInputFocused: true, rnInputIsLeftover: true })).toBe(false);
  });
  it("타깃 없음·'text' 타깃은 판정 대상이 아니다(text 는 자기 자신이 RN 입력)", () => {
    expect(isForeignKeyboard({ kind: null, rnInputFocused: true, rnInputIsLeftover: false })).toBe(false);
    expect(isForeignKeyboard({ kind: 'text', rnInputFocused: true, rnInputIsLeftover: false })).toBe(false);
  });
});

describe('바를 안 그리게 된 입력에서도 iOS 키보드 겹침 여백은 남는다(입력이 키보드에 덮이면 안 된다)', () => {
  // 게이트 결과는 keyAssistLayout 의 noBar 로 들어간다 — 일반 텍스트 입력·남의 키보드 모두 같은 경로.
  for (const [name, allowed] of [
    ['일반 텍스트 입력', keyAssistBarAllowed({ kind: 'text', noBar: false, foreignKeyboard: false })],
    ['남의 키보드', keyAssistBarAllowed({ kind: 'terminal', noBar: false, foreignKeyboard: true })],
  ] as const) {
    it(`${name}: 바 높이 0, iOS 는 키보드 높이만큼·Android 는 0`, () => {
      expect(allowed).toBe(false);
      const i = keyAssistLayout(ios({ noBar: !allowed }));
      expect(i.overlayH).toBe(0); expect(i.inset).toBe(KB);
      expect(keyAssistLayout(android({ noBar: !allowed })).inset).toBe(0);
    });
  }
});
