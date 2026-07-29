// composer.ts — 채팅 컴포저의 **순수 규칙**. PC `codingpt_pc/src/js/chat-model.js` 의 같은 이름
//  함수들(composerHasText/agentDisplayName/…)의 미러다 — 한쪽만 고치면 두 화면이 갈린다.
//
// 여기 있는 이유: 이 규칙들이 **에이전트에게 실제로 전달되는 문자열**과 버튼 활성 여부를 결정하는데,
//  컴포넌트 안에 묻어 두면 단위 테스트가 불가능해 "소스 모양만 보는" 공허한 검증이 된다.

/** 전송 가능? 공백/개행만 있는 입력은 보내지 않는다(TUI 에 빈 Enter = 프롬프트 한 번 삼킴). */
export function composerHasText(v: string | null | undefined): boolean {
  return String(v == null ? '' : v).trim().length > 0;
}

/** 에이전트 코드명 → 표시 이름(플레이스홀더 "Claude에게 요청"). 모르면 빈 문자열. */
export function agentDisplayName(agent: string | null | undefined): string {
  const s = String(agent == null ? '' : agent).trim().toLowerCase();
  if (s === 'claude') return 'Claude';
  if (s === 'codex') return 'Codex';
  if (s === 'gemini') return 'Gemini';
  return '';
}

/**
 * 커서 위치에 텍스트를 끼워 넣은 결과(음성 입력 전용).
 *  ★ **덮어쓰기 삽입**이다: STT 는 같은 발화에 대해 부분 결과를 여러 번 보내므로, 매번 원본(base)의
 *   같은 자리(anchor)에 최신 텍스트를 넣어야 한다. 누적하면 "안녕안녕하세요안녕하세요" 가 된다.
 *  · anchor 는 항상 [0, base.length] 로 클램프한다(선택 영역이 없거나 미상이면 끝에 붙는 게 안전).
 *  · 앞 글자가 공백이 아니면 공백 하나를 넣는다 — 기존 문장에 붙어 `파일을열어줘` 가 되지 않게.
 */
export function spliceSpeech(base: string, anchor: number, text: string, max = 4096): { value: string; cursor: number } {
  const b = String(base == null ? '' : base);
  const t = String(text == null ? '' : text);
  const a = Math.max(0, Math.min(Number.isFinite(anchor) ? Math.trunc(anchor) : b.length, b.length));
  const head = b.slice(0, a);
  const tail = b.slice(a);
  const sep = head && !/\s$/.test(head) ? ' ' : '';
  const ins = sep + t;
  const raw = head + ins + tail;
  const value = raw.length > max ? raw.slice(0, max) : raw;
  return { value, cursor: Math.min(head.length + ins.length, value.length) };
}

export default { composerHasText, agentDisplayName, spliceSpeech };

// ── 컴포저 라이브 미러의 순수 규칙(PC chat-model.js 미러 · 2026-07-30 cptest 실측 계약) ──
//  · 프롬프트는 "❯"+NBSP. 연속줄(랩·M-Enter 개행)은 2칸 들여쓰기. [Image #N] = 원자 셀.
//  · 랩과 개행은 화면만으로 구분 불가 → "이전 줄이 가득 찼으면 랩" 휴리스틱.

export const IMG_TOKEN_RE = /\[Image #(\d+)\]/g;

export interface ComposerParse {
  found: boolean;
  row0: number;
  rows: { row: number; text: string }[];
  text: string;
  nums: number[];
  multiRow: boolean;
  _width: number;
}

export function parseComposerScreen(lines: string[] | null | undefined, cols?: number): ComposerParse {
  const arr = Array.isArray(lines) ? lines : [];
  let s = -1;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (/^\s*❯/.test(String(arr[i] ?? ''))) { s = i; break; }
  }
  const none: ComposerParse = { found: false, row0: -1, rows: [], text: '', nums: [], multiRow: false, _width: Infinity };
  if (s < 0) return none;
  const rows = [{ row: s, text: String(arr[s]).replace(/^\s*❯[\s ]?/, '') }];
  for (let i = s + 1; i < arr.length; i++) {
    const ln = String(arr[i] ?? '');
    if (/^\s*─{4,}/.test(ln) || /^\s*$/.test(ln)) break;
    rows.push({ row: i, text: ln.replace(/^ {0,2}/, '') });
  }
  const width = Number(cols) > 4 ? Number(cols) - 2 : Infinity;
  let text = rows[0].text;
  for (let k = 1; k < rows.length; k++) {
    text += (rows[k - 1].text.length >= width ? '' : '\n') + rows[k].text;
  }
  const nums: number[] = [];
  for (const m of text.matchAll(IMG_TOKEN_RE)) nums.push(parseInt(m[1], 10));
  return { found: true, row0: s, rows, text, nums, multiRow: rows.length > 1, _width: width };
}

