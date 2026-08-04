// 팔레트 검색 — 입력 해석과 점수 매기기(순수 판정).
//
// ⚠ PC(codingpt_pc/src/js/palette-match.js)에 같은 구현이 있고 **대조 테스트가 걸려 있다**.
//   같은 글자를 쳤을 때 PC 와 폰에서 다른 순서가 나오면 "내 파일이 어디 갔지"가 된다.
//   점수는 정수, 동점은 결정적으로(짧은 것 → 사전순) — 이유는 PC 파일 머리주석 참조.

export const MODE_FILE = 'file';
export const MODE_COMMAND = 'command';

export type PaletteMode = typeof MODE_FILE | typeof MODE_COMMAND;

/** 입력 → { mode, term }. `>` 로 시작하면 명령 모드(사용자 확정: 창은 하나). */
export function parseQuery(raw: unknown): { mode: PaletteMode; term: string } {
  const s = String(raw == null ? '' : raw);
  if (s.trimStart().startsWith('>')) {
    return { mode: MODE_COMMAND, term: s.trimStart().slice(1).trim() };
  }
  return { mode: MODE_FILE, term: s.trim() };
}

const BOUNDARY = '/-_. \\';

/**
 * 여기서 낱말이 시작되는가. 구분자 뒤뿐 아니라 **camelCase 의 대문자**도 낱말의 시작이다 —
 *  빼면 `wsv` 가 `WorkspaceView.tsx` 를 못 잡는다(PC 파일 주석에 실측 경위).
 */
export function isWordStart(orig: string, low: string, idx: number): boolean {
  if (idx <= 0) return true;
  if (BOUNDARY.indexOf(low[idx - 1]) >= 0) return true;
  const c = orig[idx];
  const p = orig[idx - 1];
  return c >= 'A' && c <= 'Z' && p >= 'a' && p <= 'z';
}

/** 부분수열 점수. 안 맞으면 null(0 이 아니다 — 0 은 "빈 검색어"라는 유효한 점수다). */
export function fuzzyScore(text: unknown, term: unknown): number | null {
  const orig = String(text == null ? '' : text);
  const t = orig.toLowerCase();
  const q = String(term == null ? '' : term).toLowerCase();
  if (!q) return 0;
  let from = 0;
  let score = 0;
  let prev = -2;
  let first = -1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === ' ') continue;
    const idx = t.indexOf(c, from);
    if (idx < 0) return null;
    if (first < 0) first = idx;
    score += idx === prev + 1 ? 8 : 1;
    if (isWordStart(orig, t, idx)) score += 6;
    prev = idx;
    from = idx + 1;
  }
  if (first < 0) return 0;
  return score - Math.min(first, 20);
}

/** 경로 점수 — 파일명 일치를 경로 전체 일치보다 위로(사람은 파일명을 친다). */
export function scorePath(path: unknown, term: unknown): number | null {
  const p = String(path == null ? '' : path);
  const base = p.split('/').pop() || p;
  const b = fuzzyScore(base, term);
  const f = fuzzyScore(p, term);
  if (b == null && f == null) return null;
  if (b == null) return f;
  const withBonus = b + 12;
  return f == null || f < withBonus ? withBonus : f;
}

/** 동점 깨기 — 점수 내림차순 → 정렬키 짧은 것 → 사전순. 원본을 건드리지 않는다. */
export function rankByScore<T extends { score: number; sortKey: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ak = String(a.sortKey || '');
    const bk = String(b.sortKey || '');
    if (ak.length !== bk.length) return ak.length - bk.length;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
}

/**
 * 점수가 붙은 행들을 걸러 정렬하되, **검색어가 비면 원래 순서를 지킨다**.
 *  열린 탭·명령은 화면(또는 표)의 순서가 곧 사용자의 심상이다 — 아무것도 안 친 상태에서
 *  이름 길이순으로 다시 줄 세우면 "왜 순서가 이렇지"가 된다(PC 하네스에서 실측된 결함).
 */
export function rankRows<T extends { score: number; sortKey: string }>(
  rows: T[], term: unknown, limit?: number,
): T[] {
  const cap = typeof limit === 'number' ? limit : 50;
  const list = Array.isArray(rows) ? rows : [];
  if (!String(term || '').trim()) return list.slice(0, cap);
  return rankByScore(list).slice(0, cap);
}

/**
 * 파일 목록 걸러 정렬. 검색어가 비면 **자르기만 한다**(정렬을 흔들지 않는다 — 트리 순서가 곧
 *  사용자의 심상이다).
 */
export function rankPaths(paths: string[], term: unknown, limit?: number): string[] {
  const cap = typeof limit === 'number' ? limit : 50;
  const list = Array.isArray(paths) ? paths : [];
  if (!String(term || '').trim()) return list.slice(0, cap);
  const scored: { score: number; sortKey: string; path: string }[] = [];
  for (const p of list) {
    const s = scorePath(p, term);
    if (s == null) continue;
    scored.push({ score: s, sortKey: p, path: p });
  }
  return rankByScore(scored).slice(0, cap).map((r) => r.path);
}

/** 이름 + 검색 보조어를 가진 항목의 점수. 이름 일치가 항상 위다(보조어 일치는 감점). */
export function scoreLabeled(label: unknown, keywords: unknown, term: unknown): number | null {
  if (!String(term || '').trim()) return 0;
  const l = fuzzyScore(label, term);
  if (l != null) return l;
  const k = fuzzyScore(keywords || '', term);
  if (k == null) return null;
  return k - 30;
}
