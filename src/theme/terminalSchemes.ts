// 터미널 스타일(컬러 스킴) — 스타일 "계열" × 앱 테마(다크/라이트) 변형 자동 선택.
// PC(theme.js TERM_STYLES)와 목록/값 통일 — 값 키는 백엔드 화이트리스트와도 일치(계정 동기화).
// claude/codex/vim 등 모든 TUI 는 ANSI 색 번호로만 그리므로 이 팔레트가 곧 TUI 스타일이 된다.
//
// ★ 2026-08-15 전면 교체(사용자 확정): 서드파티 이식(Ghostty/One/Dracula/Solarized)을 버리고
//   CodingPT 디자인 언어로 직접 설계한 4종(CodingPT·미드나이트·모노·페이퍼)으로 통일.
//   값 키(auto/ghostty/one/dracula)는 **동기화 계약**(백엔드 APPEARANCE_KEYS 화이트리스트 +
//   기존 저장값)이라 그대로 두고 표시 이름/팔레트만 교체했다 — 키를 바꾸면 back 배포와
//   락스텝이 되고 구버전 클라이언트 동기화가 깨진다. 'solarized' 저장값은 페이퍼로 이관.
//   공통 규율: 커서=글자색(액센트 금지) · selectionInactiveBackground 필수 · 다크/라이트 한 쌍.

export type TermScheme = 'auto' | 'ghostty' | 'one' | 'dracula';

export const TERM_SCHEME_OPTIONS: { v: TermScheme; label: string }[] = [
  { v: 'auto', label: 'CodingPT (권장)' },
  { v: 'ghostty', label: '미드나이트' },
  { v: 'one', label: '모노' },
  { v: 'dracula', label: '페이퍼' },
];

/** 저장값 정규화 — 은퇴한 'solarized'(따뜻한 크림 톤)는 가장 가까운 페이퍼로 이관. */
export function normalizeTermScheme(v: string | null | undefined): TermScheme {
  if (v === 'solarized') return 'dracula';
  if (v === 'auto' || v === 'ghostty' || v === 'one' || v === 'dracula') return v;
  return 'auto';
}

export type TermPalette = Record<string, string>;

const AUTO_DARK: TermPalette = {
  // CodingPT 다크 — 배경=앱 배경, 16색 전부 가독 튜닝(PC theme.js 와 동일 값)
  //  ★ 커서=글자색(2026-08-15). 액센트는 상태 신호 전용이라 늘 깜빡이는 커서에 쓰지 않는다.
  //  ★ selectionInactiveBackground 없으면 포커스가 빠질 때 선택이 배경에 묻힌다.
  background: '#0A0D14', foreground: '#E2E8F0', cursor: '#E2E8F0', cursorAccent: '#0A0D14',
  selectionBackground: '#264F78', selectionInactiveBackground: '#264F78',
  black: '#1B2230', red: '#F87171', green: '#34D399', yellow: '#FBBF24',
  blue: '#60A5FA', magenta: '#C084FC', cyan: '#22D3EE', white: '#CBD5E1',
  brightBlack: '#475569', brightRed: '#FCA5A5', brightGreen: '#6EE7B7', brightYellow: '#FCD34D',
  brightBlue: '#93C5FD', brightMagenta: '#D8B4FE', brightCyan: '#67E8F9', brightWhite: '#F8FAFC',
};
const AUTO_LIGHT: TermPalette = {
  // CodingPT 라이트 — 배경=앱 라이트 배경, 밝은 배경 가독 팔레트(PC theme.js 와 동일 값)
  background: '#F2F4F8', foreground: '#1E293B', cursor: '#1E293B', cursorAccent: '#FFFFFF',
  selectionBackground: '#BCD3F5', selectionInactiveBackground: '#BCD3F5',
  black: '#334155', red: '#DC2626', green: '#059669', yellow: '#B45309',
  blue: '#2563EB', magenta: '#9333EA', cyan: '#0891B2', white: '#CBD5E1',
  brightBlack: '#64748B', brightRed: '#EF4444', brightGreen: '#10B981', brightYellow: '#D97706',
  brightBlue: '#3B82F6', brightMagenta: '#A855F7', brightCyan: '#06B6D4', brightWhite: '#0F172A',
};

