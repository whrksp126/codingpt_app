// 터미널 스타일(컬러 스킴) — 스타일 "계열" × 앱 테마(다크/라이트) 변형 자동 선택.
// PC(theme.js TERM_STYLES)와 목록/값 통일 — 값 키는 백엔드 화이트리스트와도 일치(계정 동기화).
// claude/codex/vim 등 모든 TUI 는 ANSI 색 번호로만 그리므로 이 팔레트가 곧 TUI 스타일이 된다.

export type TermScheme = 'auto' | 'ghostty' | 'one' | 'dracula' | 'solarized';

export const TERM_SCHEME_OPTIONS: { v: TermScheme; label: string }[] = [
  { v: 'auto', label: '기본' },
  { v: 'ghostty', label: 'Ghostty (cmux)' },
  { v: 'one', label: 'One' },
  { v: 'dracula', label: 'Dracula' },
  { v: 'solarized', label: 'Solarized' },
];

export type TermPalette = Record<string, string>;

const AUTO_DARK: TermPalette = {
  background: '#0A0D14', foreground: '#E2E8F0', cursor: '#34D399', selectionBackground: '#264F78',
  black: '#0A0D14', brightBlack: '#334155',
};
const AUTO_LIGHT: TermPalette = {
  background: '#F2F4F8', foreground: '#1E293B', cursor: '#0B8F63', cursorAccent: '#FFFFFF', selectionBackground: '#BCD3F5',
  black: '#383A42', red: '#CA1243', green: '#50A14F', yellow: '#C18401',
  blue: '#4078F2', magenta: '#A626A4', cyan: '#0184BC', white: '#A0A1A7',
  brightBlack: '#696C77', brightRed: '#CA1243', brightGreen: '#50A14F', brightYellow: '#C18401',
  brightBlue: '#4078F2', brightMagenta: '#A626A4', brightCyan: '#0184BC', brightWhite: '#101012',
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

/** 스타일 계열의 특정 변형 팔레트(미리보기용). */
export function termStylePalette(style: TermScheme, variant: 'dark' | 'light'): TermPalette {
  const fam = FAMILIES[style] || FAMILIES.auto;
  return fam[variant] || fam.dark;
}

/** 현재 xterm 팔레트 — 선택된 스타일 계열의 현재 테마(다크/라이트) 변형. */
export function termPalette(scheme: TermScheme, dark: boolean): TermPalette {
  return termStylePalette(scheme, dark ? 'dark' : 'light');
}
