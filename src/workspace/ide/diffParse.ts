// 통합 diff(unified diff) 파싱 — 순수 판정.
//
// ⚠ PC(codingpt_pc/src/js/diff-parse.js)에 같은 구현이 있고 **대조 테스트가 걸려 있다**.
//   리뷰 화면은 "몇 번째 덩어리를 승인했다"를 그대로 에이전트에게 돌려주므로, 두 기기가 덩어리를
//   다르게 세면 **엉뚱한 곳을 승인한 결과**가 간다. 규율은 PC 파일 머리주석에 정리돼 있다.

export type DiffLineType = 'ctx' | 'add' | 'del' | 'meta';
export type DiffLine = { type: DiffLineType; text: string; oldNo: number | null; newNo: number | null };
export type DiffHunk = {
  index: number; header: string; oldStart: number; newStart: number;
  lines: DiffLine[]; adds: number; dels: number;
};
export type ReviewFile = { path: string; hunks: number; diffText?: string; truncated?: boolean };
export type Decision = 'approve' | 'reject';
export type ReviewComment = { path: string; hunk: number; side: 'old' | 'new'; line: number | null; text: string };

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/** 한 파일의 통합 diff → 덩어리 목록. git 헤더(diff --git / index / --- / +++)는 건너뛴다. */
export function parseHunks(diffText: unknown): DiffHunk[] {
  const lines = String(diffText == null ? '' : diffText).split('\n');
  // ★ 끝의 개행이 만드는 빈 원소를 줄로 세면 문맥 줄이 하나 더 생겨 뒤 줄 번호가 전부 1씩
  //   밀린다(실제 git diff 로 잡힌 결함 — 경위는 PC diff-parse.js 주석). 마지막 하나만 버린다.
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const hunks: DiffHunk[] = [];
  let cur: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  for (const raw of lines) {
    const m = HUNK_RE.exec(raw);
    if (m) {
      cur = {
        index: hunks.length,
        header: raw,
        oldStart: parseInt(m[1], 10) || 0,
        newStart: parseInt(m[3], 10) || 0,
        lines: [],
        adds: 0,
        dels: 0,
      };
      oldNo = cur.oldStart;
      newNo = cur.newStart;
      hunks.push(cur);
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith('\\')) {               // `\ No newline at end of file`
      cur.lines.push({ type: 'meta', text: raw.slice(1).trim(), oldNo: null, newNo: null });
      continue;
    }
    const c = raw[0];
    const body = raw.length ? raw.slice(1) : '';
    if (c === '+') {
      cur.lines.push({ type: 'add', text: body, oldNo: null, newNo });
      newNo++; cur.adds++;
    } else if (c === '-') {
      cur.lines.push({ type: 'del', text: body, oldNo, newNo: null });
      oldNo++; cur.dels++;
    } else {
      cur.lines.push({ type: 'ctx', text: c === ' ' ? body : raw, oldNo, newNo });
      oldNo++; newNo++;
    }
  }
  return hunks;
}

export function summarize(diffText: unknown): { hunks: number; adds: number; dels: number } {
  const hunks = parseHunks(diffText);
  let adds = 0;
  let dels = 0;
  for (const h of hunks) { adds += h.adds; dels += h.dels; }
  return { hunks: hunks.length, adds, dels };
}

/** 코멘트를 달 수 있는 줄인가 — **바뀐 줄만**(문맥 줄 코멘트는 에이전트가 고칠 곳을 못 찾는다). */
export function isCommentable(line: DiffLine | null | undefined): boolean {
  return !!line && (line.type === 'add' || line.type === 'del');
}

/** 코멘트가 가리키는 위치 — 에이전트가 파일에서 찾을 수 있는 좌표. */
export function anchorOf(line: DiffLine | null | undefined): { side: 'old' | 'new'; line: number | null } | null {
  if (!line) return null;
  if (line.type === 'add') return { side: 'new', line: line.newNo };
  if (line.type === 'del') return { side: 'old', line: line.oldNo };
  return null;
}