const FAMILIES: Record<TermScheme, { dark: TermPalette; light: TermPalette }> = {
  auto: { dark: AUTO_DARK, light: AUTO_LIGHT },
  ghostty: {
    // 미드나이트 — CodingPT 보다 한 단계 깊은 한밤 톤. 배경을 거의 검정까지 내리고
    //  색은 전부 차가운 쪽(블루 틴트)으로 정렬 — OLED/야간 작업용 고대비.
    dark: {
      background: '#060810', foreground: '#DCE3EE', cursor: '#DCE3EE', cursorAccent: '#060810',
      selectionBackground: '#1E3A5F', selectionInactiveBackground: '#1E3A5F',
      black: '#111624', red: '#F26D6D', green: '#41CF8F', yellow: '#E8B94E',
      blue: '#5B9DFF', magenta: '#A98BF5', cyan: '#3EC5DE', white: '#C2CBD8',
      brightBlack: '#4E5A70', brightRed: '#FF9191', brightGreen: '#71E4AE', brightYellow: '#F4CE74',
      brightBlue: '#8CBAFF', brightMagenta: '#C7B0FA', brightCyan: '#6FD9EC', brightWhite: '#F4F7FB',
    },
    light: {
      // 라이트 변형 = 순백 배경 + 진한 잉크(고대비 쌍둥이)
      background: '#FFFFFF', foreground: '#111827', cursor: '#111827', cursorAccent: '#FFFFFF',
      selectionBackground: '#CBDFF7', selectionInactiveBackground: '#CBDFF7',
      black: '#1F2937', red: '#C81E1E', green: '#047857', yellow: '#A16207',
      blue: '#1D4ED8', magenta: '#7E22CE', cyan: '#0E7490', white: '#D1D5DB',
      brightBlack: '#4B5563', brightRed: '#DC2626', brightGreen: '#059669', brightYellow: '#B45309',
      brightBlue: '#2563EB', brightMagenta: '#9333EA', brightCyan: '#0891B2', brightWhite: '#111827',
    },
  },
  one: {
    // 모노 — 무채색 지향. "포인트 컬러는 신호 전용" 원칙의 터미널판: ANSI 색의 채도를 크게
    //  낮춰 화면 전체가 회색조로 가라앉되, diff/에러 판독에 필요한 색상 구분만 은은히 남긴다.
    dark: {
      background: '#0D0F13', foreground: '#D6DAE0', cursor: '#D6DAE0', cursorAccent: '#0D0F13',
      selectionBackground: '#39414F', selectionInactiveBackground: '#39414F',
      black: '#1A1E26', red: '#D99A94', green: '#9DC6AC', yellow: '#CFC09A',
      blue: '#9AB3CF', magenta: '#B8A8CC', cyan: '#98C2C8', white: '#B7BEC7',
      brightBlack: '#5A626E', brightRed: '#E8B4AF', brightGreen: '#B7D8C3', brightYellow: '#E0D3B0',
      brightBlue: '#B4C9E0', brightMagenta: '#CCBFDD', brightCyan: '#B0D4D9', brightWhite: '#EEF1F5',
    },
    light: {
      background: '#F6F7F9', foreground: '#252A31', cursor: '#252A31', cursorAccent: '#FFFFFF',
      selectionBackground: '#D5DBE3', selectionInactiveBackground: '#D5DBE3',
      black: '#3B424C', red: '#9C4F45', green: '#43705A', yellow: '#7D6A38',
      blue: '#4A6584', magenta: '#6F5C86', cyan: '#417983', white: '#C9CED5',
      brightBlack: '#6E7580', brightRed: '#B26055', brightGreen: '#52856C', brightYellow: '#94804A',
      brightBlue: '#5B7899', brightMagenta: '#836F9B', brightCyan: '#528D97', brightWhite: '#14181D',
    },
  },
  dracula: {
    // 페이퍼 — 따뜻한 종이 톤(구 Solarized 사용자의 이관처). 라이트=크림 종이,
    //  다크=따뜻한 차콜. 색도 전부 웜 쪽으로 정렬해 장시간 독서형 작업에 편하게.
    dark: {
      background: '#16120C', foreground: '#EAE3D4', cursor: '#EAE3D4', cursorAccent: '#16120C',
      selectionBackground: '#4A3E28', selectionInactiveBackground: '#4A3E28',
      black: '#262016', red: '#E07A5F', green: '#A3B368', yellow: '#DCA54C',
      blue: '#7E9CBF', magenta: '#C08FB3', cyan: '#82BCA9', white: '#D3CAB8',
      brightBlack: '#756B58', brightRed: '#EE9880', brightGreen: '#BBC989', brightYellow: '#E9BC6F',
      brightBlue: '#9FB7D4', brightMagenta: '#D2A9C7', brightCyan: '#9FD0C0', brightWhite: '#F8F3E7',
    },
    light: {
      background: '#FAF5EA', foreground: '#3E362A', cursor: '#3E362A', cursorAccent: '#FFFFFF',
      selectionBackground: '#E4D8BC', selectionInactiveBackground: '#E4D8BC',
      black: '#57503F', red: '#B54E3B', green: '#5F7D33', yellow: '#95712A',
      blue: '#41678F', magenta: '#95588C', cyan: '#3E8577', white: '#DCD3C0',
      brightBlack: '#7C725E', brightRed: '#C96047', brightGreen: '#6F9040', brightYellow: '#A98336',
      brightBlue: '#527AA3', brightMagenta: '#A96CA0', brightCyan: '#4E9788', brightWhite: '#2A251C',
    },
  },
};


