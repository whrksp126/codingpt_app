// attachmentUpload.ts — 데몬 fs.write(base64) 릴레이 업로드 공용 헬퍼(와이어 계약 §1·§2 / 라운드2 §2.3).
//   업로드 경로 규약: `.codingpt/attachments/<prefix><yyyymmdd-hhmmss>-<rand4>.jpg` (데몬 홈-기준 상대),
//   응답 absPath(절대경로)를 그대로 터미널 삽입에 쓴다(따옴표 안 `~` 는 확장 안 되므로 절대경로 필수).
//   사용처: 보조키 바 이미지 첨부(TerminalAttachButton) · Design Mode 크롭샷(PaneView).
import daemonService from './daemonService';

const ATTACH_DIR = '.codingpt/attachments';
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 첨부 파일명 — `<prefix><yyyymmdd-hhmmss>-<rand4>.jpg` (prefix 예: 'design-'). */
export function attachmentName(prefix = ''): string {
  const d = new Date();
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${prefix}${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${rand}.jpg`;
}

/** base64 JPEG 를 호스트 PC `.codingpt/attachments/` 에 업로드하고 절대경로(absPath)를 반환.
 *  디렉토리는 데몬 부팅이 보장하지만, 실패 시 mkdir 후 1회 재시도(previewHistoryService 패턴). */
export async function uploadAttachmentBase64(b64: string, host: number | null, prefix = ''): Promise<string> {
  const file = `${ATTACH_DIR}/${attachmentName(prefix)}`;
  let r: Awaited<ReturnType<typeof daemonService.fsWrite>>;
  try {
    r = await daemonService.fsWrite(file, b64, host, { base64: true });
  } catch (first) {
    try { await daemonService.fsMkdir(ATTACH_DIR, host); } catch (_) { /* 이미 존재 등 */ }
    r = await daemonService.fsWrite(file, b64, host, { base64: true });
  }
  const abs = r.absPath || r.path;
  if (!abs) throw new Error('업로드 응답에 경로가 없어요.');
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
  const file = `${ATTACH_DIR}/${ts}-${safeFileName(origName)}`;
  let r: Awaited<ReturnType<typeof daemonService.fsWrite>>;
  try {
    r = await daemonService.fsWrite(file, b64, host, { base64: true });
  } catch (first) {
    try { await daemonService.fsMkdir(ATTACH_DIR, host); } catch (_) { /* 이미 존재 등 */ }
    r = await daemonService.fsWrite(file, b64, host, { base64: true });
  }
  const abs = r.absPath || r.path;
  if (!abs) throw new Error('업로드 응답에 경로가 없어요.');
  return abs;
}