/**
 * 파일 판정은 **덩어리 판정에서 파생**한다(따로 저장하지 않는다 — 둘이 어긋나면 어느 쪽이
 *  진실인지 알 수 없다). 하나라도 거절이면 rejected, 전부 승인이면 approved, 남았으면 partial.
 */
export function fileVerdict(file: ReviewFile, decisions: Record<string, Decision> | null): string {
  const n = file && file.hunks ? file.hunks : 0;
  if (!n) return 'approved';
  let approved = 0;
  let rejected = 0;
  for (let i = 0; i < n; i++) {
    const d = decisions ? decisions[`${file.path}#${i}`] : null;
    if (d === 'approve') approved++;
    else if (d === 'reject') rejected++;
  }
  if (rejected) return 'rejected';
  if (approved === n) return 'approved';
  return 'partial';
}

export function allDecided(files: ReviewFile[], decisions: Record<string, Decision> | null): boolean {
  for (const f of files || []) {
    for (let i = 0; i < (f.hunks || 0); i++) {
      const d = decisions ? decisions[`${f.path}#${i}`] : null;
      if (d !== 'approve' && d !== 'reject') return false;
    }
  }
  return true;
}

export function undecidedCount(files: ReviewFile[], decisions: Record<string, Decision> | null): number {
  let n = 0;
  for (const f of files || []) {
    for (let i = 0; i < (f.hunks || 0); i++) {
      const d = decisions ? decisions[`${f.path}#${i}`] : null;
      if (d !== 'approve' && d !== 'reject') n++;
    }
  }
  return n;
}

/** 제출 페이로드 — 코멘트는 **모아서 한 번에** 간다(사용자 확정). */
export function buildSubmission(
  files: ReviewFile[],
  decisions: Record<string, Decision> | null,
  comments: ReviewComment[] | null,
  note?: string,
) {
  return {
    files: (files || []).map((f) => ({
      path: f.path,
      verdict: fileVerdict(f, decisions),
      hunks: Array.from({ length: f.hunks || 0 }, (_, i) => ({
        index: i,
        decision: (decisions && decisions[`${f.path}#${i}`]) || 'skipped',
      })),
      comments: (comments || [])
        .filter((c) => c.path === f.path)
        .map((c) => ({ hunk: c.hunk, side: c.side, line: c.line, text: c.text })),
    })),
    note: typeof note === 'string' && note.trim() ? note.trim() : undefined,
  };
}

// ── 작업 리뷰 코멘트 직렬화(Agent Tasks 설계 §8.5) ─────────────────────────────
//  작업 run 의 diff 리뷰는 review.submit(에이전트가 기다리는 세션)이 아니라 **그 run 의 터미널 입력**으로
//  돌아간다(chat.input). 에이전트가 읽을 평문이므로 문법이 정확해야 하고, PC `diff-parse.js` 와 **글자까지
//  같아야** 한다(review-comments-01.json 픽스처가 양쪽을 대조한다).
//  한국어 고정 문자열("리뷰 코멘트", "전체 메모", "잘림")은 i18n 하지 않는다 — 에이전트 입력이지 화면 문구가 아니다.
export type TaskReviewSubmission = {
  comments?: ReviewComment[] | null;
  decisions?: Record<string, Decision> | null;
  note?: string | null;
  /** buildSubmission() 결과 모양도 받는다(files[].hunks[].decision / files[].comments). */
  files?: Array<{ path: string; hunks?: Array<{ index: number; decision: string }>; comments?: Array<{ hunk: number; side: 'old' | 'new'; line: number | null; text: string }> }>;
};

export const REVIEW_COMMENTS_MAX_BYTES = 30000;

