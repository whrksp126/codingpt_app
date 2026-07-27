// keyAssistInset.test.ts — 보조바/패널 인셋 산수의 조합표(플랫폼 × noBar × 패널모드 × 키보드).
//
// 왜 이 테스트가 필요한가: 이 계산의 두 실패는 **둘 다 조용하다**(에러·로그 0건).
//  (a) 인셋이 과하면 입력 아래에 빈 띠가 남는다(보기 나쁘지만 치명은 아님).
//  (b) 인셋이 부족하면 **키보드가 입력을 덮어 사용자가 자기가 쓴 글을 못 본다** — 2026-07-27 "채팅에서
//      보조바 숨김" 요구를 "타깃을 등록하지 않는다" 로 구현했다면 iOS 에서 정확히 이게 났다
//      (타깃 없음 → showing=false → 인셋 0 → 키보드가 컴포저 위에 겹침).
// 그래서 noBar 는 "등록은 유지 + 바 기여만 0" 이어야 하고, 그 불변식을 여기서 못 박는다.
import { keyAssistLayout, isPanelMode, type KaLayoutInput } from '../src/components/keyboard/keyAssistInset';

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
    expect(keyAssistLayout(ios({ enabled: false })).inset).toBe(0);
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
