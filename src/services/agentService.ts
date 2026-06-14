import { api, apiRequest, refreshAccessToken } from '../utils/api';

// 바이브코딩 에이전트 — 백엔드 /api/agent/query SSE 스트림 파싱 + 워크스페이스 파일 읽기.
// 이벤트 계약(백엔드 agentService 와 동기화):
//   agent_init | text | thinking | tool_use | tool_result | done | error

export type AgentEvent =
  | { type: 'agent_init'; sessionId: string; model: string; cwd: string }
  | { type: 'text'; role: 'assistant'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; toolUseId: string; tool: string; input: any; relPath: string | null }
  | { type: 'tool_result'; toolUseId: string; ok: boolean; content: string }
  | { type: 'done'; ok: boolean; subtype?: string; summary?: string; costUsd?: number; usage?: any }
  | { type: 'error'; message: string };

/**
 * 에이전트 질의 스트림. SSE 라인을 파싱해 onEvent 로 흘린다.
 * (lessonService.streamCodeExecution 의 pendingLine 보존 파서와 동일 패턴)
 * @returns abort 함수
 */
export const streamAgentQuery = async (
  prompt: string,
  onEvent: (evt: AgentEvent) => void,
  onError?: (error: string) => void,
  onComplete?: () => void,
  opts?: { sessionId?: string; model?: string },
): Promise<() => void> => {
  let aborted = false;
  let currentXhr: XMLHttpRequest | undefined;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    try {
      const data = JSON.parse(trimmed.substring(5).trim());
      onEvent(data as AgentEvent);
    } catch (e) {
      console.error('Agent SSE JSON 파싱 에러:', e, 'Line:', trimmed);
    }
  };

  // 401(토큰 만료) 시 refresh 후 1회 재시도. SSE XHR 은 apiRequest 의 자동 refresh 를 안 타므로 직접 처리.
  const run = async (retried: boolean) => {
    let processedIndex = 0;
    let pendingLine = '';
    currentXhr = await api.agent.queryStream(
      { prompt, sessionId: opts?.sessionId, model: opts?.model },
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
          // 토큰 만료 → refresh 후 재시도 (401 응답은 SSE 가 아니라 JSON 이라 위 파싱은 무시됨)
          if (x.status === 401 && !retried) {
            refreshAccessToken()
              .then((tok) => { if (!aborted) { tok ? run(true) : onError?.('인증이 만료되었습니다. 다시 로그인해주세요.'); } })
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

/** 에이전트 워크스페이스 내 파일 읽기 (편집 후 에디터 동기화용) */
export const getAgentFile = (relPath: string) =>
  apiRequest<{ path: string; content: string }>(
    `/api/agent/file?path=${encodeURIComponent(relPath)}`,
    { method: 'GET' },
  );
