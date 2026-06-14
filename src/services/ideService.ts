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

/** 프로젝트 저장 — 현재 텍스트 파일(에이전트/사용자 편집 포함)을 objectstore 에 영속화 */
export const saveIdeProject = (projectId: string, files: { path: string; content: string }[]) =>
  apiRequest<{ projectId: string; saved: number; failed: { path: string; message: string }[] }>(
    `/api/lesson/ide/${projectId}/save`,
    { method: 'POST', body: { files } },
  );

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
  options?: { debug?: boolean },
) => lessonService.streamCodeExecution(code, language, onMessage, onError, onComplete, options);

// 확장자 → executor 언어 키 (백엔드 executorService.languageConfigs 와 동기화)
const EXT_TO_LANG: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  php: 'php',
  sh: 'bash', bash: 'bash',
  go: 'go',
  c: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  cs: 'csharp',
};

// 라인 추적 디버그 지원 언어 (백엔드 debuggableLangs 와 동기화)
const DEBUGGABLE = new Set(['python', 'javascript', 'ruby', 'bash']);

// 터미널에 표시할 실행 명령(시각적 — 실제 셸 아님)
const RUN_CMD: Record<string, (f: string) => string> = {
  python: (f) => `python ${f}`,
  javascript: (f) => `node ${f}`,
  typescript: (f) => `tsx ${f}`,
  ruby: (f) => `ruby ${f}`,
  php: (f) => `php ${f}`,
  bash: (f) => `bash ${f}`,
  go: (f) => `go run ${f}`,
  c: (f) => `gcc ${f} -o out && ./out`,
  cpp: (f) => `g++ ${f} -o out && ./out`,
  rust: (f) => `rustc ${f} -o out && ./out`,
  java: (f) => `java ${f}`,
  kotlin: (f) => `kotlinc ${f} -include-runtime -d out.jar && java -jar out.jar`,
  csharp: (f) => `mcs ${f} && mono out.exe`,
};

/** 확장자 → executor 언어 (실행 가능하면 언어 키, 아니면 null) */
export const runnableLanguage = (path: string): string | null =>
  EXT_TO_LANG[(path.split('.').pop() || '').toLowerCase()] || null;

/** 디버그(라인 추적) 가능한 언어면 언어 키, 아니면 null */
export const debuggableLanguage = (path: string): string | null => {
  const lang = runnableLanguage(path);
  return lang && DEBUGGABLE.has(lang) ? lang : null;
};

/** 터미널에 표시할 실행 명령 문자열 (fileName 은 표시용 베이스명) */
export const runCommandText = (lang: string, fileName: string): string =>
  (RUN_CMD[lang] ? RUN_CMD[lang](fileName) : `run ${fileName}`);
