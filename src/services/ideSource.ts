import daemonService from './daemonService';

// ── IDE 소스(compute) 추상화 ──
// 모바일 IDE 는 두 종류의 소스를 같은 UI 로 편집한다:
//   · cloud  — objectstore 프로젝트 + 샌드박스 터미널/프리뷰 (기존 경로, 무수정)
//   · daemon — 사용자 PC(codingpt_daemon)의 실제 폴더. 파일은 데몬 fs RPC, 터미널은 데몬 tmux.
// 소스는 projectId 로 식별한다: `pc:<root>` 이면 데몬(선택 폴더=root, 홈 기준 상대경로. 홈 루트면 빈 문자열).
// cloud 는 접두사가 없다. 이 모듈은 데몬 소스 판별 + 파일 read/write 라우팅만 담당(터미널/watcher 는
// 데몬 전용 서비스가 이미 있어 화면에서 직접 사용).

const DAEMON_PREFIX = 'pc:';

/** projectId 가 데몬 소스면 선택 폴더의 홈-기준 상대경로(root), 아니면 null. 홈 루트는 ''. */
export function daemonRootOf(projectId: string | null | undefined): string | null {
  if (!projectId || !projectId.startsWith(DAEMON_PREFIX)) return null;
  return projectId.slice(DAEMON_PREFIX.length);
}

/** 선택 폴더(root)를 데몬 소스 projectId 로 인코딩. */
export function daemonProjectId(root: string): string {
  return DAEMON_PREFIX + (root || '').replace(/^\/+|\/+$/g, '');
}

/** 워크스페이스 메타 → 활성 projectId. local(PC)은 pc:<localPath>, cloud 는 objectstore id 그대로. */
export function projectIdForWorkspace(ws: { id: string; compute?: string; localPath?: string }): string {
  return ws.compute === 'local' && ws.localPath ? daemonProjectId(ws.localPath) : ws.id;
}

/**
 * 클라우드 러너 핸드오프용 cwd(M5 Slice4). 클라우드 컨테이너 root=/workspace 이므로
 * 로컬 localPath('…/foo')를 슬러그(basename) 'foo'로 매핑(→ /workspace/foo). localPath 없으면 ws.id.
 * (진입 projectId = daemonProjectId(cloudCwdForWorkspace(ws)).)
 */
export function cloudCwdForWorkspace(ws: { id: string; localPath?: string }): string {
  const base = (ws.localPath || '').replace(/\/+$/, '').split('/').pop();
  return (base || ws.id).replace(/[^A-Za-z0-9_.-]/g, '-');
}

/** 프로젝트-상대 경로(트리 기준) → 데몬 홈-기준 절대상대경로. */
export function daemonFullPath(root: string, relPath: string): string {
  const r = (root || '').replace(/^\/+|\/+$/g, '');
  const p = (relPath || '').replace(/^\/+/, '');
  return r ? `${r}/${p}` : p;
}

export interface SourceReadResult {
  content?: string;
  binary?: boolean;
  tooLarge?: boolean;
}

/** 데몬 파일 1개 읽기(프로젝트-상대 경로). */
export async function readDaemonFile(root: string, relPath: string): Promise<SourceReadResult> {
  const r = await daemonService.fsRead(daemonFullPath(root, relPath));
  return { content: r.content, binary: r.binary, tooLarge: r.tooLarge };
}

/** 데몬 파일 1개 쓰기(프로젝트-상대 경로). 존재하지 않으면 생성. */
export async function writeDaemonFile(root: string, relPath: string, content: string): Promise<void> {
  await daemonService.fsWrite(daemonFullPath(root, relPath), content);
}

/** 데몬 이미지 1개를 base64 로 읽어 data URL 로 반환(미리보기). 실패/미지원이면 null. */
export async function readDaemonImage(root: string, relPath: string): Promise<string | null> {
  const r = await daemonService.fsRead(daemonFullPath(root, relPath), { base64: true });
  if (!r.base64) return null;
  const ext = (relPath.split('.').pop() || '').toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext || 'png'}`;
  return `data:${mime};base64,${r.base64}`;
}

export default { daemonRootOf, daemonProjectId, daemonFullPath, readDaemonFile, writeDaemonFile };
