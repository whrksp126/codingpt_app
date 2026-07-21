import { Platform } from 'react-native';

/**
 * CodingPT V2 디자인 토큰 (modern dark dev-tool 언어).
 * Claude Design `tokens/v2.css` 를 RN으로 변수화한 단일 소스.
 * 앱 셸은 다크 우선(Cursor / Replit / Linear 톤). 형광 그린/골드는 chrome에서 제외,
 * 액센트 = 민트 #34D399 + 딥그린 #08875D + 블루.
 *
 * NativeWind 클래스(bg-v2-base 등)와 동일 값. inline/StyleSheet 에선 이 객체를 사용.
 */
export const v2ColorsDark = {
  // 다크 서피스 (앱 셸 기본)
  base: '#0A0D14',       // 앱 배경
  surface: '#0E1320',    // 패널, 내비
  elevated: '#11151F',   // 카드
  elevated2: '#1B1F2A',  // 상승 카드, 모달, 인풋
  hover: '#22304A',      // hover fill

  // 보더
  border: '#1C2230',         // 헤어라인
  borderControl: '#2A2F3A',  // 버튼, 인풋
  borderFocus: '#3B82F6',    // 포커스 링

  // 텍스트
  text: '#F8FAFC',     // primary
  text2: '#CBD5E1',    // secondary
  text3: '#94A3B8',    // tertiary
  textDim: '#64748B',  // faint / meta

  // 브랜드 액센트
  accent: '#34D399',        // 민트 — primary 액센트
  accentHover: '#2CC08A',
  cta: '#08875D',           // 딥그린 — CTA / success
  ctaHover: '#0A9E6D',
  info: '#60A5FA',
  infoStrong: '#3B82F6',
  error: '#F87171',
  warn: '#FBBF24',

  // 액센트 위 텍스트(민트 버튼 글씨)
  onAccent: '#06281C',

  // tint fills
  accentTint: 'rgba(52, 211, 153, 0.12)',
  accentTintStrong: 'rgba(52, 211, 153, 0.16)',
  infoTint: 'rgba(96, 165, 250, 0.14)',
};

// 라이트 팔레트 — PC(styles.css html[data-theme="light"])와 동일 값.
export const v2ColorsLight: typeof v2ColorsDark = {
  base: '#F2F4F8',
  surface: '#F8FAFC',
  elevated: '#FFFFFF',
  elevated2: '#E9EDF3',
  hover: '#DBE4F0',

  border: '#E2E7EF',
  borderControl: '#CBD4E0',
  borderFocus: '#3B82F6',

  text: '#0F172A',
  text2: '#334155',
  text3: '#64748B',
  textDim: '#8593A8',

  accent: '#0EA371',
  accentHover: '#0B8F63',
  cta: '#08875D',
  ctaHover: '#0A9E6D',
  info: '#2563EB',
  infoStrong: '#3B82F6',
  error: '#DC2626',
  warn: '#B45309',

  onAccent: '#FFFFFF',

  accentTint: 'rgba(14, 163, 113, 0.13)',
  accentTintStrong: 'rgba(14, 163, 113, 0.18)',
  infoTint: 'rgba(37, 99, 235, 0.12)',
};

// 실사용 토큰 — "제자리 교체(mutable)" 객체. 소비처(const C = v2.colors)가 객체 참조를
// 캡처해도 값은 applyV2Palette 가 바꾼다. 색을 StyleSheet.create 등 모듈 로드 시점에
// 굳히면 테마 전환이 안 먹으므로 금지(렌더 시점에 읽을 것).
export const v2Colors: { -readonly [K in keyof typeof v2ColorsDark]: string } = { ...v2ColorsDark };

// 코드 일러스트(MockCode)용 신택스 컬러
const v2SyntaxDark = {
  keyword: '#60A5FA',
  string: '#FB923C',
  comment: '#6B8A7A',
  default: '#E2E8F0',
};
const v2SyntaxLight: typeof v2SyntaxDark = {
  keyword: '#2563EB',
  string: '#C2410C',
  comment: '#6B7F72',
  default: '#1E293B',
};
export const v2Syntax: { -readonly [K in keyof typeof v2SyntaxDark]: string } = { ...v2SyntaxDark };

/** 현재 적용된 스킴 — 렌더 시점 조회용(useTheme 훅을 못 쓰는 얕은 헬퍼에서). */
export let v2Scheme: 'light' | 'dark' = 'dark';

/** 테마 전환 — ThemeProvider 렌더에서 호출(멱등). 자식 렌더 전에 팔레트가 맞춰진다. */
export function applyV2Palette(scheme: 'light' | 'dark') {
  v2Scheme = scheme;
  Object.assign(v2Colors, scheme === 'light' ? v2ColorsLight : v2ColorsDark);
  Object.assign(v2Syntax, scheme === 'light' ? v2SyntaxLight : v2SyntaxDark);
}

// 반경 (tight — pill 버튼 없음)
export const v2Radius = {
  sm: 6,
  md: 10,
  lg: 12,
  pill: 999,
} as const;

// 4px 그리드 스페이싱
export const v2Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// 타이포 (Pretendard, tight rhythm: line-height 1.5, letter-spacing -0.02em)
export const v2Font = {
  sans: 'PretendardVariable',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  size: {
    display: 22,
    h1: 18,
    h2: 16,
    body: 15,
    label: 14,
    caption: 13,
    small: 12,
    tiny: 11,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  letterSpacing: -0.02,
} as const;

export const v2 = {
  colors: v2Colors,
  syntax: v2Syntax,
  radius: v2Radius,
  space: v2Space,
  font: v2Font,
};

export default v2;