function utf8Len(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/** 결정 키 `${path}#${hunk}` → [path, hunk]. 경로에 '#' 가 있어도 되게 마지막 '#' 로 자른다. */
function splitHunkKey(k: string): [string, number] | null {
  const i = k.lastIndexOf('#');
  if (i <= 0) return null;
  const n = Number(k.slice(i + 1));
  if (!Number.isInteger(n)) return null;
  return [k.slice(0, i), n];
}

export function serializeReviewComments(submission: TaskReviewSubmission | null | undefined, opts?: { title?: string }): string {
  const sub = submission || {};
  let comments: ReviewComment[] = Array.isArray(sub.comments) ? sub.comments.slice() : [];
  let decisions: Record<string, Decision> = sub.decisions && typeof sub.decisions === 'object' ? { ...sub.decisions } : {};
  if (!sub.comments && Array.isArray(sub.files)) {
    comments = [];
    decisions = {};
    for (const f of sub.files) {
      for (const h of f.hunks || []) if (h.decision === 'approve' || h.decision === 'reject') decisions[`${f.path}#${h.index}`] = h.decision;
      for (const c of f.comments || []) comments.push({ path: f.path, hunk: c.hunk, side: c.side, line: c.line, text: c.text });
    }
  }
  const note = typeof sub.note === 'string' ? sub.note.trim() : '';
  const rejected: [string, number][] = [];
  for (const [k, v] of Object.entries(decisions)) {
    if (v !== 'reject') continue;
    const pk = splitHunkKey(k);
    if (pk) rejected.push(pk);
  }
  if (!comments.length && !rejected.length && !note) return '';

  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  // 순서 = 경로 오름차순 → 헝크 번호 → 입력 순(안정 정렬을 믿지 않고 원래 위치를 키로 쓴다).
  const ordered = comments.map((c, i) => ({ c, i })).sort((x, y) =>
    cmp(x.c.path, y.c.path) || (x.c.hunk - y.c.hunk) || (x.i - y.i));
  const lines: string[] = [`리뷰 코멘트 (${opts?.title ?? ''})`];
  const commented = new Set<string>();
  for (const { c } of ordered) {
    const key = `${c.path}#${c.hunk}`;
    commented.add(key);
    const at = c.line === null || c.line === undefined
      ? `- ${c.path} hunk ${c.hunk}`
      : `- ${c.path}:${c.line}${c.side === 'old' ? '(old)' : ''}`;
    const rej = decisions[key] === 'reject' ? ' [reject]' : '';
    lines.push(`${at}${rej} ${String(c.text ?? '').replace(/\r?\n/g, ' ')}`);
  }
  rejected
    .filter(([p, h]) => !commented.has(`${p}#${h}`))
    .sort((a, b) => cmp(a[0], b[0]) || (a[1] - b[1]))
    .forEach(([p, h]) => lines.push(`- ${p} hunk ${h} [reject]`));
  if (note) lines.push(`전체 메모: ${note}`);

  const out = lines.join('\n');
  if (utf8Len(out) <= REVIEW_COMMENTS_MAX_BYTES) return out;
  // 상한 초과 — 줄 단위로 앞에서부터 담고 마지막 줄에 표식을 붙인다(표식 포함 상한 이내).
  const MARK = '… (잘림)';
  const budget = REVIEW_COMMENTS_MAX_BYTES - utf8Len('\n' + MARK);
  const kept: string[] = [];
  let used = 0;
  for (const ln of lines) {
    const add = utf8Len(ln) + (kept.length ? 1 : 0);
    if (used + add > budget) {
      // 첫 줄조차 안 들어가는 극단(거대한 한 줄) — 그 줄을 바이트 예산 안에서 자른다.
      if (!kept.length) {
        let cut = '';
        let b = 0;
        for (const ch of ln) { const l = utf8Len(ch); if (b + l > budget) break; cut += ch; b += l; }
        kept.push(cut);
      }
      break;
    }
    kept.push(ln);
    used += add;
  }
  kept.push(MARK);
  return kept.join('\n');
}
