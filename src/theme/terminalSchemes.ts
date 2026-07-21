// 터미널 스타일(컬러 스킴) — 스타일 "계열" × 앱 테마(다크/라이트) 변형 자동 선택.
// PC(theme.js TERM_STYLES)와 목록/값 통일 — 값 키는 백엔드 화이트리스트와도 일치(계정 동기화).
// claude/codex/vim 등 모든 TUI 는 ANSI 색 번호로만 그리므로 이 팔레트가 곧 TUI 스타일이 된다.

export type TermScheme = 'auto' | 'ghostty' | 'one' | 'dracula' | 'solarized';

export const TERM_SCHEME_OPTIONS: { v: TermScheme; label: string }[] = [
  { v: 'auto', label: 'CodingPT (권장)' },
  { v: 'ghostty', label: 'Ghostty (cmux)' },
  { v: 'one', label: 'One' },
  { v: 'dracula', label: 'Dracula' },
  { v: 'solarized', label: 'Solarized' },
];

export type TermPalette = Record<string, string>;

const AUTO_DARK: TermPalette = {
  // CodingPT 다크 — 배경=앱 배경, 액센트 민트, 16색 전부 가독 튜닝(PC theme.js 와 동일 값)
  background: '#0A0D14', foreground: '#E2E8F0', cursor: '#34D399', cursorAccent: '#0A0D14',
  selectionBackground: '#264F78',
  black: '#1B2230', red: '#F87171', green: '#34D399', yellow: '#FBBF24',
  blue: '#60A5FA', magenta: '#C084FC', cyan: '#22D3EE', white: '#CBD5E1',
  brightBlack: '#475569', brightRed: '#FCA5A5', brightGreen: '#6EE7B7', brightYellow: '#FCD34D',
  brightBlue: '#93C5FD', brightMagenta: '#D8B4FE', brightCyan: '#67E8F9', brightWhite: '#F8FAFC',
};
const AUTO_LIGHT: TermPalette = {
  // CodingPT 라이트 — 배경=앱 라이트 배경, 밝은 배경 가독 팔레트(PC theme.js 와 동일 값)
  background: '#F2F4F8', foreground: '#1E293B', cursor: '#0B8F63', cursorAccent: '#FFFFFF',
  selectionBackground: '#BCD3F5',
  black: '#334155', red: '#DC2626', green: '#059669', yellow: '#B45309',
  blue: '#2563EB', magenta: '#9333EA', cyan: '#0891B2', white: '#CBD5E1',
  brightBlack: '#64748B', brightRed: '#EF4444', brightGreen: '#10B981', brightYellow: '#D97706',
  brightBlue: '#3B82F6', brightMagenta: '#A855F7', brightCyan: '#06B6D4', brightWhite: '#0F172A',
};