/** xterm 최소 대비 자동 보정 값 — 라이트는 다크용 프롬프트(p10k 등)가 흔해 더 강하게. */
export function termMinContrast(dark: boolean): number {
  return dark ? 3 : 4.5;
}
/** 스타일 계열의 특정 변형 팔레트(미리보기용). */
export function termStylePalette(style: TermScheme | string, variant: 'dark' | 'light'): TermPalette {
  const fam = FAMILIES[normalizeTermScheme(style as string)];
  return fam[variant] || fam.dark;
}

/** 현재 xterm 팔레트 — 선택된 스타일 계열의 현재 테마(다크/라이트) 변형. */
export function termPalette(scheme: TermScheme | string, dark: boolean): TermPalette {
  return termStylePalette(scheme, dark ? 'dark' : 'light');
}

/** 256색 확장 팔레트 리맵(인덱스 66) — claude 등 chalk 계열은 COLORTERM=truecolor 가 없던
 *  환경에서 자기 선택색 hex(#264F78)를 256색으로 강등하는데, 그 결과가 인덱스 66(#5F8787
 *  세이지)이다(2026-08-15 capture-pane 실측 + 변환식 검산). 데몬이 새 세션엔 COLORTERM 을
 *  주입하지만 **이미 떠 있는 셸/TUI 는 env 를 다시 못 받으므로**, 이 인덱스를 스타일의
 *  선택색으로 되돌려 그린다. 66 을 본색으로 쓰는 TUI 는 사실상 없어 부작용 무시 가능. */
export const TERM_REMAP_ANSI_IDX = 66;
export function termExtendedAnsi(p: TermPalette): (string | undefined)[] {
  const ext: (string | undefined)[] = [];
  ext[TERM_REMAP_ANSI_IDX - 16] = p.selectionBackground;
  return ext;
}