/** 커서 좌표 → 논리 텍스트 인덱스(PC composerCaret 미러). 컴포저 밖이면 null. */
export function composerCaret(parsed: ComposerParse, cx: number, cy: number): number | null {
  if (!parsed || !parsed.found) return null;
  const ri = parsed.rows.findIndex((r) => r.row === cy);
  if (ri < 0) return null;
  let base = 0;
  for (let k = 0; k < ri; k++) {
    base += parsed.rows[k].text.length;
    base += parsed.rows[k].text.length >= parsed._width ? 0 : 1;
  }
  const col = Math.max(0, Math.min(Number(cx) - 2, parsed.rows[ri].text.length));
  return Math.min(base + col, parsed.text.length);
}

export type ComposerCell = { ch: string } | { img: number; str: string };

export function composerCells(text: string): ComposerCell[] {
  const src = String(text || '');
  const cells: ComposerCell[] = [];
  let last = 0;
  for (const m of src.matchAll(IMG_TOKEN_RE)) {
    for (const ch of src.slice(last, m.index)) cells.push({ ch });
    cells.push({ img: parseInt(m[1], 10), str: m[0] });
    last = (m.index || 0) + m[0].length;
  }
  for (const ch of src.slice(last)) cells.push({ ch });
  return cells;
}

/** 셀 델타 → 화살표 시퀀스(토큰=1스텝 원자성이 이 모델의 존재 이유). */
export function arrowSeq(delta: number): string {
  const n = Math.abs(Number(delta) || 0);
  if (!n) return '';
  return (Number(delta) > 0 ? '\x1b[C' : '\x1b[D').repeat(n);
}

/** 입력 델타(공통 접두사 비교) — 숨은 캡처칸은 끝에서만 자란다는 계약 위에서만 유효. */
export function inputDelta(prev: string, next: string): { bs: number; add: string } {
  const a = String(prev || '');
  const b = String(next || '');
  let p = 0;
  const max = Math.min(a.length, b.length);
  while (p < max && a[p] === b[p]) p++;
  return { bs: a.length - p, add: b.slice(p) };
}

export const COMPOSER_KEYS = {
  enter: '\r',
  newline: '\x1b\r',
  backspace: '\x7f',
  delete: '\x1b[3~',
  end: '\x1b[4~',
} as const;

/** 빈 컴포저의 자리표시 힌트(dim 'Try "..."')는 본문이 아니다. */
export function isComposerPlaceholder(t: string): boolean {
  return /^Try ".*"?$/.test(String(t || '').trim());
}

/** 다이얼로그 선택지(❯ 1. …)를 컴포저로 오인하지 않는다. */
export function isDialogLine(t: string): boolean {
  return /^\d+\.\s/.test(String(t || '').trimStart());
}

/** 팝업 패스스루('/'·'@') — 컴포저 위 룰 위쪽 인접 행(빈 줄/룰에서 멈춤). */
export function popupLines(lines: string[] | null | undefined, parsed: ComposerParse, max = 8): string[] {
  if (!parsed || !parsed.found) return [];
  const t = parsed.text.trimStart();
  if (!(t.startsWith('/') || t.startsWith('@'))) return [];
  const arr = Array.isArray(lines) ? lines : [];
  const out: string[] = [];
  for (let i = parsed.row0 - 2; i >= 0 && out.length < max; i--) {
    const ln = String(arr[i] ?? '');
    if (/^\s*$/.test(ln) || /^\s*─{4,}/.test(ln)) break;
    out.unshift(ln);
  }
  return out;
}

/** 낙관 버블 표시용 — [Image #N] 토큰 전부 제거(붙은 공백 정리). */
export function stripImageTokens(text: string): string {
  return String(text || '').replace(/ ?\[Image #\d+\] ?/g, ' ').replace(/ {2,}/g, ' ').trim();
}
