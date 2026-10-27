// attachmentUpload.ts — 데몬 fs.write(base64) 릴레이 업로드 공용 헬퍼(와이어 계약 §1·§2 / 라운드2 §2.3).
//   업로드 경로 규약: `.codingpt/attachments/<prefix><yyyymmdd-hhmmss>-<rand4>.jpg` (데몬 홈-기준 상대),
//   응답 absPath(절대경로)를 그대로 터미널 삽입에 쓴다(따옴표 안 `~` 는 확장 안 되므로 절대경로 필수).
//   사용처: 보조키 바 이미지 첨부(TerminalAttachButton) · Design Mode 크롭샷(PaneView).
import daemonService from './daemonService';
import ReactNativeBlobUtil from 'react-native-blob-util';
import * as i18n from '../i18n/index.ts';

const ATTACH_DIR = '.codingpt/attachments';
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 첨부 파일명 — `<prefix><yyyymmdd-hhmmss>-<rand4>.<ext>` (prefix 예: 'design-').
 *  ext 는 **실제 바이트와 맞아야 한다** — 모바일 화면 캡처는 기기에 따라 png/bmp 로도 온다.
 *  확장자가 어긋나면 칩 썸네일도, 에이전트가 그 파일을 읽는 것도 조용히 실패한다. */
export function attachmentName(prefix = '', ext = 'jpg'): string {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${prefix}${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${rand}.${ext}`;
}

// 첨부를 올릴 폴더 — 보통은 호스트의 `.codingpt/attachments`. VM 워크스페이스에 들어가 있으면 그 워크스페이스 자리 아래로
//  바꾼다(WorkspaceView 가 세운다): 데몬이 그 경로를 VM 안으로 넘기고 **VM 의 절대경로**를 돌려줘, VM 안 에이전트가 읽을 수 있다.
let dirOverride: string | null = null;
export function setAttachDir(dir: string | null): void { dirOverride = dir; }
const attachDir = (): string => dirOverride || ATTACH_DIR;

/** base64 JPEG 를 호스트 PC `.codingpt/attachments/` 에 업로드하고 절대경로(absPath)를 반환.
 *  디렉토리는 데몬 부팅이 보장하지만, 실패 시 mkdir 후 1회 재시도(previewHistoryService 패턴). */
export async function uploadAttachmentBase64(b64: string, host: number | null, prefix = '', ext = 'jpg'): Promise<string> {
  const dir = attachDir();
  const file = `${dir}/${attachmentName(prefix, ext)}`;
  let r: Awaited<ReturnType<typeof daemonService.fsWrite>>;
  try {
    r = await daemonService.fsWrite(file, b64, host, { base64: true });
  } catch (first) {
    try { await daemonService.fsMkdir(dir, host); } catch (_) { /* 이미 존재 등 */ }
    r = await daemonService.fsWrite(file, b64, host, { base64: true });
  }
  const abs = r.absPath || r.path;
  if (!abs) throw new Error(i18n.t('업로드 응답에 경로가 없어요.'));
  return abs;
}

// 파일명 안전화 — 경로 구분자/제어문자/공백 정리(첨부 상대경로로 기록되므로).
function safeFileName(name: string): string {
  const base = (name || 'file')
    .replace(/[/\\]/g, '_')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  return base || 'file';
}

/** 임의 파일(base64)을 원본 파일명(확장자 유지)으로 호스트 PC `.codingpt/attachments/` 에 업로드하고
 *  절대경로(absPath)를 반환. 파일명 앞에 타임스탬프를 붙여 동명 충돌을 피한다(예: 20260723-153010-report.pdf).
 *  이미지 전용 uploadAttachmentBase64 와 달리 확장자를 강제(.jpg)하지 않아 모든 파일 타입에 사용. */
export async function uploadAttachmentNamed(origName: string, b64: string, host: number | null): Promise<string> {
  const d = new Date();
  const ts = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  const dir = attachDir();
  const file = `${dir}/${ts}-${safeFileName(origName)}`;
  let r: Awaited<ReturnType<typeof daemonService.fsWrite>>;
  try {
    r = await daemonService.fsWrite(file, b64, host, { base64: true });
  } catch (first) {
    try { await daemonService.fsMkdir(dir, host); } catch (_) { /* 이미 존재 등 */ }
    r = await daemonService.fsWrite(file, b64, host, { base64: true });
  }
  const abs = r.absPath || r.path;
  if (!abs) throw new Error(i18n.t('업로드 응답에 경로가 없어요.'));
  return abs;
}

// 조각 올리기 — 데몬 fs.write(append) 로 3MB 씩 이어 쓴다(한 번에 6MB 상한·요청 본문 10MB 상한을 넘는 동영상).
//  조각 크기는 3 의 배수 — base64 가 조각마다 깔끔히 끊긴다.
const CHUNK = 3 * 1024 * 1024;
const MAX_FILE = 300 * 1024 * 1024;
/** 기기 안 파일(localPath) 또는 base64 첨부를 원본 이름으로 올리고 PC 의 절대경로를 돌려준다. onProgress(0~1). */
export async function uploadAttachmentFile(a: { name: string; base64: string; size: number; localPath?: string }, host: number | null, onProgress?: (p: number) => void): Promise<string> {
  if (!a.localPath) return uploadAttachmentNamed(a.name, a.base64, host);
  const src = a.localPath;
  let size = a.size || 0;
  try { size = Number((await ReactNativeBlobUtil.fs.stat(src)).size) || size; } catch (_) { /* 고른 쪽 크기 */ }
  if (size > MAX_FILE) { const e: any = new Error(i18n.t('파일이 너무 커요')); e.code = 'TOO_LARGE'; throw e; }
  if (size <= CHUNK) return uploadAttachmentNamed(a.name, await ReactNativeBlobUtil.fs.readFile(src, 'base64'), host);
  const d = new Date();
  const ts = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  const dir = attachDir();
  const file = `${dir}/${ts}-${safeFileName(a.name)}`;
  try { await daemonService.fsMkdir(dir, host); } catch (_) { /* 이미 있음 */ }
  const tmp = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/cpt-up-${Date.now()}.part`;
  let abs = '';
  let last = 0;
  try {
    for (let off = 0; off < size; off += CHUNK) {
      const end = Math.min(size, off + CHUNK);
      await ReactNativeBlobUtil.fs.slice(src, tmp, off, end);
      const b64 = await ReactNativeBlobUtil.fs.readFile(tmp, 'base64');
      const r = await daemonService.fsWrite(file, b64, host, { base64: true, append: off > 0 });
      abs = r.absPath || r.path || abs;
      last = Number(r.size) || 0;
      onProgress?.(end / size);
    }
  } finally { try { await ReactNativeBlobUtil.fs.unlink(tmp); } catch (_) { /* 없음 */ } }
  //  이어 쓰기를 모르는 옛 PC 앱은 조각마다 덮어쓴다 — 크기로 알아챈다.
  if (last !== size) { const e: any = new Error(i18n.t('PC 앱을 업데이트해 주세요')); e.code = 'NEEDS_PC_UPDATE'; throw e; }
  if (!abs) throw new Error(i18n.t('업로드 응답에 경로가 없어요.'));
  return abs;
}
