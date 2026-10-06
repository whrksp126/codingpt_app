// treeStatus.ts — 파일 트리의 git 표시(변경 글자 · 무시 흐림). PC `codingpt_pc/src/js/tree-status.js` 와 **같은 규칙**이다.
//  데몬 `git.files` 결과({ repo, entries:[{path,status}], ignored:[path] }, 경로 = 트리 루트 기준 상대)를 행마다 물을 수 있는 표로 바꾼다.
//   · 파일 = 제 상태 글자(M 수정 · A 추가 · D 삭제 · R 이름 변경 · C 복사 · U 추적 안 함 · ! 충돌)
//   · 폴더 = 안에 있는 변경 중 가장 센 것 · 폴더째 추적 안 함(`dir/`)이면 그 안의 모든 것이 U · 무시된 것은 흐리게.
export type GitFilesResult = { repo?: boolean; branch?: string | null; entries?: { path: string; status: string }[]; ignored?: string[] } | null | undefined;
export type TreeStatus = { repo: boolean; branch: string | null; file: Map<string, string>; folder: Map<string, string>; dirs: [string, string][]; ignored: Set<string>; ignoredDirs: string[] };
const PRIORITY: Record<string, number> = { '!': 6, D: 5, M: 4, A: 3, U: 3, R: 2, C: 1 };
const stronger = (a: string | undefined, b: string): string => (!a ? b : !b ? a : (PRIORITY[b] || 0) > (PRIORITY[a] || 0) ? b : a);

export function buildTreeStatus(res: GitFilesResult): TreeStatus {
  const out: TreeStatus = { repo: !!(res && res.repo), branch: (res && res.branch) || null, file: new Map(), folder: new Map(), dirs: [], ignored: new Set(), ignoredDirs: [] };
  if (!out.repo || !res) return out;
  for (const e of res.entries || []) {
    const p = String(e.path || '');
    if (!p) continue;
    const isDir = p.endsWith('/');
    const clean = isDir ? p.slice(0, -1) : p;
    if (isDir) { out.dirs.push([p, e.status]); out.folder.set(clean, stronger(out.folder.get(clean), e.status)); }
    else out.file.set(clean, stronger(out.file.get(clean), e.status));
    const segs = clean.split('/');
    for (let i = 1; i < segs.length; i++) { const d = segs.slice(0, i).join('/'); out.folder.set(d, stronger(out.folder.get(d), e.status)); }
  }
  for (const p of res.ignored || []) {
    const s = String(p || '');
    if (!s) continue;
    if (s.endsWith('/')) { out.ignoredDirs.push(s); out.ignored.add(s.slice(0, -1)); } else out.ignored.add(s);
  }
  return out;
}

export function statusOf(st: TreeStatus | null | undefined, rel: string, isDir: boolean): { letter: string; ignored: boolean } {
  if (!st || !st.repo || !rel) return { letter: '', ignored: false };
  if (st.ignored.has(rel) || st.ignoredDirs.some((d) => rel.startsWith(d))) return { letter: '', ignored: true };
  let letter = (isDir ? st.folder.get(rel) : st.file.get(rel)) || '';
  if (!letter) for (const [d, s] of st.dirs) if (rel.startsWith(d)) { letter = s; break; }
  return { letter, ignored: false };
}

export function statusSig(res: GitFilesResult): string {
  if (!res || !res.repo) return '';
  return (res.entries || []).map((e) => e.status + e.path).sort().join('\n') + '\n--\n' + (res.ignored || []).slice().sort().join('\n');
}