const FAMILIES: Record<TermScheme, { dark: TermPalette; light: TermPalette }> = {
  auto: { dark: AUTO_DARK, light: AUTO_LIGHT },
  ghostty: {
    // 다크 = Ghostty Default Style Dark(cmux 기본), 라이트 = Ghostty Builtin Light
    dark: {
      background: '#282C34', foreground: '#FFFFFF', cursor: '#FFFFFF', cursorAccent: '#353A44',
      selectionBackground: '#FFFFFF', selectionForeground: '#282C34',
      black: '#1D1F21', red: '#CC6566', green: '#B6BD68', yellow: '#F0C674',
      blue: '#82A2BE', magenta: '#B294BB', cyan: '#8ABEB7', white: '#C4C8C6',
      brightBlack: '#666666', brightRed: '#D54E53', brightGreen: '#B9CA4B', brightYellow: '#E7C547',
      brightBlue: '#7AA6DA', brightMagenta: '#C397D8', brightCyan: '#70C0B1', brightWhite: '#EAEAEA',
    },
    light: {
      background: '#FFFFFF', foreground: '#000000', cursor: '#000000', cursorAccent: '#FFFFFF',
      selectionBackground: '#B5D5FF', selectionForeground: '#000000',
      black: '#000000', red: '#BB0000', green: '#00BB00', yellow: '#BBBB00',
      blue: '#0000BB', magenta: '#BB00BB', cyan: '#00BBBB', white: '#BBBBBB',
      brightBlack: '#555555', brightRed: '#FF5555', brightGreen: '#2FD92F', brightYellow: '#BFBF15',
      brightBlue: '#5555FF', brightMagenta: '#FF55FF', brightCyan: '#22CCCC', brightWhite: '#FFFFFF',
    },
  },
  one: {
    dark: {
      background: '#282C34', foreground: '#ABB2BF', cursor: '#528BFF', cursorAccent: '#282C34',
      selectionBackground: '#3E4451',
      black: '#282C34', red: '#E06C75', green: '#98C379', yellow: '#E5C07B',
      blue: '#61AFEF', magenta: '#C678DD', cyan: '#56B6C2', white: '#ABB2BF',
      brightBlack: '#5C6370', brightRed: '#E06C75', brightGreen: '#98C379', brightYellow: '#E5C07B',
      brightBlue: '#61AFEF', brightMagenta: '#C678DD', brightCyan: '#56B6C2', brightWhite: '#FFFFFF',
    },
    light: {
      // One Light(Atom) — Ghostty 'Atom One Light' 팔레트
      background: '#F9F9F9', foreground: '#2A2C33', cursor: '#2A2C33', cursorAccent: '#FFFFFF',
      selectionBackground: '#EDEDED', selectionForeground: '#2A2C33',
      black: '#000000', red: '#DE3E35', green: '#3F953A', yellow: '#D2B67C',
      blue: '#2F5AF3', magenta: '#950095', cyan: '#3F953A', white: '#BBBBBB',
      brightBlack: '#000000', brightRed: '#DE3E35', brightGreen: '#3F953A', brightYellow: '#D2B67C',
      brightBlue: '#2F5AF3', brightMagenta: '#A00095', brightCyan: '#3F953A', brightWhite: '#FFFFFF',
    },
  },
  dracula: {
    dark: {
      background: '#282A36', foreground: '#F8F8F2', cursor: '#F8F8F2', cursorAccent: '#282A36',
      selectionBackground: '#44475A',
      black: '#21222C', red: '#FF5555', green: '#50FA7B', yellow: '#F1FA8C',
      blue: '#BD93F9', magenta: '#FF79C6', cyan: '#8BE9FD', white: '#F8F8F2',
      brightBlack: '#6272A4', brightRed: '#FF6E6E', brightGreen: '#69FF94', brightYellow: '#FFFFA5',
      brightBlue: '#D6ACFF', brightMagenta: '#FF92DF', brightCyan: '#A4FFFF', brightWhite: '#FFFFFF',
    },
    light: {
      // Alucard(Dracula 공식 라이트) — draculatheme.com/spec ANSI 매핑
      background: '#FFFBEB', foreground: '#1F1F1F', cursor: '#1F1F1F', cursorAccent: '#FFFBEB',
      selectionBackground: '#CFCFDE',
      black: '#FFFBEB', red: '#CB3A2A', green: '#14710A', yellow: '#846E15',
      blue: '#644AC9', magenta: '#A3144D', cyan: '#036A96', white: '#1F1F1F',
      brightBlack: '#6C664B', brightRed: '#D74C3D', brightGreen: '#198D0C', brightYellow: '#9E841A',
      brightBlue: '#7862D0', brightMagenta: '#BF185A', brightCyan: '#047FB4', brightWhite: '#2C2B31',
    },
  },
  solarized: {
    dark: {
      background: '#002B36', foreground: '#839496', cursor: '#839496', cursorAccent: '#002B36',
      selectionBackground: '#073642',
      black: '#073642', red: '#DC322F', green: '#859900', yellow: '#B58900',
      blue: '#268BD2', magenta: '#D33682', cyan: '#2AA198', white: '#EEE8D5',
      brightBlack: '#586E75', brightRed: '#CB4B16', brightGreen: '#586E75', brightYellow: '#657B83',
      brightBlue: '#839496', brightMagenta: '#6C71C4', brightCyan: '#93A1A1', brightWhite: '#FDF6E3',
    },
    light: {
      background: '#FDF6E3', foreground: '#657B83', cursor: '#657B83', cursorAccent: '#FDF6E3',
      selectionBackground: '#EEE8D5',
      black: '#073642', red: '#DC322F', green: '#859900', yellow: '#B58900',
      blue: '#268BD2', magenta: '#D33682', cyan: '#2AA198', white: '#EEE8D5',
      brightBlack: '#586E75', brightRed: '#CB4B16', brightGreen: '#93A1A1', brightYellow: '#839496',
      brightBlue: '#657B83', brightMagenta: '#6C71C4', brightCyan: '#586E75', brightWhite: '#FDF6E3',
    },
  },
};


/** xterm 최소 대비 자동 보정 값 — 라이트는 다크용 프롬프트(p10k 등)가 흔해 더 강하게. */
export function termMinContrast(dark: boolean): number {
  return dark ? 3 : 4.5;
}
/** 스타일 계열의 특정 변형 팔레트(미리보기용). */
export function termStylePalette(style: TermScheme, variant: 'dark' | 'light'): TermPalette {
  const fam = FAMILIES[style] || FAMILIES.auto;
  return fam[variant] || fam.dark;
}

/** 현재 xterm 팔레트 — 선택된 스타일 계열의 현재 테마(다크/라이트) 변형. */
export function termPalette(scheme: TermScheme, dark: boolean): TermPalette {
  return termStylePalette(scheme, dark ? 'dark' : 'light');
}
