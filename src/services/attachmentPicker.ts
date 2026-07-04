import { pick, keepLocalCopy, types, errorCodes, isErrorWithCode } from '@react-native-documents/picker';
import { launchCamera } from 'react-native-image-picker';
import ReactNativeBlobUtil from 'react-native-blob-util';

// 채팅 첨부(AI 참고용) — 시스템 파일 선택기로 이미지/PDF 를 골라 base64 로 읽는다.
//  · 에이전트가 실제로 읽을 수 있는 건 이미지·PDF 뿐(동영상 분석 불가)이라 타입을 제한.
//  · content:// uri 는 바로 못 읽으므로 keepLocalCopy 로 캐시에 복사 후 blob-util 로 base64 읽기.
//  · 전송 시 files 페이로드에 { path:'attachments/<name>', content:base64, base64:true } 로 시드 → 에이전트 Read.

export type Attachment = { name: string; mime: string; base64: string; size: number };

// 채팅 첨부 — AI 가 읽는 이미지/PDF 만.
export function pickAttachments(): Promise<Attachment[]> {
  return pickFiles([types.images, types.pdf]);
}

// IDE 외부 파일 가져오기 — 모든 파일.
export function pickAnyFiles(): Promise<Attachment[]> {
  return pickFiles([types.allFiles]);
}

// 카메라 촬영 → 사진 1장을 base64 첨부로. (CAMERA 권한을 매니페스트에 선언하지 않으므로
//  런타임 권한 요청 없이 시스템 카메라 앱으로 위임 — image-picker 기본 동작.)
export async function pickFromCamera(): Promise<Attachment[]> {
  const res = await launchCamera({ mediaType: 'photo', includeBase64: true, quality: 0.8, saveToPhotos: false });
  if (res.didCancel) return [];
  if (res.errorCode) throw new Error(res.errorMessage || '카메라를 열 수 없어요.');
  const a = res.assets && res.assets[0];
  if (!a || !a.base64) return [];
  const name = sanitizeName(a.fileName || `photo-${a.timestamp || ''}.jpg`);
  return [{ name, mime: a.type || 'image/jpeg', base64: a.base64, size: a.fileSize || 0 }];
}

async function pickFiles(typeFilter: string[]): Promise<Attachment[]> {
  let picked;
  try {
    picked = await pick({ type: typeFilter, allowMultiSelection: true });
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return [];
    throw e;
  }

  const out: Attachment[] = [];
  for (const f of picked) {
    const name = sanitizeName(f.name || `file-${out.length + 1}`);
    try {
      const copies = await keepLocalCopy({
        files: [{ uri: f.uri, fileName: name }],
        destination: 'cachesDirectory',
      });
      const c = copies[0];
      if (!c || c.status !== 'success') continue;
      const localPath = c.localUri.replace(/^file:\/\//, '');
      const base64 = await ReactNativeBlobUtil.fs.readFile(localPath, 'base64');
      out.push({ name, mime: f.type || 'application/octet-stream', base64, size: f.size || 0 });
    } catch (_) {
      /* 개별 파일 실패는 건너뜀 */
    }
  }
  return out;
}

// 파일명 안전화 — 경로 구분자/제어문자 제거(워크스페이스 상대경로로 시드되므로).
function sanitizeName(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/\s+/g, '_').slice(0, 120) || 'file';
}
