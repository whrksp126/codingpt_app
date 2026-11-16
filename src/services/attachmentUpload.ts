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

/** base64 JPEG 를 호스트 PC `.codingpt/attachments/` 에 업로드하고 절대경로(absPath)를 반환. */
export async function uploadAttachmentBase64(b64: string, host: number | null, prefix = '', ext = 'jpg'): Promise<string> {
  return writeChunked(`${attachDir()}/${attachmentName(prefix, ext)}`, b64Source(b64), host);
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
 *  절대경로(absPath)를 반환. 파일명 앞에 타임스탬프를 붙여 동명 충돌을 피한다(예: 20260723-153010-report.pdf). */
export async function uploadAttachmentNamed(origName: string, b64: string, host: number | null): Promise<string> {
  return writeChunked(namedTarget(origName), b64Source(b64), host);
}

// 조각 올리기 — 데몬 fs.write(append) 로 384KB 씩 이어 쓴다.
//  ★ prod 앞단 nginx 가 요청 본문 1MB 를 넘으면 413 HTML 을 돌려준다(2026-11-16 실측: 900KB=401, 1100KB=413).
//    앱은 그 HTML 을 JSON 으로 읽다 "JSON Parse error: Unexpected character: <" 를 띄웠다 — 1.78MB 동영상 첨부 실패의 진범.
//    384KB → base64 512KB → 봉인(E2EE) 봉투까지 1MB 아래. LAN 직결도 같은 조각을 쓴다(한 갈래).
//  조각 크기는 3 의 배수 — base64 가 조각마다 깔끔히 끊긴다.
const CHUNK = 384 * 1024;
const CHUNK_B64 = (CHUNK / 3) * 4;
const MAX_FILE = 300 * 1024 * 1024;

type Source = { size: number; part: (off: number, end: number) => Promise<string> };

function b64Source(b64: string): Source {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const size = Math.floor((b64.length / 4) * 3) - pad;
  // 바이트 오프셋 → base64 글자 오프셋(조각은 3바이트 경계라 4글자 경계와 맞는다)
  return { size, part: async (off, end) => b64.slice((off / 3) * 4, end >= size ? b64.length : (end / 3) * 4) };
}

function namedTarget(origName: string): string {
  const d = new Date();
  const ts = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `${attachDir()}/${ts}-${safeFileName(origName)}`;
}

async function writeChunked(file: string, src: Source, host: number | null, onProgress?: (p: number) => void): Promise<string> {
  const { size } = src;
  if (size > MAX_FILE) { const e: any = new Error(i18n.t('파일이 너무 커요')); e.code = 'TOO_LARGE'; throw e; }
  const dir = file.slice(0, file.lastIndexOf('/'));
  let abs = '';
  let last = 0;
  for (let off = 0; off < Math.max(size, 1); off += CHUNK) {
    const end = Math.min(size, off + CHUNK);
    const b64 = await src.part(off, end);
    const write = () => daemonService.fsWrite(file, b64, host, { base64: true, append: off > 0 });
    let r: Awaited<ReturnType<typeof daemonService.fsWrite>>;
    try { r = await write(); } catch (first) {
      if (off > 0) throw first;
      try { await daemonService.fsMkdir(dir, host); } catch (_) { /* 이미 존재 등 */ }
      r = await write();
    }
    abs = r.absPath || r.path || abs;
    last = Number(r.size) || 0;
    onProgress?.(size ? end / size : 1);
  }
  //  이어 쓰기를 모르는 옛 PC 앱은 조각마다 덮어쓴다 — 크기로 알아챈다(응답에 size 가 없으면 건너뜀).
  if (size > CHUNK && last && last !== size) { const e: any = new Error(i18n.t('PC 앱을 업데이트해 주세요')); e.code = 'NEEDS_PC_UPDATE'; throw e; }
  if (!abs) throw new Error(i18n.t('업로드 응답에 경로가 없어요.'));
  return abs;
}

/** 기기 안 파일(localPath) 또는 base64 첨부를 원본 이름으로 올리고 PC 의 절대경로를 돌려준다. onProgress(0~1). */
export async function uploadAttachmentFile(a: { name: string; base64: string; size: number; localPath?: string }, host: number | null, onProgress?: (p: number) => void): Promise<string> {
  if (!a.localPath) return writeChunked(namedTarget(a.name), b64Source(a.base64), host, onProgress);
  const path = a.localPath;
  let size = a.size || 0;
  try { size = Number((await ReactNativeBlobUtil.fs.stat(path)).size) || size; } catch (_) { /* 고른 쪽 크기 */ }
  const tmp = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/cpt-up-${Date.now()}.part`;
  try {
    return await writeChunked(namedTarget(a.name), {
      size,
      part: async (off, end) => {
        if (off === 0 && end >= size) return ReactNativeBlobUtil.fs.readFile(path, 'base64');
        await ReactNativeBlobUtil.fs.slice(path, tmp, off, end);
        return ReactNativeBlobUtil.fs.readFile(tmp, 'base64');
      },
    }, host, onProgress);
  } finally { try { await ReactNativeBlobUtil.fs.unlink(tmp); } catch (_) { /* 없음 */ } }
}
