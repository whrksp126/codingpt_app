import { BACK_URL } from '../utils/service';
import { apiRequest, api, refreshAccessToken } from '../utils/api';
import lessonService from './lessonService';
import daemonService from './daemonService';
import { daemonRootOf } from './ideSource';

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

// 확장자 → 에디터 언어(데몬 트리에서 IdeFile.language 채움)
const LANG_BY_EXT: Record<string, string> = {
  html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'tsx', jsx: 'jsx', json: 'json', py: 'python', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', md: 'markdown', xml: 'xml', svg: 'xml', sql: 'sql',
  yml: 'yaml', yaml: 'yaml', sh: 'shell',
};
const langOf = (p: string) => LANG_BY_EXT[(p.split('.').pop() || '').toLowerCase()] || 'plaintext';

/**
 * 프로젝트 소스(텍스트 파일 내용 포함) 조회.
 * 데몬 소스(projectId=`pc:<root>`)면 objectstore 대신 PC 폴더를 트리로 읽어 IdeProject 로 만든다.
 *  · 내용(content)은 빈 문자열로 두고 파일을 열 때 lazy 로 읽는다(대용량 폴더 대비).
 */
type IdeProjectResponse = { success: boolean; data?: IdeProject; error?: string; message?: string };
export const getIdeProject = async (projectId: string): Promise<IdeProjectResponse> => {
  const root = daemonRootOf(projectId);
  if (root !== null) {
    try {
      const tree = await daemonService.fsTree(root);
      const data: IdeProject = {
        projectId,
        files: tree.items.map((it) => ({ path: it.path, language: langOf(it.path), content: '' })),
        assets: [],
      };
      return { success: true, data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'PC 폴더를 불러올 수 없어요.' };
    }
  }
  return apiRequest<IdeProject>(`/api/lesson/ide/${projectId}`, { method: 'GET' });
};

/** 프로젝트 저장 — 현재 텍스트 파일(에이전트/사용자 편집 포함)을 objectstore 에 영속화 */
export const saveIdeProject = (projectId: string, files: { path: string; content: string; base64?: boolean }[]) =>
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

// ── dev 서버(미리보기) 프록시 ──
// 프레임워크 앱(Vite 등)은 샌드박스에서 실제 dev 서버를 띄워 프록시한다(정적 서빙으로는 못 돔).
export type DevPreviewStart =
  | { mode: 'static' }
  | { mode: 'dev'; ready: boolean; token: string; url: string; log?: string | null };

/** dev 서버 기동(+토큰 발급) 요청. dev 스크립트 없으면 mode:'static'(정적 폴백). 멱등(재호출=폴링). */
export const startDevPreview = (projectId: string) =>
  apiRequest<DevPreviewStart>('/api/preview/dev/start', { method: 'POST', body: { projectId } });

/** dev 서버 종료 */
export const stopDevPreview = (projectId: string) =>
  apiRequest<{ ok: boolean }>('/api/preview/dev/stop', { method: 'POST', body: { projectId } });

/** WebView 가 로드할 dev 미리보기 URL(토큰 경로 — Vite base 와 일치) */
export const buildDevPreviewUrl = (token: string) => `${BACK_URL}/api/preview/${token}/`;

// ── 멀티 터미널(tmux 윈도우) ──
// 세션 'cpt' 안의 tmux 윈도우 = 터미널 탭. 단일 PTY WebView 가 활성 윈도우를 따라간다.
export interface SandboxWindow {
  index: number;
  name: string;
  active: boolean;
  command: string;  // pane 의 현재 실행 명령(node/bash 등)
  pid: number | null;
}

/** 터미널(윈도우) 목록 */
export const listTerminals = (projectId: string) =>
  apiRequest<{ windows: SandboxWindow[] }>(
    `/api/preview/terminals?projectId=${encodeURIComponent(projectId)}`,
    { method: 'GET' },
  );

/** 새 터미널(윈도우) 생성 → index 반환 */
export const newTerminal = (projectId: string, name?: string) =>
  apiRequest<{ index: number }>('/api/preview/terminals/new', { method: 'POST', body: { projectId, name } });

