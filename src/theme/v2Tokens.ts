import { Platform } from 'react-native';

/**
 * CodingPT V2 디자인 토큰 — 무채색 중립(R=G=B) 단일 소스 (2026-09-30 디자인 리프레시).
 * PC(styles.css :root / html[data-theme="light"])와 같은 표를 쓴다 — 값 정본은 설계 문서 §0.1.
 * 규율: 켜짐·선택은 명암(selected/pressed 워시)으로만. 상태색(success/warn/error/info)은 신호 전용.
 *  accent·cta 는 과거 이름의 별칭 — 둘 다 success 와 같은 값(새 코드는 success 를 쓸 것).
 *
 * inline style 에선 이 객체를 렌더 시점에 읽는다(StyleSheet.create 에 굳히기 금지).
 */
export const v2ColorsDark = {
  // 서피스
  base: '#161616',       // 콘텐츠 배경(채팅·터미널 주변·활성 탭)
  surface: '#181818',    // 크롬(헤더·사이드바·탭바)
  elevated: '#262626',   // 카드·입력·시트·메뉴
  elevated2: '#303030',  // 2단: 키캡·눌린 칩·올라온 면 위 컨트롤·카운트 배지
  hover: 'rgba(255,255,255,0.06)',    // 작은 타깃 워시
  selected: 'rgba(255,255,255,0.08)', // 선택된 행·탭·옵션
  pressed: 'rgba(255,255,255,0.12)',  // 눌림(행 워시·ripple)

  // 보더
  border: 'rgba(255,255,255,0.07)',         // 헤어라인
  borderControl: 'rgba(255,255,255,0.12)',  // 버튼·입력
  borderStrong: 'rgba(255,255,255,0.20)',   // 포커스된 입력·드래그 중

  // 텍스트
  text: '#E6E6E6',
  text2: '#B0B0B0',
  text3: '#8C8C8C',
  textDim: '#6B6B6B',

  // 상태 신호
  success: '#30D158',
  accent: '#30D158',  // = success (별칭)
  cta: '#30D158',     // = success (별칭)
  info: '#6FA8F5',
  error: '#FF453A',
  warn: '#FF9F0A',

  // 오버레이
  scrim: 'rgba(0,0,0,0.45)',  // 모든 백드롭 단일값
  focus: 'rgba(255,255,255,0.40)',
};

// 라이트 팔레트 — PC html[data-theme="light"] 와 같은 값(base 만 PC 와 동일 #FFFFFF).
export const v2ColorsLight: typeof v2ColorsDark = {
  base: '#FFFFFF',
  surface: '#F5F5F5',
  elevated: '#FFFFFF',
  elevated2: '#EDEDED',
  hover: 'rgba(0,0,0,0.05)',
  selected: 'rgba(0,0,0,0.07)',
  pressed: 'rgba(0,0,0,0.10)',

  border: 'rgba(0,0,0,0.08)',
  borderControl: 'rgba(0,0,0,0.13)',
  borderStrong: 'rgba(0,0,0,0.20)',

  text: '#1A1A1A',
  text2: '#4A4A4A',
  text3: '#737373',
  textDim: '#8F8F8F',

  success: '#34C759',
  accent: '#34C759',
  cta: '#34C759',
  info: '#2F6FD6',
  error: '#FF3B30',
  warn: '#FF9500',

  scrim: 'rgba(0,0,0,0.30)',
  focus: 'rgba(0,0,0,0.35)',
};

/** 상태색 배경 틴트(14%) — `tint(C.warn)` 처럼 렌더 시점에 쓴다. hex(#RRGGBB) 전용. */
export function tint(hex: string, alpha = 0.14): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}

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

/** 현재 스킴 조회 함수형(렌더 시점) — TextInput keyboardAppearance 등. */
export function currentScheme(): 'light' | 'dark' { return v2Scheme; }

/** 테마 전환 — ThemeProvider 렌더에서 호출(멱등). 자식 렌더 전에 팔레트가 맞춰진다. */
export function applyV2Palette(scheme: 'light' | 'dark') {
  v2Scheme = scheme;
  Object.assign(v2Colors, scheme === 'light' ? v2ColorsLight : v2ColorsDark);
  Object.assign(v2Syntax, scheme === 'light' ? v2SyntaxLight : v2SyntaxDark);
}

// 반경 — xs 4(kbd·작은 배지) · sm 6(작은 버튼·칩) · md 8(행·버튼·입력) · lg 10(카드·팝오버)
//  · xl 14(다이얼로그) · sheet 16(바텀시트 윗모서리) · composer 20 · pill 999.
export const v2Radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  sheet: 16,
  composer: 20,
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

// 타이포 — 기본 = 시스템 글꼴(iOS SF / Android Roboto; fontFamily 미지정 = undefined).
// sans 는 인터페이스 글꼴 설정(계정 동기화)에 따라 applyUiFontFamily 가 제자리 교체한다 —
// 소비처는 렌더 시점에 v2.font.sans 를 읽을 것(StyleSheet.create 에 굳히기 금지).
// 크기는 아래 토큰만 쓴다: 행 제목 body 15/500 · 메타 small 13 · 헤더 제목 h2 16/600. 굵기는 400/500/600.
export const v2Font = {
  sans: undefined as string | undefined,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  size: {
    caption: 12,
    small: 13,
    label: 14,
    body: 15,
    h2: 16,
    h1: 17,
    display: 22,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
  },
  letterSpacing: 0,
};

/** 인터페이스 글꼴 전환 — ThemeProvider/App 렌더에서 호출(멱등), key 리마운트로 전 소비처 반영. */
export function applyUiFontFamily(family: string | undefined) {
  v2Font.sans = family;
}

export const v2 = {
  colors: v2Colors,
  syntax: v2Syntax,
  radius: v2Radius,
  space: v2Space,
  font: v2Font,
};

export default v2;
