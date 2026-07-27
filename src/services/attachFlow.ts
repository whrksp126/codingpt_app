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
import { pickAnyFiles, pickFromCamera, pickFromGallery } from './attachmentPicker';
import { uploadAttachmentNamed } from './attachmentUpload';
import { showAppAlert } from '../components/AppAlert';

/** 데몬 fs.write base64 디코드 후 상한과 동일 — 넘는 파일은 제외하고 나머지만 올린다. */
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
    const files = src === 'camera' ? await pickFromCamera()
      : src === 'gallery' ? await pickFromGallery()
      : await pickAnyFiles();
    if (!files.length) return;                        // 취소
    const tooBig = files.filter((f) => f.size > MAX_ATTACH_BYTES);
    const okFiles = files.filter((f) => f.size <= MAX_ATTACH_BYTES);
    const paths: string[] = [];
    for (const f of okFiles) {
      const abs = await uploadAttachmentNamed(f.name, f.base64, sink.host);
      paths.push(`'${abs}'`);
    }
    if (paths.length) sink.insert(`${paths.join(' ')} `);
    if (tooBig.length) {
      const names = tooBig.map((f) => f.name).join(', ');
      showAppAlert({ title: '파일 첨부', message: `6MB 를 넘는 파일은 제외했어요: ${names}` });
    }
  } catch (e: any) {
    showAppAlert({ title: '파일 첨부', message: String(e?.message || e) });
  } finally {
    setBusy(false);
  }
}

export default { MAX_ATTACH_BYTES, getAttachBusy, subscribeAttachBusy, pickAndUploadAttachments };
