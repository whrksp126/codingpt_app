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
