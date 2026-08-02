import { barHeight, pushLevel, SPECTRUM_BARS, SPECTRUM_DECAY } from '../src/workspace/chat/MicSpectrum';

// 수음 스펙트럼의 산술만 검증한다(그리기는 reanimated 담당).
//  지키려는 성질: ① 길이가 변하지 않는다(막대 수 = 화면 폭 계약) ② 값이 항상 유효 범위다
//  ③ 조용하면 실제로 가라앉는다 — "마이크가 죽었는데 파형만 춤춘다"가 이 기능의 유일한 거짓말이다.

describe('MicSpectrum 파형', () => {
  it('한 칸 밀어도 막대 수는 그대로다', () => {
    let bars = new Array(SPECTRUM_BARS).fill(0);
    for (let i = 0; i < 50; i++) bars = pushLevel(bars, 0.4);
    expect(bars).toHaveLength(SPECTRUM_BARS);
  });

  it('새 샘플은 오른쪽 끝으로 들어가고 가장 왼쪽이 밀려난다', () => {
    const bars = pushLevel([0.1, 0.2, 0.3], 0.9);
    expect(bars).toEqual([0.2, 0.3, 0.9]);
  });

  it('범위 밖 레벨은 0~1 로 잘린다(네이티브 스케일이 튀어도 UI 는 안 깨진다)', () => {
    expect(pushLevel([0, 0], 5)[1]).toBe(1);
    expect(pushLevel([0, 0], -3)[1]).toBe(0);
  });

  it('높이는 무음일 때 최소, 최대 입력일 때 최대이며 단조 증가한다', () => {
    const h0 = barHeight(0);
    const h5 = barHeight(0.5);
    const h1 = barHeight(1);
    expect(h0).toBeLessThan(h5);
    expect(h5).toBeLessThan(h1);
    expect(h0).toBeGreaterThan(0);
  });

  it('작은 레벨도 눈에 보이게 커진다(선형이면 거의 안 움직인다 — 감마의 존재 이유)', () => {
    const span = barHeight(1) - barHeight(0);
    // 레벨 0.1 에서 이미 전체 폭의 25% 이상 올라와야 "소리가 들어온다"가 보인다.
    expect(barHeight(0.1) - barHeight(0)).toBeGreaterThan(span * 0.25);
  });

  it('샘플이 끊기면 감쇠로 0 에 수렴한다(마이크가 죽으면 파형도 죽는다)', () => {
    let level = 1;
    for (let i = 0; i < 30; i++) level *= SPECTRUM_DECAY;
    expect(level).toBeLessThan(0.01);
  });
});
