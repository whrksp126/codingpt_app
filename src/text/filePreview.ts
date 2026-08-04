// 파일 미리보기의 화면 문구. text/index.ts 의 규율을 따른다.
//  ⚠ PC(codingpt_pc/src/js/text/file-preview.js)에 같은 키·같은 뜻의 사전이 있다(대조 테스트).
import type { Dict } from './index';

export type FilePreviewText = {
  asText: string;
  openAsText: string;
  unsupported: string;
  badJson: string;
  tableTruncated: string;
  loading: string;
  tooBig: string;
  /** 이 기기에서 못 여는 형식(안드로이드 WebView 는 PDF 를 못 그린다) — 사실대로 말한다. */
  notOnThisDevice: string;
};

export const FILE_PREVIEW_TEXT: Dict<FilePreviewText> = {
  ko: {
    asText: '원문 보기',
    openAsText: '텍스트로 열기',
    unsupported: '미리보기를 지원하지 않는 형식이에요',
    badJson: 'JSON 형식이 아니에요. 원문 보기로 확인하세요.',
    tableTruncated: '앞부분만 표로 보여요 — 전체는 원문 보기로 확인하세요.',
    loading: '불러오는 중…',
    tooBig: '파일이 커서 미리보기를 건너뛰었어요(8MB 초과)',
    notOnThisDevice: '이 기기에서는 미리볼 수 없는 형식이에요. PC 에서 열어 보세요.',
  },
  en: {
    asText: 'View source',
    openAsText: 'Open as text',
    unsupported: 'Preview is not supported for this format',
    badJson: 'Not valid JSON. Use “View source” instead.',
    tableTruncated: 'Showing the first rows only — use “View source” for the whole file.',
    loading: 'Loading…',
    tooBig: 'File is too large to preview (over 8MB)',
    notOnThisDevice: 'This format cannot be previewed on this device. Open it on your PC.',
  },
};
