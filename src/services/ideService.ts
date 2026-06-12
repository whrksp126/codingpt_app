import { BACK_URL } from '../utils/service';
import { apiRequest } from '../utils/api';
import lessonService from './lessonService';

// 모바일 IDE — 프로젝트 소스 조회 + 인라인 프리뷰 + 코드 실행.
// 소스는 objectstore `codingpt/execute/ide/<projectId>/` 에 보관(관리자 등록), 백엔드가 중계.

export interface IdeFile {
  path: string;
  language: string;
  content: string;
}

export interface IdeAsset {
  path: string;
  size: number;
}

export interface IdeProject {
  projectId: string;
  files: IdeFile[];
  assets: IdeAsset[];
}

/** 프로젝트 소스(텍스트 파일 내용 포함) 조회 */
export const getIdeProject = (projectId: string) =>
  apiRequest<IdeProject>(`/api/lesson/ide/${projectId}`, { method: 'GET' });

/** 이미지 등 바이너리 에셋을 data URL 로 — apiRequest 로 받아 토큰 자동 refresh 처리 */
export const getIdeAsset = (projectId: string, relPath: string) =>
  apiRequest<{ dataUrl: string; contentType: string; size: number }>(
    `/api/lesson/ide/${projectId}/asset?path=${encodeURIComponent(relPath)}`,
    { method: 'GET' },
  );

/** 세션 내 편집을 반영한 프리뷰 세션 생성 → sessionId 반환 */
export const createInlinePreview = (
  projectId: string,
  files: { path: string; content: string }[],
  entryFile?: string,
) =>
  apiRequest<{ sessionId: string; entryFile: string; previewUrl?: string }>(
    `/api/executor/preview-inline`,
    { method: 'POST', body: { projectId, files, entryFile } },
  );

/** 프리뷰 세션 + 진입 파일로 앱에서 직접 로드할 URL 구성 (BACKEND_URL 호스트 불일치 회피) */
export const buildPreviewUrl = (sessionId: string, entryFile: string) =>
  `${BACK_URL}/api/executor/${sessionId}/${entryFile}`;

/** 코드 실행 SSE — lessonService 의 스트림을 그대로 재사용 */
export const runCode = (
  code: string,
  language: string,
  onMessage: (data: any) => void,
  onError?: (error: string) => void,
  onComplete?: () => void,
) => lessonService.streamCodeExecution(code, language, onMessage, onError, onComplete);

/** 확장자 → executor 언어 (실행 가능 언어만) */
export const runnableLanguage = (path: string): string | null => {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'javascript';
  if (ext === 'py') return 'python';
  return null;
};
