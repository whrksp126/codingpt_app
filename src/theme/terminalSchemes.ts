// 터미널 컬러 스킴 프리셋 — 앱 테마와 별개로 "터미널만" 갈아입는 xterm 팔레트.
// PC(theme.js TERM_SCHEMES)와 목록/값 통일. claude/codex/vim 등 모든 TUI 는 ANSI 색 번호로만
// 그리므로 이 팔레트가 곧 TUI 스타일이 된다.

export type TermScheme = 'auto' | 'ghostty' | 'one-dark' | 'dracula' | 'solarized-dark' | 'solarized-light';

export const TERM_SCHEME_OPTIONS: { v: TermScheme; label: string }[] = [
  { v: 'auto', label: '기본 (테마 연동)' },
  { v: 'ghostty', label: 'Ghostty (cmux 기본)' },
  { v: 'one-dark', label: 'One Dark' },
  { v: 'dracula', label: 'Dracula' },
  { v: 'solarized-dark', label: 'Solarized Dark' },
  { v: 'solarized-light', label: 'Solarized Light' },
];

export type TermPalette = Record<string, string>;

// 앱 테마 연동(auto)용 — 기존 다크/라이트 팔레트
const TERM_DARK: TermPalette = {
  background: '#0A0D14', foreground: '#E2E8F0', cursor: '#34D399', selectionBackground: '#264F78',
};
const TERM_LIGHT: TermPalette = {
  background: '#F2F4F8', foreground: '#1E293B', cursor: '#0B8F63', cursorAccent: '#FFFFFF', selectionBackground: '#BCD3F5',
  black: '#383A42', red: '#CA1243', green: '#50A14F', yellow: '#C18401',
  blue: '#4078F2', magenta: '#A626A4', cyan: '#0184BC', white: '#A0A1A7',
  brightBlack: '#696C77', brightRed: '#CA1243', brightGreen: '#50A14F', brightYellow: '#C18401',
  brightBlue: '#4078F2', brightMagenta: '#A626A4', brightCyan: '#0184BC', brightWhite: '#101012',
};

const SCHEMES: Record<Exclude<TermScheme, 'auto'>, TermPalette> = {
  // cmux 가 내장한 Ghostty 의 기본 팔레트(Ghostty Default Style Dark)
  ghostty: {
    background: '#282C34', foreground: '#FFFFFF', cursor: '#FFFFFF', cursorAccent: '#353A44',
    selectionBackground: '#FFFFFF', selectionForeground: '#282C34',
    black: '#1D1F21', red: '#CC6566', green: '#B6BD68', yellow: '#F0C674',
    blue: '#82A2BE', magenta: '#B294BB', cyan: '#8ABEB7', white: '#C4C8C6',
    brightBlack: '#666666', brightRed: '#D54E53', brightGreen: '#B9CA4B', brightYellow: '#E7C547',
    brightBlue: '#7AA6DA', brightMagenta: '#C397D8', brightCyan: '#70C0B1', brightWhite: '#EAEAEA',
  },
  'one-dark': {
    background: '#282C34', foreground: '#ABB2BF', cursor: '#528BFF', cursorAccent: '#282C34',
    selectionBackground: '#3E4451',
    black: '#282C34', red: '#E06C75', green: '#98C379', yellow: '#E5C07B',
    blue: '#61AFEF', magenta: '#C678DD', cyan: '#56B6C2', white: '#ABB2BF',
    brightBlack: '#5C6370', brightRed: '#E06C75', brightGreen: '#98C379', brightYellow: '#E5C07B',
    brightBlue: '#61AFEF', brightMagenta: '#C678DD', brightCyan: '#56B6C2', brightWhite: '#FFFFFF',
  },
  dracula: {
    background: '#282A36', foreground: '#F8F8F2', cursor: '#F8F8F2', cursorAccent: '#282A36',
    selectionBackground: '#44475A',
    black: '#21222C', red: '#FF5555', green: '#50FA7B', yellow: '#F1FA8C',
    blue: '#BD93F9', magenta: '#FF79C6', cyan: '#8BE9FD', white: '#F8F8F2',
    brightBlack: '#6272A4', brightRed: '#FF6E6E', brightGreen: '#69FF94', brightYellow: '#FFFFA5',
    brightBlue: '#D6ACFF', brightMagenta: '#FF92DF', brightCyan: '#A4FFFF', brightWhite: '#FFFFFF',
  },
  'solarized-dark': {
    background: '#002B36', foreground: '#839496', cursor: '#839496', cursorAccent: '#002B36',
    selectionBackground: '#073642',
    black: '#073642', red: '#DC322F', green: '#859900', yellow: '#B58900',
    blue: '#268BD2', magenta: '#D33682', cyan: '#2AA198', white: '#EEE8D5',
    brightBlack: '#586E75', brightRed: '#CB4B16', brightGreen: '#586E75', brightYellow: '#657B83',
    brightBlue: '#839496', brightMagenta: '#6C71C4', brightCyan: '#93A1A1', brightWhite: '#FDF6E3',
  },
  'solarized-light': {
    background: '#FDF6E3', foreground: '#657B83', cursor: '#657B83', cursorAccent: '#FDF6E3',
    selectionBackground: '#EEE8D5',
    black: '#073642', red: '#DC322F', green: '#859900', yellow: '#B58900',
    blue: '#268BD2', magenta: '#D33682', cyan: '#2AA198', white: '#EEE8D5',
    brightBlack: '#586E75', brightRed: '#CB4B16', brightGreen: '#93A1A1', brightYellow: '#839496',
    brightBlue: '#657B83', brightMagenta: '#6C71C4', brightCyan: '#586E75', brightWhite: '#FDF6E3',
  },
};

/** 현재 xterm 팔레트 — 프리셋 선택 시 프리셋, auto 면 앱 테마(다크/라이트) 연동. */
export function termPalette(scheme: TermScheme, dark: boolean): TermPalette {
  if (scheme !== 'auto' && SCHEMES[scheme]) return SCHEMES[scheme];
  return dark ? TERM_DARK : TERM_LIGHT;
}
