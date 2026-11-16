// attachFlow.ts — "OS 파일 선택기 → 호스트 PC 업로드 → 입력에 절대경로 삽입" 첨부 플로우의 **공용 정본**.
//
// 왜 공용인가: 이 플로우의 진입점이 둘이다.
//  ① 터미널 보조키 바의 클립 버튼(`components/keyboard/TerminalAttachButton`)
//  ② 채팅 컴포저 좌측 `+` 메뉴(`workspace/chat/ChatComposer`) — 2026-07-27 신설.
//     채팅에서는 보조키 바를 띄우지 않게 바뀌었으므로(사용자 확정) ② 가 없으면 **채팅에서 첨부 기능이
//     그냥 사라진다**. 두 진입점이 각자 구현하면 상한/경로 규약/알림 문구가 갈리므로 여기 한 벌만 둔다.
//
// 업로드 규약(변경 금지): `.codingpt/attachments/<ts>-<원본파일명>` 에 base64 로 쓰고, 응답 절대경로를
//  `'<absPath>' `(작은따옴표+공백)로 삽입한다 — 공백 포함 경로도 셸/에이전트가 그대로 읽는다.
import { pickAnyFilesLazy, pickFromCamera, pickGalleryLazy } from './attachmentPicker';
import { uploadAttachmentFile } from './attachmentUpload';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { showAppAlert } from '../components/AppAlert';
import * as i18n from '../i18n/index.ts';

/** 칩 썸네일용으로 base64 를 읽어 두는 이미지 상한. 업로드 자체는 조각으로 올라가 상한이 없다(300MB). */
export const MAX_ATTACH_BYTES = 6 * 1024 * 1024;

// 업로드 상태는 모듈 스토어 — 시트/키보드 전환으로 버튼이 리마운트돼도 스피너가 유지된다.
let busy = false;
const listeners = new Set<() => void>();
const setBusy = (v: boolean) => { busy = v; listeners.forEach((l) => l()); };

export const getAttachBusy = (): boolean => busy;
export const subscribeAttachBusy = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export interface AttachSink {
  /** 대상 PC(hostDeviceId). null = 활성 러너 라우팅. */
  host: number | null;
  /** 업로드된 경로 문자열을 입력(터미널 PTY / 컴포저 텍스트)에 삽입 */
  insert: (text: string) => void;
  /** 있으면 insert 대신 이걸 부른다 — 채팅 칩 컴포저용 메타(경로+이름+이미지 여부+썸네일 base64). */
  insertRich?: (items: { path: string; name: string; image: boolean; base64?: string }[]) => void;
}

/**
 * 시스템 파일 선택기(다중선택) → 각 파일 base64 → 호스트 업로드 → 절대경로 삽입.
 * 취소는 조용히 no-op. 실패/제외는 AppAlert 로만 알린다(throw 하지 않는다 — 호출부는 버튼 하나다).
 */
/** 첨부 출처 — 세 갈래 모두 같은 업로드·삽입 규약을 쓴다(호출부가 규약을 다시 짜지 않게).
 *  'files'(기본) = 기기 네이티브 파일 탐색기 · 'camera' = 촬영 · 'gallery' = 갤러리. */
export type AttachSource = 'files' | 'camera' | 'gallery';

export async function pickAndUploadAttachments(sink: AttachSink & { source?: AttachSource }): Promise<void> {
  try {
    setBusy(true);
    const src: AttachSource = sink.source || 'files';
    //  파일·갤러리는 기기 안 경로만 받고 조각으로 올린다 — 예전엔 통째 base64 + 6MB 상한이라
    //  화면 녹화(6.89MB)가 "제외"되고, 1MB 를 넘으면 prod nginx 413 으로 "JSON Parse error" 가 났다(2026-11-16).
    const files = src === 'camera' ? await pickFromCamera()
      : src === 'gallery' ? await pickGalleryLazy()
      : await pickAnyFilesLazy();
    if (!files.length) return;                        // 취소
    const paths: string[] = [];
    const rich: { path: string; name: string; image: boolean; base64?: string }[] = [];
    const failed: string[] = [];
    for (const f of files) {
      let abs: string;
      try { abs = await uploadAttachmentFile(f, sink.host); } catch (e: any) {
        if (e?.code === 'NEEDS_PC_UPDATE') throw e;
        failed.push(`${f.name} (${String(e?.message || e)})`);
        continue;
      }
      paths.push(`'${abs}'`);
      const image = /\.(png|jpe?g|gif|webp|bmp|heic|heif|tiff)$/i.test(f.name);
      let thumb = f.base64;
      if (image && !thumb && f.localPath && f.size <= MAX_ATTACH_BYTES) {
        try { thumb = await ReactNativeBlobUtil.fs.readFile(f.localPath, 'base64'); } catch (_) { thumb = ''; }
      }
      rich.push({ path: abs, name: f.name, image, ...(image && thumb ? { base64: thumb } : {}) });
    }
    if (rich.length && sink.insertRich) sink.insertRich(rich);
    else if (paths.length) sink.insert(`${paths.join(' ')} `);
    if (failed.length) {
      showAppAlert({ title: i18n.t('파일 첨부'), message: failed.join('\n') });
    }
  } catch (e: any) {
    showAppAlert({ title: i18n.t('파일 첨부'), message: String(e?.message || e) });
  } finally {
    setBusy(false);
  }
}

export default { MAX_ATTACH_BYTES, getAttachBusy, subscribeAttachBusy, pickAndUploadAttachments };
