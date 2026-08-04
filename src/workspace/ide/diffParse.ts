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
