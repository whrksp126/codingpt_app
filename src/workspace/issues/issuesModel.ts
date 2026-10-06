// issuesModel.ts — 이슈 화면의 순수 판정(걸러 보기·묶기·정렬). PC `codingpt_pc/src/js/issues-model.js` 와 **같은 규칙**이다
//  (픽스처 교차 검증: codingpt_pc/test/orch-crossimpl.mjs). 여기에 React·서비스 접근을 넣지 않는다.
type Iss = { id?: string; key?: string; number?: number; title?: string; status: string; priority?: string; labels?: string[]; cwd?: string; source: { provider: string }; updatedAt?: number };
export const STATUSES = ['todo', 'in_progress', 'in_review', 'done'];
export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'];
export const VIEWS = ['list', 'board', 'table'];
/** 묶어 보는 순서 — 지금 손이 가야 하는 것부터(진행 중 → 리뷰 중 → 할 일 → 완료). */
export const GROUP_ORDER = ['in_progress', 'in_review', 'todo', 'done'];

export function filterIssues<T extends Iss>(issues: T[] | null | undefined, f: { source?: string; cwd?: string; q?: string; done?: boolean } | null | undefined): T[] {
  const o = f || {};
  const q = String(o.q || '').trim().toLowerCase();
  return (issues || []).filter((x) => {
    if (o.source && o.source !== 'all' && x.source.provider !== o.source) return false;
    if (o.cwd && (x.cwd || '') !== o.cwd) return false;
    if (!o.done && x.status === 'done') return false;
    if (q && !(`${x.key} ${x.title} ${(x.labels || []).join(' ')}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

const PRI_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const rank = (p: string | undefined): number => (p != null && PRI_RANK[p] != null ? PRI_RANK[p] : 4);
export function sortIssues<T extends Iss>(list: T[] | null | undefined): T[] {
  return (list || []).slice().sort((a, b) => rank(a.priority) - rank(b.priority) || (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function groupByStatus<T extends Iss>(list: T[] | null | undefined, opt: { order?: string[]; keepEmpty?: boolean } = {}): { status: string; items: T[] }[] {
  const order = opt.order || GROUP_ORDER;
  return order.map((status) => ({ status, items: sortIssues((list || []).filter((x) => x.status === status)) }))
    .filter((g) => opt.keepEmpty || g.items.length);
}

export function sortTable<T extends Iss>(list: T[] | null | undefined, key: string, dir: number): T[] {
  const d = dir === -1 ? -1 : 1;
  const val = (x: T): string | number => (key === 'status' ? STATUSES.indexOf(x.status) : key === 'priority' ? rank(x.priority)
    : key === 'source' ? x.source.provider : key === 'updatedAt' ? (x.updatedAt || 0) : key === 'key' ? (x.number || 0) : String((x as Record<string, unknown>)[key] || '').toLowerCase());
  return (list || []).slice().sort((a, b) => { const p = val(a); const q = val(b); return (p < q ? -1 : p > q ? 1 : 0) * d || (b.updatedAt || 0) - (a.updatedAt || 0); });
}

export function sourceOptions(issues: Iss[] | null | undefined, sources: { provider?: string }[] | null | undefined): string[] {
  const set = new Set<string>(['codingpt']);
  for (const s of sources || []) if (s && s.provider) set.add(s.provider);
  for (const x of issues || []) set.add(x.source.provider);
  return ['all', ...set];
}

export function openCount(issues: Iss[] | null | undefined): number { return (issues || []).filter((x) => x.status !== 'done').length; }

// ── 본문 편집(마크다운) — 폰은 글자 그대로 쓰고 도구 줄이 기호를 넣어 준다 ──
/** 고른 줄들의 앞에 표시를 붙이거나(이미 있으면) 뗀다. → { text, sel } */
export function toggleLinePrefix(text: string, sel: { start: number; end: number }, prefix: string): { text: string; sel: { start: number; end: number } } {
  const a = text.lastIndexOf('\n', Math.max(0, sel.start - 1)) + 1;
  let b = text.indexOf('\n', sel.end);
  if (b < 0) b = text.length;
  const lines = text.slice(a, b).split('\n');
  const all = lines.every((l) => l.startsWith(prefix));
  const next = lines.map((l, i) => (all ? l.slice(prefix.length) : (prefix === '1. ' ? `${i + 1}. ` : prefix) + l.replace(/^(#{1,3} |- \[[ x]\] |- |\d+\. |> )/, ''))).join('\n');
  const delta = next.length - (b - a);
  return { text: text.slice(0, a) + next + text.slice(b), sel: { start: sel.start + (all ? -Math.min(prefix.length, sel.start - a) : next.split('\n')[0].length - lines[0].length), end: sel.end + delta } };
}
/** 고른 글을 기호로 감싸거나(이미 감싸져 있으면) 푼다. 고른 글이 없으면 기호 사이에 커서를 둔다. */
export function toggleWrap(text: string, sel: { start: number; end: number }, mark: string): { text: string; sel: { start: number; end: number } } {
  const { start, end } = sel;
  const n = mark.length;
  if (start >= n && text.slice(start - n, start) === mark && text.slice(end, end + n) === mark) {
    return { text: text.slice(0, start - n) + text.slice(start, end) + text.slice(end + n), sel: { start: start - n, end: end - n } };
  }
  return { text: text.slice(0, start) + mark + text.slice(start, end) + mark + text.slice(end), sel: { start: start + n, end: end + n } };
}
/** 커서 자리에 글을 넣는다(앞뒤 줄바꿈을 맞춘다 — 첨부·구분선·코드 블록). */
export function insertBlock(text: string, sel: { start: number; end: number }, block: string): { text: string; sel: { start: number; end: number } } {
  const before = text.slice(0, sel.start); const after = text.slice(sel.end);
  const pre = before && !before.endsWith('\n') ? '\n' : '';
  const post = after.startsWith('\n') || !after ? '' : '\n';
  const out = before + pre + block + '\n' + post + after;
  const at = (before + pre + block + '\n').length;
  return { text: out, sel: { start: at, end: at } };
}
