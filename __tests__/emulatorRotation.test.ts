/**
 * 모바일 화면 pane 의 **회전 규칙**. PC(emulator-view.js)와 한 벌이어야 한다 —
 *  한쪽만 고치면 "PC 에서는 도는데 폰에서는 안 도는" 버튼이 된다.
 *
 * 아래 숫자는 지어낸 값이 아니라 **PC 에서 실측한 값**이다(2026-08-06):
 *  Pixel 6 에뮬레이터(1080x2400)를 눕혀 놓고 화면의 크롬 아이콘을 눌렀을 때, 세로로 보던 시절의
 *  같은 아이콘 좌표(0.614, 0.821)가 그대로 나와야 한다.
 */
import { rotationFor, screenRatio } from '../src/workspace/EmulatorBody';

describe('회전 각도 — 보이는 프레임이 원하는 방향과 다르면 90도', () => {
  it('아직 아무것도 모르면 안 돌린다', () => {
    expect(rotationFor(null, null)).toBe(0);
    expect(rotationFor(null, false)).toBe(0);
    expect(rotationFor(true, null)).toBe(0);
  });

  it('세로 기기를 세로로 보는 중 = 0도', () => {
    expect(rotationFor(false, false)).toBe(0);
  });

  it('★ 눕히기를 요청했는데 프레임이 세로 그대로 = 우리가 90도 돌린다(iOS 는 늘 이 경우 · 안드로이드는 런처처럼 거부하는 화면)', () => {
    expect(rotationFor(true, false)).toBe(90);
  });

  it('★ 기기가 실제로 누웠다(프레임이 가로) = 우리가 돌릴 게 없다', () => {
    expect(rotationFor(true, true)).toBe(0);
  });

  it('가로 기기를 세로로 돌려 달라고 했으면 역시 90도', () => {
    expect(rotationFor(false, true)).toBe(90);
  });
});

describe('좌표 — 돌려 그리면 좌표도 같은 만큼 되돌린다', () => {
  //  액자 400x800 안에 세로 프레임(0.45)을 contain 으로 넣은 상태.
  const box = { w: 400, h: 800 };
  const AR = 1080 / 2400;   // 0.45

  it('안 돌렸을 때는 여백만 뺀다', () => {
    //  액자 비율 0.5 > 0.45 → 폭이 줄어 360, 좌우 여백 20 씩.
    const r = screenRatio(20, 0, box, AR, 0)!;
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.y).toBeCloseTo(0, 5);
    const mid = screenRatio(200, 400, box, AR, 0)!;
    expect(mid.x).toBeCloseTo(0.5, 5);
    expect(mid.y).toBeCloseTo(0.5, 5);
  });

  it('여백(기기 밖)을 누르면 null — 조용히 엉뚱한 곳을 누르지 않는다', () => {
    expect(screenRatio(2, 400, box, AR, 0)).toBeNull();
  });

  it('★ 돌린 상태에서도 화면 한복판은 기기 한복판이다(여백 계산에 보이는 비율을 써야 성립)', () => {
    const r = screenRatio(200, 400, box, AR, 90)!;
    expect(r.x).toBeCloseTo(0.5, 5);
    expect(r.y).toBeCloseTo(0.5, 5);
  });

  it('★ PC 실측 재현 — 눕혀 놓고 누른 크롬 아이콘이 세로 시절과 같은 좌표로 간다', () => {
    //  PC 실측 당시 액자 2056x1122, 클릭 (367.14, 666.51) → (0.61404, 0.82143)
    const r = screenRatio(367.14, 666.51, { w: 2056, h: 1122 }, AR, 90)!;
    expect(r.x).toBeCloseTo(0.61404, 4);
    expect(r.y).toBeCloseTo(0.82143, 4);
  });

  it('돌린 상태에서 위/아래 여백을 누르면 null', () => {
    //  액자 2056x1122 · 보이는 비율 1/0.45=2.22 → 높이 925, 위아래 여백 98.5 씩.
    expect(screenRatio(1000, 20, { w: 2056, h: 1122 }, AR, 90)).toBeNull();
  });
});