/** 터미널(윈도우) 전환 — 활성 PTY 가 즉시 그 윈도우를 표시 */
export const selectTerminal = (index: number) =>
  apiRequest<{ ok: boolean }>('/api/preview/terminals/select', { method: 'POST', body: { index } });

/** 터미널(윈도우) 종료 */
export const closeTerminal = (index: number) =>
  apiRequest<{ ok: boolean }>('/api/preview/terminals/close', { method: 'POST', body: { index } });

/** 현재 터미널(윈도우) 화면+스크롤백 지우기(tmux clear-history) */
export const clearTerminalScreen = () =>
  apiRequest<{ ok: boolean }>('/api/preview/terminals/clear', { method: 'POST', body: {} });

// ── 감지된 실행 포트 + 임의 포트 미리보기 ──
/** 샌드박스에서 LISTEN 중인 포트 감지(수동으로 띄운 서버 포함) */
export const listSandboxPorts = (projectId: string) =>
  apiRequest<{ ports: number[]; devPort: number | null }>(
    `/api/preview/ports?projectId=${encodeURIComponent(projectId)}`,
    { method: 'GET' },
  );

/** 감지된 임의 포트로의 미리보기 토큰 발급 → WebView 로 로드할 URL */
export const openSandboxPort = (projectId: string, port: number) =>
  apiRequest<{ token: string; url: string; port: number }>(
    '/api/preview/port/open',
    { method: 'POST', body: { projectId, port } },
  );

// ── 샌드박스 터미널(실셸) ──
export type SandboxExecEvent =
  | { type: 'start'; cwd: string }
  | { type: 'output'; data: string }
  | { type: 'cwd'; cwd: string }
  | { type: 'done'; exitCode: number; timedOut?: boolean }
  | { type: 'error'; message: string };

/**
 * 샌드박스에서 임의 셸 명령 실행 — 출력 SSE 스트리밍. (streamAgentQuery 와 동일 XHR 파서 패턴)
 * @returns abort 함수(중지 버튼용)
 */
export const streamSandboxExec = async (
  payload: { command: string; cwd?: string; projectId?: string },
  onEvent: (e: SandboxExecEvent) => void,
  onError?: (error: string) => void,
  onComplete?: () => void,
): Promise<() => void> => {
  let aborted = false;
  let currentXhr: XMLHttpRequest | undefined;

  const processLine = (line: string) => {
    const t = line.trim();
    if (!t.startsWith('data:')) return;
    try { onEvent(JSON.parse(t.substring(5).trim()) as SandboxExecEvent); }
    catch (e) { /* 파싱 실패 라인 무시 */ }
  };

  const run = async (retried: boolean) => {
    let processedIndex = 0;
    let pendingLine = '';
    currentXhr = await api.agent.execStream(
      payload,
      (x) => {
        if (aborted) return;
        if (x.readyState === 3 || x.readyState === 4) {
          const chunk = x.responseText.substring(processedIndex);
          processedIndex = x.responseText.length;
          const combined = pendingLine + chunk;
          const lines = combined.split('\n');
          pendingLine = lines.pop() ?? '';
          lines.forEach(processLine);
        }
        if (x.readyState === 4) {
          if (x.status === 401 && !retried) {
            refreshAccessToken()
              .then((tok) => { if (!aborted) { tok ? run(true) : onError?.('인증이 만료되었습니다.'); } })
              .catch(() => onError?.('인증 갱신에 실패했습니다.'));
            return;
          }
          if (pendingLine) { processLine(pendingLine); pendingLine = ''; }
          if (x.status >= 200 && x.status < 300) onComplete?.();
          else onError?.(`서버 에러: ${x.status}`);
        }
      },
      (error) => onError?.(error instanceof Error ? error.message : '네트워크 연결 에러가 발생했습니다.'),
    );
  };

  await run(false);
  return () => { aborted = true; try { currentXhr?.abort(); } catch (_) { /* noop */ } };
};

/** 터미널 입력이 dev 서버 기동 명령인지(미리보기로 라우팅) */
export const isDevServerCommand = (raw: string): boolean =>
  /(^|\s|&&|;)(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve)\b/.test(raw)
  || /(^|\s|&&|;)(vite|next\s+dev|react-scripts\s+start)\b/.test(raw);

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
