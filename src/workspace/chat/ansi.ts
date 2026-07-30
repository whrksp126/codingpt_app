// ansi.ts — TUI statusline 미러용 최소 ANSI(SGR) → RN Text 세그먼트 파서.
//  PC(codingpt_pc/src/js/ansi.js)와 같은 규칙(2026-07-30 실캡처 서브셋이 정본):
//  0 리셋 · 1 bold · 2 dim · 3 italic · 4 underline · 7 반전 · 22/23/24/27 해제 ·
//  30-37/90-97/39 fg · 38;5;n(256) · 38;2;r;g;b · 40-47/100-107/48;5/48;2/49 bg.
//  그 외 SGR 무시, 비-SGR CSI/OSC 제거. 16색은 터미널 팔레트(termPalette)를 그대로 쓴다.

export interface AnsiSeg {
  text: string;
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const NAMED16 = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
] as const;

function color256(n: number, pal: Record<string, string>): string | undefined {
  if (n < 16) return pal[NAMED16[n]];
  if (n < 232) {
    const c = n - 16;
    const lv = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    const r = lv(Math.floor(c / 36));
    const g = lv(Math.floor((c % 36) / 6));
    const b = lv(c % 6);
    return `rgb(${r},${g},${b})`;
  }
  const v = 8 + (n - 232) * 10;
  return `rgb(${v},${v},${v})`;
}

interface St {
  bold: boolean; dim: boolean; italic: boolean; underline: boolean; inverse: boolean;
  fg?: string; bg?: string;
}

function applySgr(st: St, params: string, pal: Record<string, string>): void {
  const p = params.split(';').map((x) => (x === '' ? 0 : parseInt(x, 10)));
  for (let i = 0; i < p.length; i++) {
    const n = p[i];
    if (n === 0) { st.bold = st.dim = st.italic = st.underline = st.inverse = false; st.fg = undefined; st.bg = undefined; }
    else if (n === 1) st.bold = true;
    else if (n === 2) st.dim = true;
    else if (n === 3) st.italic = true;
    else if (n === 4) st.underline = true;
    else if (n === 7) st.inverse = true;
    else if (n === 22) { st.bold = false; st.dim = false; }
    else if (n === 23) st.italic = false;
    else if (n === 24) st.underline = false;
    else if (n === 27) st.inverse = false;
    else if (n >= 30 && n <= 37) st.fg = pal[NAMED16[n - 30]];
    else if (n >= 90 && n <= 97) st.fg = pal[NAMED16[n - 90 + 8]];
    else if (n === 39) st.fg = undefined;
    else if (n >= 40 && n <= 47) st.bg = pal[NAMED16[n - 40]];
    else if (n >= 100 && n <= 107) st.bg = pal[NAMED16[n - 100 + 8]];
    else if (n === 49) st.bg = undefined;
    else if (n === 38 || n === 48) {
      const isFg = n === 38;
      if (p[i + 1] === 5 && p.length > i + 2) {
        const c = color256(p[i + 2], pal);
        if (isFg) st.fg = c; else st.bg = c;
        i += 2;
      } else if (p[i + 1] === 2 && p.length > i + 4) {
        const c = `rgb(${p[i + 2]},${p[i + 3]},${p[i + 4]})`;
        if (isFg) st.fg = c; else st.bg = c;
        i += 4;
      }
    }
  }
}

/** ANSI 한 줄 → 세그먼트 목록. 줄 시작마다 상태 리셋(statusline 은 줄마다 자체 색을 칠한다 — 실측). */
export function parseAnsiLine(line: string, pal: Record<string, string>): AnsiSeg[] {
  const st: St = { bold: false, dim: false, italic: false, underline: false, inverse: false };
  const out: AnsiSeg[] = [];
  let text = '';
  const flush = () => {
    if (!text) return;
    let fg = st.fg;
    let bg = st.bg;
    if (st.inverse) { const t = fg ?? pal.foreground; fg = bg ?? pal.background; bg = t; }
    out.push({
      text,
      ...(fg ? { color: fg } : {}),
      ...(bg ? { backgroundColor: bg } : {}),
      ...(st.bold ? { bold: true } : {}),
      ...(st.dim ? { dim: true } : {}),
      ...(st.italic ? { italic: true } : {}),
      ...(st.underline ? { underline: true } : {}),
    });
    text = '';
  };
  const s = String(line || '');
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\x1b') {
      if (s[i + 1] === '[') {
        const m = /^\x1b\[([0-9;:]*)m/.exec(s.slice(i));
        if (m) { flush(); applySgr(st, m[1], pal); i += m[0].length; continue; }
        const other = /^\x1b\[[0-9;:?]*[A-Za-z]/.exec(s.slice(i));
        if (other) { i += other[0].length; continue; }
      }
      if (s[i + 1] === ']') {
        const bel = s.indexOf('\x07', i);
        const st2 = s.indexOf('\x1b\\', i);
        i = bel >= 0 && (st2 < 0 || bel < st2) ? bel + 1 : st2 >= 0 ? st2 + 2 : s.length;
        continue;
      }
      i += 2;
      continue;
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}
